/**
 * CLEAN REBUILD RATING HISTORY + PLAYER FINAL RATINGS (TEAM_K = 15, keine Teilung)
 *
 * Kernaussagen:
 * - TEAM_K = 15 (Team-K), jeder Spieler erhält das volle Team-Delta (keine Division durch Teamgröße)
 * - actualScore = topTotal / (topTotal + bottomTotal)
 * - Teamrating = Mittelwert der Partnerratings
 * - ELO_SCALE = 1000 (Whitepaper-konform)
 */

import * as admin from 'firebase-admin';

// Firebase Admin initialisieren
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru.firebaseio.com'
});

const db = admin.firestore();

// Elo-Konfiguration
const JASS_ELO_CONFIG = {
  DEFAULT_RATING: 100,
  TEAM_K: 10,       // Team-K = 10; jeder Spieler erhält das volle Team-Delta (keine Teilung)
  ELO_SCALE: 1000,  // flacher als 400, wie im Whitepaper definiert
} as const;

/** --- Elo-Utilities --- */

/** Erwartungswert für Team A vs. Team B */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

/** Summe der Striche eines Teams */
function sumStriche(s: any): number {
  return (s?.sieg || 0)
       + (s?.matsch || 0)
       + (s?.schneider || 0)
       + (s?.berg || 0)
       + (s?.kontermatsch || 0);
}

/** Tatsächlicher Score aus Top/Bottom Totals: S = top / (top + bottom) */
function actualScoreFromTotals(topTotal: number, bottomTotal: number): number {
  const total = topTotal + bottomTotal;
  if (total <= 0) return 0.5; // 0:0 → Remis
  const actual = topTotal / total;
  return Math.max(0, Math.min(1, actual)); // Clamp gegen FP-Rauschen
}

/** Mittelwert-Teamrating (Mittel der Spielerratings) */
function meanTeamRating(playerIds: string[], ratingMap: Map<string, number>): number {
  if (!playerIds.length) return JASS_ELO_CONFIG.DEFAULT_RATING;
  let sum = 0;
  for (const pid of playerIds) sum += (ratingMap.get(pid) ?? JASS_ELO_CONFIG.DEFAULT_RATING);
  return sum / playerIds.length;
}

