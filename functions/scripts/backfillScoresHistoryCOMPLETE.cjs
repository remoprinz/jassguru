/**
 * ✅ COMPLETE BACKFILL SCRIPT: ScoresHistory (Sessions + Tournaments)
 * ====================================================================
 * 
 * KORRIGIERT: Liest aus gameResults UND tournaments/{id}/games!
 * 
 * Dieses Script:
 * 1. Löscht ALLE alten scoresHistory Entries
 * 2. Für Regular Sessions: Liest aus gameResults Array
 * 3. Für Tournament Sessions: Liest aus tournaments/{id}/games
 * 4. Erstellt scoresHistory Entries für ALLE Spieler
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
  const tournamentSessions = [];
  
  for (const groupId of playerGroupIds) {
    const sessionsSnap = await db
      .collection(`groups/${groupId}/jassGameSummaries`)
      .where('participantPlayerIds', 'array-contains', playerId)
      .where('status', '==', 'completed')
      .get();
    
    sessionsSnap.docs.forEach(doc => {
      const data = doc.data();
      
      // ⚠️ WICHTIG: Skip Sessions MIT tournamentId ODER isTournamentSession
      // Diese werden AUSSCHLIESSLICH aus tournaments/{id}/games verarbeitet
      if (data.tournamentId || data.isTournamentSession) {
        // Tournament Session - wird über tournaments/{id}/games verarbeitet
        tournamentSessions.push({
          id: doc.id,
          groupId,
          tournamentId: data.tournamentId,
          ...data
        });
      } else {
        // Regular Session - wird aus gameResults verarbeitet
        allSessions.push({
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
 * ✅ NEU: Lädt Tournament Games für ein Tournament
 */
async function getTournamentGames(tournamentId) {
  try {
    const gamesSnap = await db.collection(`tournaments/${tournamentId}/games`)
      .orderBy('passeNumber', 'asc')
      .get();
    
    return gamesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.warn(`⚠️  Fehler beim Laden von Tournament ${tournamentId}:`, error.message);
    return [];
  }
}

/**
 * ✅ KORRIGIERT: Erstellt ScoresHistory Entry aus gameResults (Regular Sessions)
 */
