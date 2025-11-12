import * as admin from 'firebase-admin';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════
// 🚀 REBUILD ELO RATING HISTORY FROM SCRATCH
// ═══════════════════════════════════════════════════════════════
// 
// KOMPLETT NEU - BASIEREND AUF SOURCE DATEN!
// 
// 1. Lösche ALLE ratingHistory Einträge
// 2. Iteriere durch jassGameSummaries chronologisch
// 3. Für jede Session: Gehe durch completedGames/1,2,3,4...
// 4. Ausnahme 9.-11. Mai: Iteriere durch tournaments/games
// 5. Erstelle NEUE ratingHistory Einträge mit korrekten Ratings
// ═══════════════════════════════════════════════════════════════

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Elo-Konfiguration
const JASS_ELO_CONFIG = {
  K_TARGET: 15,
  DEFAULT_RATING: 100,
  ELO_SCALE: 1000,
} as const;

// Hilfsfunktionen
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

function stricheScore(stricheA: number, stricheB: number): number {
  const total = stricheA + stricheB;
  return total > 0 ? stricheA / total : 0.5;
}

// ✅ KORREKTUR: Exakt wie jassEloUpdater.ts Zeile 36-38!
function sumStriche(finalStriche: any): number {
  if (!finalStriche) return 0;
  return (finalStriche.berg || 0) + (finalStriche.sieg || 0) + (finalStriche.matsch || 0) + (finalStriche.schneider || 0) + (finalStriche.kontermatsch || 0);
}

// Globaler Rating-Tracker
const playerRatings = new Map<string, number>();

// ✅ KORREKT: ALLE starten bei 100, keine DB-Ladung!
function getPlayerRating(playerId: string): number {
  if (!playerRatings.has(playerId)) {
    playerRatings.set(playerId, JASS_ELO_CONFIG.DEFAULT_RATING);
    console.log(`   🎯 Player ${playerId.substring(0, 8)}: Start bei ${JASS_ELO_CONFIG.DEFAULT_RATING}`);
  }
  return playerRatings.get(playerId)!;
}

