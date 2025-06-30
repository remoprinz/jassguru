const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function analyzeJune26Games() {
  console.log('🔍 Analyzing games from June 26, 2025...');
  
  try {
    // Zuerst finden wir die Spieler-IDs für Marc, Claudia, Roger, Frank
    console.log('\n1️⃣ Finding player IDs...');
    const playersRef = db.collection('players');
    const playersSnap = await playersRef.get();
    
    const targetPlayers = {};
    const targetNames = ['Marc', 'Claudia', 'Roger', 'Frank'];
    
    playersSnap.forEach(doc => {
      const playerData = doc.data();
      const playerName = playerData.name || playerData.displayName;
      
      if (playerName && targetNames.some(name => 
        playerName.toLowerCase().includes(name.toLowerCase())
      )) {
        targetPlayers[playerName] = {
          id: doc.id,
          ...playerData
        };
        console.log(`   ✅ Found ${playerName}: ${doc.id}`);
      }
    });
    
    console.log('\n📋 Target players:', targetPlayers);
    const playerIds = Object.values(targetPlayers).map(p => p.id);
    
    // Analysiere Sessions vom 26. Juni 2025
    console.log('\n2️⃣ Analyzing sessions from June 26, 2025...');
    const sessionsRef = db.collection('sessions');
    const sessionsSnap = await sessionsRef.get();
    
    const june26Sessions = [];
    
    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      const sessionDate = sessionData.createdAt?.toDate() || sessionData.startedAt?.toDate();
      
      if (sessionDate) {
        const sessionDateStr = sessionDate.toLocaleDateString('de-DE');
        // Suche nach 26.06.2025 oder 26.6.2025
        if (sessionDateStr.includes('26.06.2025') || sessionDateStr.includes('26.6.2025') || 
            (sessionDate.getDate() === 26 && sessionDate.getMonth() === 5 && sessionDate.getFullYear() === 2025)) {
          
          // Prüfe ob unsere Ziel-Spieler beteiligt sind
          const participantIds = sessionData.participantPlayerIds || [];
          const hasTargetPlayers = participantIds.some(id => playerIds.includes(id));
          
          if (hasTargetPlayers) {
            // Lade completed games für diese Session
            const completedGamesSnap = await sessionDoc.ref.collection('completedGames').get();
            
            june26Sessions.push({
              id: sessionDoc.id,
              data: sessionData,
              completedGames: completedGamesSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              })),
              participantCount: participantIds.length,
              targetPlayersCount: participantIds.filter(id => playerIds.includes(id)).length
            });
            
            console.log(`   ✅ Found session ${sessionDoc.id}:`);
            console.log(`      Date: ${sessionDateStr}`);
            console.log(`      Status: ${sessionData.status}`);
            console.log(`      Participants: ${participantIds.length}`);
            console.log(`      Target players: ${participantIds.filter(id => playerIds.includes(id)).length}`);
            console.log(`      Completed games: ${completedGamesSnap.size}`);
          }
        }
      }
    }
    
    // Analysiere activeGames vom 26. Juni 2025
    console.log('\n3️⃣ Analyzing active games from June 26, 2025...');
    const activeGamesRef = db.collection('activeGames');
    const activeGamesSnap = await activeGamesRef.get();
    
    const june26ActiveGames = [];
    
    for (const gameDoc of activeGamesSnap.docs) {
      const gameData = gameDoc.data();
      const gameDate = gameData.createdAt?.toDate() || gameData.startedAt?.toDate();
      
      if (gameDate) {
        const gameDateStr = gameDate.toLocaleDateString('de-DE');
        
        if (gameDateStr.includes('26.06.2025') || gameDateStr.includes('26.6.2025') || 
            (gameDate.getDate() === 26 && gameDate.getMonth() === 5 && gameDate.getFullYear() === 2025)) {
          
          // Prüfe Spieler-Namen oder IDs
          const playerNames = Object.values(gameData.playerNames || {});
          const hasTargetPlayers = playerNames.some(name => 
            targetNames.some(targetName => 
              name && name.toLowerCase().includes(targetName.toLowerCase())
            )
          );
          
          if (hasTargetPlayers) {
            june26ActiveGames.push({
              id: gameDoc.id,
              data: gameData,
              createdAt: gameDate
            });
            
            console.log(`   ✅ Found active game ${gameDoc.id}:`);
            console.log(`      Date: ${gameDateStr} ${gameDate.toLocaleTimeString('de-DE')}`);
            console.log(`      Status: ${gameData.status}`);
            console.log(`      Players: ${JSON.stringify(gameData.playerNames)}`);
            console.log(`      Current scores: ${JSON.stringify(gameData.currentScores)}`);
            if (gameData.finalScores) {
              console.log(`      Final scores: ${JSON.stringify(gameData.finalScores)}`);
            }
          }
        }
      }
    }
    
    // Sortiere activeGames nach Erstellungszeit
    june26ActiveGames.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    console.log('\n4️⃣ SUMMARY:');
    console.log(`   Sessions found: ${june26Sessions.length}`);
    console.log(`   Active games found: ${june26ActiveGames.length}`);
    
    if (june26Sessions.length > 0) {
      console.log('\n📋 SESSION DETAILS:');
      june26Sessions.forEach((session, index) => {
        console.log(`   Session ${index + 1}: ${session.id}`);
        console.log(`      Status: ${session.data.status}`);
        console.log(`      Completed games: ${session.completedGames.length}`);
        
        session.completedGames.forEach((game, gameIndex) => {
          console.log(`        Game ${gameIndex + 1} (${game.gameNumber || 'unknown'}):`);
          console.log(`          Final scores: ${JSON.stringify(game.finalScores)}`);
          console.log(`          Winner: ${game.winnerTeamKey}`);
        });
      });
    }
    
    if (june26ActiveGames.length > 0) {
      console.log('\n🎮 ACTIVE GAMES TIMELINE:');
      june26ActiveGames.forEach((game, index) => {
        console.log(`   Game ${index + 1}: ${game.id}`);
        console.log(`      Time: ${game.createdAt.toLocaleTimeString('de-DE')}`);
        console.log(`      Status: ${game.data.status}`);
        console.log(`      Players: ${JSON.stringify(game.data.playerNames)}`);
        if (game.data.finalScores) {
          console.log(`      Final scores: ${JSON.stringify(game.data.finalScores)}`);
        }
        console.log('');
      });
    }
    
    // Analysiere mögliche Zusammenhänge
    console.log('\n5️⃣ ANALYSIS:');
    
    if (june26ActiveGames.length === 4) {
      console.log('   ✅ Found exactly 4 active games - matches expected count!');
      
      // Prüfe, ob sie zu Sessions gehören
      const sessionIds = new Set();
      june26ActiveGames.forEach(game => {
        if (game.data.sessionId) {
          sessionIds.add(game.data.sessionId);
        }
      });
      
      console.log(`   Session IDs referenced in games: ${Array.from(sessionIds).join(', ')}`);
      
      if (sessionIds.size > 1) {
        console.log('   ⚠️  Games are split across multiple sessions!');
        console.log('   🔧 We need to create a single summary session.');
      }
    }
    
    // Berechne Gesamtergebnis wenn möglich
    if (june26ActiveGames.length >= 4) {
      console.log('\n6️⃣ CALCULATING TOTAL SCORES:');
      
      let totalBottom = 0;
      let totalTop = 0;
      
      june26ActiveGames.forEach((game, index) => {
        if (game.data.finalScores) {
          const bottom = game.data.finalScores.bottom || 0;
          const top = game.data.finalScores.top || 0;
          
          totalBottom += bottom;
          totalTop += top;
          
          console.log(`   Game ${index + 1}: Bottom ${bottom}, Top ${top}`);
        }
      });
      
      console.log(`   TOTAL: Bottom ${totalBottom}, Top ${totalTop}`);
      console.log(`   Expected: 9:7 for Claudia and Frank`);
      
      if ((totalBottom === 9 && totalTop === 7) || (totalBottom === 7 && totalTop === 9)) {
        console.log('   ✅ Total matches expected result!');
      } else {
        console.log('   ⚠️  Total does not match expected 9:7 - need to investigate individual games');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

analyzeJune26Games()
  .then(() => {
    console.log('\n✅ Analysis completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }); 