const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkUserPlayerId() {
  console.log('🔍 Prüfe user.playerId für Remo\n');
  
  const uid = 'AaTUBO0SbWVfStdHmD7zi3qAMww2'; // Remo's UID
  
  // Prüfe users-Collection
  const userDoc = await db.doc(`users/${uid}`).get();
  
  if (userDoc.exists) {
    const data = userDoc.data();
    console.log('✅ User-Dokument gefunden:');
    console.log(`   UID: ${userDoc.id}`);
    console.log(`   Display Name: ${data.displayName}`);
    console.log(`   Email: ${data.email}`);
    console.log(`   playerId: ${data.playerId || '❌ NICHT GESETZT'}`);
    console.log('');
    
    if (data.playerId) {
      console.log('✅ user.playerId ist gesetzt!');
      console.log(`   Erwarteter Wert: b16c1120111b7d9e7d733837`);
      console.log(`   Tatsächlicher Wert: ${data.playerId}`);
      console.log(`   Match: ${data.playerId === 'b16c1120111b7d9e7d733837' ? '✅ JA' : '❌ NEIN'}`);
    } else {
      console.log('❌ user.playerId ist NICHT gesetzt!');
      console.log('   → Code wird user.uid als Fallback verwenden');
      console.log(`   → user.uid = ${uid}`);
      console.log(`   → Korrekte playerId wäre: b16c1120111b7d9e7d733837`);
    }
  } else {
    console.log('❌ User-Dokument nicht gefunden!');
  }
  
  process.exit(0);
}

checkUserPlayerId().catch(error => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});

