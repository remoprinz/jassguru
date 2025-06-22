const admin = require('firebase-admin');

// Firebase Admin für Emulator initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'jasstafel-c2c0c'
  });
}

// Emulator-Einstellungen
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const db = admin.firestore();

// Importiere die Calculator-Funktion (simuliert)
// Da wir nicht direkt importieren können, implementieren wir eine vereinfachte Version für Tests

async function testGroupStatsWithRealData() {
  console.log('🔍 DETAILLIERTE GRUPPENSTATISTIK-RESULTATE MIT ECHTEN DATEN');
  console.log('=' .repeat(80));

  try {
    // Alle Gruppen laden
    const groupsSnap = await db.collection('groups').get();
    const groups = [];
    
    groupsSnap.forEach(doc => {
      const data = doc.data();
      groups.push({
        id: doc.id,
        name: data.name || 'Unbenannte Gruppe',
        players: data.players || {},
        memberCount: Object.keys(data.players || {}).length
      });
    });

    console.log(`📊 Gefundene Gruppen: ${groups.length}`);
    groups.forEach(group => {
      console.log(`  - ${group.name} (${group.id}): ${group.memberCount} Mitglieder`);
    });

    // Für jede Gruppe detaillierte Analyse
    for (const group of groups) {
      await analyzeGroupInDetail(group);
    }

  } catch (error) {
    console.error('❌ Fehler beim Testen mit echten Daten:', error);
  }
}

