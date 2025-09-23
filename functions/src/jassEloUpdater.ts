import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

const db = admin.firestore();

// Elo-Parameter (synchron zum Frontend/Script)
const JASS_ELO_CONFIG = {
  K_TARGET: 32,
  DEFAULT_RATING: 1000,
  ELO_SCALE: 300,
} as const;

type PlayerRatingDoc = {
  rating: number;
  gamesPlayed: number;
  lastUpdated: number;
  displayName?: string;
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

  const ratingMap = new Map<string, PlayerRatingDoc>();
  for (const pid of playerIds) {
    const snap = await db.collection('playerRatings').doc(pid).get();
    if (snap.exists) {
      const d = snap.data() as PlayerRatingDoc;
      ratingMap.set(pid, {
        rating: d.rating || JASS_ELO_CONFIG.DEFAULT_RATING,
        gamesPlayed: d.gamesPlayed || 0,
        lastUpdated: d.lastUpdated || Date.now(),
        displayName: d.displayName || displayNameMap.get(pid),
      });
    } else {
      ratingMap.set(pid, {
        rating: JASS_ELO_CONFIG.DEFAULT_RATING,
        gamesPlayed: 0,
        lastUpdated: Date.now(),
        displayName: displayNameMap.get(pid),
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

    // Auf Spieler anwenden (ohne /2 – wie in Script)
    for (const pid of topPlayers) {
      const r = ratingMap.get(pid)!;
      r.rating = r.rating + deltaA;
      r.gamesPlayed += 1;
      r.lastUpdated = Date.now();
      ratingMap.set(pid, r);
    }
    for (const pid of bottomPlayers) {
      const r = ratingMap.get(pid)!;
      r.rating = r.rating + deltaB;
      r.gamesPlayed += 1;
      r.lastUpdated = Date.now();
      ratingMap.set(pid, r);
    }
  }

  // Schreiben: global + gruppenspezifisch
  const batch = db.batch();
  ratingMap.forEach((val, pid) => {
    const docData: PlayerRatingDoc = {
      rating: val.rating,
      gamesPlayed: val.gamesPlayed,
      lastUpdated: Date.now(),
      displayName: val.displayName,
    };
    batch.set(db.collection('playerRatings').doc(pid), docData, { merge: true });
    batch.set(db.collection(`groups/${groupId}/playerRatings`).doc(pid), docData, { merge: true });
  });

  // Marker an Session
  batch.set(summaryRef, { eloUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  await batch.commit();
  logger.info(`[Elo] Update finished for session ${sessionId}`);
}


