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

// Simuliere die Calculator-Funktion durch direkten Import der TypeScript-Logik
// Da wir nicht direkt importieren können, implementieren wir die Kernlogik hier

async function testGroupStatsAccuracy() {
  console.log('🔍 AKRIBISCHE ÜBERPRÜFUNG DER GRUPPENSTATISTIK-GENAUIGKEIT');
  console.log('=' .repeat(80));

  try {
    // Alle Gruppen laden
    const groupsSnap = await db.collection('groups').get();
    
    if (groupsSnap.empty) {
      console.log('❌ Keine Gruppen gefunden. Starten Sie den Firebase Emulator mit Daten.');
      return;
    }

    console.log(`📊 Gefundene Gruppen: ${groupsSnap.docs.length}`);

    // Für jede Gruppe detaillierte Genauigkeitsprüfung
    for (const groupDoc of groupsSnap.docs) {
      const groupData = groupDoc.data();
      const groupInfo = {
        id: groupDoc.id,
        name: groupData.name || 'Unbenannte Gruppe',
        players: groupData.players || {},
        memberCount: Object.keys(groupData.players || {}).length
      };

      console.log(`\n  - ${groupInfo.name} (${groupInfo.id}): ${groupInfo.memberCount} Mitglieder`);
      
      await performAccuracyCheck(groupInfo);
    }

  } catch (error) {
    console.error('❌ Fehler beim Genauigkeitstest:', error);
  }
}

async function performAccuracyCheck(group) {
  console.log(`\n🎯 GENAUIGKEITSPRÜFUNG: ${group.name}`);
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

    console.log(`📊 ROHDATEN-SAMMLUNG:`);
    console.log(`  Sessions: ${sessionsSnap.docs.length}`);

    // 2. Sammle ALLE Rohdaten systematisch
    const rawData = await collectRawData(sessionsSnap, group);
    
    console.log(`  Spiele: ${rawData.allGames.length}`);
    console.log(`  Runden: ${rawData.totalRounds}`);
    console.log(`  Spieler-Aktivitäten: ${rawData.playerActivities.size}`);

    // 3. Berechne Statistiken manuell (Ground Truth)
    const manualStats = calculateManualStatistics(rawData, group);

    // 4. Lade berechnete Statistiken
    const statsDoc = await db.collection('groupComputedStats').doc(group.id).get();
    
    if (!statsDoc.exists) {
      console.log('❌ Keine berechneten Statistiken gefunden');
      console.log('📋 MANUELL BERECHNETE STATISTIKEN (Ground Truth):');
      displayManualStatistics(manualStats);
      return;
    }

    const calculatedStats = statsDoc.data();

    // 5. Detaillierter Vergleich
    console.log(`\n🔍 DETAILLIERTER GENAUIGKEITSVERGLEICH:`);
    
    await performDetailedComparison(manualStats, calculatedStats, rawData);

  } catch (error) {
    console.error(`❌ Fehler bei Genauigkeitsprüfung für ${group.name}:`, error);
  }
}

