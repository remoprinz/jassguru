const admin = require('firebase-admin');
const path = require('path');

// Initialisiere Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

/**
 * Prüft ob eine Zahl ein Vielfaches von 10 ist
 */
function isMultipleOf10(value) {
  if (typeof value !== 'number') return false;
  return value % 10 === 0;
}

/**
 * Prüft Weis-Punkte in einem Game
 */
function checkGameWeisPoints(gameData, gameId, context) {
  const issues = [];
  
  // Prüfe weisPoints (Session-Level)
  if (gameData.weisPoints) {
    if (gameData.weisPoints.top !== undefined && !isMultipleOf10(gameData.weisPoints.top)) {
      issues.push({
        type: 'weisPoints.top',
        value: gameData.weisPoints.top,
        context: context
      });
    }
    if (gameData.weisPoints.bottom !== undefined && !isMultipleOf10(gameData.weisPoints.bottom)) {
      issues.push({
        type: 'weisPoints.bottom',
        value: gameData.weisPoints.bottom,
        context: context
      });
    }
  }
  
  // Prüfe playerDetails (Tournament-Level)
  if (gameData.playerDetails && Array.isArray(gameData.playerDetails)) {
    gameData.playerDetails.forEach((playerDetail, idx) => {
      if (playerDetail.weisPoints !== undefined && !isMultipleOf10(playerDetail.weisPoints)) {
        issues.push({
          type: 'playerDetails.weisPoints',
          playerId: playerDetail.playerId || playerDetail.uid || `player_${idx}`,
          value: playerDetail.weisPoints,
          context: context
        });
      }
      // Prüfe auch weisInPasse falls vorhanden
      if (playerDetail.weisInPasse !== undefined && !isMultipleOf10(playerDetail.weisInPasse)) {
        issues.push({
          type: 'playerDetails.weisInPasse',
          playerId: playerDetail.playerId || playerDetail.uid || `player_${idx}`,
          value: playerDetail.weisInPasse,
          context: context
        });
      }
    });
  }
  
  return issues;
}

