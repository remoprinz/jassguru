const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function findRemoPlayerId() {
  console.log('🔍 Suche nach Remo\'s playerId...\n');
  
  // 1. Suche in users-Collection
  console.log('📋 Prüfe users-Collection:');
  const usersSnap = await db.collection('users').where('email', '==', 'r.prinz@gmx.net').get();
  
  if (!usersSnap.empty) {
    usersSnap.forEach(doc => {
      const data = doc.data();
      console.log(`✅ User gefunden:`);
      console.log(`   UID: ${doc.id}`);
      console.log(`   Display Name: ${data.displayName}`);
      console.log(`   Email: ${data.email}`);
      console.log(`   Player ID: ${data.playerId || 'NICHT GESETZT'}`);
      console.log('');
    });
  } else {
    console.log('❌ Kein User mit email r.prinz@gmx.net gefunden\n');
  }
  
  // 2. Suche in players-Collection nach displayName
  console.log('📋 Prüfe players-Collection nach "Remo":');
  const playersSnap = await db.collection('players').get();
  
  playersSnap.forEach(doc => {
    const data = doc.data();
    if (data.displayName && data.displayName.toLowerCase().includes('remo')) {
      console.log(`✅ Player gefunden:`);
      console.log(`   Player ID: ${doc.id}`);
      console.log(`   Display Name: ${data.displayName}`);
      console.log(`   Email: ${data.email || 'NICHT GESETZT'}`);
      console.log(`   Global Rating: ${data.globalRating || data.rating || 'NICHT GESETZT'}`);
      console.log('');
    }
  });
  
  process.exit(0);
}

findRemoPlayerId().catch(error => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});

