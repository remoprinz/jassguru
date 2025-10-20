import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { getRatingTier } from './shared/rating-tiers';

const db = admin.firestore();

// Elo-Parameter (synchron zum Frontend/Script)
const JASS_ELO_CONFIG = {
  K_TARGET: 15,           // ✅ ANGEPASST: K=15 für moderate Änderungen
  DEFAULT_RATING: 100,    // ✅ ANGEPASST: Startwert bei 100 (neue Skala)
  ELO_SCALE: 1000,        // Beibehalten: Skala 1000 für optimale Spreizung
} as const;

type PlayerRatingDoc = {
  rating: number;
  gamesPlayed: number;
  lastUpdated: number;
  displayName?: string;
  tier?: string;
  tierEmoji?: string;
  lastDelta?: number;
  // 🆕 SESSION-DELTA TRACKING
  lastSessionDelta?: number;  // Delta der letzten Session (Summe aller Spiele)
  // 🆕 PEAK/LOW TRACKING
  peakRating?: number;        // Höchste je erreichte Wertung
  peakRatingDate?: number;    // Timestamp wann Peak erreicht wurde
  lowestRating?: number;      // Tiefste je erreichte Wertung  
  lowestRatingDate?: number;  // Timestamp wann Low erreicht wurde
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
  const games: Array<{ stricheTop: number; stricheBottom: number; }> = [];

  // completedGames
  const cgSnap = await summaryRef.collection('completedGames').orderBy('gameNumber', 'asc').get();
  if (!cgSnap.empty) {
    cgSnap.forEach(doc => {
      const g = doc.data() as any;
      const stricheTop = sumStriche(g.finalStriche?.top);
      const stricheBottom = sumStriche(g.finalStriche?.bottom);
      games.push({ stricheTop, stricheBottom });
    });
  } else if (Array.isArray(summary?.gameResults) && summary?.finalStriche) {
    // Fallback: Session-Level gameResults + finale Striche summieren
    // Wenn finalStriche auf Spielebene fehlen, nehmen wir am Ende wenigstens eine Session-aggregierte Bewertung vor: 1 Spiel
    const stricheTop = sumStriche(summary.finalStriche?.top);
    const stricheBottom = sumStriche(summary.finalStriche?.bottom);
    games.push({ stricheTop, stricheBottom });
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
      ratingMap.set(pid, {
        rating: currentRating,
        oldRating: currentRating, // ✅ Ursprüngliches Rating merken
        gamesPlayed: d?.totalGamesPlayed || 0,
        lastUpdated: d?.lastGlobalRatingUpdate?.toMillis() || Date.now(),
        displayName: d?.displayName || displayNameMap.get(pid),
        // 🆕 PEAK/LOW Werte laden (falls vorhanden)
        peakRating: d?.peakRating || currentRating,
        peakRatingDate: d?.peakRatingDate,
        lowestRating: d?.lowestRating || currentRating,
        lowestRatingDate: d?.lowestRatingDate,
      });
    } else {
      ratingMap.set(pid, {
        rating: JASS_ELO_CONFIG.DEFAULT_RATING,
        oldRating: JASS_ELO_CONFIG.DEFAULT_RATING, // ✅ Ursprüngliches Rating merken
        gamesPlayed: 0,
        lastUpdated: Date.now(),
        displayName: displayNameMap.get(pid),
        // 🆕 PEAK/LOW für neue Spieler: Start bei DEFAULT_RATING
        peakRating: JASS_ELO_CONFIG.DEFAULT_RATING,
        peakRatingDate: Date.now(),
        lowestRating: JASS_ELO_CONFIG.DEFAULT_RATING,
        lowestRatingDate: Date.now(),
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
      r.lastUpdated = Date.now();
      ratingMap.set(pid, r);
      
      // 🆕 SESSION-DELTA: Akkumuliere Delta für Session
      sessionDeltaMap.set(pid, (sessionDeltaMap.get(pid) || 0) + deltaPerTopPlayer);
    }
    for (const pid of bottomPlayers) {
      const r = ratingMap.get(pid)!;
      r.rating = r.rating + deltaPerBottomPlayer;
      r.gamesPlayed += 1;
      r.lastUpdated = Date.now();
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
    
    // ✅ KORRIGIERT: Delta berechnen - GESAMTES DELTA DER SESSION!
    const totalDelta = Math.round(val.rating - val.oldRating);
    const sessionDelta = Math.round(sessionDeltaMap.get(pid) || 0);
    
    // 🆕 PEAK/LOW TRACKING
    const currentPeak = val.peakRating || 100;
    const currentLow = val.lowestRating || 100;
    const newPeak = Math.max(val.rating, currentPeak);
    const newLow = Math.min(val.rating, currentLow);
    
    const docData: PlayerRatingDoc = {
      rating: val.rating,
      gamesPlayed: val.gamesPlayed,
      lastUpdated: Date.now(),
      displayName: val.displayName,
      tier: tierInfo.name,
      tierEmoji: tierInfo.emoji,
      lastDelta: totalDelta,
      // 🆕 SESSION-DELTA: Speichere Session-Delta separat
      lastSessionDelta: sessionDelta,
      // 🆕 PEAK/LOW TRACKING: Immer die korrekten Werte setzen
      peakRating: newPeak,
      peakRatingDate: newPeak > currentPeak ? Date.now() : val.peakRatingDate,
      lowestRating: newLow,
      lowestRatingDate: newLow < currentLow ? Date.now() : val.lowestRatingDate,
    };
    // ✅ SINGLE SOURCE OF TRUTH: Schreibe nur noch in players/*
    batch.set(db.collection('players').doc(pid), docData, { merge: true });
    // ❌ ENTFERNT: Gruppen-spezifische Kopie - nicht mehr nötig!
  });

  // 🆕 RATING-HISTORY: Erstelle Game-by-Game History für alle Spieler
  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const game = games[gameIndex];
    const gameNumber = gameIndex + 1;
    
    // Timestamp für dieses Spiel interpolieren
    const sessionStart = summary?.startedAt?.toDate?.() || new Date();
    const sessionEnd = summary?.endedAt?.toDate?.() || new Date();
    const sessionDuration = sessionEnd.getTime() - sessionStart.getTime();
    const gameTimestamp = new Date(sessionStart.getTime() + (sessionDuration * gameIndex / games.length));
    
    // Rating-History für Top-Team
    for (const pid of topPlayers) {
      const playerRating = ratingMap.get(pid);
      if (playerRating) {
        // Berechne Rating nach diesem Spiel
        const teamTopRating = topPlayers.reduce((sum, p) => sum + (ratingMap.get(p)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / topPlayers.length;
        const teamBottomRating = bottomPlayers.reduce((sum, p) => sum + (ratingMap.get(p)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / bottomPlayers.length;
        const expectedTop = expectedScore(teamTopRating, teamBottomRating);
        const actualTop = stricheScore(game.stricheTop, game.stricheBottom);
        const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
        const deltaPerPlayer = delta / topPlayers.length;
        
        const historyData = {
          rating: playerRating.rating + deltaPerPlayer,
          delta: deltaPerPlayer,
          eventType: 'game',
          gameNumber: gameNumber,
          createdAt: admin.firestore.Timestamp.fromDate(gameTimestamp),
          sessionId: sessionId,
          groupId: groupId,
        };
        
        batch.set(db.collection(`players/${pid}/ratingHistory`).doc(), historyData);
      }
    }
    
    // Rating-History für Bottom-Team
    for (const pid of bottomPlayers) {
      const playerRating = ratingMap.get(pid);
      if (playerRating) {
        // Berechne Rating nach diesem Spiel
        const teamTopRating = topPlayers.reduce((sum, p) => sum + (ratingMap.get(p)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / topPlayers.length;
        const teamBottomRating = bottomPlayers.reduce((sum, p) => sum + (ratingMap.get(p)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / bottomPlayers.length;
        const expectedTop = expectedScore(teamTopRating, teamBottomRating);
        const actualTop = stricheScore(game.stricheTop, game.stricheBottom);
        const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
        const deltaPerPlayer = -delta / bottomPlayers.length;
        
        const historyData = {
          rating: playerRating.rating + deltaPerPlayer,
          delta: deltaPerPlayer,
          eventType: 'game',
          gameNumber: gameNumber,
          createdAt: admin.firestore.Timestamp.fromDate(gameTimestamp),
          sessionId: sessionId,
          groupId: groupId,
        };
        
        batch.set(db.collection(`players/${pid}/ratingHistory`).doc(), historyData);
      }
    }
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
    
    // Chart-Daten aus players/{playerId}/ratingHistory generieren
    const playerData: Array<{
      memberId: string;
      memberData: any;
      currentRating: number;
      dataset: any;
    }> = [];
    const allLabels = new Set<string>();
    
    for (const memberId of memberIds) {
      const memberDoc = membersSnap.docs.find(doc => doc.id === memberId);
      const memberData = memberDoc?.data();
      
      // 🎯 AKTUELLES RATING aus players-Collection holen
      const playerDoc = await db.collection('players').doc(memberId).get();
      const playerDocData = playerDoc.data();
      const currentRating = playerDocData?.globalRating || playerDocData?.rating || 100;
      
      // Rating-Historie für diesen Spieler laden
      const historySnap = await db.collection(`players/${memberId}/ratingHistory`)
        .orderBy('createdAt', 'asc')
        .get();
      
      if (historySnap.empty) {
        continue; // Spieler ohne Historie überspringen
      }
      
      // Datenpunkte sammeln
      const dataPoints: (number | null)[] = [];
      const labels: string[] = [];
      
      historySnap.docs.forEach(doc => {
        const data = doc.data();
        const rating = data.rating;
        const timestamp = data.createdAt;
        
        if (typeof rating === 'number' && timestamp) {
          const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
          const label = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
          
          dataPoints.push(rating);
          labels.push(label);
          allLabels.add(label);
        }
      });
      
      if (dataPoints.length > 0) {
        // Farbe basierend auf Spieler-Index
        const colors = [
          { bg: 'rgba(5, 150, 105, 0.1)', border: '#059669' }, // Grün
          { bg: 'rgba(234, 88, 12, 0.1)', border: '#ea580c' }, // Orange
          { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6' }, // Blau
          { bg: 'rgba(220, 38, 38, 0.1)', border: '#dc2626' }, // Rot
          { bg: 'rgba(147, 51, 234, 0.1)', border: '#9333ea' }, // Lila
          { bg: 'rgba(236, 72, 153, 0.1)', border: '#ec4899' }, // Pink
          { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b' }, // Gelb
          { bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981' }, // Türkis
          { bg: 'rgba(139, 92, 246, 0.1)', border: '#8b5cf6' }, // Violett
          { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444' }, // Rot-Orange
        ];
        
        const colorIndex = playerData.length % colors.length;
        const color = colors[colorIndex];
        
        const dataset = {
          label: memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`,
          data: dataPoints,
          backgroundColor: color.bg,
          borderColor: color.border,
          playerId: memberId,
          displayName: memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`,
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.1,
          spanGaps: true,
        };
        
        playerData.push({
          memberId,
          memberData,
          currentRating,
          dataset
        });
      }
    }
    
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
    
    await db.doc(`groups/${groupId}/aggregated/chartData`).set(chartData);
    logger.info(`[ChartData] Updated for group ${groupId} with ${chartDatasets.length} players and ${sortedLabels.length} sessions`);
  } catch (error) {
    logger.error(`[ChartData] Failed to update for group ${groupId}:`, error);
    // Nicht kritisch - soll das Elo-Update nicht blockieren
  }
}


