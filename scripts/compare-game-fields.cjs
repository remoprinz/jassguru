/**
 * Vergleiche eventCounts vs teamStrichePasse für Game 2A (Remo & Fabinski)
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

async function compare() {
  console.log('📊 VERGLEICH: eventCounts vs teamStrichePasse\n');
  
  const gamesSnap = await db.collection(`tournaments/${TOURNAMENT_ID}/games`).get();
  
  gamesSnap.docs.forEach(doc => {
    const game = doc.data();
    
    console.log('='.repeat(80));
    console.log(`📌 ${game.passeLabel}: ${game.teams?.top?.players?.map(p => p.displayName).join(' & ')} vs ${game.teams?.bottom?.players?.map(p => p.displayName).join(' & ')}`);
    console.log('='.repeat(80));
    
    // eventCounts (was ich gelesen habe)
    console.log('\n   eventCounts:');
    console.log(`      top.matsch:    ${game.eventCounts?.top?.matsch || 0}`);
    console.log(`      bottom.matsch: ${game.eventCounts?.bottom?.matsch || 0}`);
    
    // finalStriche (was im jassGameSummary steht)
    console.log('\n   finalStriche:');
    console.log(`      top.matsch:    ${game.finalStriche?.top?.matsch || 0}`);
    console.log(`      bottom.matsch: ${game.finalStriche?.bottom?.matsch || 0}`);
    
    // teamStrichePasse (was das Archiv verwendet!)
    console.log('\n   teamStrichePasse:');
    console.log(`      top.matsch:    ${game.teamStrichePasse?.top?.matsch || 0}`);
    console.log(`      bottom.matsch: ${game.teamStrichePasse?.bottom?.matsch || 0}`);
    
    console.log('');
  });
}

compare()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
