/**
 * ✅ FIXED BACKFILL SCRIPT: ScoresHistory
 * ========================================
 * 
 * KORREKTUR: Liest aus gameResults Array statt aus completedGames Subcollection!
 * 
 * Dieses Script:
 * 1. Löscht ALLE alten scoresHistory Entries
 * 2. Liest gameResults direkt aus jassGameSummaries
 * 3. Berechnet Strichdifferenz korrekt aus finalStriche
 * 4. Erstellt neue scoresHistory Entries für ALLE Spieler
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jassguru.firebaseio.com"
});

const db = admin.firestore();

// ===== HILFSFUNKTIONEN =====

function sumStriche(rec) {
  if (!rec) return 0;
  return (rec.berg || 0) + (rec.sieg || 0) + (rec.matsch || 0) + (rec.schneider || 0) + (rec.kontermatsch || 0);
}

async function getAllPlayers() {
  console.log('\n📊 Lade alle Spieler...');
  const playersSnap = await db.collection('players').get();
  const players = playersSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  console.log(`✅ ${players.length} Spieler gefunden`);
  return players;
}

async function deleteOldScoresHistory(playerId) {
  const scoresHistorySnap = await db.collection(`players/${playerId}/scoresHistory`).get();
  if (scoresHistorySnap.empty) return 0;
  
  const batch = db.batch();
  scoresHistorySnap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  return scoresHistorySnap.size;
}

/**
 * ✅ KORRIGIERT: Lädt Sessions MIT gameResults direkt
 */
async function getSessionsForPlayer(playerId, playerGroupIds) {
  const allSessions = [];
  
  for (const groupId of playerGroupIds) {
    const sessionsSnap = await db
      .collection(`groups/${groupId}/jassGameSummaries`)
      .where('participantPlayerIds', 'array-contains', playerId)
      .where('status', '==', 'completed')
      .get();
    
    sessionsSnap.docs.forEach(doc => {
      const data = doc.data();
      allSessions.push({
        id: doc.id,
        groupId,
        ...data
      });
    });
  }
  
  return allSessions;
}

/**
 * ✅ KORRIGIERT: Erstellt ScoresHistory Entry aus gameResults
 */
