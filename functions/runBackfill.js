const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Import the backfill function
const { backfillRatingHistoryForGroup } = require('./lib/scripts/backfillRatingHistory');

async function runBackfill() {
  console.log('🚀 Starting Rating History Backfill...');
  console.log('📊 Group: Tz0wgIHMTlhvTtFastiJ (fürDich OGs)');
  console.log('⏰ Started at:', new Date().toLocaleString());
  
  try {
    await backfillRatingHistoryForGroup('Tz0wgIHMTlhvTtFastiJ');
    
    console.log('✅ Backfill completed successfully!');
    console.log('⏰ Finished at:', new Date().toLocaleString());
    console.log('');
    console.log('🎯 Next steps:');
    console.log('1. Open http://localhost:3000');
    console.log('2. Go to GroupView → Statistik → Übersicht');
    console.log('3. Check the "Elo-Rating Entwicklung" chart');
    console.log('4. Chart should show historical data from April 2025');
    
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

runBackfill();