/** --- Hauptjob --- */
async function cleanRebuildRatingHistory() {
  console.log('🎯 CLEAN RATING HISTORY REBUILD (TEAM_K=10, keine Teilung)\n' + '='.repeat(80));

  try {
    // 1) ratingHistory vollständig löschen
    console.log('\n🗑️  Schritt 1/5: Lösche ALLE ratingHistory Einträge...');
    const playersSnapshot = await db.collection('players').get();
    let totalDeleted = 0;

    for (const playerDoc of playersSnapshot.docs) {
      const ratingHistoryRef = db.collection(`players/${playerDoc.id}/ratingHistory`);
      const ratingHistorySnapshot = await ratingHistoryRef.get();
      for (const ratingDoc of ratingHistorySnapshot.docs) {
        await ratingDoc.ref.delete();
        totalDeleted++;
      }
    }
    console.log(`✅ ${totalDeleted} ratingHistory Einträge gelöscht`);

    // 2) alle Spieler-Ratings resetten
    console.log('\n🔄 Schritt 2/5: Reset alle Player Ratings auf DEFAULT...');
    {
      const batch = db.batch();
      for (const playerDoc of playersSnapshot.docs) {
        batch.update(playerDoc.ref, {
          globalRating: JASS_ELO_CONFIG.DEFAULT_RATING,
          gamesPlayed: 0,
          lastSessionDelta: 0,
        });
      }
      await batch.commit();
    }
    console.log(`✅ ${playersSnapshot.size} Spieler auf ${JASS_ELO_CONFIG.DEFAULT_RATING} gesetzt`);

    // 3) Events (Spiele + Passen) einsammeln
    console.log('\n📊 Schritt 3/5: Sammle alle Spiele und Turnier-Passen...');
    const allEvents: any[] = [];

    // Sessions
    const groupsSnap = await db.collection('groups').get();
    for (const groupDoc of groupsSnap.docs) {
      const summariesSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .get();

      for (const summaryDoc of summariesSnap.docs) {
        const summaryData = summaryDoc.data();
        if (!summaryData?.completedAt) continue;
        if (summaryDoc.id === '6eNr8fnsTO06jgCqjelt') continue; // Sonderfall überspringen

        const games = summaryData.gameResults || [];
        for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
          allEvents.push({
            type: 'session_game',
            groupId: groupDoc.id,
            summaryId: summaryDoc.id,
            gameIndex,
            game: games[gameIndex],
            completedAt: summaryData.completedAt,
          });
        }
      }
    }

    // Turnier-Passen
    const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
    const tournamentGamesSnap = await db.collection(`tournaments/${tournamentId}/games`)
      .orderBy('completedAt', 'asc')
      .get();

    for (const gameDoc of tournamentGamesSnap.docs) {
      const data = gameDoc.data();
      if (!data?.completedAt) continue;
      allEvents.push({
        type: 'tournament_passe',
        tournamentId,
        gameId: gameDoc.id,
        data,
        completedAt: data.completedAt,
      });
    }

    // chronologisch sortieren
    allEvents.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());
    console.log(`✅ ${allEvents.length} Events (Spiele + Passen) gefunden & sortiert`);

    // 4) PHASE 1 – Rating-History berechnen
    console.log('\n⚙️  Schritt 4/5: Berechne ratingHistory für alle Events...');

    // 4.1 alle beteiligten Spieler sammeln & initialisieren
    const allPlayerIds = new Set<string>();
    for (const event of allEvents) {
      if (event.type === 'session_game') {
        const topP = event.game?.teams?.top?.players?.map((p: any) => p.playerId) || [];
        const botP = event.game?.teams?.bottom?.players?.map((p: any) => p.playerId) || [];
        for (const pid of [...topP, ...botP]) allPlayerIds.add(pid);
      } else {
        const ids = event.data?.playerDetails?.map((p: any) => p.playerId) || [];
        for (const pid of ids) allPlayerIds.add(pid);
      }
    }

    const globalRatingMap = new Map<string, number>();
    for (const pid of allPlayerIds) globalRatingMap.set(pid, JASS_ELO_CONFIG.DEFAULT_RATING);
    console.log(`✅ ${allPlayerIds.size} Spieler initialisiert`);

    // 4.2 Events verarbeiten
    let processedCount = 0;
    for (const event of allEvents) {
      processedCount++;
      if (event.type === 'session_game') {
        await processSessionGame(event, globalRatingMap);
      } else {
        await processTournamentPasse(event, globalRatingMap);
      }
      if (processedCount % 10 === 0 || processedCount === allEvents.length) {
        console.log(`   [${processedCount}/${allEvents.length}] Events verarbeitet...`);
      }
    }
    console.log(`✅ PHASE 1 abgeschlossen`);

    // 5) PHASE 2 – playerFinalRatings in Summaries schreiben
    console.log('\n🏆 Schritt 5/5: Schreibe playerFinalRatings in jassGameSummaries...');
    let summariesProcessed = 0;

    for (const groupDoc of groupsSnap.docs) {
      const summariesSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .get();

      for (const summaryDoc of summariesSnap.docs) {
        const summaryData = summaryDoc.data();
        if (!summaryData?.completedAt) continue;

        const participantIds: string[] = summaryData.participantPlayerIds || [];
        if (participantIds.length === 0) continue;

        const playerFinalRatings = await getPlayerRatingsForSummary(
          summaryDoc.id,
          summaryData,
          participantIds
        );

        if (Object.keys(playerFinalRatings).length > 0) {
          await summaryDoc.ref.update({ playerFinalRatings });
          summariesProcessed++;
          console.log(`   ✅ ${summaryDoc.id}: ${Object.keys(playerFinalRatings).length} Spieler`);
        }
      }
    }

    console.log(`✅ PHASE 2 abgeschlossen: ${summariesProcessed} Summaries aktualisiert`);
    console.log('\n' + '='.repeat(80));
    console.log('✅ RATING HISTORY REBUILD ABGESCHLOSSEN!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ FEHLER:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

/** --- Event-Verarbeitung: Session-Spiel --- */
async function processSessionGame(event: any, globalRatingMap: Map<string, number>) {
  const { groupId, summaryId, gameIndex, game, completedAt } = event;

  // stabile Reihenfolge innerhalb der Session
  const gameCompletedAt = admin.firestore.Timestamp.fromMillis(
    completedAt.toMillis() + gameIndex
  );

  const topPlayers = game?.teams?.top?.players || [];
  const bottomPlayers = game?.teams?.bottom?.players || [];
  const topPlayerIds = topPlayers.map((p: any) => p.playerId);
  const bottomPlayerIds = bottomPlayers.map((p: any) => p.playerId);
  if (topPlayerIds.length === 0 || bottomPlayerIds.length === 0) return;

  // Strich-Totals
  const topTotal = sumStriche(game?.finalStriche?.top);
  const bottomTotal = sumStriche(game?.finalStriche?.bottom);
  const totalStriche = topTotal + bottomTotal;
  if (totalStriche === 0) return; // 0:0 → kein Update

  // Teamratings
  const topTeamRating = meanTeamRating(topPlayerIds, globalRatingMap);
  const bottomTeamRating = meanTeamRating(bottomPlayerIds, globalRatingMap);

  // Erwartung & tatsächlich
  const expectedTop = expectedScore(topTeamRating, bottomTeamRating);
  const actualTop = actualScoreFromTotals(topTotal, bottomTotal);

  // Team-Delta (TEAM_K=15) & Spieler-Delta (keine Teilung)
  const teamDelta = JASS_ELO_CONFIG.TEAM_K * (actualTop - expectedTop);
  const playerDelta = teamDelta;

  const batch = db.batch();

  // Top-Team updaten
  for (const pid of topPlayerIds) {
    const newRating = (globalRatingMap.get(pid) ?? JASS_ELO_CONFIG.DEFAULT_RATING) + playerDelta;
    globalRatingMap.set(pid, newRating);

    const playerRef = db.collection('players').doc(pid);
    batch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: playerDelta,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });

    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    batch.set(historyRef, {
      rating: newRating,
      delta: playerDelta,
      createdAt: gameCompletedAt,
      completedAt: gameCompletedAt,
      sessionId: summaryId,
      groupId: groupId,
      eventType: 'game_end',
      gameId: `${summaryId}_${gameIndex}`,
    });
  }

  // Bottom-Team updaten
  for (const pid of bottomPlayerIds) {
    const newRating = (globalRatingMap.get(pid) ?? JASS_ELO_CONFIG.DEFAULT_RATING) - playerDelta;
    globalRatingMap.set(pid, newRating);

    const playerRef = db.collection('players').doc(pid);
    batch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: -playerDelta,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });

    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    batch.set(historyRef, {
      rating: newRating,
      delta: -playerDelta,
      createdAt: gameCompletedAt,
      completedAt: gameCompletedAt,
      sessionId: summaryId,
      groupId: groupId,
      eventType: 'game_end',
      gameId: `${summaryId}_${gameIndex}`,
    });
  }

  await batch.commit();
}

