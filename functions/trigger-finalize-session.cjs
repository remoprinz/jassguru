const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function triggerFinalizeSession() {
  console.log('🚀 Triggering finalizeSession for June 26 session...');
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  
  try {
    // 1. Gather required data from our session
    console.log('\n1️⃣ Gathering session data...');
    
    const summaryRef = db.collection('jassGameSummaries').doc(sessionId);
    const summarySnap = await summaryRef.get();
    
    if (!summarySnap.exists) {
      throw new Error('Session summary not found!');
    }
    
    const summaryData = summarySnap.data();
    console.log('   ✅ Session summary loaded');
    
    // 2. Prepare initialSessionData as expected by finalizeSession
    const initialSessionData = {
      participantPlayerIds: summaryData.participantPlayerIds || [
        '1sDvqN_kvqZLB-4eSZFqZ', // Marc
        'xr0atZ7eLJgr7egkAfrE',  // Claudia
        'lW2UwWY80w3q8pyj4xufu', // Roger
        'F1uwdthL6zu7F0cYf1jbe'  // Frank
      ],
      participantUids: summaryData.participantUids || [
        'JmluPJeG6wbQzLkoJjlU7uVVYyw1', // Marc
        'CF5nVG3vW7SS2omMu0ltF0zhKHs1', // Claudia
        'j6joaEvLqKayu4GV580Dt7EsZQg1', // Roger
        'WQSNHuoqtBen2D3E1bu4OLgx4aI3'  // Frank
      ],
      playerNames: summaryData.playerNames || {
        '1': 'Marc',
        '2': 'Claudia',
        '3': 'Roger',
        '4': 'Frank'
      },
      teams: summaryData.teams || {
        bottom: {
          players: [
            { playerId: '1sDvqN_kvqZLB-4eSZFqZ', displayName: 'Marc' },
            { playerId: 'lW2UwWY80w3q8pyj4xufu', displayName: 'Roger' }
          ]
        },
        top: {
          players: [
            { playerId: 'xr0atZ7eLJgr7egkAfrE', displayName: 'Claudia' },
            { playerId: 'F1uwdthL6zu7F0cYf1jbe', displayName: 'Frank' }
          ]
        }
      },
      gruppeId: summaryData.groupId || 'Tz0wgIHMTlhvTtFastiJ',
      startedAt: summaryData.startedAt || Timestamp.now(),
      winnerTeamKey: summaryData.winnerTeamKey || 'top',
      pairingIdentifiers: summaryData.pairingIdentifiers || {
        bottom: 'JmluPJeG6wbQzLkoJjlU7uVVYyw1_j6joaEvLqKayu4GV580Dt7EsZQg1',
        top: 'CF5nVG3vW7SS2omMu0ltF0zhKHs1_WQSNHuoqtBen2D3E1bu4OLgx4aI3'
      },
      notes: summaryData.notes || []
    };
    
    console.log('   ✅ InitialSessionData prepared');
    console.log('   📊 Expected game count: 4');
    console.log('   👥 Participants:', Object.values(initialSessionData.playerNames).join(', '));
    
    // 3. Call finalizeSession function directly (simulating Cloud Function call)
    console.log('\n2️⃣ Calling finalizeSession logic...');
    
    // Since we can't call the Cloud Function directly from Node.js easily,
    // we'll simulate the logic by directly calling the session finalization
    
    // Import the finalizeSession logic (we'll implement the core logic here)
    const result = await runFinalizeSessionLogic(sessionId, 4, initialSessionData);
    
    console.log('   ✅ FinalizeSession logic completed');
    
    // 4. Trigger statistics recalculation manually if needed
    console.log('\n3️⃣ Checking if additional statistics triggers needed...');
    
    // The finalizeSession should have triggered all the necessary updates
    // Let's verify the result
    
    console.log('\n4️⃣ Verification:');
    const updatedSummarySnap = await summaryRef.get();
    if (updatedSummarySnap.exists) {
      const updatedData = updatedSummarySnap.data();
      console.log(`   ✅ Status: ${updatedData.status}`);
      console.log(`   ✅ LastActivity: ${updatedData.lastActivity?.toDate()}`);
      console.log(`   ✅ EventCounts: Top ${Object.values(updatedData.eventCounts?.top || {}).reduce((a,b) => a+b, 0)}, Bottom ${Object.values(updatedData.eventCounts?.bottom || {}).reduce((a,b) => a+b, 0)}`);
    }
    
    return {
      sessionId,
      result,
      success: true
    };
    
  } catch (error) {
    console.error('❌ Error triggering finalizeSession:', error);
    throw error;
  }
}

// Core finalization logic (simplified version of the Cloud Function)
async function runFinalizeSessionLogic(sessionId, expectedGameNumber, initialSessionData) {
  console.log('   🔧 Running finalization logic...');
  
  const summaryDocRef = db.collection('jassGameSummaries').doc(sessionId);
  const completedGamesColRef = summaryDocRef.collection('completedGames');
  
  return await db.runTransaction(async (transaction) => {
    // Get current state
    const summarySnap = await transaction.get(summaryDocRef);
    const gamesSnap = await transaction.get(completedGamesColRef.orderBy("gameNumber"));
    
    const existingSummaryData = summarySnap.exists ? summarySnap.data() : null;
    
    if (existingSummaryData && existingSummaryData.status === "completed") {
      console.log('   ℹ️  Session already completed, re-processing for statistics...');
    }
    
    const completedGames = gamesSnap.docs.map(doc => doc.data());
    console.log(`   📊 Found ${completedGames.length} completed games`);
    
    // Mark as completed and trigger statistics
    const now = Timestamp.now();
    
    const updateData = {
      status: "completed",
      lastActivity: now,
      lastCompletedGameUpdate: now,
      
      // This will trigger the statistics Cloud Functions
      __statisticsTrigger: now,
      __forceStatisticsRecalculation: true
    };
    
    transaction.update(summaryDocRef, updateData);
    
    console.log('   ✅ Session marked as completed and statistics trigger set');
    
    return { processedGames: completedGames.length };
  });
}

triggerFinalizeSession()
  .then((result) => {
    console.log('\n🎉 FinalizeSession triggered successfully!');
    console.log(`   ✅ Session: ${result.sessionId}`);
    console.log(`   ✅ Success: ${result.success}`);
    console.log('\n🚀 Session should now appear in archive!');
    console.log('   📊 Statistics should be calculated automatically');
    console.log('   📱 Check the app archive section');
    console.log('   ⏱️  May take a few minutes for all triggers to complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to trigger finalizeSession:', error);
    process.exit(1);
  }); 