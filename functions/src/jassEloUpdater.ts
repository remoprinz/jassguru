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
    const snap = await db.collection('playerRatings').doc(pid).get();
    if (snap.exists) {
      const d = snap.data() as PlayerRatingDoc;
      const currentRating = d.rating || JASS_ELO_CONFIG.DEFAULT_RATING;
      ratingMap.set(pid, {
        rating: currentRating,
        oldRating: currentRating, // ✅ Ursprüngliches Rating merken
        gamesPlayed: d.gamesPlayed || 0,
        lastUpdated: d.lastUpdated || Date.now(),
        displayName: d.displayName || displayNameMap.get(pid),
        // 🆕 PEAK/LOW Werte laden (falls vorhanden)
        peakRating: d.peakRating || currentRating,
        peakRatingDate: d.peakRatingDate,
        lowestRating: d.lowestRating || currentRating,
        lowestRatingDate: d.lowestRatingDate,
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

  // Elo über alle Spiele der Session
  for (const game of games) {
    const teamATop = (ratingMap.get(topPlayers[0])!.rating + ratingMap.get(topPlayers[1])!.rating) / 2;
    const teamBBot = (ratingMap.get(bottomPlayers[0])!.rating + ratingMap.get(bottomPlayers[1])!.rating) / 2;
    const expectedA = expectedScore(teamATop, teamBBot);
    const S = stricheScore(game.stricheTop, game.stricheBottom);

    const deltaA = JASS_ELO_CONFIG.K_TARGET * (S - expectedA);
    const deltaB = -deltaA;

    // ✅ KORRIGIERT: Gleichverteilung im Team (50/50 Split wie im Script)
    const deltaAPlayer = deltaA / 2;
    const deltaBPlayer = deltaB / 2;
    
    for (const pid of topPlayers) {
      const r = ratingMap.get(pid)!;
      r.rating = r.rating + deltaAPlayer;
      r.gamesPlayed += 1;
      r.lastUpdated = Date.now();
      ratingMap.set(pid, r);
    }
    for (const pid of bottomPlayers) {
      const r = ratingMap.get(pid)!;
      r.rating = r.rating + deltaBPlayer;
      r.gamesPlayed += 1;
      r.lastUpdated = Date.now();
      ratingMap.set(pid, r);
    }
  }

  // Schreiben: global + gruppenspezifisch
  const batch = db.batch();
  ratingMap.forEach((val, pid) => {
    // 🆕 Tier berechnen für aktuelles Rating
    const tierInfo = getRatingTier(val.rating);
    
    // ✅ KORRIGIERT: Delta berechnen - GESAMTES DELTA DER SESSION!
    const totalDelta = Math.round(val.rating - val.oldRating);
    
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
      // 🆕 PEAK/LOW TRACKING: Immer die korrekten Werte setzen
      peakRating: newPeak,
      peakRatingDate: newPeak > currentPeak ? Date.now() : val.peakRatingDate,
      lowestRating: newLow,
      lowestRatingDate: newLow < currentLow ? Date.now() : val.lowestRatingDate,
    };
    batch.set(db.collection('playerRatings').doc(pid), docData, { merge: true });
    batch.set(db.collection(`groups/${groupId}/playerRatings`).doc(pid), docData, { merge: true });
  });

  // Marker an Session
  batch.set(summaryRef, { eloUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  await batch.commit();
  
  // 🚀 PERFORMANCE: Leaderboard für Gruppe aktualisieren
  await updateGroupLeaderboard(groupId);
  
  logger.info(`[Elo] Update finished for session ${sessionId}`);
}

async function updateGroupLeaderboard(groupId: string): Promise<void> {
  try {
    // Alle Mitglieder der Gruppe laden (aus members collection)
    const membersSnap = await db.collection(`groups/${groupId}/members`).get();
    const memberIds = membersSnap.docs.map(doc => doc.id);
    
    if (memberIds.length === 0) {
      logger.warn(`[Leaderboard] No members found for group ${groupId}`);
      return;
    }
    
    // Ratings für alle Mitglieder laden (aus gruppenspezifischen playerRatings)
    const leaderboardEntries: any[] = [];
    
    for (const memberId of memberIds) {
      const memberDoc = membersSnap.docs.find(doc => doc.id === memberId);
      const memberData = memberDoc?.data();
      
      const ratingSnap = await db.doc(`groups/${groupId}/playerRatings/${memberId}`).get();
      
      if (ratingSnap.exists) {
        const rating = ratingSnap.data() as PlayerRatingDoc;
        leaderboardEntries.push({
          playerId: memberId,
          rating: rating.rating || JASS_ELO_CONFIG.DEFAULT_RATING,
          displayName: rating.displayName || memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`,
          tier: rating.tier || 'Anfänger',
          tierEmoji: rating.tierEmoji || '🆕',
          gamesPlayed: rating.gamesPlayed || 0,
          lastDelta: rating.lastDelta || 0,
          photoURL: memberData?.photoURL || null,
        });
      } else {
        // Fallback für Mitglieder ohne Rating
        leaderboardEntries.push({
          playerId: memberId,
          rating: JASS_ELO_CONFIG.DEFAULT_RATING,
          displayName: memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`,
          tier: 'Anfänger',
          tierEmoji: '🆕',
          gamesPlayed: 0,
          lastDelta: 0,
          photoURL: memberData?.photoURL || null,
        });
      }
    }
    
    // Nach Rating sortieren (höchstes zuerst)
    leaderboardEntries.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    // Leaderboard-Dokument schreiben
    const leaderboardData = {
      entries: leaderboardEntries,
      lastUpdated: admin.firestore.Timestamp.now(),
      totalMembers: leaderboardEntries.length,
    };
    
    await db.doc(`groups/${groupId}/aggregated/leaderboard`).set(leaderboardData);
    logger.info(`[Leaderboard] Updated for group ${groupId} with ${leaderboardEntries.length} members`);
  } catch (error) {
    logger.error(`[Leaderboard] Failed to update for group ${groupId}:`, error);
    // Nicht kritisch - soll das Elo-Update nicht blockieren
  }
}