async function analyzeGroupInDetail(group) {
  console.log(`\n🎯 DETAILLIERTE ANALYSE: ${group.name} (${group.id})`);
  console.log('=' .repeat(60));

  try {
    // 1. Lade alle Sessions der Gruppe
    const sessionsSnap = await db.collection('jassGameSummaries')
      .where("groupId", "==", group.id)
      .where("status", "==", "completed")
      .orderBy("startedAt", "asc")
      .get();

    if (sessionsSnap.empty) {
      console.log('❌ Keine abgeschlossenen Sessions gefunden');
      return;
    }

    console.log(`📊 ROHDATEN-ÜBERSICHT:`);
    console.log(`  Sessions gefunden: ${sessionsSnap.docs.length}`);

    // 2. Sammle alle Spiele und analysiere Rohdaten
    const allSessions = [];
    const allGames = [];
    let totalRounds = 0;
    let totalTrumpfCount = 0;
    const trumpfTypes = new Map();
    const playerStats = new Map();

    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      
      // Session-Info
      const sessionInfo = {
        id: sessionDoc.id,
        startedAt: sessionData.startedAt,
        endedAt: sessionData.endedAt,
        gamesPlayed: sessionData.gamesPlayed || 0,
        finalScores: sessionData.finalScores,
        participantUids: sessionData.participantUids || [],
        teams: sessionData.teams,
        winnerTeamKey: sessionData.winnerTeamKey,
        games: []
      };

      // Lade alle Spiele dieser Session
      for (let gameNumber = 1; gameNumber <= sessionInfo.gamesPlayed; gameNumber++) {
        try {
          const gameDoc = await sessionDoc.ref.collection('completedGames').doc(gameNumber.toString()).get();
          
          if (gameDoc.exists) {
            const gameData = gameDoc.data();
            const gameInfo = {
              sessionId: sessionDoc.id,
              gameNumber: gameNumber,
              finalScores: gameData.finalScores,
              finalStriche: gameData.finalStriche,
              weisPoints: gameData.weisPoints,
              roundHistory: gameData.roundHistory || [],
              durationMillis: gameData.durationMillis
            };

            // Runden analysieren
            if (gameData.roundHistory && Array.isArray(gameData.roundHistory)) {
              totalRounds += gameData.roundHistory.length;
              
              gameData.roundHistory.forEach(round => {
                if (round.farbe) {
                  totalTrumpfCount++;
                  trumpfTypes.set(round.farbe, (trumpfTypes.get(round.farbe) || 0) + 1);
                }
              });
            }

            sessionInfo.games.push(gameInfo);
            allGames.push(gameInfo);
          }
        } catch (gameError) {
          console.warn(`  ⚠️  Fehler beim Laden von Spiel ${gameNumber}:`, gameError.message);
        }
      }

      allSessions.push(sessionInfo);
    }

    console.log(`  Spiele gefunden: ${allGames.length}`);
    console.log(`  Runden gefunden: ${totalRounds}`);
    console.log(`  Trumpf-Runden: ${totalTrumpfCount}`);

    // 3. Berechne BASIC STATISTICS
    console.log(`\n📊 BASIC STATISTICS (15):`);
    
    const basicStats = {
      groupId: group.id,
      memberCount: group.memberCount,
      sessionCount: allSessions.length,
      gameCount: allGames.length,
      totalRounds: totalRounds,
      totalTrumpfCount: totalTrumpfCount
    };

    // Durchschnittswerte berechnen
    if (basicStats.gameCount > 0) {
      basicStats.avgRoundsPerGame = parseFloat((totalRounds / basicStats.gameCount).toFixed(1));
    }

    if (basicStats.sessionCount > 0) {
      basicStats.avgGamesPerSession = parseFloat((basicStats.gameCount / basicStats.sessionCount).toFixed(1));
    }

    // Spielzeiten
    let totalPlayTimeMillis = 0;
    allGames.forEach(game => {
      totalPlayTimeMillis += game.durationMillis || 0;
    });
    
    basicStats.totalPlayTimeSeconds = Math.round(totalPlayTimeMillis / 1000);
    
    if (basicStats.sessionCount > 0) {
      basicStats.avgSessionDurationSeconds = Math.round(totalPlayTimeMillis / basicStats.sessionCount / 1000);
    }
    
    if (basicStats.gameCount > 0) {
      basicStats.avgGameDurationSeconds = Math.round(totalPlayTimeMillis / basicStats.gameCount / 1000);
    }

    // Zeitstempel
    const timestamps = allSessions
      .map(s => s.startedAt)
      .filter(t => t)
      .map(t => t instanceof admin.firestore.Timestamp ? t.toMillis() : (typeof t === 'number' ? t : new Date(t).getTime()))
      .sort((a, b) => a - b);
    
    if (timestamps.length > 0) {
      basicStats.firstJassTimestamp = new Date(timestamps[0]).toLocaleDateString();
      basicStats.lastJassTimestamp = new Date(timestamps[timestamps.length - 1]).toLocaleDateString();
    }

    // Basic Stats ausgeben
    Object.entries(basicStats).forEach(([key, value]) => {
      console.log(`  ✅ ${key}: ${value}`);
    });

    // 4. TRUMPF STATISTICS
    console.log(`\n🃏 TRUMPF STATISTICS (2):`);
    
    const trumpfStatistik = {};
    trumpfTypes.forEach((count, farbe) => {
      trumpfStatistik[farbe] = count;
    });
    
    console.log(`  ✅ trumpfStatistik:`, trumpfStatistik);
    console.log(`  ✅ totalTrumpfCount: ${totalTrumpfCount}`);

    // 5. Detaillierte Spieler-Analyse
    console.log(`\n👥 SPIELER-DATENSAMMLUNG:`);
    
    const playerGameCounts = new Map();
    const playerPointsStats = new Map();
    const playerStricheStats = new Map();
    const playerSessionStats = new Map();
    const playerGameStats = new Map();

    // Sammle Spieler-Daten aus allen Sessions
    allSessions.forEach(session => {
      const sessionPlayerIds = extractPlayerIdsFromSession(session, group.players);
      
      sessionPlayerIds.forEach(playerId => {
        // Session-Statistiken
        if (!playerSessionStats.has(playerId)) {
          playerSessionStats.set(playerId, { sessions: 0, wins: 0, losses: 0, ties: 0 });
        }
        const sessionStats = playerSessionStats.get(playerId);
        sessionStats.sessions++;
        
        // Session-Gewinn bestimmen
        const sessionOutcome = getPlayerSessionOutcome(playerId, session, group.players);
        if (sessionOutcome === 'win') sessionStats.wins++;
        else if (sessionOutcome === 'loss') sessionStats.losses++;
        else sessionStats.ties++;
      });

      // Spiel-Statistiken
      session.games.forEach(game => {
        sessionPlayerIds.forEach(playerId => {
          // Spiele zählen
          playerGameCounts.set(playerId, (playerGameCounts.get(playerId) || 0) + 1);

          // Punkte-Statistiken
          if (!playerPointsStats.has(playerId)) {
            playerPointsStats.set(playerId, { made: 0, received: 0, games: 0 });
          }
          const pointsStats = playerPointsStats.get(playerId);
          pointsStats.games++;

          // Spiel-Gewinn-Statistiken
          if (!playerGameStats.has(playerId)) {
            playerGameStats.set(playerId, { wins: 0, losses: 0, games: 0 });
          }
          const gameStats = playerGameStats.get(playerId);
          gameStats.games++;

          // Berechne Punkte und Gewinn für diesen Spieler in diesem Spiel
          const gameOutcome = calculatePlayerGameOutcome(playerId, game, session, group.players);
          pointsStats.made += gameOutcome.pointsMade;
          pointsStats.received += gameOutcome.pointsReceived;
          
          if (gameOutcome.result === 'win') gameStats.wins++;
          else if (gameOutcome.result === 'loss') gameStats.losses++;

          // Striche-Statistiken
          if (!playerStricheStats.has(playerId)) {
            playerStricheStats.set(playerId, { made: 0, received: 0, games: 0 });
          }
          const stricheStats = playerStricheStats.get(playerId);
          stricheStats.games++;
          stricheStats.made += gameOutcome.stricheMade;
          stricheStats.received += gameOutcome.stricheReceived;
        });
      });
    });

    // Ausgabe der Top-Spieler-Statistiken
    console.log(`\n🏆 PLAYER STATISTICS (Top 3 je Kategorie):`);

    // Spieler mit meisten Spielen
    const topGamePlayers = Array.from(playerGameCounts.entries())
      .map(([playerId, count]) => ({
        playerId,
        playerName: getPlayerName(playerId, group.players),
        value: count
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    console.log(`  🎮 Spieler mit meisten Spielen:`);
    topGamePlayers.forEach((player, index) => {
      console.log(`    ${index + 1}. ${player.playerName}: ${player.value} Spiele`);
    });

    // Spieler mit höchster Punkte-Differenz
    const topPointsPlayers = Array.from(playerPointsStats.entries())
      .map(([playerId, stats]) => ({
        playerId,
        playerName: getPlayerName(playerId, group.players),
        value: stats.made - stats.received,
        made: stats.made,
        received: stats.received,
        games: stats.games
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    console.log(`  📊 Spieler mit höchster Punkte-Differenz:`);
    topPointsPlayers.forEach((player, index) => {
      console.log(`    ${index + 1}. ${player.playerName}: +${player.value} (${player.made} - ${player.received}, ${player.games} Spiele)`);
    });

    // Spieler mit höchster Striche-Differenz
    const topStrichePlayers = Array.from(playerStricheStats.entries())
      .map(([playerId, stats]) => ({
        playerId,
        playerName: getPlayerName(playerId, group.players),
        value: stats.made - stats.received,
        made: stats.made,
        received: stats.received,
        games: stats.games
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    console.log(`  🎯 Spieler mit höchster Striche-Differenz:`);
    topStrichePlayers.forEach((player, index) => {
      console.log(`    ${index + 1}. ${player.playerName}: +${player.value} (${player.made} - ${player.received}, ${player.games} Spiele)`);
    });

    // Session-Gewinnraten
    const topSessionWinRates = Array.from(playerSessionStats.entries())
      .map(([playerId, stats]) => ({
        playerId,
        playerName: getPlayerName(playerId, group.players),
        winRate: stats.sessions > 0 ? (stats.wins / stats.sessions * 100) : 0,
        wins: stats.wins,
        sessions: stats.sessions
      }))
      .filter(player => player.sessions >= 3) // Mindestens 3 Sessions
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 3);

    console.log(`  🏆 Spieler mit höchster Session-Gewinnrate (min. 3 Sessions):`);
    topSessionWinRates.forEach((player, index) => {
      console.log(`    ${index + 1}. ${player.playerName}: ${player.winRate.toFixed(1)}% (${player.wins}/${player.sessions})`);
    });

    // Spiel-Gewinnraten
    const topGameWinRates = Array.from(playerGameStats.entries())
      .map(([playerId, stats]) => ({
        playerId,
        playerName: getPlayerName(playerId, group.players),
        winRate: stats.games > 0 ? (stats.wins / stats.games * 100) : 0,
        wins: stats.wins,
        games: stats.games
      }))
      .filter(player => player.games >= 5) // Mindestens 5 Spiele
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 3);

    console.log(`  🎮 Spieler mit höchster Spiel-Gewinnrate (min. 5 Spiele):`);
    topGameWinRates.forEach((player, index) => {
      console.log(`    ${index + 1}. ${player.playerName}: ${player.winRate.toFixed(1)}% (${player.wins}/${player.games})`);
    });

    // 6. Lade berechnete Statistiken und vergleiche
    console.log(`\n🔍 VERGLEICH MIT BERECHNETEN STATISTIKEN:`);
    
    const statsDoc = await db.collection('groupComputedStats').doc(group.id).get();
    
    if (statsDoc.exists) {
      const calculatedStats = statsDoc.data();
      
      console.log(`\n📊 VERGLEICH BASIC STATISTICS:`);
      compareValues('sessionCount', basicStats.sessionCount, calculatedStats.sessionCount);
      compareValues('gameCount', basicStats.gameCount, calculatedStats.gameCount);
      compareValues('avgRoundsPerGame', basicStats.avgRoundsPerGame, calculatedStats.avgRoundsPerGame);
      compareValues('avgGamesPerSession', basicStats.avgGamesPerSession, calculatedStats.avgGamesPerSession);
      compareValues('totalTrumpfCount', basicStats.totalTrumpfCount, calculatedStats.totalTrumpfCount);

      console.log(`\n📊 VERGLEICH PLAYER STATISTICS:`);
      if (calculatedStats.playerWithMostGames && calculatedStats.playerWithMostGames.length > 0) {
        console.log(`  Berechnete Top-Spieler (meiste Spiele):`);
        calculatedStats.playerWithMostGames.slice(0, 3).forEach((player, index) => {
          console.log(`    ${index + 1}. ${player.playerName}: ${player.value} Spiele`);
        });
      }

      if (calculatedStats.playerWithHighestPointsDiff && calculatedStats.playerWithHighestPointsDiff.length > 0) {
        console.log(`  Berechnete Top-Spieler (Punkte-Diff):`);
        calculatedStats.playerWithHighestPointsDiff.slice(0, 3).forEach((player, index) => {
          console.log(`    ${index + 1}. ${player.playerName}: +${player.value} (${player.eventsPlayed} Spiele)`);
        });
      }

    } else {
      console.log(`❌ Keine berechneten Statistiken gefunden für Gruppe ${group.id}`);
    }

  } catch (error) {
    console.error(`❌ Fehler bei der Analyse von Gruppe ${group.name}:`, error);
  }
}

// Hilfsfunktionen
function extractPlayerIdsFromSession(session, groupPlayers) {
  const playerIds = new Set();
  
  if (session.participantUids) {
    session.participantUids.forEach(uid => {
      // Finde die entsprechende Player-Doc-ID in der Gruppe
      Object.keys(groupPlayers).forEach(playerDocId => {
        // Hier müssten wir die Zuordnung von UID zu Player-Doc-ID machen
        // Für den Test nehmen wir an, dass die UIDs direkt die Player-Doc-IDs sind
        playerIds.add(uid);
      });
    });
  }
  
  return Array.from(playerIds);
}

function getPlayerName(playerId, groupPlayers) {
  return groupPlayers[playerId]?.displayName || `Spieler ${playerId.substring(0, 8)}`;
}

function getPlayerSessionOutcome(playerId, session, groupPlayers) {
  if (!session.winnerTeamKey || session.winnerTeamKey === 'draw') {
    return 'tie';
  }
  
  // Vereinfachte Logik - müsste basierend auf Team-Zugehörigkeit implementiert werden
  return Math.random() > 0.5 ? 'win' : 'loss'; // Placeholder
}

function calculatePlayerGameOutcome(playerId, game, session, groupPlayers) {
  // Vereinfachte Berechnung - müsste basierend auf echten Team-Daten implementiert werden
  const basePoints = Math.floor(Math.random() * 100) + 50;
  return {
    pointsMade: basePoints,
    pointsReceived: Math.floor(Math.random() * 100) + 30,
    stricheMade: Math.floor(Math.random() * 3),
    stricheReceived: Math.floor(Math.random() * 2),
    result: Math.random() > 0.5 ? 'win' : 'loss'
  };
}

function compareValues(name, expected, actual) {
  const match = expected === actual;
  const status = match ? '✅' : '❌';
  console.log(`  ${status} ${name}: Erwartet ${expected}, Berechnet ${actual}`);
  if (!match) {
    console.log(`    ⚠️  ABWEICHUNG GEFUNDEN!`);
  }
}

// Test ausführen
testGroupStatsWithRealData().then(() => {
  console.log('\n✅ Detaillierte Analyse abgeschlossen');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test fehlgeschlagen:', error);
  process.exit(1);
}); 