async function collectRawData(sessionsSnap, group) {
  const rawData = {
    allSessions: [],
    allGames: [],
    totalRounds: 0,
    totalTrumpfCount: 0,
    trumpfTypes: new Map(),
    playerActivities: new Map(),
    totalPlayTimeMillis: 0,
    timestamps: []
  };

  for (const sessionDoc of sessionsSnap.docs) {
    const sessionData = sessionDoc.data();
    
    // Session-Info sammeln
    const sessionInfo = {
      id: sessionDoc.id,
      startedAt: sessionData.startedAt,
      endedAt: sessionData.endedAt,
      gamesPlayed: sessionData.gamesPlayed || 0,
      finalScores: sessionData.finalScores,
      participantUids: sessionData.participantUids || [],
      teams: sessionData.teams,
      winnerTeamKey: sessionData.winnerTeamKey,
      teamScoreMapping: sessionData.teamScoreMapping,
      games: []
    };

    // Zeitstempel sammeln
    if (sessionData.startedAt) {
      const timestamp = sessionData.startedAt instanceof admin.firestore.Timestamp 
        ? sessionData.startedAt.toMillis() 
        : new Date(sessionData.startedAt).getTime();
      rawData.timestamps.push(timestamp);
    }

    // Alle Spiele dieser Session laden
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
            durationMillis: gameData.durationMillis || 0,
            sessionData: sessionData
          };

          // Spielzeit sammeln
          rawData.totalPlayTimeMillis += gameInfo.durationMillis;

          // Runden analysieren
          if (gameData.roundHistory && Array.isArray(gameData.roundHistory)) {
            rawData.totalRounds += gameData.roundHistory.length;
            
            gameData.roundHistory.forEach(round => {
              if (round.farbe) {
                rawData.totalTrumpfCount++;
                rawData.trumpfTypes.set(round.farbe, (rawData.trumpfTypes.get(round.farbe) || 0) + 1);
              }
            });
          }

          sessionInfo.games.push(gameInfo);
          rawData.allGames.push(gameInfo);

          // Spieler-Aktivitäten sammeln
          if (sessionData.participantUids) {
            sessionData.participantUids.forEach(uid => {
              if (!rawData.playerActivities.has(uid)) {
                rawData.playerActivities.set(uid, {
                  sessions: new Set(),
                  games: 0,
                  pointsMade: 0,
                  pointsReceived: 0,
                  stricheMade: 0,
                  stricheReceived: 0,
                  sessionWins: 0,
                  gameWins: 0,
                  lastActivity: null
                });
              }
              
              const activity = rawData.playerActivities.get(uid);
              activity.sessions.add(sessionDoc.id);
              activity.games++;
              
              if (sessionData.endedAt) {
                const endTime = sessionData.endedAt instanceof admin.firestore.Timestamp 
                  ? sessionData.endedAt 
                  : admin.firestore.Timestamp.fromDate(new Date(sessionData.endedAt));
                
                if (!activity.lastActivity || endTime.toMillis() > activity.lastActivity.toMillis()) {
                  activity.lastActivity = endTime;
                }
              }
            });
          }
        }
      } catch (gameError) {
        console.warn(`  ⚠️  Fehler beim Laden von Spiel ${gameNumber}:`, gameError.message);
      }
    }

    rawData.allSessions.push(sessionInfo);
  }

  return rawData;
}

function calculateManualStatistics(rawData, group) {
  const stats = {
    // BASIC STATISTICS
    groupId: group.id,
    memberCount: group.memberCount,
    sessionCount: rawData.allSessions.length,
    gameCount: rawData.allGames.length,
    totalPlayTimeSeconds: Math.round(rawData.totalPlayTimeMillis / 1000),
    totalRounds: rawData.totalRounds,
    totalTrumpfCount: rawData.totalTrumpfCount,
    
    // Durchschnittswerte
    avgRoundsPerGame: rawData.allGames.length > 0 ? 
      parseFloat((rawData.totalRounds / rawData.allGames.length).toFixed(1)) : 0,
    avgGamesPerSession: rawData.allSessions.length > 0 ? 
      parseFloat((rawData.allGames.length / rawData.allSessions.length).toFixed(1)) : 0,
    avgSessionDurationSeconds: rawData.allSessions.length > 0 ? 
      Math.round(rawData.totalPlayTimeMillis / rawData.allSessions.length / 1000) : 0,
    avgGameDurationSeconds: rawData.allGames.length > 0 ? 
      Math.round(rawData.totalPlayTimeMillis / rawData.allGames.length / 1000) : 0,

    // Zeitstempel
    firstJassTimestamp: rawData.timestamps.length > 0 ? 
      new Date(Math.min(...rawData.timestamps)).toLocaleDateString() : null,
    lastJassTimestamp: rawData.timestamps.length > 0 ? 
      new Date(Math.max(...rawData.timestamps)).toLocaleDateString() : null,

    // TRUMPF STATISTICS
    trumpfStatistik: Object.fromEntries(rawData.trumpfTypes),

    // PLAYER STATISTICS (vereinfacht für Test)
    activePlayersCount: rawData.playerActivities.size,
    playersWithData: Array.from(rawData.playerActivities.entries()).map(([uid, activity]) => ({
      uid,
      name: group.players[uid]?.displayName || `Spieler ${uid.substring(0, 8)}`,
      sessions: activity.sessions.size,
      games: activity.games,
      lastActivity: activity.lastActivity
    }))
  };

  return stats;
}