function createScoresEntry(playerId, game, sessionId, groupId, tournamentId, completedAt) {
  // Hole Teams aus Game
  const gameTeams = game.teams || {};
  const topPlayers = gameTeams.top?.players || [];
  const bottomPlayers = gameTeams.bottom?.players || [];
  
  // Finde in welchem Team der Spieler war
  const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
  const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
  
  if (!isTopPlayer && !isBottomPlayer) {
    return null; // Spieler war nicht in diesem Game
  }
  
  const teamKey = isTopPlayer ? 'top' : 'bottom';
  const opponentTeamKey = isTopPlayer ? 'bottom' : 'top';
  
  // ✅ KORRIGIERT: Striche-Differenz aus finalStriche
  const finalStriche = game.finalStriche || {};
  const playerStriche = sumStriche(finalStriche[teamKey]);
  const opponentStriche = sumStriche(finalStriche[opponentTeamKey]);
  const stricheDiff = playerStriche - opponentStriche;
  
  // Punkte-Differenz aus Scores
  const topScore = game.topScore || 0;
  const bottomScore = game.bottomScore || 0;
  const pointsDiff = isTopPlayer ? (topScore - bottomScore) : (bottomScore - topScore);
  
  // Win/Loss
  const wins = pointsDiff > 0 ? 1 : 0;
  const losses = pointsDiff < 0 ? 1 : 0;
  
  // Event-Bilanz aus finalStriche
  const playerEvents = finalStriche[teamKey] || {};
  const opponentEvents = finalStriche[opponentTeamKey] || {};
  const matschBilanz = (playerEvents.matsch || 0) - (opponentEvents.matsch || 0);
  const schneiderBilanz = (playerEvents.schneider || 0) - (opponentEvents.schneider || 0);
  const kontermatschBilanz = (playerEvents.kontermatsch || 0) - (opponentEvents.kontermatsch || 0);
  
  // Weis-Differenz (TODO: aus sessionTotalWeisPoints wenn verfügbar)
  const weisDifference = 0;
  
  return {
    completedAt,
    groupId,
    tournamentId: tournamentId || null,
    sessionId, // ✅ NEU: Speichere sessionId für Referenz
    gameNumber: game.gameNumber || 0,
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
}

/**
 * Backfill für einen Player
 */
async function backfillPlayerScoresHistory(player) {
  const playerId = player.id;
  console.log(`\n👤 Player: ${player.displayName || playerId}`);
  
  // 1. Lösche alte Entries
  const deletedCount = await deleteOldScoresHistory(playerId);
  console.log(`  🗑️  ${deletedCount} alte Entries gelöscht`);
  
  // 2. Lade Sessions
  const playerGroupIds = player.groupIds || [];
  const sessions = await getSessionsForPlayer(playerId, playerGroupIds);
  console.log(`  📋 ${sessions.length} Sessions gefunden`);
  
  if (sessions.length === 0) {
    console.log(`  ⚠️  Keine Sessions für Player ${player.displayName}`);
    return 0;
  }
  
  const batch = db.batch();
  let entriesCreated = 0;
  
  // 3. Sortiere Sessions chronologisch
  const sortedSessions = sessions.sort((a, b) => {
    const aTime = a.completedAt?.toDate ? a.completedAt.toDate().getTime() : 0;
    const bTime = b.completedAt?.toDate ? b.completedAt.toDate().getTime() : 0;
    return aTime - bTime;
  });
  
  // 4. Process Sessions - Lese aus gameResults Array!
  for (const session of sortedSessions) {
    const gameResults = session.gameResults || [];
    
    if (gameResults.length === 0) {
      console.warn(`  ⚠️  Keine gameResults für Session ${session.id}`);
      continue;
    }
    
    // Verwende completedAt der Session als Basis
    let sessionCompletedAt = session.completedAt;
    if (!sessionCompletedAt) {
      console.warn(`  ⚠️  Keine completedAt für Session ${session.id}`);
      continue;
    }
    
    for (const game of gameResults) {
      const entry = createScoresEntry(
        playerId,
        game,
        session.id,
        session.groupId,
        session.tournamentId || null,
        sessionCompletedAt
      );
      
      if (entry) {
        batch.set(db.collection(`players/${playerId}/scoresHistory`).doc(), entry);
        entriesCreated++;
      }
    }
  }
  
  // 5. Commit Batch
  if (entriesCreated > 0) {
    await batch.commit();
  }
  
  console.log(`  ✅ ${entriesCreated} Entries erstellt`);
  return entriesCreated;
}

/**
 * Main Function
 */
async function main() {
  try {
    console.log('🚀 Starte FIXED ScoresHistory Backfill...\n');
    console.log('═══════════════════════════════════════════════');
    console.log('KORREKTUR: Liest aus gameResults Array!');
    console.log('═══════════════════════════════════════════════\n');
    
    const players = await getAllPlayers();
    
    let totalEntriesCreated = 0;
    let playersProcessed = 0;
    
    for (const player of players) {
      try {
        const entriesCreated = await backfillPlayerScoresHistory(player);
        totalEntriesCreated += entriesCreated;
        playersProcessed++;
        
        // Kurze Pause zwischen Batches
        if (playersProcessed % 10 === 0) {
          console.log(`\n⏸️  Pause nach ${playersProcessed} Spielern...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`❌ Fehler bei Player ${player.displayName || player.id}:`, error.message);
      }
    }
    
    console.log('\n\n═══════════════════════════════════════════════');
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('═══════════════════════════════════════════════');
    console.log(`Spieler verarbeitet: ${playersProcessed}/${players.length}`);
    console.log(`Entries erstellt: ${totalEntriesCreated}`);
    console.log('═══════════════════════════════════════════════\n');
    
    console.log('✅ Backfill abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  } finally {
    process.exit(0);
  }
}

main();