/** --- Event-Verarbeitung: Turnier-Passe --- */
async function processTournamentPasse(event: any, globalRatingMap: Map<string, number>) {
  const { tournamentId, gameId, data, completedAt } = event;

  // Totals
  const topTotal = sumStriche(data?.teamStrichePasse?.top);
  const bottomTotal = sumStriche(data?.teamStrichePasse?.bottom);
  const totalStriche = topTotal + bottomTotal;
  if (totalStriche === 0) return;

  // Spieler-IDs aus playerDetails
  const topPlayerIds: string[] = [];
  const bottomPlayerIds: string[] = [];
  if (Array.isArray(data?.playerDetails)) {
    for (const p of data.playerDetails) {
      if (p?.team === 'top') topPlayerIds.push(p.playerId);
      else if (p?.team === 'bottom') bottomPlayerIds.push(p.playerId);
    }
  }
  if (topPlayerIds.length === 0 || bottomPlayerIds.length === 0) return;

  // Teamratings
  const topTeamRating = meanTeamRating(topPlayerIds, globalRatingMap);
  const bottomTeamRating = meanTeamRating(bottomPlayerIds, globalRatingMap);

  // Erwartung & tatsächlich
  const expectedTop = expectedScore(topTeamRating, bottomTeamRating);
  const actualTop = actualScoreFromTotals(topTotal, bottomTotal);

  // Team-/Spieler-Delta (keine Teilung)
  const teamDelta = JASS_ELO_CONFIG.TEAM_K * (actualTop - expectedTop);
  const playerDelta = teamDelta;

  const batch = db.batch();

  for (const pid of topPlayerIds) {
    const newRating = (globalRatingMap.get(pid) ?? JASS_ELO_CONFIG.DEFAULT_RATING) + playerDelta;
    globalRatingMap.set(pid, newRating);

    const playerRef = db.collection('players').doc(pid);
    batch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: playerDelta,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });

    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    batch.set(historyRef, {
      rating: newRating,
      delta: playerDelta,
      createdAt: completedAt,
      completedAt: completedAt,
      tournamentId: tournamentId,
      gameId: gameId,
      eventType: 'tournament_passe',
    });
  }

  for (const pid of bottomPlayerIds) {
    const newRating = (globalRatingMap.get(pid) ?? JASS_ELO_CONFIG.DEFAULT_RATING) - playerDelta;
    globalRatingMap.set(pid, newRating);

    const playerRef = db.collection('players').doc(pid);
    batch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: -playerDelta,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });

    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    batch.set(historyRef, {
      rating: newRating,
      delta: -playerDelta,
      createdAt: completedAt,
      completedAt: completedAt,
      tournamentId: tournamentId,
      gameId: gameId,
      eventType: 'tournament_passe',
    });
  }

  await batch.commit();
}