function displayManualStatistics(stats) {
  console.log(`\n📊 BASIC STATISTICS:`);
  console.log(`  groupId: ${stats.groupId}`);
  console.log(`  memberCount: ${stats.memberCount}`);
  console.log(`  sessionCount: ${stats.sessionCount}`);
  console.log(`  gameCount: ${stats.gameCount}`);
  console.log(`  totalRounds: ${stats.totalRounds}`);
  console.log(`  avgRoundsPerGame: ${stats.avgRoundsPerGame}`);
  console.log(`  avgGamesPerSession: ${stats.avgGamesPerSession}`);
  console.log(`  totalPlayTimeSeconds: ${stats.totalPlayTimeSeconds}`);
  console.log(`  avgSessionDurationSeconds: ${stats.avgSessionDurationSeconds}`);
  console.log(`  avgGameDurationSeconds: ${stats.avgGameDurationSeconds}`);
  console.log(`  firstJassTimestamp: ${stats.firstJassTimestamp}`);
  console.log(`  lastJassTimestamp: ${stats.lastJassTimestamp}`);

  console.log(`\n🃏 TRUMPF STATISTICS:`);
  console.log(`  totalTrumpfCount: ${stats.totalTrumpfCount}`);
  console.log(`  trumpfStatistik:`, stats.trumpfStatistik);

  console.log(`\n👥 PLAYER OVERVIEW:`);
  console.log(`  activePlayersCount: ${stats.activePlayersCount}`);
  stats.playersWithData.slice(0, 5).forEach((player, index) => {
    console.log(`    ${index + 1}. ${player.name}: ${player.games} Spiele, ${player.sessions} Sessions`);
  });
}

