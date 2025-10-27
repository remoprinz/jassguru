import * as admin from 'firebase-admin';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════
// 🎯 RECALCULATE ELO RATING HISTORY V3 - KOMPLETT NEU!
// ═══════════════════════════════════════════════════════════════
// 
// V3 KRITISCHE ÄNDERUNG:
// - Lädt ALLE ratingHistory Einträge für ALLE Spieler
// - Sortiert sie GLOBAL chronologisch (completedAt + gameNumber/passeNumber)
// - Rechnet durch und updated IN DIESER REIHENFOLGE
// 
// Das garantiert dass:
// 1. Ratings kumulativ weitergegeben werden
// 2. Keine falschen Dokumente gefunden werden
// 3. Die Reihenfolge 100% korrekt ist
// ═══════════════════════════════════════════════════════════════

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Elo-Konfiguration (K=15, wie gewünscht)
const JASS_ELO_CONFIG = {
  K_TARGET: 15,
  DEFAULT_RATING: 100,
  ELO_SCALE: 1000,
} as const;

// Hilfsfunktionen (identisch zu jassEloUpdater.ts)
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

function stricheScore(stricheA: number, stricheB: number): number {
  const total = stricheA + stricheB;
  return total > 0 ? stricheA / total : 0.5;
}

function calculateStricheFromFinalStriche(finalStriche: any): number {
  const sieg = finalStriche.sieg || 0;
  const berg = finalStriche.berg || 0;
  const matsch = finalStriche.matsch || 0;
  const kontermatsch = finalStriche.kontermatsch || 0;
  const schneider = finalStriche.schneider || 0;
  
  return sieg * 1 + berg * 5 + matsch * 5 + kontermatsch * 5 + schneider * 2;
}

