/**
 * ✅ BACKFILL SCRIPT: Pro-Spiel ScoresHistory
 * 
 * Dieser Script liest ALLE historischen Sessions aus jassGameSummaries,
 * lädt die completedGames Subcollection, und schreibt PRO SPIEL
 * ScoresHistory-Einträge in players/{playerId}/scoresHistory
 * 
 * Zweck:
 * - Füllt players/{playerId}/scoresHistory mit Pro-Spiel-Entries
 * - Macht den "Strichdifferenz"-Chart granular (pro Spiel statt pro Session)
 * 
 * Architektur:
 * - Liest groups/{groupId}/jassGameSummaries/{sessionId}/completedGames
 * - Pro completedGame → Pro Spiel-ScoresHistory-Eintrag
 * - Analog zur Logik in jassEloUpdater.ts
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
 * Lädt alle Groups
 */
async function getAllGroups() {
  console.log('\n📊 Lade alle Gruppen...');
  const groupsSnap = await db.collection('groups').get();
  const groups = groupsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  console.log(`✅ ${groups.length} Gruppen gefunden`);
  return groups;
}

/**
 * Lädt alle Sessions einer Gruppe (komplett)
 */
async function getGroupSessions(groupId) {
  const sessionsSnap = await db
    .collection(`groups/${groupId}/jassGameSummaries`)
    .where('status', '==', 'completed')
    .get();
  
  return sessionsSnap.docs.map(doc => ({
    id: doc.id,
    groupId,
    ...doc.data()
  }));
}

/**
 * Lädt completedGames für eine Session
 */
async function getCompletedGames(groupId, sessionId) {
  const gamesSnap = await db
    .collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
    .orderBy('gameNumber', 'asc')
    .get();
  
  return gamesSnap.docs.map(doc => doc.data());
}

/**
 * Hauptfunktion: Backfill ScoresHistory für EINE Session
 */
async function backfillScoresHistoryForSession(session, groupId) {
  const sessionId = session.id;
  const participantPlayerIds = session.participantPlayerIds || [];
  const teams = session.teams || {};
  const topPlayerIds = teams.top?.players?.map(p => p.playerId) || [];
  const bottomPlayerIds = teams.bottom?.players?.map(p => p.playerId) || [];
  
  // Load completedGames für diese Session
  const completedGames = await getCompletedGames(groupId, sessionId);
  
  if (completedGames.length === 0) {
    console.log(`  ⚠️  Keine completedGames in Session ${sessionId}`);
    return { gamesProcessed: 0, entriesCreated: 0 };
  }
  
  console.log(`  📋 ${completedGames.length} Spiele gefunden`);
  
  // Batch für alle ScoresHistory-Einträge dieser Session
  const batch = db.batch();
  let entriesCreated = 0;
  
  // Process each game
  for (let gameIndex = 0; gameIndex < completedGames.length; gameIndex++) {
    const completedGame = completedGames[gameIndex];
    const gameNumber = completedGame.gameNumber || (gameIndex + 1);
    
    // Timestamp
    let gameTimestamp;
    if (completedGame.completedAt) {
      if (typeof completedGame.completedAt.toDate === 'function') {
        gameTimestamp = completedGame.completedAt;
      } else if (completedGame.completedAt.seconds) {
        gameTimestamp = admin.firestore.Timestamp.fromMillis(
          completedGame.completedAt.seconds * 1000
        );
      } else {
        gameTimestamp = admin.firestore.Timestamp.now();
      }
    } else {
      gameTimestamp = admin.firestore.Timestamp.now();
    }
    
    // Pro Spieler in dieser Session
    for (const playerId of participantPlayerIds) {
      const isTopPlayer = topPlayerIds.includes(playerId);
      const teamKey = isTopPlayer ? 'top' : 'bottom';
      const opponentTeamKey = isTopPlayer ? 'bottom' : 'top';
      
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
        sessionId,
        groupId,
        tournamentId: null,
        gameNumber: gameNumber,
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
  
  // Commit Batch für diese Session
  await batch.commit();
  console.log(`  ✅ ${entriesCreated} ScoresHistory-Einträge erstellt für ${completedGames.length} Spiele`);
  
  return { gamesProcessed: completedGames.length, entriesCreated };
}

/**
 * 🚀 MAIN
 */
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔄 BACKFILL: Pro-Spiel ScoresHistory                    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const groups = await getAllGroups();
  
  let totalSessionsProcessed = 0;
  let totalGamesProcessed = 0;
  let totalEntriesCreated = 0;
  
  for (const group of groups) {
    console.log(`\n📂 Gruppe: ${group.id}`);
    
    const sessions = await getGroupSessions(group.id);
    console.log(`  📊 ${sessions.length} Sessions gefunden`);
    
    for (const session of sessions) {
      const result = await backfillScoresHistoryForSession(session, group.id);
      totalGamesProcessed += result.gamesProcessed;
      totalEntriesCreated += result.entriesCreated;
      totalSessionsProcessed++;
    }
  }
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ BACKFILL ABGESCHLOSSEN                                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Statistiken:`);
  console.log(`   - Gruppen verarbeitet: ${groups.length}`);
  console.log(`   - Sessions verarbeitet: ${totalSessionsProcessed}`);
  console.log(`   - Spiele verarbeitet: ${totalGamesProcessed}`);
  console.log(`   - ScoresHistory-Einträge erstellt: ${totalEntriesCreated}`);
  console.log(`   - Durchschnitt: ${(totalEntriesCreated / totalSessionsProcessed).toFixed(1)} Einträge pro Session\n`);
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ FEHLER:', error);
  process.exit(1);
});

