/**
 * CLEAN REBUILD RATING HISTORY + PLAYER FINAL RATINGS (ELEGANTE VERSION)
 *
 * Änderungen ggü. der ursprünglichen Version:
 * - TEAM_K statt K_TARGET; effektives K pro Spieler = TEAM_K / Teamgröße
 * - Strich-Totals korrekt berechnet (keine doppelte Differenz)
 * - actualScore direkt aus Top/Bottom-Totals
 * - Division durch Teamgröße (nicht fix /2)
 * - Guards & kleine Robustheitsverbesserungen
 */

import * as admin from 'firebase-admin';

// Firebase Admin initialisieren
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru.firebaseio.com'
});

const db = admin.firestore();

// Elo-Konfiguration laut Whitepaper
const JASS_ELO_CONFIG = {
  DEFAULT_RATING: 100,
  TEAM_K: 30,        // <- Team-K. Effektives K pro Spieler = TEAM_K / Teamgröße (bei 2v2 also 15)
  ELO_SCALE: 1000,   // bewusste flachere Skala ggü. 400 (Whitepaper-konform)
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

/** Tatsächlicher Score aus Top/Bottom Totals */
function actualScoreFromTotals(topTotal: number, bottomTotal: number): number {
  const total = topTotal + bottomTotal;
  if (total <= 0) return 0.5; // 0:0 -> Remis
  const actual = topTotal / total;
  // Clamp als Sicherheitsnetz (Floating-Point)
  return Math.max(0, Math.min(1, actual));
}

/** Mittelwert-Teamrating */
function meanTeamRating(playerIds: string[], ratingMap: Map<string, number>): number {
  if (!playerIds.length) return JASS_ELO_CONFIG.DEFAULT_RATING;
  let sum = 0;
  for (const pid of playerIds) sum += (ratingMap.get(pid) ?? JASS_ELO_CONFIG.DEFAULT_RATING);
  return sum / playerIds.length;
}

/** Team-Delta -> Spieler-Delta (Teilen durch Teamgröße) */
function playerDeltaFromTeamDelta(teamDelta: number, teamSize: number): number {
  return teamSize > 0 ? teamDelta / teamSize : 0;
}

/** --- Hauptjob --- */
async function cleanRebuildRatingHistory() {
  console.log('🎯 CLEAN RATING HISTORY REBUILD (ELEGANTE VERSION)\n' + '='.repeat(80));

  try {
    // 1) ALLE ratingHistory löschen
    console.log('\n🗑️  Schritt 1/5: Lösche ALLE ratingHistory Einträge...');
    const playersSnapshot = await db.collection('players').get();
    let totalDeleted = 0;

    for (const playerDoc of playersSnapshot.docs) {
      const ratingHistoryRef = db.collection(`players/${playerDoc.id}/ratingHistory`);
      const ratingHistorySnapshot = await ratingHistoryRef.get();
      if (ratingHistorySnapshot.size > 0) {
        for (const ratingDoc of ratingHistorySnapshot.docs) {
          await ratingDoc.ref.delete();
          totalDeleted++;
        }
      }
    }
    console.log(`✅ ${totalDeleted} ratingHistory Einträge gelöscht`);

    // 2) ALLE Spieler-Ratings resetten
    console.log('\n🔄 Schritt 2/5: Reset alle Player Ratings auf 100...');
    let playersReset = 0;
    {
      const batch = db.batch();
      for (const playerDoc of playersSnapshot.docs) {
        batch.update(playerDoc.ref, {
          globalRating: JASS_ELO_CONFIG.DEFAULT_RATING,
          gamesPlayed: 0,
          lastSessionDelta: 0,
        });
        playersReset++;
      }
      await batch.commit();
    }
    console.log(`✅ ${playersReset} Spieler auf ${JASS_ELO_CONFIG.DEFAULT_RATING} Elo zurückgesetzt`);

    // 3) Events (Spiele + Passen) sammeln
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
        if (summaryDoc.id === '6eNr8fnsTO06jgCqjelt') continue; // dein Sonderfall

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

    // Chronologisch sortieren
    allEvents.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());
    console.log(`✅ ${allEvents.length} Events (Spiele + Passen) gefunden und sortiert`);

    // 4) PHASE 1 – Rating History berechnen
    console.log('\n⚙️  Schritt 4/5: PHASE 1 - Berechne ratingHistory für alle Events...');

    // 4.1: alle Spieler einsammeln
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
    console.log(`✅ ${allPlayerIds.size} Spieler identifiziert & auf ${JASS_ELO_CONFIG.DEFAULT_RATING} initialisiert`);

    // 4.2: Events verarbeiten
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
    console.log(`✅ PHASE 1 abgeschlossen: ${processedCount} Events verarbeitet`);

    // 5) PHASE 2 – playerFinalRatings in Summaries schreiben
    console.log('\n🏆 Schritt 5/5: PHASE 2 - Schreibe playerFinalRatings in jassGameSummaries...');
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

  const gameCompletedAt = admin.firestore.Timestamp.fromMillis(
    completedAt.toMillis() + gameIndex // stabile Reihenfolge innerhalb der Session
  );

  const topPlayers = game?.teams?.top?.players || [];
  const bottomPlayers = game?.teams?.bottom?.players || [];
  const topPlayerIds = topPlayers.map((p: any) => p.playerId);
  const bottomPlayerIds = bottomPlayers.map((p: any) => p.playerId);

  if (topPlayerIds.length === 0 || bottomPlayerIds.length === 0) return;

  // Strich-Totals korrekt bestimmen
  const topTotal = sumStriche(game?.finalStriche?.top);
  const bottomTotal = sumStriche(game?.finalStriche?.bottom);
  const totalStriche = topTotal + bottomTotal;
  if (totalStriche === 0) return; // 0:0 – kein Update

  // Teamratings (Mittelwerte)
  const topTeamRating = meanTeamRating(topPlayerIds, globalRatingMap);
  const bottomTeamRating = meanTeamRating(bottomPlayerIds, globalRatingMap);

  // Erwartung & tatsächlich
  const expectedTop = expectedScore(topTeamRating, bottomTeamRating);
  const actualTop = actualScoreFromTotals(topTotal, bottomTotal);

  // Team-Delta & Spieler-Delta (geteilt durch Teamgröße)
  const teamDelta = JASS_ELO_CONFIG.TEAM_K * (actualTop - expectedTop);
  const teamSize = topPlayerIds.length; // == bottomPlayerIds.length (2v2), aber generisch
  const playerDelta = playerDeltaFromTeamDelta(teamDelta, teamSize);

  const gameBatch = db.batch();

  // Top-Team updaten
  for (const pid of topPlayerIds) {
    const newRating = (globalRatingMap.get(pid) ?? JASS_ELO_CONFIG.DEFAULT_RATING) + playerDelta;
    globalRatingMap.set(pid, newRating);

    const playerRef = db.collection('players').doc(pid);
    gameBatch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: playerDelta,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });

    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    gameBatch.set(historyRef, {
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
    gameBatch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: -playerDelta,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });

    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    gameBatch.set(historyRef, {
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

  await gameBatch.commit();
}

/** --- Event-Verarbeitung: Turnier-Passe --- */
async function processTournamentPasse(event: any, globalRatingMap: Map<string, number>) {
  const { tournamentId, gameId, data, completedAt } = event;

  // Totals aus echten Team-Strichen
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

  // Team-/Spieler-Delta
  const teamDelta = JASS_ELO_CONFIG.TEAM_K * (actualTop - expectedTop);
  const teamSize = topPlayerIds.length;
  const playerDelta = playerDeltaFromTeamDelta(teamDelta, teamSize);

  const passeBatch = db.batch();

  for (const pid of topPlayerIds) {
    const newRating = (globalRatingMap.get(pid) ?? JASS_ELO_CONFIG.DEFAULT_RATING) + playerDelta;
    globalRatingMap.set(pid, newRating);

    const playerRef = db.collection('players').doc(pid);
    passeBatch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: playerDelta,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });

    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    passeBatch.set(historyRef, {
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
    passeBatch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: -playerDelta,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });

    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    passeBatch.set(historyRef, {
      rating: newRating,
      delta: -playerDelta,
      createdAt: completedAt,
      completedAt: completedAt,
      tournamentId: tournamentId,
      gameId: gameId,
      eventType: 'tournament_passe',
    });
  }

  await passeBatch.commit();
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
