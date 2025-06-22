const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'jasstafel'
  });
}

const db = admin.firestore();

async function triggerStatsRecalculation() {
  const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ'; // fürDich OGs
  
  try {
    console.log('🔄 Triggering statistics recalculation...\n');
    
    // Import the calculation function
    const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
    
    console.log(`📊 Recalculating stats for group: ${GROUP_ID}`);
    
    await updateGroupComputedStatsAfterSession(GROUP_ID);
    
    console.log('✅ Statistics recalculation completed successfully!');
    
    // Load and display the updated stats
    const statsDoc = await db.collection('groupComputedStats').doc(GROUP_ID).get();
    
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      console.log('\n📈 Updated Statistics Summary:');
      console.log(`   Sessions: ${stats.sessionCount}`);
      console.log(`   Games: ${stats.gameCount}`);
      console.log(`   Members: ${stats.memberCount}`);
      console.log(`   Play Time: ${Math.round(stats.totalPlayTimeSeconds / 60)} minutes`);
      
      // Find Frank's stats
      const frankPlayerDocId = 'F1uwdthL6zu7F0cYf1jbe';
      const frankStricheStats = stats.playerWithHighestStricheDiff?.find(p => p.playerId === frankPlayerDocId);
      
      if (frankStricheStats) {
        console.log(`\n🎯 Frank's Updated Stats:`);
        console.log(`   Striche Difference: ${frankStricheStats.value}`);
        console.log(`   Games Played: ${frankStricheStats.eventsPlayed}`);
      } else {
        console.log(`\n❌ Frank not found in striche statistics`);
      }
    } else {
      console.log('❌ No statistics document found');
    }
    
  } catch (error) {
    console.error('❌ Error during recalculation:', error);
    process.exit(1);
  }
}

// Run the recalculation
triggerStatsRecalculation(); 