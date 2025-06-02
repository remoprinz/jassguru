import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
// Ggf. weitere spezifische Modelle importieren, z.B. PlayerComputedStats, TournamentPlacement
import { PlayerComputedStats, initialPlayerComputedStats, TournamentPlacement, StatHighlight } from "./models/player-stats.model"; // PlayerComputedStats und TournamentPlacement importiert

const db = admin.firestore();

interface FinalizeTournamentData {
  tournamentId: string;
}

// Typ für die Rohdaten eines einzelnen Spiels/Passe im Turnier
interface TournamentGameData {
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
  // Weitere relevante Felder eines Spiels...
}

// NEU: Interface für die Struktur eines Gruppeneintrags im Turnierdokument
interface TournamentGroupDefinition {
  id: string;      // Eindeutige ID der Gruppe (könnte die Firestore Document ID sein)
  name: string;    // Anzeigename der Gruppe
  playerUids: string[]; // UIDs der Spieler in dieser Gruppe
}

interface TournamentDocData {
  name?: string;
  status?: string;
  tournamentMode?: 'single' | 'doubles' | 'groupVsGroup';
  playerUids?: string[]; 
  teams?: { id: string; playerUids: string[]; name: string }[];
  groups?: TournamentGroupDefinition[]; // NEU: Für groupVsGroup Modus
  settings?: {
    rankingMode?: 'total_points' | 'striche' | 'wins' | 'average_score_per_passe'; // Erweitert um 'striche'
    scoreSettings?: { // Für Strichzählung relevant
        enabled?: {
            berg?: boolean;
            sieg?: boolean;
            schneider?: boolean;
        }
    }
    // Weitere Settings...
  };
  createdAt?: admin.firestore.Timestamp; // Für TournamentPlacement
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
      const tournamentDate = tournamentData.createdAt || admin.firestore.Timestamp.now(); // Fallback
      const rankingMode = tournamentData.settings?.rankingMode || 'total_points'; // Default auf Punkte
      const scoreSettingsEnabled = tournamentData.settings?.scoreSettings?.enabled;

      logger.info(`Processing tournament ${tournamentId} (${tournamentName}) with mode: ${tournamentMode}, ranking: ${rankingMode}`);

      if (tournamentData.status === 'completed' || tournamentData.status === 'archived') {
        logger.warn(`Tournament ${tournamentId} is already finalized (status: ${tournamentData.status}). Skipping.`);
        return { success: true, message: `Turnier ${tournamentId} ist bereits abgeschlossen.` };
      }

