/**
 * ✅ UNIFIED BACKFILL SCRIPT: ScoresHistory (Sessions + Tournaments)
 * 
 * Dieses Script:
 * 1. Löscht ALLE alten scoresHistory Entries (mit timestamp)
 * 2. Erstellt neue Entries mit completedAt
 * 3. Verarbeitet Regular Sessions UND Tournaments
 * 4. Für Tournaments: Liest aus tournaments/{tournamentId}/games
 * 5. Für Sessions: Liest aus groups/{groupId}/jassGameSummaries/{sessionId}/completedGames
 */

const admin = require('firebase-admin');
const path = require('path');

// Service Account Key laden
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

/**
 * Lädt alle Player
 */
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

/**
 * Löscht ALLE bestehenden scoresHistory Entries für einen Player
 */
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
 * Lädt alle Sessions für einen Player aus allen Gruppen
 * Inklusive Tournament-Sessions (mit tournamentId)
 */
async function getSessionsForPlayer(playerId, playerGroupIds) {
  const allSessions = [];
  const tournamentSessions = [];
  
  for (const groupId of playerGroupIds) {
    const sessionsSnap = await db
      .collection(`groups/${groupId}/jassGameSummaries`)
      .where('participantPlayerIds', 'array-contains', playerId)
      .where('status', '==', 'completed')
      .get();
    
    sessionsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (!data.tournamentId) {
        // Regular Session
        allSessions.push({
          id: doc.id,
          groupId,
          ...data
        });
      } else {
        // Tournament Session
        tournamentSessions.push({
          id: doc.id,
          groupId,
          ...data
        });
      }
    });
  }
  
  return { sessions: allSessions, tournamentSessions };
}

/**
 * Lädt alle Tournaments für einen Player
 */
