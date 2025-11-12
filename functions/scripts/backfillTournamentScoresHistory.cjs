/**
 * ✅ BACKFILL SCRIPT: Tournament ScoresHistory
 * 
 * Spezielles Script für Turniere die durch tournaments/{tournamentId}/games iteriert
 * und für jeden Player Pro-Spiel-ScoresHistory-Einträge erstellt.
 * 
 * Zweck:
 * - Füllt players/{playerId}/scoresHistory mit Pro-Spiel-Entries für Turniere
 * - Liest aus tournaments/{tournamentId}/games (nicht aus jassGameSummaries!)
 * - Erstellt ScoresHistory für alle 4 Spieler pro Passe
 */

const admin = require('firebase-admin');
const path = require('path');

// ✅ Service Account Key laden
const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jassguru.firebaseio.com"
});

const db = admin.firestore();

// ===== HILFSFUNKTIONEN =====

/**
 * Summiert Striche aus einem StricheRecord
 */
function sumStriche(rec) {
  if (!rec) return 0;
  return (rec.berg || 0) + (rec.sieg || 0) + (rec.matsch || 0) + (rec.schneider || 0) + (rec.kontermatsch || 0);
}

/**
 * Lädt alle Tournaments
 */
async function getAllTournaments() {
  console.log('\n📊 Lade alle Tournaments...');
  const tournamentsSnap = await db.collection('tournaments').get();
  const tournaments = tournamentsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  console.log(`✅ ${tournaments.length} Tournaments gefunden`);
  return tournaments;
}

/**
 * Hauptfunktion: Backfill ScoresHistory für EIN Tournament
 */
async function backfillScoresHistoryForTournament(tournament, groupId) {
  const tournamentId = tournament.id;
  const participantPlayerIds = tournament.participantPlayerIds || [];
  
  // Load games für dieses Tournament
  const gamesSnap = await db
    .collection(`tournaments/${tournamentId}/games`)
    .orderBy('passeNumber', 'asc')
    .get();
  
  const games = gamesSnap.docs.map(doc => doc.data());
  
  if (games.length === 0) {
    console.log(`  ⚠️  Keine games in Tournament ${tournamentId}`);
    return { gamesProcessed: 0, entriesCreated: 0 };
  }
  
  console.log(`  📋 ${games.length} Passen gefunden`);
  
  // Batch für alle ScoresHistory-Einträge dieses Tournaments
  const batch = db.batch();
  let entriesCreated = 0;
  
  // Process each game (passe)
  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const game = games[gameIndex];
    const passeNumber = game.passeNumber || (gameIndex + 1);
    
    // Timestamp
    let gameTimestamp;
    if (game.completedAt) {
      if (typeof game.completedAt.toDate === 'function') {
        gameTimestamp = game.completedAt;
      } else if (game.completedAt.seconds) {
        gameTimestamp = admin.firestore.Timestamp.fromMillis(
          game.completedAt.seconds * 1000
        );
      } else {
        gameTimestamp = admin.firestore.Timestamp.now();
      }
    } else {
      gameTimestamp = admin.firestore.Timestamp.now();
    }
    
    // Pro Spieler in diesem Tournament
    for (const playerId of participantPlayerIds) {
      // Identifiziere Team basierend auf game.teams
      const topPlayers = game.teams?.top?.players?.map(p => p.playerId) || [];
      const bottomPlayers = game.teams?.bottom?.players?.map(p => p.playerId) || [];
      
      const isTopPlayer = topPlayers.includes(playerId);
      const teamKey = isTopPlayer ? 'top' : 'bottom';
      const opponentTeamKey = isTopPlayer ? 'bottom' : 'top';
      
      // Striche-Differenz
      const playerStriche = sumStriche(game.finalStriche?.[teamKey]);
      const opponentStriche = sumStriche(game.finalStriche?.[opponentTeamKey]);
      const stricheDiff = playerStriche - opponentStriche;
      
      // Punkte-Differenz
      const playerPoints = game.finalScores?.[teamKey] || 0;
      const opponentPoints = game.finalScores?.[opponentTeamKey] || 0;
      const pointsDiff = playerPoints - opponentPoints;
      
      // Win/Loss (NO draw on game level!)
      const wins = pointsDiff > 0 ? 1 : 0;
      const losses = pointsDiff < 0 ? 1 : 0;
      
      // Event-Bilanz
      const playerEvents = game.eventCounts?.[teamKey];
      const opponentEvents = game.eventCounts?.[opponentTeamKey];
      const matschBilanz = (playerEvents?.matsch || 0) - (opponentEvents?.matsch || 0);
      const schneiderBilanz = (playerEvents?.schneider || 0) - (opponentEvents?.schneider || 0);
      const kontermatschBilanz = (playerEvents?.kontermatsch || 0) - (opponentEvents?.kontermatsch || 0);
      
      // Weis-Differenz (TODO: Weis pro Player extrahieren)
      const weisDifference = 0; // Placeholder
      
      // GlobalStats Snapshot (Minimal-Version)
      const globalStats = {
        current: {
          totalGames: gameIndex + 1,
          globalRating: 0, // Wird nicht benötigt für Backfill
        }
      };
      
      const scoresEntry = {
        completedAt: gameTimestamp, // ✅ KONSISTENT mit ratingHistory!
        sessionId: tournamentId, // Tournament ID als Session ID
        groupId: groupId,
        tournamentId: tournamentId,
        gameNumber: passeNumber,
        stricheDiff,
        pointsDiff,
        wins,
        losses,
        draws: 0, // ✅ NO draws on game level!
        matschBilanz,
        schneiderBilanz,
        kontermatschBilanz,
        weisDifference,
        globalStats,
        eventType: 'game',
      };
      
      // Schreibe zu players/{playerId}/scoresHistory
      const historyRef = db.collection(`players/${playerId}/scoresHistory`).doc();
      batch.set(historyRef, scoresEntry);
      entriesCreated++;
    }
  }
  
  // Commit Batch für dieses Tournament
  await batch.commit();
  console.log(`  ✅ ${entriesCreated} ScoresHistory-Einträge erstellt für ${games.length} Passen`);
  
  return { gamesProcessed: games.length, entriesCreated };
}

/**
 * 🚀 MAIN
 */
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔄 BACKFILL: Tournament ScoresHistory                     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const tournaments = await getAllTournaments();
  
  let totalTournamentsProcessed = 0;
  let totalGamesProcessed = 0;
  let totalEntriesCreated = 0;
  
  for (const tournament of tournaments) {
    console.log(`\n📂 Tournament: ${tournament.name || tournament.id}`);
    
    const groupId = tournament.groupId;
    if (!groupId) {
      console.log('  ⚠️  Keine groupId, überspringe');
      continue;
    }
    
    const result = await backfillScoresHistoryForTournament(tournament, groupId);
    totalGamesProcessed += result.gamesProcessed;
    totalEntriesCreated += result.entriesCreated;
    totalTournamentsProcessed++;
  }
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ BACKFILL ABGESCHLOSSEN                                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Statistiken:`);
  console.log(`   - Tournaments verarbeitet: ${totalTournamentsProcessed}`);
  console.log(`   - Passen verarbeitet: ${totalGamesProcessed}`);
  console.log(`   - ScoresHistory-Einträge erstellt: ${totalEntriesCreated}`);
  console.log(`   - Durchschnitt: ${(totalEntriesCreated / totalTournamentsProcessed).toFixed(1)} Einträge pro Tournament\n`);
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ FEHLER:', error);
  process.exit(1);
});

