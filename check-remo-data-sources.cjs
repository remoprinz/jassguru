const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkRemoDataSources() {
  console.log('🔍 VOLLSTÄNDIGE ANALYSE: Remo\'s Daten\n');
  
  // 1. Prüfe players-Collection
  const playerId = 'SzpjpYSr8hN7HJfxxOBCkGd5Lsh1';
  const playerDoc = await db.doc(`players/${playerId}`).get();
  
  if (playerDoc.exists) {
    const data = playerDoc.data();
    console.log('✅ Player-Dokument existiert:');
    console.log(`   Display Name: ${data.displayName}`);
    console.log(`   Email: ${data.email}`);
    console.log(`   Global Rating: ${data.globalRating || data.rating || 'NICHT GESETZT'}`);
    console.log('');
  } else {
    console.log('❌ Player-Dokument existiert NICHT!\n');
    return;
  }
  
  // 2. Prüfe alle Subcollections
  console.log('📂 Subcollections:');
  const subcollections = ['ratingHistory', 'scoresHistory', 'partnerStats', 'opponentStats'];
  
  for (const subcoll of subcollections) {
    const snap = await db.collection(`players/${playerId}/${subcoll}`).limit(1).get();
    console.log(`   ${subcoll}: ${snap.empty ? '❌ LEER' : '✅ ' + snap.size + ' Einträge'}`);
  }
  console.log('');
  
  // 3. Prüfe jassGameSummaries für Session vom 27.11.
  console.log('📊 Prüfe jassGameSummaries für 27.11.2025...\n');
  
  const groupsSnap = await db.collection('groups').get();
  let found = false;
  
  for (const groupDoc of groupsSnap.docs) {
    const summariesRef = db.collection(`groups/${groupDoc.id}/jassGameSummaries`);
    const summariesSnap = await summariesRef
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'desc')
      .limit(10)
      .get();
    
    summariesSnap.forEach(summaryDoc => {
      const data = summaryDoc.data();
      const completedAt = data.completedAt?.toDate();
      
      if (completedAt && completedAt.getDate() === 27 && completedAt.getMonth() === 10 && completedAt.getFullYear() === 2025) {
        found = true;
        console.log(`✅ Session gefunden in Gruppe ${groupDoc.id}:`);
        console.log(`   Session ID: ${summaryDoc.id}`);
        console.log(`   Datum: ${completedAt.toLocaleString('de-DE')}`);
        
        if (data.playerFinalRatings) {
          console.log('   Player Final Ratings:');
          Object.entries(data.playerFinalRatings).forEach(([pid, rating]) => {
            console.log(`     ${rating.displayName}: ${rating.rating} (${rating.ratingDelta > 0 ? '+' : ''}${rating.ratingDelta})`);
          });
        }
        console.log('');
      }
    });
  }
  
  if (!found) {
    console.log('❌ KEINE Session vom 27.11.2025 in jassGameSummaries gefunden!\n');
  }
  
  process.exit(0);
}

checkRemoDataSources().catch(error => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});