/** --- Aggregation für Summaries --- */
async function getPlayerRatingsForSummary(
  summaryId: string,
  summaryData: any,
  playerIds: string[]
): Promise<{ [playerId: string]: { rating: number; ratingDelta: number; gamesPlayed: number; } }> {
  const res: { [playerId: string]: { rating: number; ratingDelta: number; gamesPlayed: number; } } = {};

  const isTournamentSummary = !!summaryData.tournamentId;
  const eventId = isTournamentSummary ? summaryData.tournamentId : summaryId;
  const eventTypeField = isTournamentSummary ? 'tournamentId' : 'sessionId';

  for (const playerId of playerIds) {
    const eventHistorySnap = await db.collection(`players/${playerId}/ratingHistory`)
      .where(eventTypeField, '==', eventId)
      .get();

    const sortedDocs = eventHistorySnap.docs.sort((a, b) =>
      a.data().completedAt.toMillis() - b.data().completedAt.toMillis()
    );
    if (sortedDocs.length === 0) continue;

    const first = sortedDocs[0].data();
    const last = sortedDocs[sortedDocs.length - 1].data();
    const startRating = (first.rating ?? JASS_ELO_CONFIG.DEFAULT_RATING) - (first.delta ?? 0);
    const finalRating = last.rating ?? JASS_ELO_CONFIG.DEFAULT_RATING;
    const totalDelta = finalRating - startRating;

    const gamesCountSnap = await db.collection(`players/${playerId}/ratingHistory`)
      .where('completedAt', '<=', summaryData.completedAt)
      .get();

    res[playerId] = {
      rating: finalRating,
      ratingDelta: totalDelta,
      gamesPlayed: gamesCountSnap.size,
    };
  }
  return res;
}

// Start
cleanRebuildRatingHistory();
