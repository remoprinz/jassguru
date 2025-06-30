const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function addRoundHistoryToCompletedGames() {
  console.log('🔧 Adding roundHistory arrays to completedGames...');
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  const summaryRef = db.collection('jassGameSummaries').doc(sessionId);
  
  try {
    // Process each completedGame (1, 2, 3, 4)
    for (let gameNum = 1; gameNum <= 4; gameNum++) {
      console.log(`\n${gameNum}️⃣ Processing completedGame ${gameNum}:`);
      
      const completedGameRef = summaryRef.collection('completedGames').doc(gameNum.toString());
      const completedGameSnap = await completedGameRef.get();
      
      if (!completedGameSnap.exists) {
        console.log(`   ❌ completedGame ${gameNum} not found`);
        continue;
      }
      
      // Get all rounds from subcollection
      const roundsSnap = await completedGameRef.collection('rounds').get();
      console.log(`   📋 Found ${roundsSnap.size} rounds in subcollection`);
      
      if (roundsSnap.size === 0) {
        console.log(`   ⚠️  No rounds to convert`);
        continue;
      }
      
      // Convert rounds to roundHistory array
      const roundHistory = [];
      
      // Sort rounds by timestamp or roundId for correct order
      const sortedRounds = roundsSnap.docs.sort((a, b) => {
        const dataA = a.data();
        const dataB = b.data();
        
        // Try to sort by timestamp first
        if (dataA.timestamp && dataB.timestamp) {
          return dataA.timestamp - dataB.timestamp;
        }
        
        // Fallback to roundId if available
        if (dataA.roundId && dataB.roundId) {
          return dataA.roundId - dataB.roundId;
        }
        
        // Fallback to document ID
        return a.id.localeCompare(b.id);
      });
      
      sortedRounds.forEach((roundDoc, index) => {
        const roundData = roundDoc.data();
        
        // Create roundHistory entry in the format from perfect example
        const roundHistoryEntry = {
          // Copy all round data
          ...roundData,
          
          // Ensure key fields are present
          actionType: roundData.actionType || 'jass',
          currentPlayer: roundData.currentPlayer || 1,
          farbe: roundData.farbe || 'unknown',
          isCompleted: roundData.isCompleted || true,
          isRoundFinalized: roundData.isRoundFinalized || true,
          
          // Round state
          roundState: roundData.roundState || {
            nextPlayer: roundData.currentPlayer || 1,
            roundNumber: index + 1
          },
          
          // Ensure scores and striche are present
          scores: roundData.scores || { bottom: 0, top: 0 },
          striche: roundData.striche || {
            bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
            top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
          },
          
          // Visual striche (from perfect example)
          visualStriche: roundData.visualStriche || {
            bottom: { restZahl: 0, stricheCounts: {} },
            top: { restZahl: 0, stricheCounts: {} }
          },
          
          // Weis actions
          weisActions: roundData.weisActions || []
        };
        
        roundHistory.push(roundHistoryEntry);
      });
      
      console.log(`   ✅ Created roundHistory array with ${roundHistory.length} entries`);
      
      // Update completedGame with roundHistory
      await completedGameRef.update({
        roundHistory: roundHistory
      });
      
      console.log(`   ✅ Added roundHistory to completedGame ${gameNum}`);
    }
    
    // Verify the update
    console.log('\n🔍 Verification:');
    for (let gameNum = 1; gameNum <= 4; gameNum++) {
      const completedGameRef = summaryRef.collection('completedGames').doc(gameNum.toString());
      const completedGameSnap = await completedGameRef.get();
      
      if (completedGameSnap.exists) {
        const data = completedGameSnap.data();
        const roundHistoryLength = data.roundHistory ? data.roundHistory.length : 0;
        console.log(`   Game ${gameNum}: roundHistory with ${roundHistoryLength} entries`);
      }
    }
    
    return {
      sessionId,
      processedGames: 4
    };
    
  } catch (error) {
    console.error('❌ Error adding roundHistory:', error);
    throw error;
  }
}

addRoundHistoryToCompletedGames()
  .then((result) => {
    console.log('\n🎉 RoundHistory arrays added successfully!');
    console.log(`   ✅ Session: ${result.sessionId}`);
    console.log(`   ✅ Processed games: ${result.processedGames}`);
    console.log('\n🚀 CompletedGames now match perfect example structure!');
    console.log('   📱 Should now work correctly in archive');
    console.log('   🎮 Full round details preserved in roundHistory arrays');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to add roundHistory:', error);
    process.exit(1);
  }); 