async function performDetailedComparison(manualStats, calculatedStats, rawData) {
  let totalChecks = 0;
  let passedChecks = 0;
  let criticalErrors = [];

  console.log(`\n📊 BASIC STATISTICS VERGLEICH:`);
  
  const basicChecks = [
    ['groupId', manualStats.groupId, calculatedStats.groupId],
    ['memberCount', manualStats.memberCount, calculatedStats.memberCount],
    ['sessionCount', manualStats.sessionCount, calculatedStats.sessionCount],
    ['gameCount', manualStats.gameCount, calculatedStats.gameCount],
    ['avgRoundsPerGame', manualStats.avgRoundsPerGame, calculatedStats.avgRoundsPerGame],
    ['avgGamesPerSession', manualStats.avgGamesPerSession, calculatedStats.avgGamesPerSession],
    ['totalPlayTimeSeconds', manualStats.totalPlayTimeSeconds, calculatedStats.totalPlayTimeSeconds],
    ['totalTrumpfCount', manualStats.totalTrumpfCount, calculatedStats.totalTrumpfCount]
  ];

  basicChecks.forEach(([name, expected, actual]) => {
    totalChecks++;
    const match = Math.abs(expected - actual) < 0.1; // Toleranz für Rundungsfehler
    const status = match ? '✅' : '❌';
    
    if (match) passedChecks++;
    else criticalErrors.push(`${name}: Erwartet ${expected}, Berechnet ${actual}`);
    
    console.log(`  ${status} ${name}: ${expected} vs ${actual}`);
  });

  console.log(`\n🃏 TRUMPF STATISTICS VERGLEICH:`);
  
  // Trumpf-Statistiken vergleichen
  totalChecks++;
  const trumpfMatch = JSON.stringify(manualStats.trumpfStatistik) === JSON.stringify(calculatedStats.trumpfStatistik);
  const trumpfStatus = trumpfMatch ? '✅' : '❌';
  
  if (trumpfMatch) passedChecks++;
  else criticalErrors.push('trumpfStatistik: Strukturelle Abweichung');
  
  console.log(`  ${trumpfStatus} trumpfStatistik: ${trumpfMatch ? 'Identisch' : 'Abweichung'}`);
  
  if (!trumpfMatch) {
    console.log(`    Erwartet:`, manualStats.trumpfStatistik);
    console.log(`    Berechnet:`, calculatedStats.trumpfStatistik);
  }

  console.log(`\n👥 PLAYER STATISTICS ÜBERPRÜFUNG:`);
  
  // Prüfe ob Spieler-Statistiken existieren und plausibel sind
  const playerStatsChecks = [
    'playerWithMostGames',
    'playerWithHighestPointsDiff',
    'playerWithHighestStricheDiff',
    'playerWithHighestWinRateSession',
    'playerWithHighestWinRateGame'
  ];

  playerStatsChecks.forEach(statName => {
    totalChecks++;
    const exists = calculatedStats[statName] !== undefined && calculatedStats[statName] !== null;
    const hasData = exists && Array.isArray(calculatedStats[statName]) && calculatedStats[statName].length > 0;
    
    if (exists && hasData) {
      passedChecks++;
      console.log(`  ✅ ${statName}: ${calculatedStats[statName].length} Einträge`);
      
      // Zeige Top 3
      calculatedStats[statName].slice(0, 3).forEach((entry, index) => {
        console.log(`    ${index + 1}. ${entry.playerName}: ${entry.value} ${entry.eventsPlayed ? `(${entry.eventsPlayed} Events)` : ''}`);
      });
    } else {
      criticalErrors.push(`${statName}: ${exists ? 'Leer' : 'Nicht vorhanden'}`);
      console.log(`  ❌ ${statName}: ${exists ? 'Leer' : 'Nicht vorhanden'}`);
    }
  });

  console.log(`\n🏆 TEAM STATISTICS ÜBERPRÜFUNG:`);
  
  const teamStatsChecks = [
    'teamWithHighestWinRateSession',
    'teamWithHighestWinRateGame',
    'teamWithHighestPointsDiff',
    'teamWithHighestStricheDiff'
  ];

  teamStatsChecks.forEach(statName => {
    totalChecks++;
    const exists = calculatedStats[statName] !== undefined && calculatedStats[statName] !== null;
    const hasData = exists && Array.isArray(calculatedStats[statName]) && calculatedStats[statName].length > 0;
    
    if (exists && hasData) {
      passedChecks++;
      console.log(`  ✅ ${statName}: ${calculatedStats[statName].length} Einträge`);
    } else {
      console.log(`  ⚪ ${statName}: ${exists ? 'Leer (normal bei wenig Daten)' : 'Nicht vorhanden'}`);
    }
  });

  // FINALE BEWERTUNG
  console.log(`\n🎯 GENAUIGKEITSBEWERTUNG:`);
  console.log(`  📊 Geprüfte Werte: ${totalChecks}`);
  console.log(`  ✅ Korrekte Werte: ${passedChecks}`);
  console.log(`  ❌ Fehlerhafte Werte: ${totalChecks - passedChecks}`);
  console.log(`  📈 Genauigkeit: ${Math.round(passedChecks / totalChecks * 100)}%`);

  if (criticalErrors.length > 0) {
    console.log(`\n❌ KRITISCHE FEHLER (${criticalErrors.length}):`);
    criticalErrors.forEach(error => {
      console.log(`  - ${error}`);
    });
  } else {
    console.log(`\n🎉 ALLE KRITISCHEN WERTE SIND KORREKT!`);
  }

  // Detaillierte Rohdaten-Ausgabe für Debugging
  console.log(`\n📋 ROHDATEN-ZUSAMMENFASSUNG:`);
  console.log(`  Sessions: ${rawData.allSessions.length}`);
  console.log(`  Spiele: ${rawData.allGames.length}`);
  console.log(`  Runden: ${rawData.totalRounds}`);
  console.log(`  Trumpf-Runden: ${rawData.totalTrumpfCount}`);
  console.log(`  Aktive Spieler: ${rawData.playerActivities.size}`);
  console.log(`  Gesamtspielzeit: ${Math.round(rawData.totalPlayTimeMillis / 1000 / 60)} Minuten`);
}

// Test ausführen
testGroupStatsAccuracy().then(() => {
  console.log('\n✅ Genauigkeitsprüfung abgeschlossen');
  process.exit(0);
}).catch(error => {
  console.error('❌ Genauigkeitsprüfung fehlgeschlagen:', error);
  process.exit(1);
}); 