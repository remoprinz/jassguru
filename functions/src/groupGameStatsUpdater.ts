import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { PlayerComputedStats } from "./models/player-stats.model";

// Annahme: admin.initializeApp() wird in der Haupt-index.ts aufgerufen.
const db = admin.firestore();

// Typdefinitionen, um Klarheit zu schaffen
type PlayerNumber = 1 | 2 | 3 | 4;

interface RoundData {
  farbe?: string;
  currentPlayer?: PlayerNumber;
}

interface GameData {
  status: 'completed' | string;
  roundHistory?: RoundData[];
  participantUids?: string[];
  groupId?: string; // NEU: groupId hinzugefügt
  // NEU: Zusätzliche Felder für vollständige Statistik-Berechnung
  scores?: { top: number; bottom: number };
  striche?: { 
    top: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
    bottom: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
  };
  weisPoints?: { top: number; bottom: number };
  durationMillis?: number;
  teams?: {
    top: { playerUids: string[] };
    bottom: { playerUids: string[] };
  };
  winnerTeam?: 'top' | 'bottom' | 'draw';
  timestampCompleted?: admin.firestore.Timestamp;
  activeGameId?: string;
  finalScores?: { top: number; bottom: number };
}

interface SessionPlayerData {
  [key: string]: string; // z.B. "1": "uid123"
}

interface SessionTeamData {
  players: SessionPlayerData;
}

interface SessionData {
  teams?: {
    top?: SessionTeamData;
    bottom?: SessionTeamData;
  };
}

// === HILFSFUNKTION FÜR SPIELERGEBNIS-ANALYSE ===
function getPlayerGameOutcome(userId: string, gameData: GameData): {
  result: 'win' | 'loss' | 'draw' | 'unknown';
  pointsMade: number;
  pointsReceived: number;
  stricheMade: number;
  stricheReceived: number;
  weisMade: number;
  isMatschGame: boolean;
  isSchneiderGame: boolean;
  isKontermatschMade: boolean;
  isKontermatschReceived: boolean;
  playerTeamKey: 'top' | 'bottom' | null;
  opponentTeamKey: 'top' | 'bottom' | null;
} {
  let playerTeamKey: 'top' | 'bottom' | null = null;
  let opponentTeamKey: 'top' | 'bottom' | null = null;

  // Team-Zuordnung ermitteln
  if (gameData.teams?.bottom?.playerUids?.includes(userId)) {
    playerTeamKey = 'bottom';
    opponentTeamKey = 'top';
  } else if (gameData.teams?.top?.playerUids?.includes(userId)) {
    playerTeamKey = 'top';
    opponentTeamKey = 'bottom';
  }

  if (!playerTeamKey || !opponentTeamKey) {
    logger.warn(`[getPlayerGameOutcome] Could not determine team for player ${userId}. UIDs in teams: Top[${gameData.teams?.top?.playerUids?.join(",")}], Bottom[${gameData.teams?.bottom?.playerUids?.join(",")}]`);
    return { 
      result: 'unknown', 
      pointsMade: 0, 
      pointsReceived: 0, 
      stricheMade: 0, 
      stricheReceived: 0, 
      weisMade: 0, 
      isMatschGame: false, 
      isSchneiderGame: false, 
      isKontermatschMade: false, 
      isKontermatschReceived: false, 
      playerTeamKey: null, 
      opponentTeamKey: null 
    };
  }

  const pointsMade = gameData.scores?.[playerTeamKey] || 0;
  const pointsReceived = gameData.scores?.[opponentTeamKey] || 0;
  const weisMade = gameData.weisPoints?.[playerTeamKey] || 0;
  
  // Striche berechnen
  const calculateTotalStricheValue = (stricheObj: any): number => {
    if (!stricheObj) return 0;
    return (stricheObj.berg || 0) + (stricheObj.sieg || 0) + (stricheObj.matsch || 0) + (stricheObj.schneider || 0) + (stricheObj.kontermatsch || 0);
  };

  const stricheMade = calculateTotalStricheValue(gameData.striche?.[playerTeamKey]);
  const stricheReceived = calculateTotalStricheValue(gameData.striche?.[opponentTeamKey]);

  // Spezielle Spiel-Typen ermitteln
  const isMatschGame = (gameData.striche?.[playerTeamKey]?.matsch || 0) > 0;
  const isSchneiderGame = (gameData.striche?.[playerTeamKey]?.schneider || 0) > 0;
  const isKontermatschMade = (gameData.striche?.[playerTeamKey]?.kontermatsch || 0) > 0;
  const isKontermatschReceived = (gameData.striche?.[opponentTeamKey]?.kontermatsch || 0) > 0;

  // Spielergebnis ermitteln
  let result: 'win' | 'loss' | 'draw' = 'loss';
  if (gameData.winnerTeam === playerTeamKey) {
    result = 'win';
  } else if (gameData.winnerTeam === 'draw') {
    result = 'draw';
  } else if (gameData.winnerTeam === opponentTeamKey) {
    result = 'loss';
  } else {
    // Fallback anhand der Punkte
    if (pointsMade > pointsReceived) result = 'win';
    else if (pointsMade < pointsReceived) result = 'loss';
    else result = 'draw';
  }

  return { 
    result, 
    pointsMade, 
    pointsReceived, 
    stricheMade, 
    stricheReceived, 
    weisMade, 
    isMatschGame, 
    isSchneiderGame, 
    isKontermatschMade, 
    isKontermatschReceived, 
    playerTeamKey, 
    opponentTeamKey 
  };
}