      // Teilnehmer-UIDs aus dem Turnierdokument holen
      const participantUidsInTournament = tournamentData.playerUids || [];
      if (participantUidsInTournament.length === 0) {
        logger.warn(`No participants found in tournament ${tournamentId}. Cannot calculate rankings.`);
        await tournamentRef.update({ status: 'completed', finalizedAt: admin.firestore.FieldValue.serverTimestamp(), lastError: "Keine Teilnehmer." });
        return { success: true, message: "Keine Teilnehmer im Turnier, Abschluss ohne Ranking."};
      }

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
        await tournamentRef.update({ status: 'completed', finalizedAt: admin.firestore.FieldValue.serverTimestamp(), lastError: "Keine abgeschlossenen Spiele." });
        return { success: true, message: "Keine abgeschlossenen Spiele im Turnier, Abschluss ohne Ranking." };
      }

      switch (tournamentMode) {
        case 'single':
          logger.info(`Handling 'single' tournament mode for ${tournamentId}.`);
          
          const playerScores: { [uid: string]: { score: number; gamesPlayed: number; wins: number; } } = {};
          participantUidsInTournament.forEach(uid => {
            playerScores[uid] = { score: 0, gamesPlayed: 0, wins: 0 };
          });

          // Funktion zur Berechnung des Strichwerts für ein Spiel
          const calculateStricheForGame = (game: TournamentGameData, playerUid: string): number => {
            let striche = 0;
            const team = game.teams?.top?.playerUids?.includes(playerUid) ? 'top' : 
                         (game.teams?.bottom?.playerUids?.includes(playerUid) ? 'bottom' : null);
            if (team && game.finalStriche?.[team]) {
              const teamStriche = game.finalStriche[team];
              if (scoreSettingsEnabled?.berg) striche += (teamStriche.berg || 0);
              if (scoreSettingsEnabled?.sieg) striche += (teamStriche.sieg || 0); // Sieg zählt normal
              if (scoreSettingsEnabled?.schneider) striche += (teamStriche.schneider || 0);
              striche += (teamStriche.matsch || 0);
              striche += (teamStriche.kontermatsch || 0);
            }
            return striche;
          };

          for (const game of tournamentGames) {
            const gameParticipants = game.participantUids || [];
            for (const playerUid of gameParticipants) {
              if (!playerScores[playerUid]) continue; // Nur Spieler verarbeiten, die im Turnier registriert sind

              playerScores[playerUid].gamesPlayed++;
              let gameContribution = 0;
              const playerTeam = game.teams?.top?.playerUids?.includes(playerUid) ? 'top' :
                                 (game.teams?.bottom?.playerUids?.includes(playerUid) ? 'bottom' : null);

              if (playerTeam) {
                if (rankingMode === 'striche') {
                  gameContribution = calculateStricheForGame(game, playerUid);
                  // Sieg-Zählung für Striche-Ranking (optional, hier: Sieg wenn mehr Striche)
                  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
                  const opponentStriche = calculateStricheForGame(game, game.teams?.[opponentTeam]?.playerUids?.[0] || ''); // Annahme: mindestens 1 Gegner
                  if (gameContribution > opponentStriche) playerScores[playerUid].wins++;
                } else { // Default: total_points oder anderer Punkte-basierter Modus
                  gameContribution = game.finalScores[playerTeam] || 0;
                  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
                  if (game.finalScores[playerTeam] > game.finalScores[opponentTeam]) {
                    playerScores[playerUid].wins++;
                  }
                }
                playerScores[playerUid].score += gameContribution;
              }
            }
          }

          const rankedPlayers = Object.entries(playerScores)
            .map(([uid, data]) => ({ uid, ...data }))
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score; // Höchster Score zuerst
              // Sekundäres Kriterium: Weniger Spiele gespielt ist besser (bei gleichem Score)
              // oder Anzahl Siege, falls rankingMode 'wins' ist (noch nicht voll implementiert)
              return a.gamesPlayed - b.gamesPlayed; 
            });

          // Update PlayerComputedStats for each participant
          const promises = rankedPlayers.map(async (player, index) => {
            const rank = index + 1;
            const playerStatsRef = db.collection("playerComputedStats").doc(player.uid);
            
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
                if (rank === 1) {
                  stats.tournamentWins = (stats.tournamentWins || 0) + 1;
                }

                const currentPlacement: TournamentPlacement = {
                  tournamentId: tournamentId,
                  tournamentName: tournamentName,
                  rank: rank,
                  totalParticipants: rankedPlayers.length,
                  date: tournamentDate
                };

                if (!stats.bestTournamentPlacement || rank < stats.bestTournamentPlacement.rank) {
                  stats.bestTournamentPlacement = currentPlacement;
                }
                stats.tournamentPlacements = [currentPlacement, ...(stats.tournamentPlacements || [])].slice(0, 20); // Max 20 behalten

                transaction.set(playerStatsRef, stats, { merge: true });
              });
            } catch (txError) {
              logger.error(`Transaction failed for player ${player.uid} in tournament ${tournamentId}:`, txError);
              // Fehler hier nicht weiterwerfen, um andere Spieler-Updates nicht zu blockieren
            }
          });
          await Promise.all(promises);
          logger.info(`Player stats updated for 'single' tournament ${tournamentId}.`);
          break;

        case 'doubles':
          logger.info(`Handling 'doubles' tournament mode for ${tournamentId}.`);
          
          if (!tournamentData.teams || tournamentData.teams.length === 0) {
            logger.warn(`No teams defined for 'doubles' tournament ${tournamentId}. Cannot calculate rankings.`);
            await tournamentRef.update({ status: 'completed', finalizedAt: admin.firestore.FieldValue.serverTimestamp(), lastError: "Keine Teams für Doppelmodus definiert." });
            return { success: true, message: "Keine Teams für Doppelmodus definiert, Abschluss ohne Ranking." };
          }

          const teamScores: { [teamId: string]: { score: number; gamesPlayed: number; wins: number; teamName: string; playerUids: string[] } } = {};
          tournamentData.teams.forEach(team => {
            teamScores[team.id] = { score: 0, gamesPlayed: 0, wins: 0, teamName: team.name, playerUids: team.playerUids };
          });

          // Die Funktion calculateStricheForGame aus dem 'single'-Modus kann hier wiederverwendet oder angepasst werden,
          // falls Striche pro Team und nicht pro Spieler gezählt werden müssen.
          // Für Doppel ist es meistens das Team-Ergebnis.
          const calculateStricheForTeamInGame = (game: TournamentGameData, teamPlayerUids: string[]): number => {
            let striche = 0;
            // Bestimme, ob das Team 'top' oder 'bottom' in diesem Spiel war
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

            let scoreTeamA = 0;
            let scoreTeamB = 0;

            if (rankingMode === 'striche') {
              scoreTeamA = calculateStricheForTeamInGame(game, teamA.playerUids);
              scoreTeamB = calculateStricheForTeamInGame(game, teamB.playerUids);
              if (scoreTeamA > scoreTeamB) teamScores[teamA.teamId].wins++;
              if (scoreTeamB > scoreTeamA) teamScores[teamB.teamId].wins++;
            } else { // Default: total_points
              scoreTeamA = game.finalScores[teamA.teamKeyInGame] || 0;
              scoreTeamB = game.finalScores[teamB.teamKeyInGame] || 0;
              if (scoreTeamA > scoreTeamB) teamScores[teamA.teamId].wins++;
              if (scoreTeamB > scoreTeamA) teamScores[teamB.teamId].wins++;
            }
            teamScores[teamA.teamId].score += scoreTeamA;
            teamScores[teamB.teamId].score += scoreTeamB;
          }

          const rankedTeams = Object.values(teamScores)
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return a.gamesPlayed - b.gamesPlayed;
            });

          // Update PlayerComputedStats for each player in the ranked teams
          const playerStatsUpdatePromises = [];
          for (let i = 0; i < rankedTeams.length; i++) {
            const team = rankedTeams[i];
            const rank = i + 1;
            for (const playerUid of team.playerUids) {
              const playerStatsRef = db.collection("playerComputedStats").doc(playerUid);
              playerStatsUpdatePromises.push(
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
                    totalParticipants: rankedTeams.length, // Hier Anzahl Teams statt Spieler
                    date: tournamentDate
                  };

                  if (!stats.bestTournamentPlacement || rank < stats.bestTournamentPlacement.rank) {
                    stats.bestTournamentPlacement = currentPlacement;
                  }
                  stats.tournamentPlacements = [currentPlacement, ...(stats.tournamentPlacements || [])].slice(0, 20);
                  
                  // Hinzufügen eines Highlights für den Turniersieg oder die Teilnahme
                  const tournamentHighlight: StatHighlight = {
                    type: rank === 1 ? "tournament_win" : "tournament_participation",
                    value: rank,
                    stringValue: team.teamName, // Teamname als stringValue
                    date: tournamentDate,
                    relatedId: tournamentId,
                    label: rank === 1 ? `Turniersieg: ${tournamentName} (Team: ${team.teamName})` : `Turnierteilnahme: ${tournamentName} (Rang ${rank}, Team: ${team.teamName})`,
                  };
                  stats.highlights = [tournamentHighlight, ...(stats.highlights || [])].slice(0, 50); // Max 50 Highlights

                  transaction.set(playerStatsRef, stats, { merge: true });
                }).catch(txError => {
                    logger.error(`Transaction failed for player ${playerUid} (Team: ${team.teamName}) in tournament ${tournamentId}:`, txError);
                })
              );
            }
          }
          await Promise.all(playerStatsUpdatePromises);
          logger.info(`Player stats updated for 'doubles' tournament ${tournamentId}.`);
          break;

        case 'groupVsGroup':
          logger.info(`Handling 'groupVsGroup' tournament mode for ${tournamentId}.`);

          // Annahme: tournamentData.groups enthält Infos zu den teilnehmenden Gruppen
          // z.B. [{ groupId: "id1", name: "Gruppe A", playerUids: ["uid1", "uid2"] }, ...]
          // ODER tournamentData.participatingGroupIds und wir laden die Gruppen-Infos separat.
          // Für dieses Beispiel nehmen wir an, dass `tournamentData.groups` die notwendigen Infos enthält.

          if (!tournamentData.groups || tournamentData.groups.length < 2) {
            logger.warn(`Not enough groups defined for 'groupVsGroup' tournament ${tournamentId}. Needs at least 2. Cannot calculate rankings.`);
            await tournamentRef.update({ status: 'completed', finalizedAt: admin.firestore.FieldValue.serverTimestamp(), lastError: "Nicht genügend Gruppen für groupVsGroup-Modus definiert." });
            return { success: true, message: "Nicht genügend Gruppen (min. 2) für groupVsGroup-Modus definiert, Abschluss ohne Ranking." };
          }

          interface GroupTournamentStats {
            groupId: string;
            groupName: string;
            playerUids: string[];
            score: number; // Gesamtpunkte oder Striche der Gruppe im Turnier
            wins: number;    // Anzahl gewonnener Spiele/Begegnungen der Gruppe
            gamesPlayed: number;
          }

          const groupStats: { [groupId: string]: GroupTournamentStats } = {};
          // Expliziter Typ für group
          tournamentData.groups.forEach((group: TournamentGroupDefinition) => { 
            groupStats[group.id] = { 
              groupId: group.id,
              groupName: group.name,
              playerUids: group.playerUids || [], // Spieler der Gruppe
              score: 0,
              wins: 0,
              gamesPlayed: 0,
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

          for (const game of tournamentGames) {
            // Finde die zwei Gruppen, die in diesem Spiel gegeneinander gespielt haben
            const involvedGroupsInGame: GroupTournamentStats[] = [];
            const gameParticipantUids = new Set(game.participantUids || []);

            for (const groupId in groupStats) {
              const group = groupStats[groupId];
              // Prüfen, ob mindestens ein Spieler der Gruppe an diesem Spiel teilgenommen hat
              if (group.playerUids.some(uid => gameParticipantUids.has(uid))) {
                involvedGroupsInGame.push(group);
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

            let scoreGroupA = 0;
            let scoreGroupB = 0;
            
            // Bestimme, welches Team (top/bottom) im Spiel zu welcher Gruppe gehört
            const groupATeamKey = game.teams?.top?.playerUids?.some(uid => groupA.playerUids.includes(uid)) ? 'top' :
                                 (game.teams?.bottom?.playerUids?.some(uid => groupA.playerUids.includes(uid)) ? 'bottom' : null);
            const groupBTeamKey = groupATeamKey === 'top' ? 'bottom' : (groupATeamKey === 'bottom' ? 'top' : null);

            if (!groupATeamKey || !groupBTeamKey) {
                logger.warn(`Could not determine team keys for groups in game ${game.id}. Skipping score calculation for this game.`);
                continue;
            }

            if (rankingMode === 'striche') {
              scoreGroupA = calculateStricheForGroupInGame(game, groupA.playerUids);
              scoreGroupB = calculateStricheForGroupInGame(game, groupB.playerUids);
              // Direkte Zuweisung der Striche als Score der Gruppe in diesem Spiel
            } else { // Default: total_points
              scoreGroupA = game.finalScores[groupATeamKey] || 0;
              scoreGroupB = game.finalScores[groupBTeamKey] || 0;
            }

            groupStats[groupA.groupId].score += scoreGroupA;
            groupStats[groupB.groupId].score += scoreGroupB;

            if (scoreGroupA > scoreGroupB) {
              groupStats[groupA.groupId].wins++;
            } else if (scoreGroupB > scoreGroupA) {
              groupStats[groupB.groupId].wins++;
            } // Bei Gleichstand keinem einen Sieg zuweisen
          }

          const rankedGroups = Object.values(groupStats)
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score; // Höchster Score zuerst
              if (b.wins !== a.wins) return b.wins - a.wins; // Bei gleichem Score: Mehr Siege zuerst
              return a.gamesPlayed - b.gamesPlayed; // Weniger Spiele gespielt ist besser
            });

          // Update PlayerComputedStats for each player in the ranked groups
          const groupPlayerStatsUpdatePromises = [];
          for (let i = 0; i < rankedGroups.length; i++) {
            const group = rankedGroups[i];
            const rank = i + 1;
            for (const playerUid of group.playerUids) {
              const playerStatsRef = db.collection("playerComputedStats").doc(playerUid);
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
                    totalParticipants: rankedGroups.length, // Anzahl Gruppen
                    date: tournamentDate
                  };

                  if (!stats.bestTournamentPlacement || rank < stats.bestTournamentPlacement.rank) {
                    stats.bestTournamentPlacement = currentPlacement;
                  }
                  stats.tournamentPlacements = [currentPlacement, ...(stats.tournamentPlacements || [])].slice(0, 20);
                  
                  const tournamentHighlight: StatHighlight = {
                    type: rank === 1 ? "tournament_win_group" : "tournament_participation_group",
                    value: rank,
                    stringValue: group.groupName,
                    date: tournamentDate,
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
          logger.info(`Player stats updated for 'groupVsGroup' tournament ${tournamentId}.`);
          break;

        default:
          logger.warn(`Unknown or unsupported tournament mode: ${tournamentMode} for tournament ${tournamentId}.`);
          throw new HttpsError("unimplemented", `Turniermodus '${tournamentMode || 'nicht definiert'}' wird nicht unterstützt.`);
      }

      await tournamentRef.update({ 
        status: 'completed', 
        finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastError: null // Fehler löschen, wenn erfolgreich
      });

      logger.info(`--- finalizeTournament SUCCESS for ${tournamentId} ---`);
      return { success: true, message: `Turnier ${tournamentId} erfolgreich abgeschlossen.` };

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