type RatingHistoryEntry = {
  playerId: string;
  docPath: string;
  completedAt: admin.firestore.Timestamp;
  sessionId?: string;
  tournamentId?: string;
  gameNumber?: number;
  passeNumber?: number;
  groupId?: string;
  currentRating: number; // Wird neu berechnet
  currentDelta: number; // Wird neu berechnet
};

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🚀 ELO RATING HISTORY BACKFILL V3 - KOMPLETT NEU!');
  console.log('═══════════════════════════════════════════════════════════\n');

  const groupId = 'Tz0wgIHMTlhvTtFastiJ'; // fürDich OGs

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: Sammle ALLE ratingHistory Einträge für alle Spieler
  // ═══════════════════════════════════════════════════════════════
  console.log('📊 PHASE 1: Sammle alle ratingHistory Einträge...\n');

  const membersSnap = await db.collection(`groups/${groupId}/members`).get();
  const allEntries: RatingHistoryEntry[] = [];

  for (const memberDoc of membersSnap.docs) {
    const playerId = memberDoc.id;
    const historySnap = await db.collection(`players/${playerId}/ratingHistory`).get();

    for (const historyDoc of historySnap.docs) {
      const data = historyDoc.data();

      // Nur Einträge mit completedAt
      if (!data.completedAt) continue;

      let completedAt: admin.firestore.Timestamp;
      if (data.completedAt?.toDate) {
        completedAt = data.completedAt;
      } else if (data.completedAt?._seconds) {
        completedAt = admin.firestore.Timestamp.fromMillis(data.completedAt._seconds * 1000);
      } else {
        continue;
      }

      allEntries.push({
        playerId,
        docPath: `players/${playerId}/ratingHistory/${historyDoc.id}`,
        completedAt,
        sessionId: data.sessionId,
        tournamentId: data.tournamentId,
        gameNumber: data.gameNumber,
        passeNumber: data.passeNumber,
        groupId: data.groupId,
        currentRating: JASS_ELO_CONFIG.DEFAULT_RATING, // Placeholder
        currentDelta: 0, // Placeholder
      });
    }
  }

  console.log(`   ✅ Gesammelt: ${allEntries.length} ratingHistory Einträge\n`);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Sortiere GLOBAL chronologisch
  // ═══════════════════════════════════════════════════════════════
  allEntries.sort((a, b) => {
    const timeDiff = a.completedAt.toMillis() - b.completedAt.toMillis();
    if (timeDiff !== 0) return timeDiff;

    // Tie-Breaker: gameNumber/passeNumber
    const aNum = a.gameNumber || a.passeNumber || 0;
    const bNum = b.gameNumber || b.passeNumber || 0;
    return aNum - bNum;
  });

  console.log('✅ Sortiert chronologisch\n');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Berechne Elo für jeden Eintrag chronologisch
  // ═══════════════════════════════════════════════════════════════
  console.log('🧮 PHASE 3: Berechne Elo chronologisch...\n');

  const playerRatings = new Map<string, number>();
  const updates: { docPath: string; rating: number; delta: number }[] = [];

  // Initialisiere alle Spieler mit DEFAULT_RATING
  for (const entry of allEntries) {
    if (!playerRatings.has(entry.playerId)) {
      playerRatings.set(entry.playerId, JASS_ELO_CONFIG.DEFAULT_RATING);
    }
  }

  // Gruppiere Einträge nach Event (Session/Tournament + GameNumber/PasseNumber)
  const eventGroups: RatingHistoryEntry[][] = [];
  let currentGroup: RatingHistoryEntry[] = [];
  let lastKey = '';

  for (const entry of allEntries) {
    const key = entry.sessionId
      ? `${entry.sessionId}_${entry.gameNumber}`
      : `${entry.tournamentId}_${entry.passeNumber}`;

    if (key !== lastKey && currentGroup.length > 0) {
      eventGroups.push(currentGroup);
      currentGroup = [];
    }

    currentGroup.push(entry);
    lastKey = key;
  }
  if (currentGroup.length > 0) {
    eventGroups.push(currentGroup);
  }

  console.log(`   ✅ ${eventGroups.length} Events gefunden\n`);

  // Iteriere durch jedes Event
  for (let i = 0; i < eventGroups.length; i++) {
    const group = eventGroups[i];
    if (group.length === 0) continue;

    const firstEntry = group[0];
    const eventId = firstEntry.sessionId || firstEntry.tournamentId || 'unknown';
    const eventNum = firstEntry.gameNumber || firstEntry.passeNumber || 0;

    // Lade Event-Daten (finalStriche)
    let topStriche = 0;
    let bottomStriche = 0;
    let topPlayerIds: string[] = [];
    let bottomPlayerIds: string[] = [];

    if (firstEntry.sessionId) {
      // Session Game
      const gameDoc = await db
        .doc(`groups/${firstEntry.groupId}/jassGameSummaries/${firstEntry.sessionId}/completedGames/${firstEntry.gameNumber}`)
        .get();

      if (gameDoc.exists) {
        const gameData = gameDoc.data() as any;
        topStriche = calculateStricheFromFinalStriche(gameData.finalStriche?.top || {});
        bottomStriche = calculateStricheFromFinalStriche(gameData.finalStriche?.bottom || {});

        // Hole Session Summary für Teams
        const sessionDoc = await db
          .doc(`groups/${firstEntry.groupId}/jassGameSummaries/${firstEntry.sessionId}`)
          .get();

        if (sessionDoc.exists) {
          const sessionData = sessionDoc.data() as any;
          const teamsSource = gameData.teams || sessionData.teams;
          topPlayerIds = teamsSource?.top?.players?.map((p: any) => p.playerId) || [];
          bottomPlayerIds = teamsSource?.bottom?.players?.map((p: any) => p.playerId) || [];
        }
      }
    } else if (firstEntry.tournamentId) {
      // Tournament Passe
      const passeDoc = await db.doc(`tournaments/${firstEntry.tournamentId}/games/${firstEntry.passeNumber}`).get();

      if (passeDoc.exists) {
        const passeData = passeDoc.data() as any;
        topStriche = calculateStricheFromFinalStriche(passeData.finalStriche?.top || {});
        bottomStriche = calculateStricheFromFinalStriche(passeData.finalStriche?.bottom || {});

        topPlayerIds = passeData.teams?.top?.players?.map((p: any) => p.playerId) || [];
        bottomPlayerIds = passeData.teams?.bottom?.players?.map((p: any) => p.playerId) || [];
      }
    }

    // Berechne Team-Ratings
    const topPlayers = group.filter((e) => topPlayerIds.includes(e.playerId));
    const bottomPlayers = group.filter((e) => bottomPlayerIds.includes(e.playerId));

    if (topPlayers.length === 0 || bottomPlayers.length === 0) {
      console.log(`   ⚠️  Event ${i + 1}/${eventGroups.length} [${eventId.substring(0, 8)}] #${eventNum}: Keine Teams gefunden, überspringe...`);
      continue;
    }

    const topRating = topPlayers.reduce((sum, e) => sum + playerRatings.get(e.playerId)!, 0) / topPlayers.length;
    const bottomRating = bottomPlayers.reduce((sum, e) => sum + playerRatings.get(e.playerId)!, 0) / bottomPlayers.length;

    // Berechne Expected & Actual Score
    const expectedTop = expectedScore(topRating, bottomRating);
    const actualTop = stricheScore(topStriche, bottomStriche);

    // Berechne Delta (Zero-Sum, identisch für Partner)
    const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
    const deltaPerTopPlayer = delta / topPlayers.length;
    const deltaPerBottomPlayer = -delta / bottomPlayers.length;

    console.log(
      `   ${i + 1}/${eventGroups.length} [${eventId.substring(0, 8)}] #${eventNum}: ` +
        `Top Δ=${deltaPerTopPlayer.toFixed(2)}, Bottom Δ=${deltaPerBottomPlayer.toFixed(2)}`
    );

    // Update Ratings
    for (const entry of topPlayers) {
      const oldRating = playerRatings.get(entry.playerId)!;
      const newRating = oldRating + deltaPerTopPlayer;
      playerRatings.set(entry.playerId, newRating);

      updates.push({
        docPath: entry.docPath,
        rating: newRating,
        delta: deltaPerTopPlayer,
      });
    }

    for (const entry of bottomPlayers) {
      const oldRating = playerRatings.get(entry.playerId)!;
      const newRating = oldRating + deltaPerBottomPlayer;
      playerRatings.set(entry.playerId, newRating);

      updates.push({
        docPath: entry.docPath,
        rating: newRating,
        delta: deltaPerBottomPlayer,
      });
    }
  }

  console.log(`\n   ✅ ${updates.length} Updates vorbereitet\n`);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Schreibe Updates zu Firestore
  // ═══════════════════════════════════════════════════════════════
  console.log('💾 PHASE 4: Schreibe Updates zu Firestore...\n');

  if (process.argv.includes('--confirm')) {
    const batchSize = 500;
    let successCount = 0;

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = db.batch();
      const chunk = updates.slice(i, i + batchSize);

      for (const update of chunk) {
        const docRef = db.doc(update.docPath);
        batch.update(docRef, {
          rating: update.rating,
          delta: update.delta,
        });
      }

      await batch.commit();
      successCount += chunk.length;
      console.log(`   ✅ Batch ${Math.floor(i / batchSize) + 1}: ${chunk.length} Updates geschrieben`);
    }

    // Update Global Ratings
    console.log('\n💾 Aktualisiere globale Ratings...\n');
    const globalBatch = db.batch();

    for (const [playerId, rating] of playerRatings) {
      const playerRef = db.doc(`players/${playerId}`);
      globalBatch.update(playerRef, {
        globalRating: rating,
        lastGlobalRatingUpdate: admin.firestore.Timestamp.now(),
      });
    }

    await globalBatch.commit();
    console.log(`   ✅ ${playerRatings.size} globale Ratings aktualisiert\n`);

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ BACKFILL V3 ABGESCHLOSSEN!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`   Erfolgreich: ${successCount} Updates`);
    console.log('════════════════════════════════════════════════════════════════\n');
  } else {
    console.log('🔍 DRY-RUN MODUS');
    console.log('   Verwende --confirm um die Änderungen zu schreiben.\n');
    console.log(`   ${updates.length} Updates würden geschrieben werden.\n`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});