/**
 * ZENTRALER ECHTZEIT-WÄCHTER für abgeschlossene Gruppenspiele.
 * Trigger: Wird für jedes abgeschlossene Spiel in einer Session aufgerufen.
 * Aufgabe: Erhöht SOFORT und ATOMAR alle kumulativen Pro-Spiel-Statistiken UND bereinigt das aktive Spiel.
 * Dazu gehören:
 *  - gameCount / totalGames (für Gruppe und Spieler)
 *  - trumpfStatistik / totalTrumpfCount (für Gruppe und Spieler)
 *  - ALLE weiteren Spieler-Statistiken (Siege, Punkte, Striche, etc.)
 *  - Löschen des Dokuments aus 'activeGames'
 */
export const updateGroupGameStats = onDocumentWritten({
  document: "jassGameSummaries/{sessionId}/completedGames/{gameId}",
  region: "europe-west1",
  timeoutSeconds: 60,
}, async (event) => {
  const { sessionId, gameId } = event.params;
  
  // Nur bei Erstellung oder Aktualisierung eines Spiels handeln, nicht bei Löschung
  if (!event.data?.after) {
    logger.log(`[updateGroupGameStats] Document ${gameId} deleted. Skipping.`);
    return;
  }
  
  const gameData = event.data.after.data() as GameData;
  const beforeGameData = event.data.before?.data() as GameData | undefined;

  // Verhindert, dass die Funktion erneut läuft, wenn sich das Dokument ändert, aber der Status 'completed' bleibt.
  if (gameData.status === 'completed' && beforeGameData?.status === 'completed') {
    logger.log(`[updateGroupGameStats] Game ${gameId} was already completed. Skipping.`);
    return;
  }

  // GroupId aus den Game-Daten extrahieren
  const groupId = gameData.groupId;
  if (!groupId) {
    logger.warn(`[updateGroupGameStats] No groupId found in game data for ${gameId}. Skipping group stats update.`);
  }

  logger.info(`[updateGroupGameStats] Triggered for game ${gameId}${groupId ? ` in group ${groupId}` : ''}.`);

  // Erweiterte Status-Prüfung: 
  // 1. Expliziter status 'completed'
  // 2. Oder: Vorhandensein von finalScores/finalStriche (impliziert Abschluss)
  const isCompleted = gameData.status === 'completed' || 
                     (gameData.scores && (gameData.scores.top > 0 || gameData.scores.bottom > 0)) ||
                     (gameData.finalScores && (gameData.finalScores.top > 0 || gameData.finalScores.bottom > 0));
  
  if (!isCompleted) {
    logger.log(`[updateGroupGameStats] Game ${gameId} is not completed. Status: '${gameData.status}', has scores: ${!!gameData.scores}, has finalScores: ${!!gameData.finalScores}. Skipping.`);
    return;
  }

  try {
    // Führe Updates parallel aus - groupStats nur wenn groupId vorhanden
    const updatePromises = [
      updatePlayerStats(gameData, sessionId, gameId, groupId)
    ];
    
    if (groupId) {
      updatePromises.push(updateGroupStats(gameData, groupId, gameId));
    }
    
    await Promise.all(updatePromises);
    logger.info(`[updateGroupGameStats] All stats updated successfully for game ${gameId}.`);
  } catch (error) {
    logger.error(`[updateGroupGameStats] A failure occurred during stat updates for game ${gameId}:`, error);
    // Fehler erneut werfen, damit der Aufruf wiederholt wird
    throw error;
  }
});

