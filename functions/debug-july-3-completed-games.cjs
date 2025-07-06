const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBmvHu1pNzTLJhLWF2KdmJuXlPUJqKrxUo",
  authDomain: "jassguru-7a213.firebaseapp.com",
  projectId: "jassguru-7a213",
  storageBucket: "jassguru-7a213.appspot.com",
  messagingSenderId: "266239362897",
  appId: "1:266239362897:web:e0b8b7d8a9d9a8b5dc6c6f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function debugJuly3CompletedGames() {
  console.log('🔍 Debugging Juli 3. Session CompletedGameSummary-Dokumente...');
  
  const sessionId = 'GvshcbgPDCtbhCeqHApvk';
  const gameIds = ['BddFeTmedf7hipTcMcGk', 'viQQv1biZzrahe1iQ4Cd', 'KqErTLHxrfe5IMQKAGTW'];
  
  for (const gameId of gameIds) {
    console.log(`\n=== GAME ${gameId} ===`);
    
    try {
      const gameRef = doc(db, 'jassGameSummaries', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (gameDoc.exists()) {
        const gameData = gameDoc.data();
        console.log('✅ Game existiert in jassGameSummaries');
        console.log('📊 Wichtige Felder:');
        console.log('- sessionId:', gameData.sessionId);
        console.log('- finalScores:', gameData.finalScores);
        console.log('- finalStriche:', gameData.finalStriche);
        console.log('- teams:', gameData.teams);
        console.log('- weisPoints:', gameData.weisPoints);
        console.log('- status:', gameData.status);
        console.log('- initialStartingPlayer:', gameData.initialStartingPlayer);
        
        // Deep dive in finalStriche
        if (gameData.finalStriche) {
          console.log('\n📋 finalStriche Details:');
          console.log('- top:', JSON.stringify(gameData.finalStriche.top, null, 2));
          console.log('- bottom:', JSON.stringify(gameData.finalStriche.bottom, null, 2));
        } else {
          console.log('❌ finalStriche fehlt!');
        }
        
        // Deep dive in teams
        if (gameData.teams) {
          console.log('\n👥 teams Details:');
          console.log('- top:', JSON.stringify(gameData.teams.top, null, 2));
          console.log('- bottom:', JSON.stringify(gameData.teams.bottom, null, 2));
        } else {
          console.log('❌ teams fehlt!');
        }
        
        // Check roundHistory length
        if (gameData.roundHistory) {
          console.log(`\n🔄 roundHistory: ${gameData.roundHistory.length} Runden`);
          console.log('- Erste Runde:', JSON.stringify(gameData.roundHistory[0], null, 2));
          console.log('- Letzte Runde:', JSON.stringify(gameData.roundHistory[gameData.roundHistory.length - 1], null, 2));
        } else {
          console.log('❌ roundHistory fehlt!');
        }
        
      } else {
        console.log('❌ Game existiert NICHT in jassGameSummaries');
      }
      
    } catch (error) {
      console.error('❌ Fehler beim Laden des Games:', error);
    }
  }
  
  // Check Session document
  console.log('\n=== SESSION DOCUMENT ===');
  try {
    const sessionRef = doc(db, 'jassSessions', sessionId);
    const sessionDoc = await getDoc(sessionRef);
    
    if (sessionDoc.exists()) {
      const sessionData = sessionDoc.data();
      console.log('✅ Session existiert');
      console.log('📊 Session-Felder:');
      console.log('- status:', sessionData.status);
      console.log('- gamesPlayed:', sessionData.gamesPlayed);
      console.log('- gameResults:', sessionData.gameResults);
      console.log('- participantIds:', sessionData.participantIds);
      console.log('- teams:', sessionData.teams);
      console.log('- completedGameIds:', sessionData.completedGameIds);
      
      if (sessionData.gameResults) {
        console.log('\n🎯 gameResults Details:');
        sessionData.gameResults.forEach((result, index) => {
          console.log(`Game ${index + 1}:`, JSON.stringify(result, null, 2));
        });
      }
      
    } else {
      console.log('❌ Session existiert NICHT');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Laden der Session:', error);
  }
  
  console.log('\n✅ Debug abgeschlossen');
}

debugJuly3CompletedGames().catch(console.error); 