function createSessionGameEntry(playerId, game, sessionId, groupId, completedAt, session = null, gameResults = []) {
  // Hole Teams aus Game
  const gameTeams = game.teams || {};
  const topPlayers = gameTeams.top?.players || [];
  const bottomPlayers = gameTeams.bottom?.players || [];
  
  // Finde in welchem Team der Spieler war
  const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
  const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
  
  if (!isTopPlayer && !isBottomPlayer) {
    return null;
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
  
  // ✅ Weis-Differenz - GENAU WIE alle anderen Metriken!
  const weisPoints = game.weisPoints || { top: 0, bottom: 0 };
  const playerWeis = weisPoints[teamKey] || 0;
  const opponentWeis = weisPoints[opponentTeamKey] || 0;
  const weisDifference = playerWeis - opponentWeis;
  
  return {
    completedAt,
    groupId,
    tournamentId: null,
    sessionId,
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
 * ✅ NEU: Erstellt ScoresHistory Entry aus Tournament Games
 */
function createTournamentGameEntry(playerId, game, tournamentId, groupId) {
  // Hole playerDetails
  const playerDetails = game.playerDetails || [];
  const playerData = playerDetails.find(p => p.playerId === playerId);
  
  if (!playerData) {
    return null; // Spieler war nicht in dieser Passe
  }
  
  const playerTeam = playerData.team; // 'top' oder 'bottom'
  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  
  // ✅ Striche-Differenz aus playerData.stricheInPasse vs teamStrichePasse
  const playerStriche = sumStriche(playerData.stricheInPasse);
  const teamStrichePasse = game.teamStrichePasse || {};
  const opponentStriche = sumStriche(teamStrichePasse[opponentTeam]);
  const stricheDiff = playerStriche - opponentStriche;
  
  // Punkte-Differenz aus teamScoresPasse
  const teamScoresPasse = game.teamScoresPasse || {};
  const playerPoints = teamScoresPasse[playerTeam] || 0;
  const opponentPoints = teamScoresPasse[opponentTeam] || 0;
  const pointsDiff = playerPoints - opponentPoints;
  
  // Win/Loss
  const wins = pointsDiff > 0 ? 1 : 0;
  const losses = pointsDiff < 0 ? 1 : 0;
  
  // Event-Bilanz aus stricheInPasse
  const playerEvents = playerData.stricheInPasse || {};
  const opponentEvents = teamStrichePasse[opponentTeam] || {};
  const matschBilanz = (playerEvents.matsch || 0) - (opponentEvents.matsch || 0);
  const schneiderBilanz = (playerEvents.schneider || 0) - (opponentEvents.schneider || 0);
  const kontermatschBilanz = (playerEvents.kontermatsch || 0) - (opponentEvents.kontermatsch || 0);
  
  // ✅ Weis-Differenz aus roundHistory.weisPoints
  let playerWeis = 0;
  let opponentWeis = 0;
  
  if (game.roundHistory && Array.isArray(game.roundHistory)) {
    game.roundHistory.forEach((round) => {
      const weisPoints = round.weisPoints || {};
      
      if (playerTeam === 'top') {
        if (weisPoints.top) playerWeis += weisPoints.top;
        if (weisPoints.bottom) opponentWeis += weisPoints.bottom;
      } else {
        if (weisPoints.bottom) playerWeis += weisPoints.bottom;
        if (weisPoints.top) opponentWeis += weisPoints.top;
      }
    });
  }
  
  const weisDifference = playerWeis - opponentWeis;
  
  // Hole completedAt aus Game
  let gameCompletedAt = game.completedAt;
  if (!gameCompletedAt) {
    gameCompletedAt = admin.firestore.Timestamp.now();
  }
  
  return {
    completedAt: gameCompletedAt,
    groupId,
    tournamentId,
    sessionId: null,
    gameNumber: game.passeNumber || 0,
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
  const { sessions, tournamentSessions } = await getSessionsForPlayer(playerId, playerGroupIds);
  console.log(`  📋 ${sessions.length} Regular Sessions gefunden`);
  console.log(`  🏆 ${tournamentSessions.length} Tournament Sessions gefunden`);
  
  // ⚠️ DEBUG: Prüfe ob Tournament Sessions versehentlich in Regular Sessions landen
  const hasTournamentInRegular = sessions.some(s => s.tournamentId || s.isTournamentSession);
  if (hasTournamentInRegular) {
    console.log(`  ⚠️  WARNUNG: Tournament Session in Regular Sessions erkannt!`);
  }
  
  if (sessions.length === 0 && tournamentSessions.length === 0) {
    console.log(`  ⚠️  Keine Sessions für Player ${player.displayName}`);
    return 0;
  }
  
  const batch = db.batch();
  let entriesCreated = 0;
  
  // 3. Process Regular Sessions
  for (const session of sessions) {
    const gameResults = session.gameResults || [];
    
    if (gameResults.length === 0) {
      console.warn(`  ⚠️  Keine gameResults für Session ${session.id}`);
      continue;
    }
    
    let sessionCompletedAt = session.completedAt;
    if (!sessionCompletedAt) {
      console.warn(`  ⚠️  Keine completedAt für Session ${session.id}`);
      continue;
    }
    
    for (const game of gameResults) {
      const entry = createSessionGameEntry(
        playerId,
        game,
        session.id,
        session.groupId,
        sessionCompletedAt,
        session,
        gameResults
      );
      
      if (entry) {
        batch.set(db.collection(`players/${playerId}/scoresHistory`).doc(), entry);
        entriesCreated++;
      }
    }
  }
  
  // 4. Process Tournament Sessions - LIEST AUS tournaments/{id}/games!
  for (const tournamentSession of tournamentSessions) {
    const tournamentId = tournamentSession.tournamentId;
    if (!tournamentId) {
      console.warn(`  ⚠️  TournamentSession ${tournamentSession.id} hat keine tournamentId`);
      continue;
    }
    
    // ✅ Lade originale Tournament Games
    const games = await getTournamentGames(tournamentId);
    
    if (games.length === 0) {
      console.warn(`  ⚠️  Keine Games gefunden für Tournament ${tournamentId}`);
      continue;
    }
    
    console.log(`  📊 Tournament ${tournamentId}: ${games.length} Games gefunden`);
    
    // Iteriere durch ALLE Games/Passen
    for (const game of games) {
      const entry = createTournamentGameEntry(
        playerId,
        game,
        tournamentId,
        tournamentSession.groupId
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
    // Überprüfe ob eine spezifische Player-ID als Argument übergeben wurde
    const specificPlayerId = process.argv[2];
    
    if (specificPlayerId) {
      // Backfill für einen spezifischen Spieler
      console.log(`🎯 Backfill für Spieler: ${specificPlayerId}\n`);
      
      const playerDoc = await db.collection('players').doc(specificPlayerId).get();
      
      if (!playerDoc.exists) {
        console.error(`❌ Spieler ${specificPlayerId} nicht gefunden!`);
        process.exit(1);
      }
      
      const player = {
        id: playerDoc.id,
        ...playerDoc.data()
      };
      
      const entriesCreated = await backfillPlayerScoresHistory(player);
      console.log(`\n✅ Backfill abgeschlossen: ${entriesCreated} Entries erstellt\n`);
    } else {
      // Backfill für alle Spieler
      console.log('🚀 Starte COMPLETE ScoresHistory Backfill für ALLE Spieler...\n');
      console.log('═══════════════════════════════════════════════');
      console.log('KORREKTUR: Liest aus gameResults UND tournaments/games!');
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
    }
    
    console.log('✅ Backfill abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  } finally {
    process.exit(0);
  }
}

main();

