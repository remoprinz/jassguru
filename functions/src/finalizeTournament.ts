import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
// Ggf. weitere spezifische Modelle importieren, z.B. PlayerComputedStats, TournamentPlacement
import { PlayerComputedStats, initialPlayerComputedStats, TournamentPlacement, StatHighlight } from "./models/player-stats.model"; // PlayerComputedStats und TournamentPlacement importiert
import { TournamentPlayerRankingData } from "./models/tournament-ranking.model"; // NEU: Import für das Ranking-Datenmodell
import { saveRatingHistorySnapshot } from './ratingHistoryService'; // 🆕 Rating-Historie

const db = admin.firestore();

// ✅ NEU: Hilfsfunktion zur Konvertierung von Firebase UID zu Player Document ID
async function getPlayerIdForUser(userId: string): Promise<string | null> {
  try {
    const playerQuery = db.collection('players').where('userId', '==', userId).limit(1);
    const playerSnap = await playerQuery.get();
    if (playerSnap.empty) {
      return null;
    }
    return playerSnap.docs[0].id;
  } catch (error) {
    logger.error(`[getPlayerIdForUser] Error fetching player for userId ${userId}:`, error);
    return null;
  }
}

// ✅ NEU: EventCounts-Interface (muss eventuell aus finalizeSession.ts importiert werden)
interface EventCountRecord {
  sieg: number;
  berg: number;
  matsch: number;
  kontermatsch: number;
  schneider: number;
}

interface EventCounts {
  bottom: EventCountRecord;
  top: EventCountRecord;
}

interface FinalizeTournamentData {
  tournamentId: string;
}

// Typ für die Rohdaten eines einzelnen Spiels/Passe im Turnier
// ACHTUNG: Diese Struktur wird hier als TournamentGameDetailData bezeichnet, 
// um Namenskollisionen zu vermeiden, wenn sie zusammen mit der aus tournamentGameProcessing.ts importiert wird.
// Für die interne Logik dieser Datei ist `TournamentGameData` okay, aber beim Export umbenennen oder anpassen.
// Da playerStatsRecalculation.ts bereits `TournamentGameData as TournamentProcessingGameData` importiert,
// können wir diese hier einfach als `TournamentGameData` belassen und exportieren.
export interface TournamentGameData { // EXPORTIERT
  id: string; // gameId / passeId
  finalScores: { top: number; bottom: number };
  finalStriche?: { 
    top: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
    bottom: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
  };
  teams?: { 
    top?: { playerUids?: string[] }; 
    bottom?: { playerUids?: string[] }; 
  };
  participantUids?: string[]; // Sollte die UIDs der Spieler in diesem spezifischen Spiel enthalten
  status?: string;
  roundHistory?: any[]; // ✅ NEU: Für eventCounts-Berechnung
  eventCounts?: EventCounts; // ✅ NEU: Berechnete eventCounts
  playerDetails?: Array<{ uid: string; weisPoints?: number }>; // ✅ NEU: Für Weis-Points
  // Weitere relevante Felder eines Spiels...
}

// ✅ NEU: Hilfsfunktion zur Berechnung der eventCounts für ein Game
function calculateEventCountsForTournamentGame(game: TournamentGameData): EventCounts {
  const { finalStriche, roundHistory } = game;
  
  const bottomEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
  const topEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };

  // 1. Matsch/Kontermatsch aus roundHistory
  if (roundHistory && Array.isArray(roundHistory)) {
    roundHistory.forEach(round => {
      if (round.strichInfo && round.strichInfo.type && round.strichInfo.team) {
        const teamKey = round.strichInfo.team;
        if (round.strichInfo.type === 'matsch') {
          if (teamKey === 'bottom') bottomEvents.matsch++;
          else if (teamKey === 'top') topEvents.matsch++;
        } else if (round.strichInfo.type === 'kontermatsch') {
          if (teamKey === 'bottom') bottomEvents.kontermatsch++;
          else if (teamKey === 'top') topEvents.kontermatsch++;
        }
      }
    });
  }

  // 2. Sieg, Berg, Schneider aus finalStriche
  if (finalStriche) {
    if (finalStriche.bottom?.sieg > 0) bottomEvents.sieg = 1;
    if (finalStriche.top?.sieg > 0) topEvents.sieg = 1;
    if (finalStriche.bottom?.berg > 0) bottomEvents.berg = 1;
    if (finalStriche.top?.berg > 0) topEvents.berg = 1;
    if (finalStriche.bottom?.schneider > 0) bottomEvents.schneider = 1;
    if (finalStriche.top?.schneider > 0) topEvents.schneider = 1;
  }

  return { bottom: bottomEvents, top: topEvents };
}

// NEU: Interface für die Struktur eines Gruppeneintrags im Turnierdokument
export interface TournamentGroupDefinition { // EXPORTIERT (wird von TournamentDocData verwendet)
  id: string;      // Eindeutige ID der Gruppe (könnte die Firestore Document ID sein)
  name: string;    // Anzeigename der Gruppe
  playerUids: string[]; // UIDs der Spieler in dieser Gruppe
}

export interface TournamentDocData { // EXPORTIERT
  name?: string;
  status?: string;
  tournamentMode?: 'single' | 'doubles' | 'groupVsGroup';
  playerUids?: string[]; 
  teams?: { id: string; playerUids: string[]; name: string }[];
  groups?: TournamentGroupDefinition[]; 
  settings?: {
    rankingMode?: 'total_points' | 'striche' | 'wins' | 'average_score_per_passe';
    scoreSettings?: {
        enabled?: {
            berg?: boolean;
            sieg?: boolean;
            schneider?: boolean;
        }
    }
    // Weitere Settings...
  };
  createdAt?: admin.firestore.Timestamp; 
  finalizedAt?: admin.firestore.Timestamp; // NEU: Explizit hier definiert
  totalRankedEntities?: number;          // NEU: Anzahl der gerankten Entitäten (Spieler/Teams/Gruppen)
  rankingSystemUsed?: string;            // NEU: Verwendetes Ranking-System (z.B. 'total_points')
  rankedPlayerUids?: string[];           // NEU: Liste der Spieler-UIDs, für die ein Ranking erstellt wurde
  lastError?: string | null;
}

/**
 * Finalizes a tournament, calculates rankings, and updates player statistics.
 */
