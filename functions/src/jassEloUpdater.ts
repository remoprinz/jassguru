import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { getRatingTier } from './shared/rating-tiers';
import { ScoresHistoryEntry } from './models/unified-player-data.model';

const db = admin.firestore();

// Elo-Parameter (synchron zum Frontend/Script)
const JASS_ELO_CONFIG = {
  K_TARGET: 15,          // 🔧 KORREKTUR: Synchronisiert mit recalculateEloRatingHistoryV2.ts
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

function stricheScore(stricheA: number, stricheB: number): number {
  const total = stricheA + stricheB;
  if (total === 0) return 0.5;
  return stricheA / total;
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

  // Spiele laden: bevorzugt completedGames Subcollection, sonst gameResults
  const games: Array<{ stricheTop: number; stricheBottom: number; completedAt: admin.firestore.Timestamp | null; }> = [];
  const completedGames: any[] = []; // ✅ NEU: Vollständige Game-Daten für ScoresHistory

  // completedGames
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
  } else if (Array.isArray(summary?.gameResults) && summary?.finalStriche) {
    // Fallback: Session-Level gameResults + finale Striche summieren
    // Wenn finalStriche auf Spielebene fehlen, nehmen wir am Ende wenigstens eine Session-aggregierte Bewertung vor: 1 Spiel
    const stricheTop = sumStriche(summary.finalStriche?.top);
    const stricheBottom = sumStriche(summary.finalStriche?.bottom);
    games.push({ stricheTop, stricheBottom, completedAt: null });
  }

  if (games.length === 0) {
    logger.warn(`[Elo] No games found for session ${sessionId}`);
    return;
  }

  // Ratings laden (global)
  const playerIds = [...topPlayers, ...bottomPlayers];
  const displayNameMap = await loadDisplayNames(playerIds);

  const ratingMap = new Map<string, PlayerRatingDoc & { oldRating: number }>();
  for (const pid of playerIds) {
    // ✅ OPTION A: Lese direkt aus players/* statt playerRatings/*
    const snap = await db.collection('players').doc(pid).get();
    if (snap.exists) {
      const d = snap.data();
      const currentRating = d?.globalRating || JASS_ELO_CONFIG.DEFAULT_RATING;
      
      // ✅ FIX: Erstelle sauberes Objekt ohne alte Felder
      const cleanRatingData: PlayerRatingDoc & { oldRating: number } = {
        rating: currentRating,
        oldRating: currentRating, // ✅ Ursprüngliches Rating merken
        gamesPlayed: d?.totalGamesPlayed || 0,
        displayName: d?.displayName || displayNameMap.get(pid),
        // ✅ Explizit KEINE peak/low Felder mehr laden
      };
      
      ratingMap.set(pid, cleanRatingData);
    } else {
      ratingMap.set(pid, {
        rating: JASS_ELO_CONFIG.DEFAULT_RATING,
        oldRating: JASS_ELO_CONFIG.DEFAULT_RATING, // ✅ Ursprüngliches Rating merken
        gamesPlayed: 0,
        displayName: displayNameMap.get(pid),
      });
    }
  }

  // ✅ KORRIGIERT: Elo spiel-für-spiel berechnen (wie in fixStartRatings)
  // 🆕 SESSION-DELTA TRACKING: Sammle alle Deltas pro Spieler
  const sessionDeltaMap = new Map<string, number>();
  
  for (const game of games) {
    // Aktuelle Team-Ratings vor diesem Spiel
    const teamTopRating = topPlayers.reduce((sum, pid) => sum + (ratingMap.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / topPlayers.length;
    const teamBottomRating = bottomPlayers.reduce((sum, pid) => sum + (ratingMap.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / bottomPlayers.length;

    const expectedTop = expectedScore(teamTopRating, teamBottomRating);
    const actualTop = stricheScore(game.stricheTop, game.stricheBottom);

    const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
    const deltaPerTopPlayer = delta / topPlayers.length;
    const deltaPerBottomPlayer = -delta / bottomPlayers.length;

  // Update Ratings für dieses Spiel
  for (const pid of topPlayers) {
    const r = ratingMap.get(pid)!;
    r.rating = r.rating + deltaPerTopPlayer;
    r.gamesPlayed += 1;
    ratingMap.set(pid, r);
    
    // 🆕 SESSION-DELTA: Akkumuliere Delta für Session
    sessionDeltaMap.set(pid, (sessionDeltaMap.get(pid) || 0) + deltaPerTopPlayer);
  }
  for (const pid of bottomPlayers) {
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
  
  // Erstelle temporäre Map für Game-by-Game Ratings
  const gameByGameRatings = new Map<string, Array<{rating: number, delta: number, gameNumber: number}>>();
  
  // Initialisiere für alle Spieler
  [...topPlayers, ...bottomPlayers].forEach(pid => {
    gameByGameRatings.set(pid, []);
  });
  
  // Simuliere Game-by-Game Rating-Updates
  const tempRatingMap = new Map<string, {rating: number, gamesPlayed: number}>();
  [...topPlayers, ...bottomPlayers].forEach(pid => {
    const initialRating = ratingMap.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING;
    tempRatingMap.set(pid, {rating: initialRating, gamesPlayed: 0});
  });
  
  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const game = games[gameIndex];
    const gameNumber = gameIndex + 1;
    
    // Berechne Team-Ratings vor diesem Spiel
    const teamTopRating = topPlayers.reduce((sum, pid) => sum + tempRatingMap.get(pid)!.rating, 0) / topPlayers.length;
    const teamBottomRating = bottomPlayers.reduce((sum, pid) => sum + tempRatingMap.get(pid)!.rating, 0) / bottomPlayers.length;
    
    const expectedTop = expectedScore(teamTopRating, teamBottomRating);
    const actualTop = stricheScore(game.stricheTop, game.stricheBottom);
    const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
    const deltaPerTopPlayer = delta / topPlayers.length;
    const deltaPerBottomPlayer = -delta / bottomPlayers.length;
    
    // Update temporäre Ratings und sammle History-Daten
    for (const pid of topPlayers) {
      const currentRating = tempRatingMap.get(pid)!;
      currentRating.rating += deltaPerTopPlayer;
      currentRating.gamesPlayed += 1;
      
      gameByGameRatings.get(pid)!.push({
        rating: currentRating.rating,
        delta: deltaPerTopPlayer,
        gameNumber: gameNumber
      });
    }
    
    for (const pid of bottomPlayers) {
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
    
    if (game.completedAt) {
      // Verwende echten Timestamp aus completedGames
      gameTimestamp = game.completedAt.toDate();
    } else {
      // Fallback: Interpoliere nur wenn kein completedAt verfügbar
      logger.warn(`[Elo] No completedAt for game ${gameIndex + 1}, falling back to interpolation`);
      const sessionStart = summary?.startedAt?.toDate?.() || new Date();
      const sessionEnd = summary?.endedAt?.toDate?.() || new Date();
      const sessionDuration = sessionEnd.getTime() - sessionStart.getTime();
      gameTimestamp = new Date(sessionStart.getTime() + (sessionDuration * gameIndex / games.length));
    }
    
    const gameTimestampFirestore = admin.firestore.Timestamp.fromDate(gameTimestamp);
    
    // Schreibe Rating-History & Scores-History für alle Spieler
    [...topPlayers, ...bottomPlayers].forEach(pid => {
      const gameData = gameByGameRatings.get(pid)![gameIndex];
      if (!gameData) return;
      
      const isTopPlayer = topPlayers.includes(pid);
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

  // Alle Passen des Turniers laden
  const tournamentRef = db.doc(`tournaments/${tournamentId}`);
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

  // Ratings laden (global)
  const displayNameMap = await loadDisplayNames(participantPlayerIds);
  const ratingMap = new Map<string, PlayerRatingDoc & { oldRating: number }>();
  
  for (const pid of participantPlayerIds) {
    const snap = await db.collection('players').doc(pid).get();
    if (snap.exists) {
      const d = snap.data();
      const currentRating = d?.globalRating || JASS_ELO_CONFIG.DEFAULT_RATING;
      ratingMap.set(pid, {
        rating: currentRating,
        oldRating: currentRating,
        gamesPlayed: d?.totalGamesPlayed || 0,
        displayName: d?.displayName || displayNameMap.get(pid),
      });
    } else {
      ratingMap.set(pid, {
        rating: JASS_ELO_CONFIG.DEFAULT_RATING,
        oldRating: JASS_ELO_CONFIG.DEFAULT_RATING,
        gamesPlayed: 0,
        displayName: displayNameMap.get(pid),
      });
    }
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
    const actualTop = stricheScore(stricheTop, stricheBottom);

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
      const actualTop = stricheScore(stricheTop, stricheBottom);
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

  // Hole aktuelle Ratings für alle 4 Spieler
  const allPlayers = [...topPlayers, ...bottomPlayers];
  const displayNameMap = await loadDisplayNames(allPlayers);
  const ratingMap = new Map<string, PlayerRatingDoc & { oldRating: number }>();
  
  for (const pid of allPlayers) {
    const snap = await db.collection('players').doc(pid).get();
    if (snap.exists) {
      const d = snap.data();
      const currentRating = d?.globalRating || JASS_ELO_CONFIG.DEFAULT_RATING;
      ratingMap.set(pid, {
        rating: currentRating,
        oldRating: currentRating,
        gamesPlayed: d?.gamesPlayed || 0,
        displayName: d?.displayName || displayNameMap.get(pid),
      });
    } else {
      ratingMap.set(pid, {
        rating: JASS_ELO_CONFIG.DEFAULT_RATING,
        oldRating: JASS_ELO_CONFIG.DEFAULT_RATING,
        gamesPlayed: 0,
        displayName: displayNameMap.get(pid),
      });
    }
  }

  // Berechne Striche für Teams
  const stricheTop = sumStriche(passeData.finalStriche?.top);
  const stricheBottom = sumStriche(passeData.finalStriche?.bottom);

  // Berechne Team-Ratings
  const teamTopRating = topPlayers.reduce((sum, pid) => sum + (ratingMap.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / topPlayers.length;
  const teamBottomRating = bottomPlayers.reduce((sum, pid) => sum + (ratingMap.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / bottomPlayers.length;

  // Berechne Elo-Änderung
  const expectedTop = expectedScore(teamTopRating, teamBottomRating);
  const actualTop = stricheScore(stricheTop, stricheBottom);
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

  // Rating-History für alle Spieler
  const completedAt = passeData.completedAt || admin.firestore.Timestamp.now();
  
  for (const pid of allPlayers) {
    const playerRating = ratingMap.get(pid);
    if (playerRating) {
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
    }
  }

  await batch.commit();
  logger.info(`[Elo] ✅ Successfully updated Elo for tournament ${tournamentId} passe ${passeNumber}`);
}