// === HILFSFUNKTION FÜR GRUPPEN-STATISTIK ===
async function updateGroupStats(gameData: GameData, groupId: string, gameId: string): Promise<void> {
  const statsRef = db.collection('groupComputedStats').doc(groupId);
  const updates: { [key: string]: admin.firestore.FieldValue | admin.firestore.Timestamp } = {};

  // 1. Spielzähler für die Gruppe immer erhöhen
  updates.gameCount = admin.firestore.FieldValue.increment(1);

  // 2. Trumpf-Statistiken aus der Runden-History aggregieren
  const rounds = gameData.roundHistory || [];
  
  if (rounds.length > 0) {
    const trumpfCounts: { [key: string]: number } = {};
    let totalTrumpfsInGame = 0;

    rounds.forEach(round => {
      if (round.farbe && typeof round.farbe === 'string') {
        const farbeKey = round.farbe.toLowerCase();
        trumpfCounts[farbeKey] = (trumpfCounts[farbeKey] || 0) + 1;
        totalTrumpfsInGame++;
      }
    });
    
    if (totalTrumpfsInGame > 0) {
      for (const [farbe, count] of Object.entries(trumpfCounts)) {
        updates[`trumpfStatistik.${farbe}`] = admin.firestore.FieldValue.increment(count);
      }
      updates.totalTrumpfCount = admin.firestore.FieldValue.increment(totalTrumpfsInGame);
      logger.info(`[updateGroupStats] Updated trumpf stats for ${groupId}: ${totalTrumpfsInGame} total trumpfs`);
    }
  }

  updates.lastUpdateTimestamp = admin.firestore.Timestamp.now();

  try {
    // .set mit {merge: true} ist idempotent: Erstellt das Dokument, falls es nicht existiert, oder aktualisiert es.
    await statsRef.set(updates, { merge: true });
    logger.info(`[updateGroupStats] Group stats updated for ${groupId} from game ${gameId}.`);
  } catch (error) {
    logger.error(`[updateGroupStats] Error updating group stats for ${groupId}:`, error);
    throw error;
  }
}