function updatePlayerRating(playerId: string, newRating: number): void {
  playerRatings.set(playerId, newRating);
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🚀 REBUILD ELO RATING HISTORY FROM SCRATCH');
  console.log('═══════════════════════════════════════════════════════════\n');

  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p'; // Krakau 2025

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: Lösche ALLE ratingHistory Einträge
  // ═══════════════════════════════════════════════════════════════
  if (process.argv.includes('--confirm')) {
    console.log('💥 PHASE 1: Lösche alte ratingHistory Einträge...\n');

    const membersSnap = await db.collection(`groups/${groupId}/members`).get();
    let deletedCount = 0;

    for (const memberDoc of membersSnap.docs) {
      const playerId = memberDoc.id;
      const historySnap = await db.collection(`players/${playerId}/ratingHistory`).get();

      const batch = db.batch();
      historySnap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (!historySnap.empty) {
        await batch.commit();
        deletedCount += historySnap.size;
        console.log(`   ✅ Spieler ${memberDoc.data().displayName}: ${historySnap.size} Einträge gelöscht`);
      }
    }

    console.log(`\n   ✅ Total: ${deletedCount} Einträge gelöscht\n`);
  } else {
    console.log('⚠️  PHASE 1: ÜBERSPRUNGEN (Dry-Run)\n');
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Lade jassGameSummaries chronologisch
  // ═══════════════════════════════════════════════════════════════
  console.log('📊 PHASE 2: Lade jassGameSummaries...\n');

  const summariesSnap = await db
    .collection(`groups/${groupId}/jassGameSummaries`)
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc')
    .get();

  console.log(`   ✅ ${summariesSnap.size} Sessions gefunden\n`);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Iteriere chronologisch & erstelle ratingHistory
  // ═══════════════════════════════════════════════════════════════
  console.log('🧮 PHASE 3: Berechne Elo & erstelle ratingHistory...\n');

  const newEntries: any[] = [];
  let eventCount = 0;

  for (const summaryDoc of summariesSnap.docs) {
    const sessionId = summaryDoc.id;
    const sessionData = summaryDoc.data();
    const completedAt = sessionData.completedAt;
    const isTournament = sessionData.isTournamentSession === true || sessionData.tournamentId != null;

    // ✅ SPEZIALFALL: Turnier (9.-11. Mai)
    if (isTournament && sessionData.tournamentId === tournamentId) {
      console.log(`   🏆 TURNIER: ${completedAt.toDate().toLocaleDateString('de-DE')}\n`);

      // Iteriere durch tournament/games (Pässe 1-15)
      const tournamentGamesSnap = await db
        .collection(`tournaments/${tournamentId}/games`)
        .get();

      // ✅ KRITISCH: Sortiere nach completedAt, NICHT passeNumber!
      const sortedPasses = tournamentGamesSnap.docs
        .map(doc => ({ doc, data: doc.data(), completedAt: doc.data().completedAt }))
        .sort((a, b) => {
          if (!a.completedAt || !b.completedAt) return 0;
          return a.completedAt.toMillis() - b.completedAt.toMillis();
        });

      for (const passe of sortedPasses) {
        const passeData = passe.data;
        const passeNumber = passeData.passeNumber;
        const passeCompletedAt = passeData.completedAt;

        // Hole Teams aus playerDetails
        const playerDetails = passeData.playerDetails || [];
        const topPlayers = playerDetails.filter((p: any) => p.team === 'top');
        const bottomPlayers = playerDetails.filter((p: any) => p.team === 'bottom');

        if (topPlayers.length === 0 || bottomPlayers.length === 0) {
          console.log(`      ⚠️  Passe ${passeNumber}: Keine Teams, überspringe`);
          continue;
        }

        // Hole Striche aus teamStrichePasse
        const topStriche = sumStriche(passeData.teamStrichePasse?.top);
        const bottomStriche = sumStriche(passeData.teamStrichePasse?.bottom);

        // Berechne Team-Ratings
        const topRating = topPlayers.reduce((sum: number, p: any) => sum + getPlayerRating(p.playerId), 0) / topPlayers.length;
        const bottomRating = bottomPlayers.reduce((sum: number, p: any) => sum + getPlayerRating(p.playerId), 0) / bottomPlayers.length;

        // Berechne Elo
        const expectedTop = expectedScore(topRating, bottomRating);
        const actualTop = stricheScore(topStriche, bottomStriche);
        const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
        const deltaPerTopPlayer = delta / topPlayers.length;
        const deltaPerBottomPlayer = -delta / bottomPlayers.length;

        console.log(`      Passe ${passeNumber}: Top Δ=${deltaPerTopPlayer.toFixed(2)}, Bottom Δ=${deltaPerBottomPlayer.toFixed(2)}`);

        // Erstelle ratingHistory Einträge für Top Players
        for (const player of topPlayers) {
          const oldRating = getPlayerRating(player.playerId);
          const newRating = oldRating + deltaPerTopPlayer;
          updatePlayerRating(player.playerId, newRating);

          newEntries.push({
            playerId: player.playerId,
            rating: newRating,
            delta: deltaPerTopPlayer,
            completedAt: passeCompletedAt,
            eventType: 'tournament_passe',
            tournamentId,
            passeNumber,
            groupId,
            createdAt: admin.firestore.Timestamp.now(),
          });
        }

        // Erstelle ratingHistory Einträge für Bottom Players
        for (const player of bottomPlayers) {
          const oldRating = getPlayerRating(player.playerId);
          const newRating = oldRating + deltaPerBottomPlayer;
          updatePlayerRating(player.playerId, newRating);

          newEntries.push({
            playerId: player.playerId,
            rating: newRating,
            delta: deltaPerBottomPlayer,
            completedAt: passeCompletedAt,
            eventType: 'tournament_passe',
            tournamentId,
            passeNumber,
            groupId,
            createdAt: admin.firestore.Timestamp.now(),
          });
        }

        eventCount++;
      }

      console.log('');
      continue;
    }

    // ✅ NORMALE SESSION
    console.log(`   📅 SESSION: ${completedAt.toDate().toLocaleDateString('de-DE')} (${sessionId.substring(0, 8)})\n`);

    // Hole completedGames
    const gamesSnap = await db
      .collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
      .get();

    const games = gamesSnap.docs.map(doc => ({
      ...doc.data(),
      gameNumber: parseInt(doc.id) || 0
    })).sort((a: any, b: any) => a.gameNumber - b.gameNumber);

    // Hole Teams von Session Summary (Fallback für Games ohne eigene Teams)
    const sessionTeams = sessionData.teams;

    for (const game of games) {
      const gameData = game as any;
      const gameNumber = gameData.gameNumber;
      const gameCompletedAt = gameData.completedAt || completedAt;

      // Hole Teams (Game-specific oder Session-wide)
      const teamsSource = (gameData.teams && gameData.teams.top?.players && gameData.teams.bottom?.players)
        ? gameData.teams
        : sessionTeams;

      const topPlayers = teamsSource?.top?.players || [];
      const bottomPlayers = teamsSource?.bottom?.players || [];

      if (topPlayers.length === 0 || bottomPlayers.length === 0) {
        console.log(`      ⚠️  Game ${gameNumber}: Keine Teams, überspringe`);
        continue;
      }

      // Hole Striche
      const topStriche = sumStriche(gameData.finalStriche?.top);
      const bottomStriche = sumStriche(gameData.finalStriche?.bottom);

      // Berechne Team-Ratings
      const topRating = topPlayers.reduce((sum: number, p: any) => sum + getPlayerRating(p.playerId), 0) / topPlayers.length;
      const bottomRating = bottomPlayers.reduce((sum: number, p: any) => sum + getPlayerRating(p.playerId), 0) / bottomPlayers.length;

      // Berechne Elo
      const expectedTop = expectedScore(topRating, bottomRating);
      const actualTop = stricheScore(topStriche, bottomStriche);
      const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
      const deltaPerTopPlayer = delta / topPlayers.length;
      const deltaPerBottomPlayer = -delta / bottomPlayers.length;

      console.log(`      Game ${gameNumber}: Top Δ=${deltaPerTopPlayer.toFixed(2)}, Bottom Δ=${deltaPerBottomPlayer.toFixed(2)}`);

      // Erstelle ratingHistory Einträge für Top Players
      for (const player of topPlayers) {
        const oldRating = getPlayerRating(player.playerId);
        const newRating = oldRating + deltaPerTopPlayer;
        updatePlayerRating(player.playerId, newRating);

        newEntries.push({
          playerId: player.playerId,
          rating: newRating,
          delta: deltaPerTopPlayer,
          completedAt: gameCompletedAt,
          eventType: 'game_end',
          sessionId,
          gameNumber,
          groupId,
          createdAt: admin.firestore.Timestamp.now(),
        });
      }

      // Erstelle ratingHistory Einträge für Bottom Players
      for (const player of bottomPlayers) {
        const oldRating = getPlayerRating(player.playerId);
        const newRating = oldRating + deltaPerBottomPlayer;
        updatePlayerRating(player.playerId, newRating);

        newEntries.push({
          playerId: player.playerId,
          rating: newRating,
          delta: deltaPerBottomPlayer,
          completedAt: gameCompletedAt,
          eventType: 'game_end',
          sessionId,
          gameNumber,
          groupId,
          createdAt: admin.firestore.Timestamp.now(),
        });
      }

      eventCount++;
    }

    console.log('');
  }

  console.log(`   ✅ ${eventCount} Events verarbeitet, ${newEntries.length} neue ratingHistory Einträge erstellt\n`);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Schreibe neue ratingHistory Einträge
  // ═══════════════════════════════════════════════════════════════
  console.log('💾 PHASE 4: Schreibe neue ratingHistory...\n');

  if (process.argv.includes('--confirm')) {
    const batchSize = 500;
    let successCount = 0;

    for (let i = 0; i < newEntries.length; i += batchSize) {
      const batch = db.batch();
      const chunk = newEntries.slice(i, i + batchSize);

      for (const entry of chunk) {
        const docRef = db.collection(`players/${entry.playerId}/ratingHistory`).doc();
        batch.set(docRef, entry);
      }

      await batch.commit();
      successCount += chunk.length;
      console.log(`   ✅ Batch ${Math.floor(i / batchSize) + 1}: ${chunk.length} Einträge geschrieben`);
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
    console.log('✅ REBUILD ABGESCHLOSSEN!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`   Neu erstellt: ${successCount} ratingHistory Einträge`);
    console.log(`   Global Ratings: ${playerRatings.size} Spieler`);
    console.log('════════════════════════════════════════════════════════════════\n');
  } else {
    console.log('🔍 DRY-RUN MODUS');
    console.log('   Verwende --confirm um die Änderungen zu schreiben.\n');
    console.log(`   ${newEntries.length} Einträge würden erstellt werden.\n`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});