async function getTournamentsForPlayer(playerId) {
  const tournamentsSnap = await db
    .collection('tournaments')
    .where('participantPlayerIds', 'array-contains', playerId)
    .where('status', 'in', ['completed', 'finalized'])
    .get();
  
  return tournamentsSnap.docs.map(doc => ({
    id: doc.id,
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
 * Lädt Tournament Games
 */
async function getTournamentGames(tournamentId) {
  const gamesSnap = await db
    .collection(`tournaments/${tournamentId}/games`)
    .orderBy('passeNumber', 'asc')
    .get();
  
  return gamesSnap.docs.map(doc => doc.data());
}

/**
 * Erstellt ScoresHistory Entry für ein Spiel
 */
function createScoresEntry(playerId, game, gameNumber, groupId, tournamentId, gameTimestamp) {
  // ✅ TOURNAMENT GAMES: Verwende teamScoresPasse und playerDetails
  if (tournamentId && game.teamScoresPasse) {
    // Finde Player in playerDetails
    const playerData = game.playerDetails?.find(p => p.playerId === playerId);
    if (!playerData) {
      return null; // Skip wenn Player nicht in diesem Spiel war
    }
    
    const playerTeam = playerData.team; // 'top' oder 'bottom'
    const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
    
    // Punkte-Differenz
    const playerPoints = game.teamScoresPasse?.[playerTeam] || 0;
    const opponentPoints = game.teamScoresPasse?.[opponentTeam] || 0;
    const pointsDiff = playerPoints - opponentPoints;
    
    // Striche-Differenz
    const playerStriche = sumStriche(game.teamStrichePasse?.[playerTeam]);
    const opponentStriche = sumStriche(game.teamStrichePasse?.[opponentTeam]);
    const stricheDiff = playerStriche - opponentStriche;
    
    // Win/Loss
    const wins = pointsDiff > 0 ? 1 : 0;
    const losses = pointsDiff < 0 ? 1 : 0;
    
    // Event-Bilanz aus teamStrichePasse
    const playerEvents = game.teamStrichePasse?.[playerTeam] || {};
    const opponentEvents = game.teamStrichePasse?.[opponentTeam] || {};
    const matschBilanz = (playerEvents.matsch || 0) - (opponentEvents.matsch || 0);
    const schneiderBilanz = (playerEvents.schneider || 0) - (opponentEvents.schneider || 0);
    const kontermatschBilanz = (playerEvents.kontermatsch || 0) - (opponentEvents.kontermatsch || 0);
    
    // Weis-Differenz aus playerDetails
    const opponentPlayers = game.playerDetails?.filter(p => p.team === opponentTeam) || [];
    const playerWeis = playerData.weisInPasse || 0;
    const opponentWeis = opponentPlayers.reduce((sum, p) => sum + (p.weisInPasse || 0), 0);
    const weisDifference = playerWeis - opponentWeis;
    
    return {
      completedAt: gameTimestamp,
      groupId,
      tournamentId,
      gameNumber,
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
  
  // ✅ SESSION GAMES: Verwende teams Structure
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
  
  // Win/Loss
  const wins = pointsDiff > 0 ? 1 : 0;
  const losses = pointsDiff < 0 ? 1 : 0;
  
  // Event-Bilanz
  const playerEvents = game.eventCounts?.[teamKey] || {};
  const opponentEvents = game.eventCounts?.[opponentTeamKey] || {};
  const matschBilanz = (playerEvents.matsch || 0) - (opponentEvents.matsch || 0);
  const schneiderBilanz = (playerEvents.schneider || 0) - (opponentEvents.schneider || 0);
  const kontermatschBilanz = (playerEvents.kontermatsch || 0) - (opponentEvents.kontermatsch || 0);
  
  // Weis-Differenz (TODO)
  const weisDifference = 0;
  
  return {
    completedAt: gameTimestamp,
    groupId,
    tournamentId: tournamentId || null,
    gameNumber,
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
  
  // 2. Lade Sessions (Regular + Tournament)
  const playerGroupIds = player.groupIds || [];
  const { sessions, tournamentSessions } = await getSessionsForPlayer(playerId, playerGroupIds);
  console.log(`  📋 ${sessions.length} Regular Sessions gefunden`);
  console.log(`  🏆 ${tournamentSessions.length} Tournament Sessions gefunden`);
  
  const batch = db.batch();
  let entriesCreated = 0;
  
  // 4. Process Sessions
  for (const session of sessions) {
    const completedGames = await getCompletedGames(session.groupId, session.id);
    
    for (let i = 0; i < completedGames.length; i++) {
      const game = completedGames[i];
      const gameNumber = game.gameNumber || (i + 1);
      
      let gameTimestamp;
      if (game.completedAt) {
        if (typeof game.completedAt.toDate === 'function') {
          gameTimestamp = game.completedAt;
        } else if (game.completedAt.seconds) {
          gameTimestamp = admin.firestore.Timestamp.fromMillis(game.completedAt.seconds * 1000);
        } else {
          gameTimestamp = admin.firestore.Timestamp.now();
        }
      } else {
        gameTimestamp = admin.firestore.Timestamp.now();
      }
      
      const entry = createScoresEntry(
        playerId,
        game,
        gameNumber,
        session.groupId,
        null,
        gameTimestamp
      );
      
      batch.set(db.collection(`players/${playerId}/scoresHistory`).doc(), entry);
      entriesCreated++;
    }
  }
  
  // 5. Process Tournament Sessions (lade ALLE Games aus tournaments/{id}/games!)
  for (const tournamentSession of tournamentSessions) {
    const tournamentId = tournamentSession.tournamentId;
    if (!tournamentId) {
      console.warn(`⚠️  TournamentSession ${tournamentSession.id} hat keine tournamentId!`);
      continue;
    }
    
    // ✅ Lade originale Tournament Games (MIT completedAt!)
    const gamesSnap = await db.collection(`tournaments/${tournamentId}/games`).get();
    
    if (gamesSnap.empty) {
      console.warn(`⚠️  Keine Games gefunden für Tournament ${tournamentId}`);
      continue;
    }
    
    // Sortiere manuell nach completedAt
    const games = gamesSnap.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter(g => g.completedAt) // Nur abgeschlossene Games
      .sort((a, b) => {
        const aTime = a.completedAt?.toDate ? a.completedAt.toDate().getTime() : 0;
        const bTime = b.completedAt?.toDate ? b.completedAt.toDate().getTime() : 0;
        return aTime - bTime;
      });
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      const passeNumber = game.passeNumber || (i + 1);
      
      let gameTimestamp;
      if (typeof game.completedAt.toDate === 'function') {
        gameTimestamp = game.completedAt;
      } else if (game.completedAt.seconds) {
        gameTimestamp = admin.firestore.Timestamp.fromMillis(game.completedAt.seconds * 1000);
      } else {
        console.warn(`⚠️  Ungültiger completedAt für Game ${game.id}`);
        continue;
      }
      
      const entry = createScoresEntry(
        playerId,
        game,
        passeNumber,
        tournamentSession.groupId,
        tournamentId,
        gameTimestamp
      );
      
      // Skip wenn Player nicht in diesem Spiel war
      if (entry) {
        batch.set(db.collection(`players/${playerId}/scoresHistory`).doc(), entry);
        entriesCreated++;
      }
    }
  }
  
  // 6. Commit
  if (entriesCreated > 0) {
    await batch.commit();
  }
  
  console.log(`  ✅ ${entriesCreated} neue Entries erstellt`);
  
  return { deleted: deletedCount, created: entriesCreated };
}

/**
 * MAIN
 */
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔄 UNIFIED BACKFILL: ScoresHistory                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  const players = await getAllPlayers();
  
  let totalDeleted = 0;
  let totalCreated = 0;
  
  for (const player of players) {
    const result = await backfillPlayerScoresHistory(player);
    totalDeleted += result.deleted;
    totalCreated += result.created;
  }
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ BACKFILL ABGESCHLOSSEN                                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Statistiken:`);
  console.log(`   - Spieler verarbeitet: ${players.length}`);
  console.log(`   - Alte Entries gelöscht: ${totalDeleted}`);
  console.log(`   - Neue Entries erstellt: ${totalCreated}`);
  console.log(`   - Durchschnitt: ${(totalCreated / players.length).toFixed(1)} Entries pro Spieler\n`);
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ FEHLER:', error);
  process.exit(1);
});