// === HILFSFUNKTION FÜR SPIELER-STATISTIK ===
async function updatePlayerStats(gameData: GameData, sessionId: string, gameId: string, groupId?: string): Promise<void> {
  // Schritt 1: Hole die Spieler-UIDs.
  // Priorität 1: Direkte UIDs aus dem Spieldokument.
  // Priorität 2: UIDs aus dem zugehörigen Session-Dokument extrahieren.
  let allPlayerUids: string[] = [];
  const playerNumberToUidMap = new Map<PlayerNumber, string>();

  if (gameData.participantUids && gameData.participantUids.length > 0) {
    allPlayerUids = gameData.participantUids;
    logger.info(`[updatePlayerStats] Found ${allPlayerUids.length} participant UIDs directly in game document ${gameId}.`);
  }

  // Lese das Session-Dokument, um die Zuordnung von Spieler-Nummer zu UID zu erhalten,
  // was für die Trumpf-Statistik benötigt wird.
  const sessionDoc = await db.collection('jassSummaries').doc(sessionId).get();
  if (!sessionDoc.exists) {
    logger.error(`[updatePlayerStats] Session ${sessionId} not found. Cannot map players for game ${gameId}.`);
    // Wenn wir keine Session haben, können wir die Trumpfwähler nicht zuordnen. Wir könnten trotzdem
    // die `totalGames` für die `participantUids` aus dem gameData erhöhen, aber es ist besser, hier abzubrechen,
    // um Dateninkonsistenzen zu vermeiden.
    if (allPlayerUids.length === 0) {
       logger.error(`[updatePlayerStats] No participantUids in game data either. Aborting player stats update for ${gameId}.`);
       return; // Abbruch, wenn wir gar keine Spieler-IDs haben.
    }
  } else {
    const sessionData = sessionDoc.data() as SessionData;
    
    if (sessionData.teams?.top?.players && sessionData.teams?.bottom?.players) {
        (['top', 'bottom'] as const).forEach(team => {
            const teamData = sessionData.teams?.[team];
            if (teamData?.players) {
                for (const [playerNumStr, uid] of Object.entries(teamData.players)) {
                    const playerNum = parseInt(playerNumStr, 10) as PlayerNumber;
                    playerNumberToUidMap.set(playerNum, uid as string);
                }
            }
        });
        // Wenn wir die UIDs aus der Session extrahiert haben und sie im gameData fehlten, verwenden wir sie.
        if (allPlayerUids.length === 0) {
            allPlayerUids = Array.from(playerNumberToUidMap.values());
            logger.info(`[updatePlayerStats] Extracted ${allPlayerUids.length} UIDs from session document ${sessionId}.`);
        }
    }
  }

  if (allPlayerUids.length === 0) {
    logger.warn(`[updatePlayerStats] Could not determine any player UIDs for game ${gameId}. Skipping player stats update.`);
    return;
  }
  
  // Schritt 2: Bereite die Updates für alle Spieler vor.
  const playerUpdates = new Map<string, { [key: string]: any }>();
  const now = admin.firestore.Timestamp.now();
  const gameTimestamp = gameData.timestampCompleted || now;

  // Analysiere das Spielergebnis für jeden Teilnehmer und bereite die Updates vor
  const playerOutcomes = new Map<string, ReturnType<typeof getPlayerGameOutcome>>();
  for (const playerId of allPlayerUids) {
    const outcome = getPlayerGameOutcome(playerId, gameData);
    playerOutcomes.set(playerId, outcome);

    const updates: { [key: string]: any } = {
      totalGames: admin.firestore.FieldValue.increment(1),
      lastUpdateTimestamp: now,
      lastJassTimestamp: gameTimestamp,
    };

    // Nur Updates hinzufügen, wenn die Team-Zuordnung erfolgreich war
    if (outcome.result !== 'unknown') {
      // Spielzeit hinzufügen
      if (gameData.durationMillis) {
        updates.totalPlayTimeSeconds = admin.firestore.FieldValue.increment(gameData.durationMillis / 1000);
      }

      // Siege/Niederlagen
      if (outcome.result === 'win') {
        updates.gameWins = admin.firestore.FieldValue.increment(1);
      } else if (outcome.result === 'loss') {
        updates.gameLosses = admin.firestore.FieldValue.increment(1);
      }

      // Punkte und Striche
      updates.totalPointsMade = admin.firestore.FieldValue.increment(outcome.pointsMade);
      updates.totalPointsReceived = admin.firestore.FieldValue.increment(outcome.pointsReceived);
      updates.totalStricheMade = admin.firestore.FieldValue.increment(outcome.stricheMade);
      updates.totalStricheReceived = admin.firestore.FieldValue.increment(outcome.stricheReceived);

      // Weispunkte
      if (outcome.weisMade > 0) {
        updates.playerTotalWeisMade = admin.firestore.FieldValue.increment(outcome.weisMade);
      }

      // Spezielle Spiel-Typen
      if (outcome.isMatschGame) {
        updates.totalMatschEventsMade = admin.firestore.FieldValue.increment(1);
      }
      if (outcome.isSchneiderGame) {
        updates.totalSchneiderEventsMade = admin.firestore.FieldValue.increment(1);
      }
      if (outcome.isKontermatschMade) {
        updates.totalKontermatschEventsMade = admin.firestore.FieldValue.increment(1);
      }
      if (outcome.isKontermatschReceived) {
        updates.totalKontermatschGamesReceived = admin.firestore.FieldValue.increment(1);
      }

      // Berechnete Felder für Durchschnittswerte (werden über Transaktionen aktualisiert)
      // Diese werden in einer separaten Transaktion berechnet, um korrekte Durchschnittswerte zu gewährleisten
    }

    playerUpdates.set(playerId, updates);
  }

  // Schritt 3: Aggregiere die Trumpf-Statistiken aus der Runden-History.
  const rounds = gameData.roundHistory || [];
  
  if (rounds.length > 0 && playerNumberToUidMap.size > 0) {
      // Temporäre Map, um die Trumpf-Inkremente pro Spieler zu zählen
      const playerTrumpfIncrements = new Map<string, { total: number, farben: Map<string, number> }>();

      rounds.forEach(round => {
        if (round.farbe && typeof round.farbe === 'string' && round.currentPlayer) {
          const playerId = playerNumberToUidMap.get(round.currentPlayer);
          if (playerId) {
            if (!playerTrumpfIncrements.has(playerId)) {
              playerTrumpfIncrements.set(playerId, { total: 0, farben: new Map() });
            }
            const playerIncrements = playerTrumpfIncrements.get(playerId)!;
            const farbeKey = round.farbe.toLowerCase();

            playerIncrements.total += 1;
            playerIncrements.farben.set(farbeKey, (playerIncrements.farben.get(farbeKey) || 0) + 1);
          }
        }
      });
      
      // Übertrage die gezählten Inkremente in die finale Update-Map
      for (const [playerId, increments] of playerTrumpfIncrements.entries()) {
        const updates = playerUpdates.get(playerId)!;
        updates.totalTrumpfCount = admin.firestore.FieldValue.increment(increments.total);
        for (const [farbe, count] of increments.farben.entries()) {
          updates[`trumpfStatistik.${farbe}`] = admin.firestore.FieldValue.increment(count);
        }
      }
      
      if (playerTrumpfIncrements.size > 0) {
        logger.info(`[updatePlayerStats] Updated trumpf stats for ${playerTrumpfIncrements.size} players in game ${gameId}`);
      }

  } else if (rounds.length > 0) {
      logger.warn(`[updatePlayerStats] Game ${gameId} has ${rounds.length} rounds, but player mapping from session ${sessionId} is missing (size: ${playerNumberToUidMap.size}). Cannot attribute trumpf choices.`);
  }

  // Schritt 4: Schreibe alle Updates in einer einzigen Batch-Operation.
  if (playerUpdates.size === 0) {
    logger.log(`[updatePlayerStats] No player updates to commit for game ${gameId}.`);
    return;
  }

  const batch = db.batch();
  for (const [playerId, updates] of playerUpdates.entries()) {
    const playerStatsRef = db.collection('playerComputedStats').doc(playerId);
    // .set mit {merge: true} ist idempotent und sicher.
    batch.set(playerStatsRef, updates, { merge: true });
  }
  
  try {
    await batch.commit();
    logger.info(`[updatePlayerStats] Basic stats updated for ${playerUpdates.size} players from game ${gameId}.`);
    
    // Schritt 5: Aktualisiere berechnete Felder (Durchschnittswerte, Differenzen, Serien) in Transaktionen
    await updateCalculatedPlayerFields(playerOutcomes, gameData, gameId, gameTimestamp);
  } catch (error) {
    logger.error(`[updatePlayerStats] Error committing batch player stats for game ${gameId}:`, error);
    throw error;
  }
  
  // NEU: Logik aus archiveGame.ts zum Aufräumen des activeGame Dokuments
  const activeGameId = gameData.activeGameId;
  if (activeGameId) {
    const activeGameRef = db.collection('activeGames').doc(activeGameId);
    try {
      await activeGameRef.delete();
      logger.info(`[updatePlayerStats] Successfully deleted active game ${activeGameId} for completed game ${gameId}.`);
    } catch (error) {
      logger.error(`[updatePlayerStats] Error deleting active game ${activeGameId} for completed game ${gameId}:`, error);
      // Wir werfen den Fehler hier nicht erneut, da die Statistik-Updates der wichtigere Teil sind.
      // Ein verwaistes activeGame ist weniger kritisch als eine fehlende Statistik.
    }
  } else {
    logger.warn(`[updatePlayerStats] No activeGameId found in completed game ${gameId}. Cannot delete active game.`);
  }
}