export const finalizeTournament = onCall<FinalizeTournamentData>(
  {
    region: "europe-west1",
    timeoutSeconds: 540, 
    memory: "1GiB",      
  },
  async (request: CallableRequest<FinalizeTournamentData>) => {
    logger.info("--- finalizeTournament START ---", { data: request.data });

    const { tournamentId } = request.data;

    if (!tournamentId || typeof tournamentId !== 'string') {
      logger.error("Invalid tournamentId received.", { tournamentId });
      throw new HttpsError("invalid-argument", "Turnier-ID fehlt oder ist ungültig.");
    }

    try {
      const tournamentRef = db.collection("tournaments").doc(tournamentId);
      const tournamentSnap = await tournamentRef.get();

      if (!tournamentSnap.exists) {
        logger.error(`Tournament document with ID ${tournamentId} not found.`);
        throw new HttpsError("not-found", `Turnier mit ID ${tournamentId} nicht gefunden.`);
      }

      const tournamentData = tournamentSnap.data() as TournamentDocData;
      const tournamentMode = tournamentData.tournamentMode;
      const tournamentName = tournamentData.name || "Unbenanntes Turnier";
      const rankingModeToStore = tournamentData.settings?.rankingMode || 'total_points';
      const scoreSettingsEnabled = tournamentData.settings?.scoreSettings?.enabled;

      logger.info(`Processing tournament ${tournamentId} (${tournamentName}) with mode: ${tournamentMode}, ranking: ${rankingModeToStore}`);

      if (tournamentData.status === 'completed' || tournamentData.status === 'archived') {
        logger.warn(`Tournament ${tournamentId} is already finalized (status: ${tournamentData.status}). Skipping.`);
        return { success: true, message: `Turnier ${tournamentId} ist bereits abgeschlossen.` };
      }

      // Teilnehmer-UIDs aus dem Turnierdokument holen
      const participantUidsInTournament = tournamentData.playerUids || [];
      if (participantUidsInTournament.length === 0) {
        logger.warn(`No participants found in tournament ${tournamentId}. Cannot calculate rankings.`);
        await tournamentRef.update({ 
            status: 'completed', 
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(), 
            lastError: "Keine Teilnehmer.",
            totalRankedEntities: 0,
            rankedPlayerUids: [],
            rankingSystemUsed: rankingModeToStore
        });
        return { success: true, message: "Keine Teilnehmer im Turnier, Abschluss ohne Ranking."};
      }

      // ✅ KRITISCH: Konvertiere Firebase UIDs zu Player Document IDs
      logger.info(`[finalizeTournament] Converting ${participantUidsInTournament.length} Firebase UIDs to Player Document IDs...`);
      const uidToPlayerIdMap = new Map<string, string>();
      const participantPlayerIds: string[] = [];
      
      for (const uid of participantUidsInTournament) {
        try {
          const playerId = await getPlayerIdForUser(uid);
          if (playerId) {
            uidToPlayerIdMap.set(uid, playerId);
            participantPlayerIds.push(playerId);
            logger.debug(`[finalizeTournament] Mapped UID ${uid} → Player ID ${playerId}`);
          } else {
            logger.warn(`[finalizeTournament] Could not find Player ID for UID ${uid}`);
          }
        } catch (error) {
          logger.error(`[finalizeTournament] Error converting UID ${uid} to Player ID:`, error);
        }
      }
      
      if (participantPlayerIds.length === 0) {
        logger.error(`[finalizeTournament] No valid Player IDs found for tournament ${tournamentId}`);
        await tournamentRef.update({ 
            status: 'completed', 
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(), 
            lastError: "Keine gültigen Player IDs gefunden.",
            totalRankedEntities: 0,
            rankedPlayerUids: [],
            rankingSystemUsed: rankingModeToStore
        });
        return { success: true, message: "Keine gültigen Player IDs gefunden, Abschluss ohne Ranking."};
      }
      
      logger.info(`[finalizeTournament] Successfully converted ${participantPlayerIds.length}/${participantUidsInTournament.length} UIDs to Player IDs`);

      // 1. Alle abgeschlossenen Spiele/Passen des Turniers laden
      const gamesRef = tournamentRef.collection("games");
      const gamesSnap = await gamesRef.where("status", "==", "completed").get();
      const tournamentGames: TournamentGameData[] = [];
      gamesSnap.forEach(doc => {
        tournamentGames.push({ id: doc.id, ...doc.data() } as TournamentGameData);
      });

      if (tournamentGames.length === 0) {
        logger.warn(`No completed games found for tournament ${tournamentId}. Cannot calculate rankings.`);
        // Dennoch Turnier als abgeschlossen markieren, ggf. mit Hinweis
        await tournamentRef.update({ 
            status: 'completed', 
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(), 
            lastError: "Keine abgeschlossenen Spiele.",
            totalRankedEntities: 0,
            rankedPlayerUids: [],
            rankingSystemUsed: rankingModeToStore
        });
        return { success: true, message: "Keine abgeschlossenen Spiele im Turnier, Abschluss ohne Ranking." };
      }

      // ✅ NEU: Berechne eventCounts für alle Tournament-Games
      logger.info(`🔥 Berechne eventCounts für ${tournamentGames.length} Tournament-Games...`);
      const gameBatch = db.batch();
      
      for (const game of tournamentGames) {
        if (game.finalStriche && !game.eventCounts) {
          // Berechne eventCounts für dieses Game
          const eventCounts = calculateEventCountsForTournamentGame(game);
          
          // Update das Game in Firestore
          const gameRef = gamesRef.doc(game.id);
          gameBatch.update(gameRef, { eventCounts });
          
          // Update das lokale Game-Objekt für weitere Berechnungen
          game.eventCounts = eventCounts;
          
          logger.info(`  ✅ Game ${game.id}: eventCounts berechnet - Bottom: ${JSON.stringify(eventCounts.bottom)}, Top: ${JSON.stringify(eventCounts.top)}`);
        }
      }
      
      // Commit alle Game-Updates
      await gameBatch.commit();
      logger.info(`🎯 EventCounts für ${tournamentGames.length} Games erfolgreich berechnet und gespeichert`);

      // NEU: Batch für das Schreiben der Player-Rankings
      const playerRankingBatch = db.batch();
      const playerRankingsColRef = tournamentRef.collection("playerRankings");
      const allRankedPlayerUidsForTournamentDoc = new Set<string>();
      let totalRankedEntitiesForTournamentDoc = 0;

      switch (tournamentMode) {
        case 'single': {
          logger.info(`Handling 'single' tournament mode for ${tournamentId}.`);
          
          // ✅ ERWEITERTE PLAYER-STATISTIK-STRUKTUR
          interface PlayerStats {
            // Scores
            pointsScored: number;
            pointsReceived: number;
            stricheScored: number;
            stricheReceived: number;
            score: number; // Legacy für Ranking
            
            // Game Stats
            gamesPlayed: number;
            wins: number;
            losses: number;
            draws: number;
            
            // Event Counts (nur sinnvolle!)
            eventCounts: {
              matschMade: number;
              matschReceived: number;
              schneiderMade: number;
              schneiderReceived: number;
              kontermatschMade: number;
              kontermatschReceived: number;
            };
            
            // Weis
            totalWeisPoints: number;
          }
          
          const playerScores: { [playerId: string]: PlayerStats } = {};
          participantPlayerIds.forEach(playerId => {
            playerScores[playerId] = {
              pointsScored: 0,
              pointsReceived: 0,
              stricheScored: 0,
              stricheReceived: 0,
              score: 0,
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              eventCounts: {
                matschMade: 0,
                matschReceived: 0,
                schneiderMade: 0,
                schneiderReceived: 0,
                kontermatschMade: 0,
                kontermatschReceived: 0
              },
              totalWeisPoints: 0
            };
          });

          const calculateStricheForGame = (game: TournamentGameData, playerId: string): number => {
            let striche = 0;
            // ✅ KORRIGIERT: Konvertiere Player ID zurück zu UID für Game-Team-Zuordnung
            const playerUid = Array.from(uidToPlayerIdMap.entries()).find(([uid, pid]) => pid === playerId)?.[0];
            if (!playerUid) return 0;
            
            const team = game.teams?.top?.playerUids?.includes(playerUid) ? 'top' : 
                         (game.teams?.bottom?.playerUids?.includes(playerUid) ? 'bottom' : null);
            if (team && game.finalStriche?.[team]) {
              const teamStriche = game.finalStriche[team];
              if (scoreSettingsEnabled?.berg) striche += (teamStriche.berg || 0);
              if (scoreSettingsEnabled?.sieg) striche += (teamStriche.sieg || 0); 
              if (scoreSettingsEnabled?.schneider) striche += (teamStriche.schneider || 0);
              striche += (teamStriche.matsch || 0);
              striche += (teamStriche.kontermatsch || 0);
            }
            return striche;
          };

          // ✅ NEU: Iteriere über alle Games und sammle ALLE Statistiken
          for (const game of tournamentGames) {
            const gameParticipants = game.participantUids || [];
            
            for (const gameParticipantUid of gameParticipants) {
              // Konvertiere Game UID zu Player ID
              const playerId = uidToPlayerIdMap.get(gameParticipantUid);
              if (!playerId || !playerScores[playerId]) continue;

              playerScores[playerId].gamesPlayed++;
              
              const playerTeam = game.teams?.top?.playerUids?.includes(gameParticipantUid) ? 'top' :
                                 (game.teams?.bottom?.playerUids?.includes(gameParticipantUid) ? 'bottom' : null);
              
              if (!playerTeam) continue;
              
              const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
              
              // ===== 1. PUNKTE SAMMELN =====
              const playerPoints = game.finalScores[playerTeam] || 0;
              const opponentPoints = game.finalScores[opponentTeam] || 0;
              playerScores[playerId].pointsScored += playerPoints;
              playerScores[playerId].pointsReceived += opponentPoints;
              
              // ===== 2. STRICHE SAMMELN =====
              const playerStriche = calculateStricheForGame(game, playerId);
              // Berechne Gegner-Striche für "received"
              const opponentUid = game.teams?.[opponentTeam]?.playerUids?.[0];
              const opponentPlayerId = opponentUid ? uidToPlayerIdMap.get(opponentUid) : null;
              const opponentStriche = opponentPlayerId ? calculateStricheForGame(game, opponentPlayerId) : 0;
              
              playerScores[playerId].stricheScored += playerStriche;
              playerScores[playerId].stricheReceived += opponentStriche;
              
              // ===== 3. WINS/LOSSES/DRAWS =====
              if (playerPoints > opponentPoints) {
                playerScores[playerId].wins++;
              } else if (playerPoints < opponentPoints) {
                playerScores[playerId].losses++;
              } else {
                playerScores[playerId].draws++;
              }
              
              // ===== 4. EVENT COUNTS (nur sinnvolle!) =====
              if (game.eventCounts && game.eventCounts[playerTeam]) {
                const teamEvents = game.eventCounts[playerTeam];
                const opponentEvents = game.eventCounts[opponentTeam];
                
                // Events die man MACHT
                playerScores[playerId].eventCounts.matschMade += teamEvents.matsch || 0;
                playerScores[playerId].eventCounts.schneiderMade += teamEvents.schneider || 0;
                playerScores[playerId].eventCounts.kontermatschMade += teamEvents.kontermatsch || 0;
                
                // Events die man EMPFÄNGT (vom Gegner)
                playerScores[playerId].eventCounts.matschReceived += opponentEvents.matsch || 0;
                playerScores[playerId].eventCounts.schneiderReceived += opponentEvents.schneider || 0;
                playerScores[playerId].eventCounts.kontermatschReceived += opponentEvents.kontermatsch || 0;
                
                // NICHT: berg/sieg (redundant - ist bereits in striche bzw. wins)
              }
              
              // ===== 5. WEIS POINTS (falls verfügbar in playerDetails) =====
              if (game.playerDetails && Array.isArray(game.playerDetails)) {
                const playerDetail = game.playerDetails.find(pd => pd.uid === gameParticipantUid);
                if (playerDetail && playerDetail.weisPoints) {
                  playerScores[playerId].totalWeisPoints += playerDetail.weisPoints;
                }
              }
              
              // ===== 6. LEGACY SCORE für Ranking =====
              if (rankingModeToStore === 'striche') {
                playerScores[playerId].score += playerStriche;
              } else {
                playerScores[playerId].score += playerPoints;
              }
            }
          }

          const rankedPlayers = Object.entries(playerScores)
            .map(([playerId, data]) => ({ playerId, ...data }))
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return a.gamesPlayed - b.gamesPlayed; 
            });

          totalRankedEntitiesForTournamentDoc = rankedPlayers.length;

          // PlayerComputedStats aktualisieren UND PlayerRankings speichern
          const singleModePromises = rankedPlayers.map(async (player, index) => {
            const rank = index + 1;
            allRankedPlayerUidsForTournamentDoc.add(player.playerId);
            const playerStatsRef = db.collection("playerComputedStats").doc(player.playerId);
            
            // ✅ Speichere ERWEITERTE Ranking-Daten für diesen Spieler
            const playerRankingDocRef = playerRankingsColRef.doc(player.playerId);
            const rankingData: TournamentPlayerRankingData = {
                // Identifikation
                playerId: player.playerId,
                tournamentId: tournamentId,
                tournamentName: tournamentName,
                tournamentFinalizedAt: admin.firestore.Timestamp.now(),
                createdAt: admin.firestore.Timestamp.now(),
                
                // Ranking
                rank: rank,
                totalRankedEntities: rankedPlayers.length,
                rankingSystemUsed: rankingModeToStore,
                
                // ✅ SCORES MIT DIFFERENZEN
                // Punkte
                pointsScored: player.pointsScored,
                pointsReceived: player.pointsReceived,
                pointsDifference: player.pointsScored - player.pointsReceived,
                totalPoints: player.pointsScored, // Legacy
                
                // Striche
                stricheScored: player.stricheScored,
                stricheReceived: player.stricheReceived,
                stricheDifference: player.stricheScored - player.stricheReceived,
                totalStriche: player.stricheScored, // Legacy
                
                score: player.score, // Legacy: Haupt-Score für Ranking
                
                // ✅ SPIEL-STATISTIKEN
                gamesPlayed: player.gamesPlayed,
                gamesWon: player.wins,
                gamesLost: player.losses,
                gamesDraw: player.draws,
                rawWins: player.wins, // Legacy
                
                // ✅ EVENT COUNTS
                eventCounts: player.eventCounts,
                
                // ✅ WEIS-STATISTIKEN
                totalWeisPoints: player.totalWeisPoints,
                averageWeisPerGame: player.gamesPlayed > 0 ? player.totalWeisPoints / player.gamesPlayed : 0
            };
            
            logger.info(`[finalizeTournament] Saving ranking for player ${player.playerId} (rank ${rank}): ` +
                       `Points ${player.pointsScored}/${player.pointsReceived} (${player.pointsScored - player.pointsReceived}), ` +
                       `Striche ${player.stricheScored}/${player.stricheReceived} (${player.stricheScored - player.stricheReceived})`);
            
            playerRankingBatch.set(playerRankingDocRef, rankingData);

            try {
              await db.runTransaction(async (transaction) => {
                const playerStatsDoc = await transaction.get(playerStatsRef);
                let stats: PlayerComputedStats;
                if (!playerStatsDoc.exists) {
                  stats = JSON.parse(JSON.stringify(initialPlayerComputedStats));
                } else {
                  stats = playerStatsDoc.data() as PlayerComputedStats;
                }
                stats.lastUpdateTimestamp = admin.firestore.Timestamp.now();
                stats.totalTournamentsParticipated = (stats.totalTournamentsParticipated || 0) + 1;
                if (rank === 1) {
                  stats.tournamentWins = (stats.tournamentWins || 0) + 1;
                }
                const currentPlacement: TournamentPlacement = {
                  tournamentId: tournamentId,
                  tournamentName: tournamentName, // Ohne Teamname für Single-Modus
                  rank: rank,
                  totalParticipants: rankedPlayers.length, // Beibehalten für Abwärtskompatibilität
                  totalRankedEntities: rankedPlayers.length, // NEU
                  date: tournamentData.createdAt || admin.firestore.Timestamp.now(),
                  highlights: [], // NEU
                };
                if (!stats.bestTournamentPlacement || rank < stats.bestTournamentPlacement.rank) {
                  stats.bestTournamentPlacement = currentPlacement;
                }
                stats.tournamentPlacements = [currentPlacement, ...(stats.tournamentPlacements || [])].slice(0, 20);
                // Highlight wird hier nicht dupliziert, da recalculateStats dies basierend auf dem TOURNAMENT_END Event macht
                transaction.set(playerStatsRef, stats, { merge: true });
              });
            } catch (txError) {
              logger.error(`Transaction failed for player ${player.playerId} in tournament ${tournamentId}:`, txError);
            }
          });
          await Promise.all(singleModePromises);
          logger.info(`Player stats updated and rankings prepared for 'single' tournament ${tournamentId}.`);
          break;
        }
        case 'doubles': {
          logger.info(`Handling 'doubles' tournament mode for ${tournamentId}.`);
          if (!tournamentData.teams || tournamentData.teams.length === 0) {
            logger.warn(`No teams defined for 'doubles' tournament ${tournamentId}. Cannot calculate rankings.`);
            await tournamentRef.update({ 
                status: 'completed', 
                finalizedAt: admin.firestore.FieldValue.serverTimestamp(), 
                lastError: "Keine Teams für Doppelmodus definiert.",
                totalRankedEntities: 0,
                rankedPlayerUids: [],
                rankingSystemUsed: rankingModeToStore
            });
            return { success: true, message: "Keine Teams für Doppelmodus definiert, Abschluss ohne Ranking." };
          }

          // ✅ ERWEITERTE TEAM-STATISTIK-STRUKTUR für doubles
          interface TeamStats {
            id: string;
            teamName: string;
            playerUids: string[];
            
            // Scores
            pointsScored: number;
            pointsReceived: number;
            stricheScored: number;
            stricheReceived: number;
            score: number; // Legacy für Ranking
            
            // Game Stats
            gamesPlayed: number;
            wins: number;
            losses: number;
            draws: number;
            
            // Event Counts (nur sinnvolle!)
            eventCounts: {
              matschMade: number;
              matschReceived: number;
              schneiderMade: number;
              schneiderReceived: number;
              kontermatschMade: number;
              kontermatschReceived: number;
            };
            
            // Weis
            totalWeisPoints: number;
          }

          const teamScores: { [teamDataId: string]: TeamStats } = {};
          tournamentData.teams.forEach(team => {
            teamScores[team.id] = { 
              id: team.id, 
              teamName: team.name, 
              playerUids: team.playerUids,
              pointsScored: 0,
              pointsReceived: 0,
              stricheScored: 0,
              stricheReceived: 0,
              score: 0,
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              eventCounts: {
                matschMade: 0,
                matschReceived: 0,
                schneiderMade: 0,
                schneiderReceived: 0,
                kontermatschMade: 0,
                kontermatschReceived: 0
              },
              totalWeisPoints: 0
            };
          });

          const calculateStricheForTeamInGame = (game: TournamentGameData, teamPlayerUids: string[]): number => {
            let striche = 0;
            const gameTeamKey = game.teams?.top?.playerUids?.some(uid => teamPlayerUids.includes(uid)) ? 'top' :
                               (game.teams?.bottom?.playerUids?.some(uid => teamPlayerUids.includes(uid)) ? 'bottom' : null);
            if (gameTeamKey && game.finalStriche?.[gameTeamKey]) {
              const teamStricheRecord = game.finalStriche[gameTeamKey];
              if (scoreSettingsEnabled?.berg) striche += (teamStricheRecord.berg || 0);
              if (scoreSettingsEnabled?.sieg) striche += (teamStricheRecord.sieg || 0);
              if (scoreSettingsEnabled?.schneider) striche += (teamStricheRecord.schneider || 0);
              striche += (teamStricheRecord.matsch || 0);
              striche += (teamStricheRecord.kontermatsch || 0);
            }
            return striche;
          };
          
          // ✅ NEU: Iteriere über alle Games und sammle ALLE Statistiken für Teams
          for (const game of tournamentGames) {
            // Identifiziere die teilnehmenden Turnier-Teams in diesem Spiel
            const playingTournamentTeams: {teamId: string, teamKeyInGame: 'top' | 'bottom', playerUids: string[]}[] = [];
            
            for (const definedTeam of tournamentData.teams) {
                if (game.teams?.top?.playerUids?.some(uid => definedTeam.playerUids.includes(uid))) {
                    playingTournamentTeams.push({teamId: definedTeam.id, teamKeyInGame: 'top', playerUids: definedTeam.playerUids});
                } else if (game.teams?.bottom?.playerUids?.some(uid => definedTeam.playerUids.includes(uid))) {
                    playingTournamentTeams.push({teamId: definedTeam.id, teamKeyInGame: 'bottom', playerUids: definedTeam.playerUids});
                }
            }

            if (playingTournamentTeams.length !== 2) {
                logger.warn(`Game ${game.id} in doubles tournament ${tournamentId} does not involve exactly two defined tournament teams. Skipping game for ranking.`);
                continue;
            }

            const teamA = playingTournamentTeams[0];
            const teamB = playingTournamentTeams[1];

            if (!teamScores[teamA.teamId] || !teamScores[teamB.teamId]) {
                logger.warn(`Game ${game.id} involves teams not registered in the tournament. Skipping.`);
                continue;
            }
            
            teamScores[teamA.teamId].gamesPlayed++;
            teamScores[teamB.teamId].gamesPlayed++;

            // ===== 1. PUNKTE SAMMELN =====
            const teamAPoints = game.finalScores[teamA.teamKeyInGame] || 0;
            const teamBPoints = game.finalScores[teamB.teamKeyInGame] || 0;
            teamScores[teamA.teamId].pointsScored += teamAPoints;
            teamScores[teamA.teamId].pointsReceived += teamBPoints;
            teamScores[teamB.teamId].pointsScored += teamBPoints;
            teamScores[teamB.teamId].pointsReceived += teamAPoints;
            
            // ===== 2. STRICHE SAMMELN =====
            const teamAStriche = calculateStricheForTeamInGame(game, teamA.playerUids);
            const teamBStriche = calculateStricheForTeamInGame(game, teamB.playerUids);
            teamScores[teamA.teamId].stricheScored += teamAStriche;
            teamScores[teamA.teamId].stricheReceived += teamBStriche;
            teamScores[teamB.teamId].stricheScored += teamBStriche;
            teamScores[teamB.teamId].stricheReceived += teamAStriche;
            
            // ===== 3. WINS/LOSSES/DRAWS =====
            if (teamAPoints > teamBPoints) {
              teamScores[teamA.teamId].wins++;
              teamScores[teamB.teamId].losses++;
            } else if (teamBPoints > teamAPoints) {
              teamScores[teamB.teamId].wins++;
              teamScores[teamA.teamId].losses++;
            } else {
              teamScores[teamA.teamId].draws++;
              teamScores[teamB.teamId].draws++;
            }
            
            // ===== 4. EVENT COUNTS (nur sinnvolle!) =====
            if (game.eventCounts) {
              const teamAEvents = game.eventCounts[teamA.teamKeyInGame];
              const teamBEvents = game.eventCounts[teamB.teamKeyInGame];
              
              if (teamAEvents && teamBEvents) {
                // Events die Team A MACHT
                teamScores[teamA.teamId].eventCounts.matschMade += teamAEvents.matsch || 0;
                teamScores[teamA.teamId].eventCounts.schneiderMade += teamAEvents.schneider || 0;
                teamScores[teamA.teamId].eventCounts.kontermatschMade += teamAEvents.kontermatsch || 0;
                
                // Events die Team A EMPFÄNGT (von Team B)
                teamScores[teamA.teamId].eventCounts.matschReceived += teamBEvents.matsch || 0;
                teamScores[teamA.teamId].eventCounts.schneiderReceived += teamBEvents.schneider || 0;
                teamScores[teamA.teamId].eventCounts.kontermatschReceived += teamBEvents.kontermatsch || 0;
                
                // Events die Team B MACHT
                teamScores[teamB.teamId].eventCounts.matschMade += teamBEvents.matsch || 0;
                teamScores[teamB.teamId].eventCounts.schneiderMade += teamBEvents.schneider || 0;
                teamScores[teamB.teamId].eventCounts.kontermatschMade += teamBEvents.kontermatsch || 0;
                
                // Events die Team B EMPFÄNGT (von Team A)
                teamScores[teamB.teamId].eventCounts.matschReceived += teamAEvents.matsch || 0;
                teamScores[teamB.teamId].eventCounts.schneiderReceived += teamAEvents.schneider || 0;
                teamScores[teamB.teamId].eventCounts.kontermatschReceived += teamAEvents.kontermatsch || 0;
              }
            }
            
            // ===== 5. WEIS POINTS (falls verfügbar in playerDetails) =====
            if (game.playerDetails && Array.isArray(game.playerDetails)) {
              for (const playerUid of teamA.playerUids) {
                const playerDetail = game.playerDetails.find(pd => pd.uid === playerUid);
                if (playerDetail && playerDetail.weisPoints) {
                  teamScores[teamA.teamId].totalWeisPoints += playerDetail.weisPoints;
                }
              }
              for (const playerUid of teamB.playerUids) {
                const playerDetail = game.playerDetails.find(pd => pd.uid === playerUid);
                if (playerDetail && playerDetail.weisPoints) {
                  teamScores[teamB.teamId].totalWeisPoints += playerDetail.weisPoints;
                }
              }
            }
            
            // ===== 6. LEGACY SCORE für Ranking =====
            if (rankingModeToStore === 'striche') {
              teamScores[teamA.teamId].score += teamAStriche;
              teamScores[teamB.teamId].score += teamBStriche;
            } else {
              teamScores[teamA.teamId].score += teamAPoints;
              teamScores[teamB.teamId].score += teamBPoints;
            }
          }

          const rankedTeams = Object.values(teamScores)
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return a.gamesPlayed - b.gamesPlayed;
            });

          totalRankedEntitiesForTournamentDoc = rankedTeams.length;

          const doublesPlayerStatsUpdatePromises: Promise<void>[] = [];
          for (let i = 0; i < rankedTeams.length; i++) {
            const team = rankedTeams[i];
            const rank = i + 1;
            for (const playerUid of team.playerUids) {
              // ✅ KORRIGIERT: Konvertiere UID zu Player ID für Stats
              const playerId = uidToPlayerIdMap.get(playerUid);
              if (!playerId) {
                logger.warn(`[finalizeTournament] Could not find Player ID for UID ${playerUid} in doubles mode`);
                continue;
              }
              
              allRankedPlayerUidsForTournamentDoc.add(playerId);
              const playerRankingDocRef = playerRankingsColRef.doc(playerId);
              
              // ✅ Speichere ERWEITERTE Ranking-Daten für diesen Spieler im Team
              const rankingData: TournamentPlayerRankingData = {
                  // Identifikation
                  playerId: playerId,
                  tournamentId: tournamentId,
                  tournamentName: tournamentName,
                  tournamentFinalizedAt: admin.firestore.Timestamp.now(),
                  createdAt: admin.firestore.Timestamp.now(),
                  
                  // Ranking
                  rank: rank,
                  totalRankedEntities: rankedTeams.length,
                  rankingSystemUsed: rankingModeToStore,
                  
                  // Team-Info
                  teamId: team.id,
                  teamName: team.teamName,
                  
                  // ✅ SCORES MIT DIFFERENZEN (vom Team)
                  // Punkte
                  pointsScored: team.pointsScored,
                  pointsReceived: team.pointsReceived,
                  pointsDifference: team.pointsScored - team.pointsReceived,
                  totalPoints: team.pointsScored, // Legacy
                  
                  // Striche
                  stricheScored: team.stricheScored,
                  stricheReceived: team.stricheReceived,
                  stricheDifference: team.stricheScored - team.stricheReceived,
                  totalStriche: team.stricheScored, // Legacy
                  
                  score: team.score, // Legacy: Haupt-Score für Ranking
                  
                  // ✅ SPIEL-STATISTIKEN (vom Team)
                  gamesPlayed: team.gamesPlayed,
                  gamesWon: team.wins,
                  gamesLost: team.losses,
                  gamesDraw: team.draws,
                  rawWins: team.wins, // Legacy
                  
                  // ✅ EVENT COUNTS (vom Team)
                  eventCounts: team.eventCounts,
                  
                  // ✅ WEIS-STATISTIKEN (vom Team)
                  totalWeisPoints: team.totalWeisPoints,
                  averageWeisPerGame: team.gamesPlayed > 0 ? team.totalWeisPoints / team.gamesPlayed : 0
              };
              
              logger.info(`[finalizeTournament] Saving doubles ranking for player ${playerId} (Team: ${team.teamName}, rank ${rank}): ` +
                         `Points ${team.pointsScored}/${team.pointsReceived} (${team.pointsScored - team.pointsReceived}), ` +
                         `Striche ${team.stricheScored}/${team.stricheReceived} (${team.stricheScored - team.stricheReceived})`);
              
              playerRankingBatch.set(playerRankingDocRef, rankingData);
              
              const playerStatsRef = db.collection("playerComputedStats").doc(playerId);
              doublesPlayerStatsUpdatePromises.push(
                db.runTransaction(async (transaction) => {
                  const playerStatsDoc = await transaction.get(playerStatsRef);
                  let stats: PlayerComputedStats;
                  if (!playerStatsDoc.exists) {
                      stats = JSON.parse(JSON.stringify(initialPlayerComputedStats));
                  } else {
                      stats = playerStatsDoc.data() as PlayerComputedStats;
                  }
                  stats.lastUpdateTimestamp = admin.firestore.Timestamp.now();
                  stats.totalTournamentsParticipated = (stats.totalTournamentsParticipated || 0) + 1;
                  if (rank === 1) {
                      stats.tournamentWins = (stats.tournamentWins || 0) + 1;
                  }
                  const currentPlacement: TournamentPlacement = {
                      tournamentId: tournamentId,
                      tournamentName: `${tournamentName} (Team: ${team.teamName})`,
                      rank: rank,
                      totalParticipants: rankedTeams.length, // Beibehalten
                      totalRankedEntities: rankedTeams.length, // NEU
                      date: tournamentData.createdAt || admin.firestore.Timestamp.now(),
                      highlights: [], // NEU
                  };
                  if (!stats.bestTournamentPlacement || rank < stats.bestTournamentPlacement.rank) {
                      stats.bestTournamentPlacement = currentPlacement;
                  }
                  stats.tournamentPlacements = [currentPlacement, ...(stats.tournamentPlacements || [])].slice(0, 20);
                  const tournamentHighlight: StatHighlight = {
                      type: rank === 1 ? "tournament_win" : "tournament_participation",
                      value: rank,
                      stringValue: team.teamName,
                      date: tournamentData.createdAt || admin.firestore.Timestamp.now(),
                      relatedId: tournamentId,
                      label: rank === 1 ? `Turniersieg: ${tournamentName} (Team: ${team.teamName})` : `Turnierteilnahme: ${tournamentName} (Rang ${rank}, Team: ${team.teamName})`,
                  };
                  stats.highlights = [tournamentHighlight, ...(stats.highlights || [])].slice(0, 50);
                  transaction.set(playerStatsRef, stats, { merge: true });
                }).catch(txError => {
                    logger.error(`Transaction failed for player ${playerUid} (Team: ${team.teamName}) in tournament ${tournamentId}:`, txError);
                })
              );
            }
          }
          await Promise.all(doublesPlayerStatsUpdatePromises);
          logger.info(`Player stats updated and rankings prepared for 'doubles' tournament ${tournamentId}.`);
          break;
        }
        case 'groupVsGroup': {
          logger.info(`Handling 'groupVsGroup' tournament mode for ${tournamentId}.`);

          // Annahme: tournamentData.groups enthält Infos zu den teilnehmenden Gruppen
          // z.B. [{ groupId: "id1", name: "Gruppe A", playerUids: ["uid1", "uid2"] }, ...]
          // ODER tournamentData.participatingGroupIds und wir laden die Gruppen-Infos separat.
          // Für dieses Beispiel nehmen wir an, dass `tournamentData.groups` die notwendigen Infos enthält.

          if (!tournamentData.groups || tournamentData.groups.length < 2) {
            logger.warn(`Not enough groups defined for 'groupVsGroup' tournament ${tournamentId}. Needs at least 2. Cannot calculate rankings.`);
            await tournamentRef.update({ 
                status: 'completed', 
                finalizedAt: admin.firestore.FieldValue.serverTimestamp(), 
                lastError: "Nicht genügend Gruppen für groupVsGroup-Modus definiert.",
                totalRankedEntities: 0,
                rankedPlayerUids: [],
                rankingSystemUsed: rankingModeToStore
            });
            return { success: true, message: "Nicht genügend Gruppen (min. 2) für groupVsGroup-Modus definiert, Abschluss ohne Ranking." };
          }

          // ✅ ERWEITERTE GRUPPEN-STATISTIK-STRUKTUR für groupVsGroup
          interface GroupStats {
            groupId: string;
            groupName: string;
            playerUids: string[];
            
            // Scores
            pointsScored: number;
            pointsReceived: number;
            stricheScored: number;
            stricheReceived: number;
            score: number; // Legacy für Ranking
            
            // Game Stats
            gamesPlayed: number;
            wins: number;
            losses: number;
            draws: number;
            
            // Event Counts (nur sinnvolle!)
            eventCounts: {
              matschMade: number;
              matschReceived: number;
              schneiderMade: number;
              schneiderReceived: number;
              kontermatschMade: number;
              kontermatschReceived: number;
            };
            
            // Weis
            totalWeisPoints: number;
          }

          const groupStats: { [groupId: string]: GroupStats } = {};
          // Expliziter Typ für group
          tournamentData.groups.forEach((group: TournamentGroupDefinition) => { 
            groupStats[group.id] = { 
              groupId: group.id,
              groupName: group.name,
              playerUids: group.playerUids || [], // Spieler der Gruppe
              pointsScored: 0,
              pointsReceived: 0,
              stricheScored: 0,
              stricheReceived: 0,
              score: 0,
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              eventCounts: {
                matschMade: 0,
                matschReceived: 0,
                schneiderMade: 0,
                schneiderReceived: 0,
                kontermatschMade: 0,
                kontermatschReceived: 0
              },
              totalWeisPoints: 0
            };
          });

          // Hilfsfunktion (ähnlich wie bei 'doubles', aber für Gruppen)
          const calculateStricheForGroupInGame = (game: TournamentGameData, groupPlayerUids: string[]): number => {
            let striche = 0;
            const gameTeamKey = game.teams?.top?.playerUids?.some(uid => groupPlayerUids.includes(uid)) ? 'top' :
                               (game.teams?.bottom?.playerUids?.some(uid => groupPlayerUids.includes(uid)) ? 'bottom' : null);
            if (gameTeamKey && game.finalStriche?.[gameTeamKey]) {
              const teamStricheRecord = game.finalStriche[gameTeamKey];
              if (scoreSettingsEnabled?.berg) striche += (teamStricheRecord.berg || 0);
              if (scoreSettingsEnabled?.sieg) striche += (teamStricheRecord.sieg || 0);
              if (scoreSettingsEnabled?.schneider) striche += (teamStricheRecord.schneider || 0);
              striche += (teamStricheRecord.matsch || 0);
              striche += (teamStricheRecord.kontermatsch || 0);
            }
            return striche;
          };

          // ✅ NEU: Iteriere über alle Games und sammle ALLE Statistiken für Gruppen
          for (const game of tournamentGames) {
            // Finde die zwei Gruppen, die in diesem Spiel gegeneinander gespielt haben
            const involvedGroupsInGame: GroupStats[] = [];
            const gameParticipantUids = new Set(game.participantUids || []);

            for (const groupId in groupStats) {
              if (Object.prototype.hasOwnProperty.call(groupStats, groupId)) {
              const group = groupStats[groupId];
              // Prüfen, ob mindestens ein Spieler der Gruppe an diesem Spiel teilgenommen hat
              if (group.playerUids.some(uid => gameParticipantUids.has(uid))) {
                involvedGroupsInGame.push(group);
                }
              }
            }

            if (involvedGroupsInGame.length !== 2) {
              logger.warn(`Game ${game.id} in groupVsGroup tournament ${tournamentId} does not clearly involve two defined tournament groups. Found ${involvedGroupsInGame.length} groups. Skipping game for group ranking.`);
              continue;
            }

            const groupA = involvedGroupsInGame[0];
            const groupB = involvedGroupsInGame[1];

            groupStats[groupA.groupId].gamesPlayed++;
            groupStats[groupB.groupId].gamesPlayed++;

            // Bestimme, welches Team (top/bottom) im Spiel zu welcher Gruppe gehört
            const groupATeamKey = game.teams?.top?.playerUids?.some(uid => groupA.playerUids.includes(uid)) ? 'top' :
                                 (game.teams?.bottom?.playerUids?.some(uid => groupA.playerUids.includes(uid)) ? 'bottom' : null);
            const groupBTeamKey = groupATeamKey === 'top' ? 'bottom' : (groupATeamKey === 'bottom' ? 'top' : null);

            if (!groupATeamKey || !groupBTeamKey) {
                logger.warn(`Could not determine team keys for groups in game ${game.id}. Skipping score calculation for this game.`);
                continue;
            }

            // ===== 1. PUNKTE SAMMELN =====
            const groupAPoints = game.finalScores[groupATeamKey] || 0;
            const groupBPoints = game.finalScores[groupBTeamKey] || 0;
            groupStats[groupA.groupId].pointsScored += groupAPoints;
            groupStats[groupA.groupId].pointsReceived += groupBPoints;
            groupStats[groupB.groupId].pointsScored += groupBPoints;
            groupStats[groupB.groupId].pointsReceived += groupAPoints;
            
            // ===== 2. STRICHE SAMMELN =====
            const groupAStriche = calculateStricheForGroupInGame(game, groupA.playerUids);
            const groupBStriche = calculateStricheForGroupInGame(game, groupB.playerUids);
            groupStats[groupA.groupId].stricheScored += groupAStriche;
            groupStats[groupA.groupId].stricheReceived += groupBStriche;
            groupStats[groupB.groupId].stricheScored += groupBStriche;
            groupStats[groupB.groupId].stricheReceived += groupAStriche;
            
            // ===== 3. WINS/LOSSES/DRAWS =====
            if (groupAPoints > groupBPoints) {
              groupStats[groupA.groupId].wins++;
              groupStats[groupB.groupId].losses++;
            } else if (groupBPoints > groupAPoints) {
              groupStats[groupB.groupId].wins++;
              groupStats[groupA.groupId].losses++;
            } else {
              groupStats[groupA.groupId].draws++;
              groupStats[groupB.groupId].draws++;
            }
            
            // ===== 4. EVENT COUNTS (nur sinnvolle!) =====
            if (game.eventCounts) {
              const groupAEvents = game.eventCounts[groupATeamKey];
              const groupBEvents = game.eventCounts[groupBTeamKey];
              
              if (groupAEvents && groupBEvents) {
                // Events die Gruppe A MACHT
                groupStats[groupA.groupId].eventCounts.matschMade += groupAEvents.matsch || 0;
                groupStats[groupA.groupId].eventCounts.schneiderMade += groupAEvents.schneider || 0;
                groupStats[groupA.groupId].eventCounts.kontermatschMade += groupAEvents.kontermatsch || 0;
                
                // Events die Gruppe A EMPFÄNGT (von Gruppe B)
                groupStats[groupA.groupId].eventCounts.matschReceived += groupBEvents.matsch || 0;
                groupStats[groupA.groupId].eventCounts.schneiderReceived += groupBEvents.schneider || 0;
                groupStats[groupA.groupId].eventCounts.kontermatschReceived += groupBEvents.kontermatsch || 0;
                
                // Events die Gruppe B MACHT
                groupStats[groupB.groupId].eventCounts.matschMade += groupBEvents.matsch || 0;
                groupStats[groupB.groupId].eventCounts.schneiderMade += groupBEvents.schneider || 0;
                groupStats[groupB.groupId].eventCounts.kontermatschMade += groupBEvents.kontermatsch || 0;
                
                // Events die Gruppe B EMPFÄNGT (von Gruppe A)
                groupStats[groupB.groupId].eventCounts.matschReceived += groupAEvents.matsch || 0;
                groupStats[groupB.groupId].eventCounts.schneiderReceived += groupAEvents.schneider || 0;
                groupStats[groupB.groupId].eventCounts.kontermatschReceived += groupAEvents.kontermatsch || 0;
              }
            }
            
            // ===== 5. WEIS POINTS (falls verfügbar in playerDetails) =====
            if (game.playerDetails && Array.isArray(game.playerDetails)) {
              for (const playerUid of groupA.playerUids) {
                const playerDetail = game.playerDetails.find(pd => pd.uid === playerUid);
                if (playerDetail && playerDetail.weisPoints) {
                  groupStats[groupA.groupId].totalWeisPoints += playerDetail.weisPoints;
                }
              }
              for (const playerUid of groupB.playerUids) {
                const playerDetail = game.playerDetails.find(pd => pd.uid === playerUid);
                if (playerDetail && playerDetail.weisPoints) {
                  groupStats[groupB.groupId].totalWeisPoints += playerDetail.weisPoints;
                }
              }
            }
            
            // ===== 6. LEGACY SCORE für Ranking =====
            if (rankingModeToStore === 'striche') {
              groupStats[groupA.groupId].score += groupAStriche;
              groupStats[groupB.groupId].score += groupBStriche;
            } else {
              groupStats[groupA.groupId].score += groupAPoints;
              groupStats[groupB.groupId].score += groupBPoints;
            }
          }

          const rankedGroups = Object.values(groupStats)
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score; // Höchster Score zuerst
              if (b.wins !== a.wins) return b.wins - a.wins; // Bei gleichem Score: Mehr Siege zuerst
              return a.gamesPlayed - b.gamesPlayed; // Weniger Spiele gespielt ist besser
            });

          const groupPlayerStatsUpdatePromises: Promise<void>[] = [];
          for (let i = 0; i < rankedGroups.length; i++) {
            const group = rankedGroups[i];
            const rank = i + 1;
            for (const playerUid of group.playerUids) {
              // ✅ KORRIGIERT: Konvertiere UID zu Player ID für Stats
              const playerId = uidToPlayerIdMap.get(playerUid);
              if (!playerId) {
                logger.warn(`[finalizeTournament] Could not find Player ID for UID ${playerUid} in groupVsGroup mode`);
                continue;
              }
              
              allRankedPlayerUidsForTournamentDoc.add(playerId);
              const playerRankingDocRef = playerRankingsColRef.doc(playerId);
              
              // ✅ Speichere ERWEITERTE Ranking-Daten für diesen Spieler in der Gruppe
              const rankingData: TournamentPlayerRankingData = {
                  // Identifikation
                  playerId: playerId,
                  tournamentId: tournamentId,
                  tournamentName: tournamentName,
                  tournamentFinalizedAt: admin.firestore.Timestamp.now(),
                  createdAt: admin.firestore.Timestamp.now(),
                  
                  // Ranking
                  rank: rank,
                  totalRankedEntities: rankedGroups.length,
                  rankingSystemUsed: rankingModeToStore,
                  
                  // Team-Info (hier: Gruppe)
                  teamId: group.groupId,
                  teamName: group.groupName,
                  
                  // ✅ SCORES MIT DIFFERENZEN (von der Gruppe)
                  // Punkte
                  pointsScored: group.pointsScored,
                  pointsReceived: group.pointsReceived,
                  pointsDifference: group.pointsScored - group.pointsReceived,
                  totalPoints: group.pointsScored, // Legacy
                  
                  // Striche
                  stricheScored: group.stricheScored,
                  stricheReceived: group.stricheReceived,
                  stricheDifference: group.stricheScored - group.stricheReceived,
                  totalStriche: group.stricheScored, // Legacy
                  
                  score: group.score, // Legacy: Haupt-Score für Ranking
                  
                  // ✅ SPIEL-STATISTIKEN (von der Gruppe)
                  gamesPlayed: group.gamesPlayed,
                  gamesWon: group.wins,
                  gamesLost: group.losses,
                  gamesDraw: group.draws,
                  rawWins: group.wins, // Legacy
                  
                  // ✅ EVENT COUNTS (von der Gruppe)
                  eventCounts: group.eventCounts,
                  
                  // ✅ WEIS-STATISTIKEN (von der Gruppe)
                  totalWeisPoints: group.totalWeisPoints,
                  averageWeisPerGame: group.gamesPlayed > 0 ? group.totalWeisPoints / group.gamesPlayed : 0
              };
              
              logger.info(`[finalizeTournament] Saving groupVsGroup ranking for player ${playerId} (Group: ${group.groupName}, rank ${rank}): ` +
                         `Points ${group.pointsScored}/${group.pointsReceived} (${group.pointsScored - group.pointsReceived}), ` +
                         `Striche ${group.stricheScored}/${group.stricheReceived} (${group.stricheScored - group.stricheReceived})`);
              
              playerRankingBatch.set(playerRankingDocRef, rankingData);

              const playerStatsRef = db.collection("playerComputedStats").doc(playerId);
              groupPlayerStatsUpdatePromises.push(
                db.runTransaction(async (transaction) => {
                  const playerStatsDoc = await transaction.get(playerStatsRef);
                  let stats: PlayerComputedStats;
                  if (!playerStatsDoc.exists) {
                      stats = JSON.parse(JSON.stringify(initialPlayerComputedStats));
                  } else {
                      stats = playerStatsDoc.data() as PlayerComputedStats;
                  }
                  stats.lastUpdateTimestamp = admin.firestore.Timestamp.now();
                  stats.totalTournamentsParticipated = (stats.totalTournamentsParticipated || 0) + 1;
                  if (rank === 1) {
                      stats.tournamentWins = (stats.tournamentWins || 0) + 1;
                  }
                  const currentPlacement: TournamentPlacement = {
                      tournamentId: tournamentId,
                      tournamentName: `${tournamentName} (Gruppe: ${group.groupName})`,
                      rank: rank,
                      totalParticipants: rankedGroups.length, // Beibehalten
                      totalRankedEntities: rankedGroups.length, // NEU
                      date: tournamentData.createdAt || admin.firestore.Timestamp.now(),
                      highlights: [], // NEU
                  };
                  if (!stats.bestTournamentPlacement || rank < stats.bestTournamentPlacement.rank) {
                      stats.bestTournamentPlacement = currentPlacement;
                  }
                  stats.tournamentPlacements = [currentPlacement, ...(stats.tournamentPlacements || [])].slice(0, 20);
                  const tournamentHighlight: StatHighlight = {
                      type: rank === 1 ? "tournament_win_group" : "tournament_participation_group",
                      value: rank,
                      stringValue: group.groupName,
                      date: tournamentData.createdAt || admin.firestore.Timestamp.now(),
                      relatedId: tournamentId,
                      label: rank === 1 ? `Turniersieg (Gruppe): ${tournamentName} - ${group.groupName}` : `Turnierteilnahme (Gruppe): ${tournamentName} - ${group.groupName} (Rang ${rank})`,
                  };
                  stats.highlights = [tournamentHighlight, ...(stats.highlights || [])].slice(0, 50);
                  transaction.set(playerStatsRef, stats, { merge: true });
                }).catch(txError => {
                    logger.error(`Transaction failed for player ${playerUid} (Group ${group.groupName}) in tournament ${tournamentId}:`, txError);
                })
              );
            }
          }
          await Promise.all(groupPlayerStatsUpdatePromises);
          logger.info(`Player stats updated and rankings prepared for 'groupVsGroup' tournament ${tournamentId}.`);
          break;
        }
        default: {
          logger.warn(`Unknown or unsupported tournament mode: ${tournamentMode} for tournament ${tournamentId}.`);
          // Hier keinen Batch Commit, da nichts zu speichern ist oder Fehler auftrat
          throw new HttpsError("unimplemented", `Turniermodus '${tournamentMode || 'nicht definiert'}' wird nicht unterstützt.`);
        }
      }

      // Batch für PlayerRankings committen, NACHDEM alle PlayerStats-Transaktionen (potenziell) durchgelaufen sind
      await playerRankingBatch.commit();
      logger.info(`Player rankings committed for tournament ${tournamentId}.`);

      await tournamentRef.update({ 
        status: 'completed', 
        finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastError: null,
        totalRankedEntities: totalRankedEntitiesForTournamentDoc,
        rankingSystemUsed: rankingModeToStore,
        rankedPlayerUids: Array.from(allRankedPlayerUidsForTournamentDoc)
      });

      // 🚀 INTELLIGENTE GRUPPENSTATISTIK-AKTUALISIERUNG FÜR ALLE TEILNEHMER-GRUPPEN
      const participantGroups = new Set<string>();
      
      // Sammle alle Gruppen der Turnier-Teilnehmer
      for (const playerUid of participantUidsInTournament) {
        try {
          const playerGroupsSnap = await db.collection('groups')
            .where(`players.${playerUid}`, '!=', null)
            .limit(10) // Begrenze auf 10 Gruppen pro Spieler
            .get();
          
          playerGroupsSnap.docs.forEach(groupDoc => {
            participantGroups.add(groupDoc.id);
          });
        } catch (groupQueryError) {
          logger.warn(`Error querying groups for player ${playerUid}:`, groupQueryError);
        }
      }

      // Aktualisiere Statistiken für alle betroffenen Gruppen
      const groupStatsUpdatePromises = Array.from(participantGroups).map(async (groupId) => {
        try {
          logger.info(`[finalizeTournament] Updating group stats for ${groupId} after tournament completion`);
          
          const groupRef = db.collection('groups').doc(groupId);
          const groupSnapshot = await groupRef.get();
          
          if (groupSnapshot.exists) {
            const groupData = groupSnapshot.data();
            const totalGames = groupData?.totalGames || 0;
            
            if (totalGames < 1000) {
              // Unter 1000 Spiele: Vollständige Neuberechnung
              logger.info(`[finalizeTournament] Group ${groupId} has ${totalGames} games (<1000), triggering full recalculation`);
              
              const groupStatsModule = await import('./groupStatsCalculator');
              await groupStatsModule.updateGroupComputedStatsAfterSession(groupId);
              
              logger.info(`[finalizeTournament] Group stats updated for ${groupId}`);
            } else {
              // Über 1000 Spiele: Markiere für Batch-Verarbeitung
              logger.info(`[finalizeTournament] Group ${groupId} has ${totalGames} games (≥1000), marking for batch update`);
              
              await groupRef.update({
                needsStatsRecalculation: true,
                lastTournamentFinalized: admin.firestore.Timestamp.now()
              });
            }
          }
        } catch (groupStatsError) {
          logger.error(`[finalizeTournament] Error updating group stats for ${groupId}:`, groupStatsError);
          // Fehler bei einzelner Gruppe soll Turnier-Finalisierung nicht blockieren
        }
      });

      // Warte auf alle Gruppen-Updates (parallel)
      await Promise.allSettled(groupStatsUpdatePromises);
      logger.info(`[finalizeTournament] Group stats update completed for ${participantGroups.size} groups`);

      // 🆕 Rating-Historie für Turnier-Ende speichern
      try {
        logger.info(`[finalizeTournament] Saving rating history snapshots for tournament ${tournamentId}`);
        
        // Sammle alle Gruppen der Turnier-Teilnehmer für Rating-Historie
        const groupsToUpdateHistory = new Set<string>();
        
        for (const playerUid of participantUidsInTournament) {
          try {
            const playerGroupsSnap = await db.collection('groups')
              .where(`players.${playerUid}`, '!=', null)
              .limit(5) // Begrenze auf 5 Gruppen pro Spieler für Rating-Historie
              .get();
            
            playerGroupsSnap.docs.forEach(groupDoc => {
              groupsToUpdateHistory.add(groupDoc.id);
            });
          } catch (groupQueryError) {
            logger.warn(`[finalizeTournament] Error querying groups for rating history for player ${playerUid}:`, groupQueryError);
          }
        }

        // Speichere Rating-Historie für jede betroffene Gruppe
        const historyPromises = Array.from(groupsToUpdateHistory).map(async (groupId) => {
          try {
            // Finde Spieler dieser Gruppe, die am Turnier teilgenommen haben
            const groupRef = db.collection('groups').doc(groupId);
            const groupDoc = await groupRef.get();
            
            if (groupDoc.exists) {
              const groupData = groupDoc.data();
              const groupPlayerUids = Object.keys(groupData?.players || {});
              const tournamentParticipantsInGroup = groupPlayerUids.filter(uid => 
                participantUidsInTournament.includes(uid)
              );
              
              if (tournamentParticipantsInGroup.length > 0) {
                await saveRatingHistorySnapshot(
                  groupId,
                  null, // Keine Session-ID bei Turnier-Ende
                  tournamentParticipantsInGroup,
                  'tournament_end',
                  tournamentId
                );
                
                logger.info(`[finalizeTournament] Rating history saved for ${tournamentParticipantsInGroup.length} players in group ${groupId}`);
              }
            }
          } catch (historyError) {
            logger.warn(`[finalizeTournament] Error saving rating history for group ${groupId}:`, historyError);
            // Fehler bei Rating-Historie soll Turnier-Finalisierung nicht blockieren
          }
        });

        await Promise.allSettled(historyPromises);
        logger.info(`[finalizeTournament] Rating history snapshots completed for tournament ${tournamentId}`);
      } catch (historyError) {
        logger.warn(`[finalizeTournament] Error during rating history snapshot process for tournament ${tournamentId}:`, historyError);
        // Rating-Historie-Fehler soll Turnier-Finalisierung nicht blockieren
      }

      logger.info(`--- finalizeTournament SUCCESS for ${tournamentId} ---`);
      return { success: true, message: `Turnier ${tournamentId} erfolgreich abgeschlossen und Rankings gespeichert.` };
    } catch (error) {
      logger.error(`--- finalizeTournament CRITICAL ERROR for ${tournamentId} --- `, error);
      // Versuche, den Fehler im Turnierdokument zu speichern
      try {
        await db.collection("tournaments").doc(tournamentId).update({ 
            lastError: error instanceof Error ? error.message : String(error),
            status: 'error_finalizing' // Ein spezieller Status für Fehler beim Abschluss
        });
      } catch (dbError) {
        logger.error(`Failed to update tournament doc with error state for ${tournamentId}:`, dbError);
      }

      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", `Ein interner Fehler ist beim Abschluss des Turniers ${tournamentId} aufgetreten.`, { errorDetails: (error as Error).message });
    }
  }
); 