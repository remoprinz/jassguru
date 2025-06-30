const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function debugCollections() {
  console.log('🔍 Debugging collection structure...');
  
  const gameId = 'McwZp97kiOhAJXwhEFAh'; // First game
  console.log(`\n📋 Debugging game: ${gameId}`);
  
  try {
    const gameRef = db.collection('activeGames').doc(gameId);
    const gameSnap = await gameRef.get();
    
    if (!gameSnap.exists) {
      console.log('❌ Game not found');
      return;
    }
    
    const gameData = gameSnap.data();
    console.log('Game data keys:', Object.keys(gameData));
    
    // Check all possible subcollections
    const possibleSubcollections = ['rounds', 'gameRounds', 'sessions', 'history', 'moves'];
    
    for (const subCollection of possibleSubcollections) {
      try {
        const subRef = gameRef.collection(subCollection);
        const subSnap = await subRef.get();
        console.log(`   ${subCollection}: ${subSnap.size} documents`);
        
        if (subSnap.size > 0) {
          // Show first few documents
          subSnap.docs.slice(0, 3).forEach((doc, index) => {
            console.log(`      Document ${index + 1} (${doc.id}):`, Object.keys(doc.data()));
          });
        }
      } catch (error) {
        console.log(`   ${subCollection}: Error - ${error.message}`);
      }
    }
    
    // Check if rounds data is directly in the game document
    if (gameData.rounds) {
      console.log('   Rounds in main document:', Array.isArray(gameData.rounds) ? gameData.rounds.length : 'Object');
    }
    
    if (gameData.gameState) {
      console.log('   Game state exists:', Object.keys(gameData.gameState));
    }
    
    // Try to get rounds without orderBy
    try {
      const roundsRef = gameRef.collection('rounds');
      const roundsSnap = await roundsRef.get();
      console.log(`\n📋 Rounds collection (no orderBy): ${roundsSnap.size} documents`);
      
      if (roundsSnap.size > 0) {
        roundsSnap.docs.forEach((doc, index) => {
          const roundData = doc.data();
          console.log(`   Round ${index + 1} (${doc.id}):`);
          console.log(`      Keys: ${Object.keys(roundData).join(', ')}`);
          console.log(`      Round scores: ${JSON.stringify(roundData.roundScores)}`);
          console.log(`      Round striche: ${JSON.stringify(roundData.roundStriche)}`);
          console.log(`      Created: ${roundData.createdAt?.toDate()}`);
        });
      }
    } catch (error) {
      console.log('❌ Error getting rounds:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  // Also check all games quickly
  console.log('\n🎮 Quick check of all 4 games:');
  const gameIds = [
    'McwZp97kiOhAJXwhEFAh',
    'b6WgosKliW94lXKnPIM7', 
    'zGrHNzF6EE05kKtnzu0b',
    'e7O072Iy9vSHuO0cZZKF'
  ];
  
  for (const gameId of gameIds) {
    try {
      const gameRef = db.collection('activeGames').doc(gameId);
      const roundsSnap = await gameRef.collection('rounds').get();
      console.log(`   ${gameId}: ${roundsSnap.size} rounds`);
    } catch (error) {
      console.log(`   ${gameId}: Error - ${error.message}`);
    }
  }
}

debugCollections()
  .then(() => {
    console.log('\n✅ Debug completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  }); 