// === HILFSFUNKTION FÜR BERECHNETE FELDER ===
async function updateCalculatedPlayerFields(
    playerOutcomes: Map<string, ReturnType<typeof getPlayerGameOutcome>>,
    gameData: GameData,
    gameId: string,
    gameTimestamp: admin.firestore.Timestamp
): Promise<void> {
  for (const [playerId, outcome] of playerOutcomes.entries()) {
    const playerStatsRef = db.collection('playerComputedStats').doc(playerId);

    if (outcome.result === 'unknown') {
      logger.warn(`[updateCalculatedPlayerFields] Skipping calculated fields for player ${playerId} due to unknown game outcome.`);
      continue;
    }
    
    try {
      await db.runTransaction(async (transaction) => {
        const playerDoc = await transaction.get(playerStatsRef);
        
        if (!playerDoc.exists) {
          logger.warn(`[updateCalculatedPlayerFields] Player document ${playerId} not found in transaction. Skipping streak/average calculation.`);
          return;
        }
        
        const stats = playerDoc.data() as PlayerComputedStats;
        const updates: { [key: string]: any } = {};
        
        // 1. Berechnete Differenzen
        const totalPointsMade = stats.totalPointsMade || 0;
        const totalPointsReceived = stats.totalPointsReceived || 0;
        const totalStricheMade = stats.totalStricheMade || 0;
        const totalStricheReceived = stats.totalStricheReceived || 0;
        
        updates.totalPointsDifference = totalPointsMade - totalPointsReceived;
        updates.totalStricheDifference = totalStricheMade - totalStricheReceived;
        
        // 2. Durchschnittswerte
        const totalGames = stats.totalGames || 0;
        if (totalGames > 0) {
          updates.avgPointsPerGame = totalPointsMade / totalGames;
          updates.avgStrichePerGame = totalStricheMade / totalGames;
          updates.avgMatschPerGame = (stats.totalMatschEventsMade || 0) / totalGames;
          updates.avgSchneiderPerGame = (stats.totalSchneiderEventsMade || 0) / totalGames;
          updates.avgKontermatschPerGame = (stats.totalKontermatschEventsMade || 0) / totalGames;
          
          const playerTotalWeisMade = stats.playerTotalWeisMade || 0;
          updates.avgWeisPointsPerGame = playerTotalWeisMade / totalGames;
        }

        // 3. NEU: Spiel-Serien (Game Streaks)
        const result = outcome.result;
        const currentStreaks = {
            win: stats.currentGameWinStreak || 0,
            loss: stats.currentGameLossStreak || 0,
            winless: stats.currentGameWinlessStreak || 0,
            undefeated: stats.currentUndefeatedStreakGames || 0,
        };

        if (result === 'win') {
            currentStreaks.win++;
            currentStreaks.loss = 0;
            currentStreaks.winless = 0;
            currentStreaks.undefeated++;
        } else if (result === 'loss') {
            currentStreaks.loss++;
            currentStreaks.win = 0;
            currentStreaks.winless++;
            currentStreaks.undefeated = 0;
        } else { // draw
            currentStreaks.win = 0;
            currentStreaks.loss = 0;
            currentStreaks.winless++;
            currentStreaks.undefeated++;
        }

        updates.currentGameWinStreak = currentStreaks.win;
        updates.currentGameLossStreak = currentStreaks.loss;
        updates.currentGameWinlessStreak = currentStreaks.winless;
        updates.currentUndefeatedStreakGames = currentStreaks.undefeated;

        // Längste Serien prüfen und ggf. aktualisieren
        if (!stats.longestWinStreakGames || currentStreaks.win > stats.longestWinStreakGames.value) {
            updates.longestWinStreakGames = {
                value: currentStreaks.win,
                startDate: currentStreaks.win === 1 ? gameTimestamp : (stats.longestWinStreakGames?.startDate || gameTimestamp),
                endDate: gameTimestamp
            };
        }
        if (!stats.longestLossStreakGames || currentStreaks.loss > stats.longestLossStreakGames.value) {
            updates.longestLossStreakGames = {
                value: currentStreaks.loss,
                startDate: currentStreaks.loss === 1 ? gameTimestamp : (stats.longestLossStreakGames?.startDate || gameTimestamp),
                endDate: gameTimestamp
            };
        }
        if (!stats.longestWinlessStreakGames || currentStreaks.winless > stats.longestWinlessStreakGames.value) {
            updates.longestWinlessStreakGames = {
                value: currentStreaks.winless,
                startDate: currentStreaks.winless === 1 ? gameTimestamp : (stats.longestWinlessStreakGames?.startDate || gameTimestamp),
                endDate: gameTimestamp
            };
        }
        if (!stats.longestUndefeatedStreakGames || currentStreaks.undefeated > stats.longestUndefeatedStreakGames.value) {
            updates.longestUndefeatedStreakGames = {
                value: currentStreaks.undefeated,
                startDate: currentStreaks.undefeated === 1 ? gameTimestamp : (stats.longestUndefeatedStreakGames?.startDate || gameTimestamp),
                endDate: gameTimestamp
            };
        }

        // 4. NEU: Game-Level Highlights (aus finalizeSession.ts übertragen)
        const pointsMade = outcome.pointsMade;
        const stricheMade = outcome.stricheMade;
        const weisMade = outcome.weisMade;

        // Punkte-Highlights
        const currentHighestPointsGameValue = typeof stats.highestPointsGame?.value === 'number' ? stats.highestPointsGame.value : -Infinity;
        if (pointsMade > currentHighestPointsGameValue) {
            updates.highestPointsGame = {
                value: pointsMade,
                date: gameTimestamp,
                relatedId: gameId,
                type: "highest_points_game",
                label: `Höchste Punkte in Einzelspiel (${pointsMade})`
            };
        }
        const currentLowestPointsGameValue = typeof stats.lowestPointsGame?.value === 'number' ? stats.lowestPointsGame.value : Infinity;
        if (pointsMade < currentLowestPointsGameValue) {
            updates.lowestPointsGame = {
                value: pointsMade,
                date: gameTimestamp,
                relatedId: gameId,
                type: "lowest_points_game",
                label: `Niedrigste Punkte in Einzelspiel (${pointsMade})`
            };
        }

        // Striche-Highlights
        const currentHighestStricheGameValue = typeof stats.highestStricheGame?.value === 'number' ? stats.highestStricheGame.value : -Infinity;
        if (stricheMade > currentHighestStricheGameValue) {
            updates.highestStricheGame = {
                value: stricheMade,
                date: gameTimestamp,
                relatedId: gameId,
                type: "highest_striche_game",
                label: `Höchste Striche in Einzelspiel (${stricheMade})`
            };
        }
        const currentHighestStricheReceivedGameValue = typeof stats.highestStricheReceivedGame?.value === 'number' ? stats.highestStricheReceivedGame.value : -Infinity;
        if (stricheMade > currentHighestStricheReceivedGameValue) {
            updates.highestStricheReceivedGame = {
                value: stricheMade,
                date: gameTimestamp,
                relatedId: gameId,
                type: "highest_striche_received_game",
                label: `Höchste erhaltene Striche in Einzelspiel (${stricheMade})`
            };
        }

        // Weis-Highlights
        const currentMostWeisPointsGameValue = typeof stats.mostWeisPointsGame?.value === 'number' ? stats.mostWeisPointsGame.value : -Infinity;
        if (weisMade > currentMostWeisPointsGameValue) {
            updates.mostWeisPointsGame = {
                value: weisMade,
                date: gameTimestamp,
                relatedId: gameId,
                type: "most_weis_points_game",
                label: `Meiste Weispunkte in Einzelspiel (${weisMade})`
            };
        }

        // Matsch-Highlights (aus outcome-Daten)
        if (outcome.isMatschGame && outcome.playerTeamKey && gameData.striche) {
            const matschCount = gameData.striche[outcome.playerTeamKey]?.matsch || 0;
            const currentMostMatschGameValue = typeof stats.mostMatschGame?.value === 'number' ? stats.mostMatschGame.value : -Infinity;
            if (matschCount > currentMostMatschGameValue) {
                updates.mostMatschGame = {
                    value: matschCount,
                    date: gameTimestamp,
                    relatedId: gameId,
                    type: "most_matsch_game",
                    label: `Meiste Matsch in Einzelspiel (${matschCount})`
                };
            }
        }

        // Matsch-Received-Highlights (aus Gegner-Team)
        if (outcome.isKontermatschReceived && outcome.opponentTeamKey && gameData.striche) {
            const matschReceivedCount = gameData.striche[outcome.opponentTeamKey]?.matsch || 0;
            const currentMostMatschReceivedGameValue = typeof stats.mostMatschReceivedGame?.value === 'number' ? stats.mostMatschReceivedGame.value : -Infinity;
            if (matschReceivedCount > currentMostMatschReceivedGameValue) {
                updates.mostMatschReceivedGame = {
                    value: matschReceivedCount,
                    date: gameTimestamp,
                    relatedId: gameId,
                    type: "most_matsch_received_game",
                    label: `Meiste Matsch erhalten in Einzelspiel (${matschReceivedCount})`
                };
            }
        }

        // Weis-Received-Highlights (aus Gegner-Team)
        if (outcome.opponentTeamKey && gameData.weisPoints) {
            const weisReceivedCount = gameData.weisPoints[outcome.opponentTeamKey] || 0;
            const currentMostWeisReceivedGameValue = typeof stats.mostWeisPointsReceivedGame?.value === 'number' ? stats.mostWeisPointsReceivedGame.value : -Infinity;
            if (weisReceivedCount > currentMostWeisReceivedGameValue) {
                updates.mostWeisPointsReceivedGame = {
                    value: weisReceivedCount,
                    date: gameTimestamp,
                    relatedId: gameId,
                    type: "most_weis_points_received_game",
                    label: `Meiste Weispunkte erhalten in Einzelspiel (${weisReceivedCount})`
                };
            }
        }
        
        if (Object.keys(updates).length > 0) {
          transaction.update(playerStatsRef, updates);
        }
      });
    } catch (error) {
      logger.error(`[updateCalculatedPlayerFields] Error updating calculated fields for player ${playerId}:`, error);
      // Fehler protokollieren, aber nicht den gesamten Prozess abbrechen
    }
  }
  
  logger.info(`[updateCalculatedPlayerFields] Calculated fields updated for ${playerOutcomes.size} players from game ${gameId}.`);
} 