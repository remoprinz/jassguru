import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { getRatingTier } from './shared/rating-tiers';
import { ScoresHistoryEntry } from './models/unified-player-data.model';

const db = admin.firestore();

// Elo-Parameter (synchron zum Frontend/Script)
const JASS_ELO_CONFIG = {
  K_TARGET: 32,          // 🔧 KORREKTUR: Synchronisiert mit recalculateEloRatingHistoryV2.ts
  DEFAULT_RATING: 100,   
  ELO_SCALE: 1000,        // Beibehalten: Skala 1000 für optimale Spreizung
} as const;

type PlayerRatingDoc = {
  rating: number;
  gamesPlayed: number;
  displayName?: string;
  tier?: string;
  tierEmoji?: string;
  // ✅ SESSION-DELTA TRACKING
  lastSessionDelta?: number;  // Delta der letzten Session (Summe aller Spiele)
};

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

/**
 * 🎯 NEUE PERFEKTE ELO-FORMEL
 * 
 * Basierend auf erwarteter vs. tatsächlicher Strichdifferenz
 * 
 * @param stricheA - Striche von Team A
 * @param stricheB - Striche von Team B
 * @param expectedScore - Erwartete Wahrscheinlichkeit für Team A (0.0 - 1.0), berechnet aus Team-Ratings
 * @returns Score für Team A (0.0 - 1.0)
 * 
 * Formel:
 * 1. Expected_Diff = (2 × Expected - 1) × TotalStriche
 * 2. Actual_Diff = Striche_A - Striche_B
 * 3. Deviation = Actual_Diff - Expected_Diff
 * 4. Score = 0.5 + (Deviation / (2 × maxDiff))
 */
function stricheScore(stricheA: number, stricheB: number, expectedScore: number): number {
  const totalStriche = stricheA + stricheB;
  
  if (totalStriche === 0) return 0.5;
  
  // Erwartete Strichdifferenz basierend auf Team-Ratings
  const expectedDiff = (2 * expectedScore - 1) * totalStriche;
  
  // Tatsächliche Strichdifferenz
  const actualDiff = stricheA - stricheB;
  
  // Abweichung von Erwartung
  const deviation = actualDiff - expectedDiff;
  
  // Normalisiere auf fester Skala (maxDiff = 7)
  const maxDiff = 7;
  const normalizedDeviation = deviation / (2 * maxDiff);
  const score = 0.5 + normalizedDeviation;
  
  // Clamp auf [0, 1]
  return Math.max(0, Math.min(1, score));
}

function sumStriche(rec: any): number {
  if (!rec) return 0;
  return (rec.berg || 0) + (rec.sieg || 0) + (rec.matsch || 0) + (rec.schneider || 0) + (rec.kontermatsch || 0);
}

async function loadDisplayNames(playerIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  // Batchweise laden (max 10 per 'in')
  for (let i = 0; i < playerIds.length; i += 10) {
    const batch = playerIds.slice(i, i + 10);
    const snap = await db.collection('players')
      .where(admin.firestore.FieldPath.documentId(), 'in', batch)
      .get();
    snap.forEach(doc => {
      const d = doc.data() as any;
      map.set(doc.id, d.displayName || d.nickname || `Spieler_${doc.id.slice(0, 6)}`);
    });
  }
  return map;
}

/**
 * 🆕 SINGLE SOURCE OF TRUTH: Lade aktuelles Elo aus ratingHistory
 * Dies ist die EINZIGE korrekte Methode, um das aktuelle Elo zu laden!
 * 
 * @param playerId - Player Document ID
 * @param beforeTimestamp - Optional: Lade Elo VOR diesem Zeitpunkt (für Turniere)
 * @returns Aktuelles Elo Rating
 */
async function getPlayerRatingFromHistory(
  playerId: string, 
  beforeTimestamp?: admin.firestore.Timestamp
): Promise<number> {
  try {
    const ratingHistoryRef = db.collection(`players/${playerId}/ratingHistory`);
    
    // ✅ Strategie: Hole ALLE Einträge und sortiere manuell
    // (Manche Einträge haben nur createdAt, nicht completedAt!)
    const allEntriesSnap = await ratingHistoryRef.get();
    
    if (allEntriesSnap.empty) {
      logger.warn(`[Elo] No ratingHistory found for player ${playerId}, using default rating`);
      return JASS_ELO_CONFIG.DEFAULT_RATING;
    }
    
    // Mappe Einträge mit Fallback: completedAt → createdAt
    const entries = allEntriesSnap.docs
      .map(doc => {
        const data = doc.data();
        const timestamp = data.completedAt || data.createdAt; // ✅ Fallback auf createdAt
        
        // ✅ Konvertiere zu Millisekunden (unterstützt Firestore Timestamp UND Date)
        let milliseconds = 0;
        if (timestamp) {
          if (typeof timestamp.toMillis === 'function') {
            milliseconds = timestamp.toMillis(); // Firestore Timestamp
          } else if (timestamp instanceof Date) {
            milliseconds = timestamp.getTime(); // Date Object
          } else if (typeof timestamp.getTime === 'function') {
            milliseconds = timestamp.getTime(); // Anything with getTime()
          }
        }
        
        return {
          rating: data.rating,
          timestamp,
          milliseconds
        };
      })
      .filter(e => typeof e.rating === 'number' && !isNaN(e.rating) && e.milliseconds > 0);
    
    if (entries.length === 0) {
      logger.warn(`[Elo] No valid ratingHistory entries for player ${playerId}, using default rating`);
      return JASS_ELO_CONFIG.DEFAULT_RATING;
    }
    
    // Sortiere nach Timestamp (neueste zuerst)
    entries.sort((a, b) => b.milliseconds - a.milliseconds);
    
    // Falls beforeTimestamp angegeben, filtere
    if (beforeTimestamp) {
      const beforeMillis = beforeTimestamp.toMillis();
      const filteredEntries = entries.filter(e => e.milliseconds < beforeMillis);
      
      if (filteredEntries.length > 0) {
        const rating = filteredEntries[0].rating;
        logger.debug(`[Elo] Loaded rating ${rating.toFixed(2)} for player ${playerId} from ratingHistory (before ${beforeTimestamp.toDate().toISOString()})`);
        return rating;
      } else {
        logger.warn(`[Elo] No ratingHistory entries before ${beforeTimestamp.toDate().toISOString()} for player ${playerId}, using default rating`);
        return JASS_ELO_CONFIG.DEFAULT_RATING;
      }
    }
    
    // Kein beforeTimestamp: Neuester Eintrag
    const rating = entries[0].rating;
    logger.debug(`[Elo] Loaded rating ${rating.toFixed(2)} for player ${playerId} from ratingHistory (latest)`);
    return rating;
  } catch (error) {
    logger.error(`[Elo] Error loading rating from history for player ${playerId}:`, error);
    return JASS_ELO_CONFIG.DEFAULT_RATING;
  }
}

