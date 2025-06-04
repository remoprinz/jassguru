import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { PlayerComputedStats, initialPlayerComputedStats, TournamentPlacement, StatHighlight } from "./models/player-stats.model";

const db = admin.firestore();

// Annahme für die Struktur des Turnierdokuments (Auszug)
interface TournamentData {
  name: string;
  status: string; // z.B. 'active', 'completed'
  endDate?: admin.firestore.Timestamp;
  participants: Array<{
    playerId: string;
    rank: number;
    // ggf. weitere spielerrelevante Turnierergebnisdaten wie Punkte
  }>;
  totalParticipants?: number; // Gesamtzahl der Teilnehmer, falls separat gespeichert
  // ... weitere Turnierdaten
}

export const processTournamentCompletion = onDocumentUpdated(
  "tournaments/{tournamentId}",
  async (event) => {
    const tournamentId = event.params.tournamentId;
    const change = event.data;

    if (!change) {
      logger.log(`[processTournamentCompletion] No data change for tournament ${tournamentId}`);
      return;
    }

    const dataBefore = change.before.data() as TournamentData | undefined;
    const dataAfter = change.after.data() as TournamentData | undefined;

    if (!dataAfter) {
      logger.log(`[processTournamentCompletion] Tournament ${tournamentId} deleted, no action.`);
      return;
    }

    // Nur ausführen, wenn der Status von etwas anderem zu "completed" wechselt
    if (dataAfter.status !== "completed" || dataBefore?.status === "completed") {
      logger.log(
        `[processTournamentCompletion] Tournament ${tournamentId} status not changing to 'completed' or already was 'completed'. Current status: ${dataAfter.status}, Before: ${dataBefore?.status}`
      );
      return;
    }

    logger.info(`[processTournamentCompletion] Processing completion of tournament ${tournamentId} - Name: ${dataAfter.name}`);

    const tournamentName = dataAfter.name || "Unbenanntes Turnier";
    const tournamentEndDate = dataAfter.endDate || admin.firestore.Timestamp.now(); // Fallback
    const finalRanking = dataAfter.participants;
    // Gesamtzahl der Teilnehmer: Entweder aus einem eigenen Feld oder aus der Länge des Rankings
    const totalTournamentParticipants = dataAfter.totalParticipants || finalRanking?.length || 0;

    if (!finalRanking || finalRanking.length === 0) {
      logger.warn(`[processTournamentCompletion] No participant ranking found for completed tournament ${tournamentId}. Cannot update player stats.`);
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const playerStatsUpdatePromises: Promise<void>[] = [];

    for (const participant of finalRanking) {
      if (!participant.playerId || typeof participant.rank !== 'number') {
        logger.warn(`[processTournamentCompletion] Invalid participant data in tournament ${tournamentId}:`, participant);
        continue;
      }

      const playerId = participant.playerId;
      const playerRank = participant.rank;
      const playerStatsRef = db.collection("playerComputedStats").doc(playerId);

      const promise = db.runTransaction(async (transaction) => {
        const playerStatsDoc = await transaction.get(playerStatsRef);
        let stats: PlayerComputedStats;

        if (!playerStatsDoc.exists) {
          stats = JSON.parse(JSON.stringify(initialPlayerComputedStats));
          stats.firstJassTimestamp = tournamentEndDate; // Erstes Ereignis könnte dieses Turnier sein
        } else {
          stats = playerStatsDoc.data() as PlayerComputedStats;
        }

        // Update Timestamps
        stats.lastUpdateTimestamp = now;
        if (!stats.lastJassTimestamp || stats.lastJassTimestamp.toMillis() < tournamentEndDate.toMillis()) {
          stats.lastJassTimestamp = tournamentEndDate;
        }
        if (!stats.firstJassTimestamp) { // Falls es das allererste Ereignis für den Spieler ist
            stats.firstJassTimestamp = tournamentEndDate;
        }

        // Turnierstatistiken aktualisieren
        stats.totalTournamentsParticipated = (stats.totalTournamentsParticipated || 0) + 1;

        const newPlacement: TournamentPlacement = {
          tournamentId,
          tournamentName,
          rank: playerRank,
          totalParticipants: totalTournamentParticipants,
          date: tournamentEndDate,
          highlights: [],
        };

        // tournamentPlacements aktualisieren (z.B. die letzten 20, neueste zuerst)
        stats.tournamentPlacements = [newPlacement, ...(stats.tournamentPlacements || [])].slice(0, 20);

        // bestTournamentPlacement aktualisieren
        if (!stats.bestTournamentPlacement || playerRank < stats.bestTournamentPlacement.rank || 
            (playerRank === stats.bestTournamentPlacement.rank && tournamentEndDate.toMillis() > (stats.bestTournamentPlacement.date?.toMillis() || 0) )) {
          stats.bestTournamentPlacement = newPlacement;
        }

        // Highlight für Teilnahme/Platzierung
        const placementHighlight: StatHighlight = {
            type: "tournament_completed",
            value: playerRank,
            stringValue: tournamentName,
            date: tournamentEndDate,
            relatedId: tournamentId,
            label: `${playerRank}. Platz bei Turnier "${tournamentName}" (${totalTournamentParticipants} Teiln.)`
        };
        stats.highlights = [placementHighlight, ...(stats.highlights || [])].slice(0, 50); // Max 50 Highlights

        if (playerRank === 1) {
          stats.tournamentWins = (stats.tournamentWins || 0) + 1;
          const winHighlight: StatHighlight = {
            type: "tournament_win",
            value: 1,
            stringValue: tournamentName,
            date: tournamentEndDate,
            relatedId: tournamentId,
            label: `Turnier "${tournamentName}" gewonnen (${totalTournamentParticipants} Teiln.)`
          };
          // Füge Win-Highlight als erstes/wichtigstes hinzu, wenn nicht schon ein ähnliches Highlight für DIESES Turnier existiert.
          // Dies vermeidet doppelte Highlights, falls "tournament_completed" schon den 1. Platz anzeigt.
          const existingWinHighlightIndex = stats.highlights.findIndex(h => h.type === "tournament_win" && h.relatedId === tournamentId);
          if (existingWinHighlightIndex !== -1) {
            stats.highlights.splice(existingWinHighlightIndex, 1); // Entferne altes/generisches Platzierungs-Highlight für den Sieg
          }
          stats.highlights.unshift(winHighlight); // Füge als erstes hinzu
          stats.highlights = stats.highlights.slice(0, 50);
        }
        
        transaction.set(playerStatsRef, stats, { merge: true });
      });
      playerStatsUpdatePromises.push(promise);
    }

    try {
      await Promise.all(playerStatsUpdatePromises);
      logger.info(`[processTournamentCompletion] Successfully updated stats for ${finalRanking.length} players for tournament ${tournamentId}`);
    } catch (error) {
      logger.error(`[processTournamentCompletion] Error updating player stats for tournament ${tournamentId}:`, error);
    }
  }
); 