async function checkAllGames() {
  console.log('\n🔍 Starte Prüfung aller Weis-Punkte auf 10er-Schritte...\n');
  
  const stats = {
    totalGroups: 0,
    totalSessions: 0,
    totalSessionGames: 0,
    totalTournaments: 0,
    totalTournamentGames: 0,
    issuesFound: [],
    gamesWithIssues: new Set(),
    issueCount: 0
  };
  
  try {
    // 1. Prüfe alle Gruppen und deren Sessions
    console.log('📊 Prüfe Regular Sessions...');
    const groupsSnapshot = await db.collection('groups').get();
    stats.totalGroups = groupsSnapshot.size;
    
    for (const groupDoc of groupsSnapshot.docs) {
      const groupId = groupDoc.id;
      const sessionsSnapshot = await db
        .collection(`groups/${groupId}/jassGameSummaries`)
        .get();
      
      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionId = sessionDoc.id;
        const sessionData = sessionDoc.data();
        
        // Überspringe Turniere (werden separat geprüft)
        if (sessionData.isTournamentSession || sessionData.tournamentId) {
          continue;
        }
        
        stats.totalSessions++;
        
        // Lade completedGames ZUERST für detaillierte Analyse
        const completedGamesSnapshot = await db
          .collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
          .get();
        
        // Sammle Weis-Punkte aus allen Games
        let totalWeisTopFromGames = 0;
        let totalWeisBottomFromGames = 0;
        const gameDetails = [];
        
        for (const gameDoc of completedGamesSnapshot.docs) {
          const gameNumber = gameDoc.id;
          const gameData = gameDoc.data();
          stats.totalSessionGames++;
          
          const gameWeisTop = gameData.weisPoints?.top || 0;
          const gameWeisBottom = gameData.weisPoints?.bottom || 0;
          
          totalWeisTopFromGames += gameWeisTop;
          totalWeisBottomFromGames += gameWeisBottom;
          
          gameDetails.push({
            gameNumber: gameNumber,
            weisTop: gameWeisTop,
            weisBottom: gameWeisBottom,
            hasIssue: !isMultipleOf10(gameWeisTop) || !isMultipleOf10(gameWeisBottom)
          });
          
          // Prüfe einzelne Games
          const context = `Group: ${groupId}, Session: ${sessionId}, Game: ${gameNumber}`;
          const issues = checkGameWeisPoints(gameData, gameDoc.id, context);
          
          if (issues.length > 0) {
            stats.gamesWithIssues.add(`${groupId}/${sessionId}/${gameNumber}`);
            stats.issueCount += issues.length;
            stats.issuesFound.push({
              gameId: `${groupId}/${sessionId}/${gameNumber}`,
              context: context,
              issues: issues,
              gameDetails: {
                weisTop: gameWeisTop,
                weisBottom: gameWeisBottom
              }
            });
          }
        }
        
        // ✅ NEU: Prüfe sessionTotalWeisPoints im Session-Summary und vergleiche mit Game-Summen
        if (sessionData.sessionTotalWeisPoints) {
          const sessionWeisTop = sessionData.sessionTotalWeisPoints.top || 0;
          const sessionWeisBottom = sessionData.sessionTotalWeisPoints.bottom || 0;
          
          const context = `Group: ${groupId}, Session: ${sessionId} (Summary-Level)`;
          const sessionIssues = [];
          const detailedAnalysis = {
            sessionWeisTop: sessionWeisTop,
            sessionWeisBottom: sessionWeisBottom,
            sumFromGamesTop: totalWeisTopFromGames,
            sumFromGamesBottom: totalWeisBottomFromGames,
            games: gameDetails,
            gamesCount: completedGamesSnapshot.size
          };
          
          if (sessionWeisTop !== undefined && !isMultipleOf10(sessionWeisTop)) {
            sessionIssues.push({
              type: 'sessionTotalWeisPoints.top',
              value: sessionWeisTop,
              context: context,
              sumFromGames: totalWeisTopFromGames,
              difference: sessionWeisTop - totalWeisTopFromGames
            });
          }
          if (sessionWeisBottom !== undefined && !isMultipleOf10(sessionWeisBottom)) {
            sessionIssues.push({
              type: 'sessionTotalWeisPoints.bottom',
              value: sessionWeisBottom,
              context: context,
              sumFromGames: totalWeisBottomFromGames,
              difference: sessionWeisBottom - totalWeisBottomFromGames
            });
          }
          
          if (sessionIssues.length > 0) {
            stats.issueCount += sessionIssues.length;
            stats.issuesFound.push({
              gameId: `${groupId}/${sessionId}/summary`,
              context: context,
              issues: sessionIssues,
              detailedAnalysis: detailedAnalysis
            });
          }
        }
      }
    }
    
    // 2. Prüfe alle Turniere
    console.log('🏆 Prüfe Tournament Games...');
    const tournamentsSnapshot = await db.collection('tournaments').get();
    stats.totalTournaments = tournamentsSnapshot.size;
    
    for (const tournamentDoc of tournamentsSnapshot.docs) {
      const tournamentId = tournamentDoc.id;
      const tournamentData = tournamentDoc.data();
      
      // Lade alle Games des Turniers
      const gamesSnapshot = await db
        .collection(`tournaments/${tournamentId}/games`)
        .get();
      
      for (const gameDoc of gamesSnapshot.docs) {
        const gameId = gameDoc.id;
        const gameData = gameDoc.data();
        stats.totalTournamentGames++;
        
        const context = `Tournament: ${tournamentId} (${tournamentData.name || 'Unbekannt'}), Game: ${gameId}`;
        const issues = checkGameWeisPoints(gameData, gameId, context);
        
        if (issues.length > 0) {
          stats.gamesWithIssues.add(`tournament/${tournamentId}/${gameId}`);
          stats.issueCount += issues.length;
          stats.issuesFound.push({
            gameId: `tournament/${tournamentId}/${gameId}`,
            context: context,
            issues: issues
          });
        }
      }
    }
    
    // 3. Prüfe aggregierte Weis-Punkte in groupStats (für Rankings)
    console.log('📈 Prüfe aggregierte Weis-Punkte in Rankings...');
    const playerWeisTotals = new Map(); // playerId -> { made: number, received: number }
    
    for (const groupDoc of groupsSnapshot.docs) {
      const groupId = groupDoc.id;
      const sessionsSnapshot = await db
        .collection(`groups/${groupId}/jassGameSummaries`)
        .get();
      
      // Sammle Weis-Punkte pro Spieler aus allen Sessions
      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionData = sessionDoc.data();
        
        // Überspringe Turniere (werden separat geprüft)
        if (sessionData.isTournamentSession || sessionData.tournamentId) {
          continue;
        }
        
        if (!sessionData.sessionTotalWeisPoints || !sessionData.teams) {
          continue;
        }
        
        // Finde Spieler in Top-Team
        if (sessionData.teams.top && sessionData.teams.top.players) {
          sessionData.teams.top.players.forEach(player => {
            const playerId = player.playerId;
            if (!playerWeisTotals.has(playerId)) {
              playerWeisTotals.set(playerId, { made: 0, received: 0 });
            }
            const totals = playerWeisTotals.get(playerId);
            totals.made += sessionData.sessionTotalWeisPoints.top || 0;
            totals.received += sessionData.sessionTotalWeisPoints.bottom || 0;
          });
        }
        
        // Finde Spieler in Bottom-Team
        if (sessionData.teams.bottom && sessionData.teams.bottom.players) {
          sessionData.teams.bottom.players.forEach(player => {
            const playerId = player.playerId;
            if (!playerWeisTotals.has(playerId)) {
              playerWeisTotals.set(playerId, { made: 0, received: 0 });
            }
            const totals = playerWeisTotals.get(playerId);
            totals.made += sessionData.sessionTotalWeisPoints.bottom || 0;
            totals.received += sessionData.sessionTotalWeisPoints.top || 0;
          });
        }
      }
    }
    
    // Lade Spielernamen für bessere Ausgabe
    const playerNames = new Map();
    for (const playerId of playerWeisTotals.keys()) {
      try {
        const playerDoc = await db.collection('players').doc(playerId).get();
        if (playerDoc.exists) {
          playerNames.set(playerId, playerDoc.data().displayName || playerId);
        } else {
          playerNames.set(playerId, playerId);
        }
      } catch (e) {
        playerNames.set(playerId, playerId);
      }
    }
    
    // Prüfe aggregierte Werte
    const playerIssues = [];
    for (const [playerId, totals] of playerWeisTotals.entries()) {
      const playerName = playerNames.get(playerId) || playerId;
      if (!isMultipleOf10(totals.made)) {
        playerIssues.push({
          playerId: playerId,
          playerName: playerName,
          type: 'aggregated.made',
          value: totals.made,
          context: `Spieler ${playerName} (${playerId}) - aggregiert aus allen Sessions`
        });
      }
      if (!isMultipleOf10(totals.received)) {
        playerIssues.push({
          playerId: playerId,
          playerName: playerName,
          type: 'aggregated.received',
          value: totals.received,
          context: `Spieler ${playerName} (${playerId}) - aggregiert aus allen Sessions`
        });
      }
    }
    
    if (playerIssues.length > 0) {
      stats.issueCount += playerIssues.length;
      stats.issuesFound.push({
        gameId: 'aggregated-player-totals',
        context: 'Aggregierte Weis-Punkte pro Spieler',
        issues: playerIssues
      });
    }
    
    // 4. Ausgabe der Ergebnisse
    console.log('\n' + '='.repeat(80));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(80));
    console.log(`\nGruppen geprüft: ${stats.totalGroups}`);
    console.log(`Regular Sessions geprüft: ${stats.totalSessions}`);
    console.log(`Session Games geprüft: ${stats.totalSessionGames}`);
    console.log(`Turniere geprüft: ${stats.totalTournaments}`);
    console.log(`Tournament Games geprüft: ${stats.totalTournamentGames}`);
    console.log(`\n⚠️  PROBLEME GEFUNDEN:`);
    console.log(`   Spiele mit nicht-10er Weis-Punkten: ${stats.gamesWithIssues.size}`);
    console.log(`   Gesamtanzahl Probleme: ${stats.issueCount}`);
    
    if (stats.issuesFound.length > 0) {
      console.log(`\n📋 DETAILLIERTE PROBLEMLISTE:`);
      console.log('-'.repeat(80));
      
      // Trenne Session-Summary-Probleme von Game-Problemen
      const sessionSummaryIssues = stats.issuesFound.filter(item => item.gameId.includes('/summary'));
      const gameIssues = stats.issuesFound.filter(item => !item.gameId.includes('/summary') && !item.gameId.includes('aggregated'));
      const aggregatedIssues = stats.issuesFound.filter(item => item.gameId.includes('aggregated'));
      
      // Zeige Session-Summary-Probleme mit detaillierter Analyse
      if (sessionSummaryIssues.length > 0) {
        console.log(`\n🔍 SESSION-SUMMARY-PROBLEME (${sessionSummaryIssues.length}):`);
        sessionSummaryIssues.forEach((item, idx) => {
          console.log(`\n${idx + 1}. ${item.context}`);
          item.issues.forEach(issue => {
            console.log(`   ❌ ${issue.type}: ${issue.value} (sollte Vielfaches von 10 sein)`);
            if (issue.sumFromGames !== undefined) {
              console.log(`      Summe aus allen Games: ${issue.sumFromGames}`);
              console.log(`      Differenz: ${issue.difference > 0 ? '+' : ''}${issue.difference}`);
            }
          });
          
          if (item.detailedAnalysis) {
            const analysis = item.detailedAnalysis;
            console.log(`\n   📊 DETAILLIERTE ANALYSE:`);
            console.log(`      Anzahl Games: ${analysis.gamesCount}`);
            console.log(`      Session-Summe Top: ${analysis.sessionWeisTop}`);
            console.log(`      Summe aus Games Top: ${analysis.sumFromGamesTop}`);
            console.log(`      Session-Summe Bottom: ${analysis.sessionWeisBottom}`);
            console.log(`      Summe aus Games Bottom: ${analysis.sumFromGamesBottom}`);
            
            const problematicGames = analysis.games.filter(g => g.hasIssue);
            if (problematicGames.length > 0) {
              console.log(`\n   ⚠️  PROBLEMATISCHE GAMES:`);
              problematicGames.forEach(game => {
                const topIssue = !isMultipleOf10(game.weisTop) ? ` ❌` : '';
                const bottomIssue = !isMultipleOf10(game.weisBottom) ? ` ❌` : '';
                console.log(`      Game ${game.gameNumber}: Top=${game.weisTop}${topIssue}, Bottom=${game.weisBottom}${bottomIssue}`);
              });
            } else {
              console.log(`\n   ✅ Alle einzelnen Games haben korrekte 10er-Werte`);
              console.log(`   ⚠️  Problem liegt in der Session-Summe (möglicherweise falsche Aggregation)`);
            }
          }
        });
      }
      
      // Zeige Game-Probleme
      if (gameIssues.length > 0) {
        console.log(`\n\n🎮 EINZELNE GAME-PROBLEME (${gameIssues.length}):`);
        gameIssues.forEach((item, idx) => {
          console.log(`\n${idx + 1}. ${item.context}`);
          item.issues.forEach(issue => {
            console.log(`   - ${issue.type}: ${issue.value} (sollte Vielfaches von 10 sein)`);
          });
          if (item.gameDetails) {
            console.log(`     Game Details: Top=${item.gameDetails.weisTop}, Bottom=${item.gameDetails.weisBottom}`);
          }
        });
      }
      
      // Zeige aggregierte Probleme
      if (aggregatedIssues.length > 0) {
        console.log(`\n\n📈 AGGREGIERTE SPIELER-PROBLEME (${aggregatedIssues.length}):`);
        aggregatedIssues.forEach((item, idx) => {
          console.log(`\n${idx + 1}. ${item.context}`);
          item.issues.forEach(issue => {
            console.log(`   - ${issue.type}: ${issue.value} (sollte Vielfaches von 10 sein)`);
            if (issue.playerId) {
              const name = issue.playerName || issue.playerId;
              console.log(`     Spieler: ${name} (${issue.playerId})`);
            }
          });
        });
      }
      
      if (stats.issuesFound.length > 20) {
        console.log(`\n... und ${stats.issuesFound.length - 20} weitere Probleme`);
      }
      
      // Gruppiere nach Typ
      const issuesByType = {};
      stats.issuesFound.forEach(item => {
        item.issues.forEach(issue => {
          if (!issuesByType[issue.type]) {
            issuesByType[issue.type] = 0;
          }
          issuesByType[issue.type]++;
        });
      });
      
      console.log(`\n📊 PROBLEME NACH TYP:`);
      Object.entries(issuesByType).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });
    } else {
      console.log('\n✅ KEINE PROBLEME GEFUNDEN! Alle Weis-Punkte sind Vielfache von 10.');
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fehler beim Prüfen:', error);
    process.exit(1);
  }
}

// Führe die Prüfung aus
checkAllGames();