export async function updateEloForSession(groupId: string, sessionId: string): Promise<void> {
  logger.info(`[Elo] Start update for session ${sessionId} (group ${groupId})`);

  const summaryRef = db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`);
  const summarySnap = await summaryRef.get();
  if (!summarySnap.exists) {
    logger.warn(`[Elo] Summary ${sessionId} not found in group ${groupId}`);
    return;
  }
  const summary = summarySnap.data() as any;

  // Team-Zuordnung aus Summary verwenden (robuster als participantIndex)
  const topPlayers: string[] = summary?.teams?.top?.players?.map((p: any) => p.playerId).filter(Boolean) || [];
  const bottomPlayers: string[] = summary?.teams?.bottom?.players?.map((p: any) => p.playerId).filter(Boolean) || [];
  if (topPlayers.length !== 2 || bottomPlayers.length !== 2) {
    logger.warn(`[Elo] Invalid team structure for session ${sessionId}`);
    return;
  }

  // Spiele laden: bevorzugt completedGames Subcollection, sonst gameResults Array
  const games: Array<{ stricheTop: number; stricheBottom: number; completedAt: admin.firestore.Timestamp | null; teams?: any }> = [];
  const completedGames: any[] = []; // ✅ NEU: Vollständige Game-Daten für ScoresHistory

  // completedGames Subcollection (normale Sessions)
  const cgSnap = await summaryRef.collection('completedGames').orderBy('gameNumber', 'asc').get();
  if (!cgSnap.empty) {
    cgSnap.forEach(doc => {
      const g = doc.data() as any;
      const stricheTop = sumStriche(g.finalStriche?.top);
      const stricheBottom = sumStriche(g.finalStriche?.bottom);
      // ✅ KORREKTUR: Lade auch completedAt Timestamp!
      const completedAt = g.completedAt || g.timestampCompleted || null;
      games.push({ stricheTop, stricheBottom, completedAt });
      completedGames.push(g); // ✅ NEU: Speichere vollständiges Game
    });
  } else if (Array.isArray(summary?.gameResults) && summary.gameResults.length > 0) {
    // ✅ NEU: Tournament-Sessions mit gameResults Array
    // Jedes Spiel im gameResults Array hat seine eigenen Teams und Striche
    logger.info(`[Elo] Using gameResults array (${summary.gameResults.length} games) for tournament session ${sessionId}`);
    
    summary.gameResults.forEach((gameResult: any) => {
      if (!gameResult.finalStriche) {
        logger.warn(`[Elo] Game ${gameResult.gameNumber} missing finalStriche, skipping`);
        return;
      }
      
      const stricheTop = sumStriche(gameResult.finalStriche?.top);
      const stricheBottom = sumStriche(gameResult.finalStriche?.bottom);
      const completedAt = gameResult.completedAt || null;
      
      // ✅ WICHTIG: Für Tournament-Sessions ändern sich Teams pro Spiel!
      // Speichere Teams für dieses spezifische Spiel
      games.push({ 
        stricheTop, 
        stricheBottom, 
        completedAt,
        teams: gameResult.teams // Speichere Teams für dieses Spiel
      });
      completedGames.push(gameResult); // Vollständiges Game für ScoresHistory
    });
  } else if (summary?.finalStriche) {
    // Fallback: Nur Session-Level finalStriche (keine individuellen Spiele)
    // Nur wenn wirklich keine gameResults vorhanden sind
    logger.warn(`[Elo] No completedGames or gameResults found, using session-level finalStriche as fallback for session ${sessionId}`);
    const stricheTop = sumStriche(summary.finalStriche?.top);
    const stricheBottom = sumStriche(summary.finalStriche?.bottom);
    games.push({ stricheTop, stricheBottom, completedAt: null });
  }

  if (games.length === 0) {
    logger.warn(`[Elo] No games found for session ${sessionId}`);
    return;
  }

  // Ratings laden (global) - ✅ NEU: Aus ratingHistory statt globalRating!
  const playerIds = [...topPlayers, ...bottomPlayers];
  const displayNameMap = await loadDisplayNames(playerIds);

  const ratingMap = new Map<string, PlayerRatingDoc & { oldRating: number }>();
  for (const pid of playerIds) {
    // ✅ SINGLE SOURCE OF TRUTH: Lade aus ratingHistory
    const currentRating = await getPlayerRatingFromHistory(pid);
    
    // Lade zusätzliche Player-Daten
    const snap = await db.collection('players').doc(pid).get();
    const playerData = snap.exists ? snap.data() : null;
    
    const cleanRatingData: PlayerRatingDoc & { oldRating: number } = {
      rating: currentRating,
      oldRating: currentRating,
      gamesPlayed: playerData?.totalGamesPlayed || 0,
      displayName: playerData?.displayName || displayNameMap.get(pid) || pid,
    };
    
    ratingMap.set(pid, cleanRatingData);
  }

  // ✅ KORRIGIERT: Elo spiel-für-spiel berechnen (wie in fixStartRatings)
  // 🆕 SESSION-DELTA TRACKING: Sammle alle Deltas pro Spieler
  const sessionDeltaMap = new Map<string, number>();
  
  for (const game of games) {
    // ✅ WICHTIG: Für Tournament-Sessions können sich Teams pro Spiel ändern!
    // Verwende game.teams wenn vorhanden (Tournament), sonst summary.teams (normale Session)
    const gameTopPlayers = game.teams?.top?.players?.map((p: any) => p.playerId).filter(Boolean) || topPlayers;
    const gameBottomPlayers = game.teams?.bottom?.players?.map((p: any) => p.playerId).filter(Boolean) || bottomPlayers;
    
    if (gameTopPlayers.length !== 2 || gameBottomPlayers.length !== 2) {
      logger.warn(`[Elo] Invalid team structure for game in session ${sessionId}, skipping`);
      continue;
    }
    
    // Aktuelle Team-Ratings vor diesem Spiel
    const teamTopRating = gameTopPlayers.reduce((sum: number, pid: string) => sum + (ratingMap.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / gameTopPlayers.length;
    const teamBottomRating = gameBottomPlayers.reduce((sum: number, pid: string) => sum + (ratingMap.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / gameBottomPlayers.length;

    const expectedTop = expectedScore(teamTopRating, teamBottomRating);
    const actualTop = stricheScore(game.stricheTop, game.stricheBottom, expectedTop);

    const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
    const deltaPerTopPlayer = delta / gameTopPlayers.length;
    const deltaPerBottomPlayer = -delta / gameBottomPlayers.length;

  // Update Ratings für dieses Spiel
    for (const pid of gameTopPlayers) {
    const r = ratingMap.get(pid)!;
    r.rating = r.rating + deltaPerTopPlayer;
    r.gamesPlayed += 1;
    ratingMap.set(pid, r);
    
    // 🆕 SESSION-DELTA: Akkumuliere Delta für Session
    sessionDeltaMap.set(pid, (sessionDeltaMap.get(pid) || 0) + deltaPerTopPlayer);
  }
    for (const pid of gameBottomPlayers) {
    const r = ratingMap.get(pid)!;
    r.rating = r.rating + deltaPerBottomPlayer;
    r.gamesPlayed += 1;
    ratingMap.set(pid, r);
    
    // 🆕 SESSION-DELTA: Akkumuliere Delta für Session
    sessionDeltaMap.set(pid, (sessionDeltaMap.get(pid) || 0) + deltaPerBottomPlayer);
  }
  }

  // Schreiben: global + gruppenspezifisch
  const batch = db.batch();
  ratingMap.forEach((val, pid) => {
    // 🆕 Tier berechnen für aktuelles Rating
    const tierInfo = getRatingTier(val.rating);
    
    // ✅ SESSION-DELTA: Summe aller Spiele in dieser Session
    const sessionDelta = Math.round(sessionDeltaMap.get(pid) || 0);
    
    const docData: any = {
      globalRating: val.rating, // ✅ KUMULATIVE GLOBAL RATING!
      totalGamesPlayed: val.gamesPlayed, // ✅ KONSISTENT: Vereinheitlicht mit Tournaments
      displayName: val.displayName,
      tier: tierInfo.name,
      tierEmoji: tierInfo.emoji,
      // ✅ SESSION-DELTA: Speichere Session-Delta (für Profilbild-Anzeige)
      lastSessionDelta: sessionDelta,
      // ✅ GLOBAL-RATING-UPDATE: Timestamp des letzten Elo-Updates
      lastGlobalRatingUpdate: admin.firestore.Timestamp.now(),
    };
    
    // ✅ SINGLE SOURCE OF TRUTH: Schreibe nur noch in players/*
    batch.set(db.collection('players').doc(pid), docData, { merge: true });
    // ❌ ENTFERNT: Gruppen-spezifische Kopie - nicht mehr nötig!
  });

  // 🆕 RATING-HISTORY: Erstelle Game-by-Game History für alle Spieler
  // ✅ KORRIGIERT: Verwende bereits aktualisierte Ratings aus der Hauptschleife
  
  // Sammle ALLE Player IDs die in dieser Session gespielt haben (für Tournament-Sessions wichtig!)
  const allParticipantIds = new Set<string>();
  games.forEach(game => {
    const gameTopPlayers = game.teams?.top?.players?.map((p: any) => p.playerId).filter(Boolean) || topPlayers;
    const gameBottomPlayers = game.teams?.bottom?.players?.map((p: any) => p.playerId).filter(Boolean) || bottomPlayers;
    gameTopPlayers.forEach((pid: string) => allParticipantIds.add(pid));
    gameBottomPlayers.forEach((pid: string) => allParticipantIds.add(pid));
  });
  // Falls keine game.teams vorhanden (normale Session), verwende summary Teams
  if (allParticipantIds.size === 0) {
    topPlayers.forEach(pid => allParticipantIds.add(pid));
    bottomPlayers.forEach(pid => allParticipantIds.add(pid));
  }
  
  // Erstelle temporäre Map für Game-by-Game Ratings
  const gameByGameRatings = new Map<string, Array<{rating: number, delta: number, gameNumber: number}>>();
  
  // Initialisiere für alle Spieler
  allParticipantIds.forEach(pid => {
    gameByGameRatings.set(pid, []);
  });
  
  // Simuliere Game-by-Game Rating-Updates
  const tempRatingMap = new Map<string, {rating: number, gamesPlayed: number}>();
  allParticipantIds.forEach(pid => {
    // Verwende initiale Rating aus ratingMap (VOR dem ersten Spiel)
    const initialRating = ratingMap.get(pid)?.oldRating || JASS_ELO_CONFIG.DEFAULT_RATING;
    tempRatingMap.set(pid, {rating: initialRating, gamesPlayed: 0});
  });
  
  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const game = games[gameIndex];
    const gameNumber = gameIndex + 1;
    
    // ✅ WICHTIG: Verwende game.teams wenn vorhanden (Tournament), sonst summary.teams
    const gameTopPlayers = game.teams?.top?.players?.map((p: any) => p.playerId).filter(Boolean) || topPlayers;
    const gameBottomPlayers = game.teams?.bottom?.players?.map((p: any) => p.playerId).filter(Boolean) || bottomPlayers;
    
    if (gameTopPlayers.length !== 2 || gameBottomPlayers.length !== 2) {
      logger.warn(`[Elo] Invalid team structure for game ${gameNumber} in rating history, skipping`);
      continue;
    }
    
    // Berechne Team-Ratings vor diesem Spiel
    const teamTopRating = gameTopPlayers.reduce((sum: number, pid: string) => sum + tempRatingMap.get(pid)!.rating, 0) / gameTopPlayers.length;
    const teamBottomRating = gameBottomPlayers.reduce((sum: number, pid: string) => sum + tempRatingMap.get(pid)!.rating, 0) / gameBottomPlayers.length;
    
    const expectedTop = expectedScore(teamTopRating, teamBottomRating);
    const actualTop = stricheScore(game.stricheTop, game.stricheBottom, expectedTop);
    const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
    const deltaPerTopPlayer = delta / gameTopPlayers.length;
    const deltaPerBottomPlayer = -delta / gameBottomPlayers.length;
    
    // Update temporäre Ratings und sammle History-Daten
    for (const pid of gameTopPlayers) {
      const currentRating = tempRatingMap.get(pid)!;
      currentRating.rating += deltaPerTopPlayer;
      currentRating.gamesPlayed += 1;
      
      gameByGameRatings.get(pid)!.push({
        rating: currentRating.rating,
        delta: deltaPerTopPlayer,
        gameNumber: gameNumber
      });
    }
    
    for (const pid of gameBottomPlayers) {
      const currentRating = tempRatingMap.get(pid)!;
      currentRating.rating += deltaPerBottomPlayer;
      currentRating.gamesPlayed += 1;
      
      gameByGameRatings.get(pid)!.push({
        rating: currentRating.rating,
        delta: deltaPerBottomPlayer,
        gameNumber: gameNumber
      });
    }
  }
  
  // Schreibe Rating-History & Scores-History Einträge (PRO SPIEL!)
  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const game = games[gameIndex];
    const completedGame = completedGames[gameIndex]; // ✅ Vollständige Game-Daten
    
    // ✅ KORREKTUR: Verwende echte completedAt Timestamp aus completedGames!
    let gameTimestamp: Date;
    
    // ✅ ROBUSTES TIMESTAMP-HANDLING: Behandle verschiedene Datentypen
    let gameCompletedAtMs: number | undefined;
    
    if (game.completedAt) {
      // Sichere Timestamp-Extraktion - behandle verschiedene Datentypen
      const completedAt = game.completedAt as any;
      if (typeof completedAt === 'object' && 'toDate' in completedAt && typeof completedAt.toDate === 'function') {
        // Firestore Timestamp (hat .toDate() Methode)
        gameCompletedAtMs = (completedAt as admin.firestore.Timestamp).toMillis();
      } else if (typeof completedAt === 'object' && 'seconds' in completedAt) {
        // Firestore Timestamp-ähnliches Objekt mit seconds/nanoseconds
        gameCompletedAtMs = completedAt.seconds * 1000 + Math.floor((completedAt.nanoseconds || 0) / 1000000);
      } else if (typeof completedAt === 'number') {
        // Zahl (Millisekunden)
        gameCompletedAtMs = completedAt;
      } else if (completedAt && typeof completedAt === 'object' && 'getTime' in completedAt && typeof completedAt.getTime === 'function') {
        // Date Objekt oder ähnliches
        gameCompletedAtMs = (completedAt as Date).getTime();
      }
    }
    
    // Fallback: Versuche aus completedGame zu extrahieren
    if (!gameCompletedAtMs && completedGame) {
      if (completedGame.completedAt) {
        if (typeof completedGame.completedAt === 'object' && 'toDate' in completedGame.completedAt) {
          gameCompletedAtMs = (completedGame.completedAt as admin.firestore.Timestamp).toMillis();
        } else if (typeof completedGame.completedAt === 'object' && 'seconds' in completedGame.completedAt) {
          gameCompletedAtMs = (completedGame.completedAt as any).seconds * 1000 + Math.floor((completedGame.completedAt as any).nanoseconds / 1000000);
        } else if (typeof completedGame.completedAt === 'number') {
          gameCompletedAtMs = completedGame.completedAt;
        }
      } else if (completedGame.timestampCompleted) {
        if (typeof completedGame.timestampCompleted === 'object' && 'toDate' in completedGame.timestampCompleted) {
          gameCompletedAtMs = (completedGame.timestampCompleted as admin.firestore.Timestamp).toMillis();
        } else if (typeof completedGame.timestampCompleted === 'object' && 'seconds' in completedGame.timestampCompleted) {
          gameCompletedAtMs = (completedGame.timestampCompleted as any).seconds * 1000 + Math.floor((completedGame.timestampCompleted as any).nanoseconds / 1000000);
        } else if (typeof completedGame.timestampCompleted === 'number') {
          gameCompletedAtMs = completedGame.timestampCompleted;
        }
      }
    }
    
    if (gameCompletedAtMs) {
      gameTimestamp = new Date(gameCompletedAtMs);
    } else {
      // Fallback: Interpoliere nur wenn kein completedAt verfügbar
      logger.warn(`[Elo] No completedAt for game ${gameIndex + 1}, falling back to interpolation`);
      const sessionStart = summary?.startedAt?.toDate?.() || new Date();
      const sessionEnd = summary?.endedAt?.toDate?.() || new Date();
      const sessionDuration = sessionEnd.getTime() - sessionStart.getTime();
      gameTimestamp = new Date(sessionStart.getTime() + (sessionDuration * gameIndex / games.length));
    }
    
    const gameTimestampFirestore = admin.firestore.Timestamp.fromDate(gameTimestamp);
    
    // ✅ WICHTIG: Für Tournament-Sessions können sich Teams pro Spiel ändern!
    const gameTopPlayers = game.teams?.top?.players?.map((p: any) => p.playerId).filter(Boolean) || topPlayers;
    const gameBottomPlayers = game.teams?.bottom?.players?.map((p: any) => p.playerId).filter(Boolean) || bottomPlayers;
    
    // Schreibe Rating-History & Scores-History für alle Spieler dieses Spiels
    [...gameTopPlayers, ...gameBottomPlayers].forEach(pid => {
      const gameData = gameByGameRatings.get(pid)?.[gameIndex];
      if (!gameData) return; // Spieler war nicht in diesem Spiel (Tournament)
      
      const isTopPlayer = gameTopPlayers.includes(pid);
      const teamKey = isTopPlayer ? 'top' : 'bottom';
      const opponentTeamKey = isTopPlayer ? 'bottom' : 'top';
      
      // ✅ RATING-HISTORY (existing)
      const ratingHistoryData = {
        rating: gameData.rating,
        delta: gameData.delta,
        eventType: 'game',
        gameNumber: gameData.gameNumber,
        createdAt: gameTimestampFirestore,
        completedAt: gameTimestampFirestore,
        sessionId: sessionId,
        groupId: groupId,
      };
      batch.set(db.collection(`players/${pid}/ratingHistory`).doc(), ratingHistoryData);
      
      // ✅ SCORES-HISTORY (NEU!)
      if (completedGame) {
        // Striche-Differenz
        const playerStriche = sumStriche(completedGame.finalStriche?.[teamKey]);
        const opponentStriche = sumStriche(completedGame.finalStriche?.[opponentTeamKey]);
        const stricheDiff = playerStriche - opponentStriche;
        
        // Punkte-Differenz
        const playerPoints = completedGame.finalScores?.[teamKey] || 0;
        const opponentPoints = completedGame.finalScores?.[opponentTeamKey] || 0;
        const pointsDiff = playerPoints - opponentPoints;
        
        // Win/Loss (NO draw on game level!)
        const wins = pointsDiff > 0 ? 1 : 0;
        const losses = pointsDiff < 0 ? 1 : 0;
        
        // Event-Bilanz
        const playerEvents = completedGame.eventCounts?.[teamKey];
        const opponentEvents = completedGame.eventCounts?.[opponentTeamKey];
        const matschBilanz = (playerEvents?.matsch || 0) - (opponentEvents?.matsch || 0);
        const schneiderBilanz = (playerEvents?.schneider || 0) - (opponentEvents?.schneider || 0);
        const kontermatschBilanz = (playerEvents?.kontermatsch || 0) - (opponentEvents?.kontermatsch || 0);
        
        // Weis-Differenz (TODO: Weis pro Player aus completedGame extrahieren)
        const weisDifference = 0; // Placeholder
        
        const scoresEntry: ScoresHistoryEntry = {
          completedAt: gameTimestampFirestore,
          groupId,
          sessionId: sessionId, // ✅ FEHLTE: Wichtig für Queries!
          tournamentId: null,
          gameNumber: gameData.gameNumber,
          stricheDiff,
          pointsDiff,
          wins,
          losses,
          matschBilanz,
          schneiderBilanz,
          kontermatschBilanz,
          weisDifference,
          eventType: 'game',
        };
        
        batch.set(db.collection(`players/${pid}/scoresHistory`).doc(), scoresEntry);
      }
    });
  }

  // Marker an Session
  batch.set(summaryRef, { eloUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  await batch.commit();
  
  // 🚀 PERFORMANCE: Chart-Daten für Gruppe aktualisieren
  // ❌ ENTFERNT: updateGroupLeaderboard(groupId) - Leaderboard Collection wurde gelöscht
  await updateGroupChartData(groupId);
  
  logger.info(`[Elo] Update finished for session ${sessionId}`);
}

async function updateGroupChartData(groupId: string): Promise<void> {
  try {
    console.log(`[ChartData] Updating chart data for group ${groupId}`);
    
    // Alle Mitglieder der Gruppe laden
    const membersSnap = await db.collection(`groups/${groupId}/members`).get();
    const memberIds = membersSnap.docs.map(doc => doc.id);
    
    if (memberIds.length === 0) {
      logger.warn(`[ChartData] No members found for group ${groupId}`);
      return;
    }
    
    // 🎯 NEUE METHODE: Chart-Daten aus jassGameSummaries generieren
    const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .orderBy('completedAt', 'asc')
      .get();
    
    if (sessionsSnap.empty) {
      logger.warn(`[ChartData] No sessions found for group ${groupId}`);
      return;
    }
    
    // Spieler-Daten sammeln
    const playerDataMap = new Map<string, {
      memberId: string;
      memberData: any;
      currentRating: number;
      ratings: number[];
    }>();
    const allLabels = new Set<string>();
    
    // Initialisiere alle Spieler
    for (const memberId of memberIds) {
      const memberDoc = membersSnap.docs.find(doc => doc.id === memberId);
      const memberData = memberDoc?.data();
      
      // Aktuelles Rating aus players-Collection holen
      const playerDoc = await db.collection('players').doc(memberId).get();
      const playerDocData = playerDoc.data();
      const currentRating = playerDocData?.globalRating || playerDocData?.rating || 100;
      
      playerDataMap.set(memberId, {
        memberId,
        memberData,
        currentRating,
        ratings: []
      });
    }
    
    // Durch alle Sessions gehen und finale Ratings sammeln
    sessionsSnap.docs.forEach(doc => {
      const sessionData = doc.data();
      const playerFinalRatings = sessionData.playerFinalRatings || {};
      const sessionDate = sessionData.completedAt?.toDate?.() || new Date();
      const label = sessionDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
      
      allLabels.add(label);
      
      // Für jeden Spieler den finalen Rating-Wert nehmen
      Object.entries(playerFinalRatings).forEach(([playerId, ratingData]) => {
        const playerData = playerDataMap.get(playerId);
        if (playerData && ratingData && typeof ratingData === 'object' && 'rating' in ratingData && typeof ratingData.rating === 'number') {
          playerData.ratings.push(ratingData.rating);
        }
      });
    });
    
    // ✅ Chart-Datasets generieren OHNE Farben (Farben werden im Frontend generiert)
    const playerData: Array<{
      memberId: string;
      memberData: any;
      currentRating: number;
      dataset: any;
    }> = [];
    
    playerDataMap.forEach((playerDataItem, memberId) => {
      if (playerDataItem.ratings.length > 0) {
        // ✅ KEINE Farben mehr - Frontend übernimmt das!
        const dataset = {
          label: playerDataItem.memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`,
          data: playerDataItem.ratings,
          playerId: memberId,
          displayName: playerDataItem.memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`,
          // ℹ️ Farben werden im Frontend basierend auf Theme generiert
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.1,
          spanGaps: true,
        };
        
        playerData.push({
          memberId,
          memberData: playerDataItem.memberData,
          currentRating: playerDataItem.currentRating,
          dataset
        });
      }
    });
    
    // 🎯 SORTIERE Spieler nach aktuellem Rating (höchstes zuerst)
    playerData.sort((a, b) => b.currentRating - a.currentRating);
    
    // Extrahiere sortierte Datasets
    const chartDatasets = playerData.map(p => p.dataset);
    
    // Alle Labels sortieren
    const sortedLabels = Array.from(allLabels).sort((a, b) => {
      const [dayA, monthA, yearA] = a.split('.');
      const [dayB, monthB, yearB] = b.split('.');
      const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
      const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
      return dateA.getTime() - dateB.getTime();
    });
    
    // Chart-Daten schreiben
    const chartData = {
      datasets: chartDatasets,
      labels: sortedLabels,
      lastUpdated: admin.firestore.Timestamp.now(),
      totalPlayers: chartDatasets.length,
      totalSessions: sortedLabels.length,
    };
    
    await db.doc(`groups/${groupId}/aggregated/chartData_elo`).set(chartData);
    logger.info(`[ChartData] Updated for group ${groupId} with ${chartDatasets.length} players and ${sortedLabels.length} sessions`);
  } catch (error) {
    logger.error(`[ChartData] Failed to update for group ${groupId}:`, error);
    // Nicht kritisch - soll das Elo-Update nicht blockieren
  }
}

export async function updateEloForTournament(tournamentId: string, participantPlayerIds: string[]): Promise<void> {
  logger.info(`[Elo] Start update for tournament ${tournamentId} with ${participantPlayerIds.length} participants`);

  // Hole groupId aus Tournament-Dokument für Chart-Update
  const tournamentRef = db.doc(`tournaments/${tournamentId}`);
  const tournamentSnap = await tournamentRef.get();
  const tournamentData = tournamentSnap.data();
  const groupId = tournamentData?.groupId;
  
  // Alle Passen des Turniers laden
  const gamesSnap = await tournamentRef.collection('games').orderBy('completedAt', 'asc').get();
  
  if (gamesSnap.empty) {
    logger.warn(`[Elo] No games found for tournament ${tournamentId}`);
    return;
  }

  const games = gamesSnap.docs.map(doc => ({
    id: doc.id,
    data: doc.data(),
    completedAt: doc.data().completedAt
  }));

  logger.info(`[Elo] Found ${games.length} passes for tournament ${tournamentId}`);

  // ✅ Ratings laden aus ratingHistory - VOR Turnier-Start!
  const displayNameMap = await loadDisplayNames(participantPlayerIds);
  const ratingMap = new Map<string, PlayerRatingDoc & { oldRating: number }>();
  
  // Hole Turnier-Start-Timestamp (erster Pass)
  const firstGameTimestamp = games[0]?.completedAt;
  
  for (const pid of participantPlayerIds) {
    // ✅ SINGLE SOURCE OF TRUTH: Lade Elo VOR Turnier aus ratingHistory
    const currentRating = await getPlayerRatingFromHistory(pid, firstGameTimestamp);
    
    // Lade zusätzliche Player-Daten
    const snap = await db.collection('players').doc(pid).get();
    const playerData = snap.exists ? snap.data() : null;
    
    ratingMap.set(pid, {
      rating: currentRating,
      oldRating: currentRating,
      gamesPlayed: playerData?.totalGamesPlayed || 0,
      displayName: playerData?.displayName || displayNameMap.get(pid) || pid,
    });
    
    logger.debug(`[Elo] Tournament ${tournamentId} - Player ${pid} starts with rating ${currentRating.toFixed(2)}`);
  }

  // Elo passe-für-passe berechnen
  const tournamentDeltaMap = new Map<string, number>();
  
  for (const game of games) {
    const gameData = game.data;
    
    // Teams aus playerDetails extrahieren
    const playerDetails = gameData.playerDetails || [];
    if (playerDetails.length !== 4) {
      logger.warn(`[Elo] Invalid playerDetails length for game ${game.id} in tournament ${tournamentId}`);
      continue;
    }

    // Teams basierend auf team-Feld bilden
    const topPlayers: string[] = [];
    const bottomPlayers: string[] = [];
    
    playerDetails.forEach((player: any) => {
      if (player.team === 'top') {
        topPlayers.push(player.playerId);
      } else if (player.team === 'bottom') {
        bottomPlayers.push(player.playerId);
      }
    });

    if (topPlayers.length !== 2 || bottomPlayers.length !== 2) {
      logger.warn(`[Elo] Invalid team structure for game ${game.id} in tournament ${tournamentId}`);
      continue;
    }

    // Striche aus teamStrichePasse extrahieren
    const teamStriche = gameData.teamStrichePasse || {};
    const stricheTop = sumStriche(teamStriche.top);
    const stricheBottom = sumStriche(teamStriche.bottom);

    // Aktuelle Team-Ratings vor dieser Passe
    const teamTopRating = topPlayers.reduce((sum, pid) => sum + (ratingMap.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / topPlayers.length;
    const teamBottomRating = bottomPlayers.reduce((sum, pid) => sum + (ratingMap.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / bottomPlayers.length;

    const expectedTop = expectedScore(teamTopRating, teamBottomRating);
    const actualTop = stricheScore(stricheTop, stricheBottom, expectedTop);

    const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
    const deltaPerTopPlayer = delta / topPlayers.length;
    const deltaPerBottomPlayer = -delta / bottomPlayers.length;

    // Update Ratings für diese Passe
    for (const pid of topPlayers) {
      const r = ratingMap.get(pid)!;
      r.rating = r.rating + deltaPerTopPlayer;
      r.gamesPlayed += 1;
      ratingMap.set(pid, r);
      
      // Tournament-Delta akkumulieren
      tournamentDeltaMap.set(pid, (tournamentDeltaMap.get(pid) || 0) + deltaPerTopPlayer);
    }
    
    for (const pid of bottomPlayers) {
      const r = ratingMap.get(pid)!;
      r.rating = r.rating + deltaPerBottomPlayer;
      r.gamesPlayed += 1;
      ratingMap.set(pid, r);
      
      // Tournament-Delta akkumulieren
      tournamentDeltaMap.set(pid, (tournamentDeltaMap.get(pid) || 0) + deltaPerBottomPlayer);
    }
  }

  // Schreiben: global + rating history
  const batch = db.batch();
  ratingMap.forEach((val, pid) => {
    const tierInfo = getRatingTier(val.rating);
    
    // ✅ TOURNAMENT-DELTA: Summe aller Passen in diesem Turnier
    const tournamentDelta = Math.round(tournamentDeltaMap.get(pid) || 0);
    
    const docData: any = {
      globalRating: val.rating,
      totalGamesPlayed: val.gamesPlayed,
      displayName: val.displayName,
      tier: tierInfo.name,
      tierEmoji: tierInfo.emoji,
      // ✅ TOURNAMENT-DELTA: Speichere als "Session-Delta" (für Profilbild-Anzeige)
      lastSessionDelta: tournamentDelta,
      lastGlobalRatingUpdate: admin.firestore.Timestamp.now(),
    };
    
    batch.set(db.collection('players').doc(pid), docData, { merge: true });
  });

  // Rating-History & Scores-History: Erstelle Passe-by-Passe History für alle Spieler (PRO SPIEL!)
  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const game = games[gameIndex];
    const gameData = game.data;
    const passeNumber = gameData.passeNumber || (gameIndex + 1);
    
    // Teams für diese Passe
    const playerDetails = gameData.playerDetails || [];
    const topPlayers: string[] = [];
    const bottomPlayers: string[] = [];
    
    playerDetails.forEach((player: any) => {
      if (player.team === 'top') {
        topPlayers.push(player.playerId);
      } else if (player.team === 'bottom') {
        bottomPlayers.push(player.playerId);
      }
    });

    if (topPlayers.length !== 2 || bottomPlayers.length !== 2) continue;

    // Striche für diese Passe
    const teamStriche = gameData.teamStrichePasse || {};
    const stricheTop = sumStriche(teamStriche.top);
    const stricheBottom = sumStriche(teamStriche.bottom);
    
    // Punkte für diese Passe
    const pointsTop = gameData.finalScores?.top || 0;
    const pointsBottom = gameData.finalScores?.bottom || 0;

    // Rating-History & Scores-History für ALLE Spieler (Top + Bottom)
    [...topPlayers, ...bottomPlayers].forEach(pid => {
      const playerRating = ratingMap.get(pid);
      if (!playerRating) return;
      
      const isTopPlayer = topPlayers.includes(pid);
      const teamKey = isTopPlayer ? 'top' : 'bottom';
      const opponentTeamKey = isTopPlayer ? 'bottom' : 'top';
      
      // Rating-Delta berechnen
      const teamTopRating = topPlayers.reduce((sum, p) => sum + (ratingMap.get(p)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / topPlayers.length;
      const teamBottomRating = bottomPlayers.reduce((sum, p) => sum + (ratingMap.get(p)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / bottomPlayers.length;
      const expectedTop = expectedScore(teamTopRating, teamBottomRating);
      const actualTop = stricheScore(stricheTop, stricheBottom, expectedTop);
      const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
      const deltaPerPlayer = isTopPlayer ? (delta / topPlayers.length) : (-delta / bottomPlayers.length);
      
      // ✅ RATING-HISTORY (existing)
      const ratingHistoryData = {
        rating: playerRating.rating + deltaPerPlayer,
        delta: deltaPerPlayer,
        eventType: 'tournament_passe',
        eventId: `tournament_${tournamentId}_passe_${passeNumber}`,
        createdAt: game.completedAt,
        completedAt: game.completedAt,
        tournamentId: tournamentId,
        passeNumber: passeNumber,
      };
      batch.set(db.collection(`players/${pid}/ratingHistory`).doc(), ratingHistoryData);
      
      // ✅ SCORES-HISTORY (NEU!)
      // Striche-Differenz
      const playerStriche = isTopPlayer ? stricheTop : stricheBottom;
      const opponentStriche = isTopPlayer ? stricheBottom : stricheTop;
      const stricheDiff = playerStriche - opponentStriche;
      
      // Punkte-Differenz
      const playerPoints = isTopPlayer ? pointsTop : pointsBottom;
      const opponentPoints = isTopPlayer ? pointsBottom : pointsTop;
      const pointsDiff = playerPoints - opponentPoints;
      
      // Win/Loss (NO draw on game level!)
      const wins = pointsDiff > 0 ? 1 : 0;
      const losses = pointsDiff < 0 ? 1 : 0;
      
      // Event-Bilanz
      const playerEvents = gameData.eventCounts?.[teamKey];
      const opponentEvents = gameData.eventCounts?.[opponentTeamKey];
      const matschBilanz = (playerEvents?.matsch || 0) - (opponentEvents?.matsch || 0);
      const schneiderBilanz = (playerEvents?.schneider || 0) - (opponentEvents?.schneider || 0);
      const kontermatschBilanz = (playerEvents?.kontermatsch || 0) - (opponentEvents?.kontermatsch || 0);
      
      // Weis-Differenz (TODO: Weis pro Player extrahieren)
      const weisDifference = 0; // Placeholder
      
      const scoresEntry: ScoresHistoryEntry = {
        completedAt: game.completedAt,
        groupId: '',
        tournamentId: tournamentId,
        gameNumber: passeNumber,
        stricheDiff,
        pointsDiff,
        wins,
        losses,
        matschBilanz,
        schneiderBilanz,
        kontermatschBilanz,
        weisDifference,
        eventType: 'game',
      };
      
      batch.set(db.collection(`players/${pid}/scoresHistory`).doc(), scoresEntry);
    });
  }

  await batch.commit();
  
  // 🚀 CHART-UPDATE: Aktualisiere chartData_elo für die Gruppe
  if (groupId) {
    try {
      await updateGroupChartData(groupId);
      logger.info(`[Elo] Chart data updated for group ${groupId} after tournament ${tournamentId}`);
    } catch (chartError) {
      logger.error(`[Elo] Failed to update chart data for group ${groupId}:`, chartError);
      // Nicht kritisch - soll Elo-Update nicht blockieren
    }
  } else {
    logger.warn(`[Elo] No groupId found for tournament ${tournamentId}, skipping chart update`);
  }
  
  logger.info(`[Elo] Successfully updated Elo for tournament ${tournamentId} with ${participantPlayerIds.length} participants`);
}

/**
 * 🆕 Aktualisiert Elo für eine einzelne Tournament-Passe (wird nach jeder Passe getriggert)
 * Analog zu updateEloForSession, aber für eine einzelne Turnier-Passe
 */
export async function updateEloForSingleTournamentPasse(
  tournamentId: string,
  passeId: string
): Promise<void> {
  logger.info(`[Elo] Updating Elo for tournament ${tournamentId} passe ${passeId}`);

  // Lade Passe-Daten
  const passeRef = db.doc(`tournaments/${tournamentId}/games/${passeId}`);
  const passeSnap = await passeRef.get();
  
  if (!passeSnap.exists) {
    logger.warn(`[Elo] Passe ${passeId} not found in tournament ${tournamentId}`);
    return;
  }

  const passeData = passeSnap.data() as any;
  const passeNumber = passeData.passeNumber || 0;
  
  // Extrahiere Spieler-IDs und Teams
  const topPlayers: string[] = passeData.teams?.top?.players?.map((p: any) => p.playerId).filter(Boolean) || [];
  const bottomPlayers: string[] = passeData.teams?.bottom?.players?.map((p: any) => p.playerId).filter(Boolean) || [];
  
  if (topPlayers.length !== 2 || bottomPlayers.length !== 2) {
    logger.warn(`[Elo] Invalid team structure for passe ${passeId}`);
    return;
  }

  // ✅ Hole aktuelle Ratings aus ratingHistory (vor dieser Passe!)
  const allPlayers = [...topPlayers, ...bottomPlayers];
  const displayNameMap = await loadDisplayNames(allPlayers);
  const ratingMap = new Map<string, PlayerRatingDoc & { oldRating: number }>();
  
  // Hole Passe-Timestamp
  const passeTimestamp = passeData.completedAt;
  
  for (const pid of allPlayers) {
    // ✅ SINGLE SOURCE OF TRUTH: Lade Elo VOR dieser Passe aus ratingHistory
    const currentRating = await getPlayerRatingFromHistory(pid, passeTimestamp);
    
    // Lade zusätzliche Player-Daten
    const snap = await db.collection('players').doc(pid).get();
    const playerData = snap.exists ? snap.data() : null;
    
    ratingMap.set(pid, {
      rating: currentRating,
      oldRating: currentRating,
      gamesPlayed: playerData?.gamesPlayed || 0,
      displayName: playerData?.displayName || displayNameMap.get(pid) || pid,
    });
    
    logger.debug(`[Elo] Passe ${passeId} - Player ${pid} starts with rating ${currentRating.toFixed(2)}`);
  }

  // Berechne Striche für Teams
  const stricheTop = sumStriche(passeData.finalStriche?.top);
  const stricheBottom = sumStriche(passeData.finalStriche?.bottom);

  // Berechne Team-Ratings
  const teamTopRating = topPlayers.reduce((sum, pid) => sum + (ratingMap.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / topPlayers.length;
  const teamBottomRating = bottomPlayers.reduce((sum, pid) => sum + (ratingMap.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / bottomPlayers.length;

  // Berechne Elo-Änderung
  const expectedTop = expectedScore(teamTopRating, teamBottomRating);
  const actualTop = stricheScore(stricheTop, stricheBottom, expectedTop);
  const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
  const deltaPerTopPlayer = delta / topPlayers.length;
  const deltaPerBottomPlayer = -delta / bottomPlayers.length;

  // Update Ratings in-memory
  for (const pid of topPlayers) {
    const r = ratingMap.get(pid)!;
    r.rating = r.rating + deltaPerTopPlayer;
    r.gamesPlayed += 1;
    ratingMap.set(pid, r);
  }
  for (const pid of bottomPlayers) {
    const r = ratingMap.get(pid)!;
    r.rating = r.rating + deltaPerBottomPlayer;
    r.gamesPlayed += 1;
    ratingMap.set(pid, r);
  }

  // Schreibe zu Firestore
  const batch = db.batch();
  
  // Update Player Documents
  ratingMap.forEach((val, pid) => {
    const tierInfo = getRatingTier(val.rating);
    
    // ✅ PASSE-DELTA: Gesamtänderung durch diese Passe (für Profilbild-Anzeige)
    const passeDelta = Math.round(val.rating - val.oldRating);
    
    const docData: any = {
      globalRating: val.rating,
      totalGamesPlayed: val.gamesPlayed,
      displayName: val.displayName,
      tier: tierInfo.name,
      tierEmoji: tierInfo.emoji,
      // ✅ PASSE-DELTA: Speichere als "Session-Delta" für Profilbild-Anzeige
      lastSessionDelta: passeDelta,
      lastGlobalRatingUpdate: admin.firestore.Timestamp.now(),
    };
    
    batch.set(db.collection('players').doc(pid), docData, { merge: true });
  });

  // Rating-History & Scores-History für alle Spieler
  const completedAt = passeData.completedAt || admin.firestore.Timestamp.now();
  
  // Punkte für diese Passe
  const pointsTop = passeData.finalScores?.top || 0;
  const pointsBottom = passeData.finalScores?.bottom || 0;
  
  for (const pid of allPlayers) {
    const playerRating = ratingMap.get(pid);
    if (playerRating) {
      const isTopPlayer = topPlayers.includes(pid);
      const teamKey = isTopPlayer ? 'top' : 'bottom';
      const opponentTeamKey = isTopPlayer ? 'bottom' : 'top';
      
      // ✅ RATING-HISTORY (existing)
      const historyData = {
        rating: playerRating.rating,
        delta: Math.round(playerRating.rating - playerRating.oldRating),
        eventType: 'tournament_passe',
        eventId: `tournament_${tournamentId}_passe_${passeNumber}`,
        createdAt: completedAt,
        completedAt: completedAt,
        tournamentId: tournamentId,
        passeNumber: passeNumber,
      };
      
      batch.set(db.collection(`players/${pid}/ratingHistory`).doc(), historyData);
      
      // ✅ SCORES-HISTORY (NEU!)
      // Striche-Differenz
      const playerStriche = isTopPlayer ? stricheTop : stricheBottom;
      const opponentStriche = isTopPlayer ? stricheBottom : stricheTop;
      const stricheDiff = playerStriche - opponentStriche;
      
      // Punkte-Differenz
      const playerPoints = isTopPlayer ? pointsTop : pointsBottom;
      const opponentPoints = isTopPlayer ? pointsBottom : pointsTop;
      const pointsDiff = playerPoints - opponentPoints;
      
      // Win/Loss (NO draw on game level!)
      const wins = pointsDiff > 0 ? 1 : 0;
      const losses = pointsDiff < 0 ? 1 : 0;
      
      // Event-Bilanz
      const playerEvents = passeData.eventCounts?.[teamKey];
      const opponentEvents = passeData.eventCounts?.[opponentTeamKey];
      const matschBilanz = (playerEvents?.matsch || 0) - (opponentEvents?.matsch || 0);
      const schneiderBilanz = (playerEvents?.schneider || 0) - (opponentEvents?.schneider || 0);
      const kontermatschBilanz = (playerEvents?.kontermatsch || 0) - (opponentEvents?.kontermatsch || 0);
      
      // Weis-Differenz (TODO: Weis pro Player extrahieren)
      const weisDifference = 0; // Placeholder
      
      const scoresEntry: ScoresHistoryEntry = {
        completedAt: completedAt,
        groupId: '', // Tourniere haben keine groupId per se
        tournamentId: tournamentId,
        gameNumber: passeNumber,
        stricheDiff,
        pointsDiff,
        wins,
        losses,
        matschBilanz,
        schneiderBilanz,
        kontermatschBilanz,
        weisDifference,
        eventType: 'game',
      };
      
      batch.set(db.collection(`players/${pid}/scoresHistory`).doc(), scoresEntry);
    }
  }

  await batch.commit();
  logger.info(`[Elo] ✅ Successfully updated Elo & scores for tournament ${tournamentId} passe ${passeNumber}`);
}


