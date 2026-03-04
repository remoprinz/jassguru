/**
 * FIX-Script: Synchronisiert die photoURL aus dem players-Dokument in die members-Subcollection
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'jassguru.firebasestorage.app'
  });
}

const db = admin.firestore();

const GTO_PLAYER_ID = 'q79AtQHIxvXnUmgdh4kyF';
const GROUP_ID = '1op99awMEoKJjp8wZpxj';

async function fix() {
  console.log('=' .repeat(80));
  console.log('FIX: Synchronisiere photoURL für GTO in members-Subcollection');
  console.log('=' .repeat(80));
  console.log();

  // 1. Hole die photoURL aus dem players-Dokument
  console.log('1️⃣ Lade photoURL aus players/' + GTO_PLAYER_ID);
  const playerDoc = await db.collection('players').doc(GTO_PLAYER_ID).get();
  
  if (!playerDoc.exists) {
    console.error('❌ Player-Dokument nicht gefunden!');
    return;
  }
  
  const playerData = playerDoc.data();
  const photoURL = playerData.photoURL;
  
  console.log('   Gefundene photoURL:', photoURL);
  console.log();

  // 2. Update die members-Subcollection
  console.log('2️⃣ Update members-Subcollection: groups/' + GROUP_ID + '/members/' + GTO_PLAYER_ID);
  
  const memberRef = db.collection('groups').doc(GROUP_ID).collection('members').doc(GTO_PLAYER_ID);
  const memberDoc = await memberRef.get();
  
  if (!memberDoc.exists) {
    console.error('❌ Member-Dokument nicht gefunden!');
    return;
  }
  
  console.log('   Vorherige photoURL:', memberDoc.data().photoURL);
  
  // Update durchführen
  await memberRef.update({
    photoURL: photoURL
  });
  
  console.log('   ✅ photoURL aktualisiert!');
  console.log();

  // 3. Verifizieren
  console.log('3️⃣ Verifiziere Update');
  const updatedMemberDoc = await memberRef.get();
  console.log('   Neue photoURL:', updatedMemberDoc.data().photoURL);
  console.log();

  console.log('=' .repeat(80));
  console.log('✅ FIX ABGESCHLOSSEN');
  console.log('=' .repeat(80));
  console.log();
  console.log('Das Profilbild sollte jetzt angezeigt werden.');
  console.log('Bitte die App neu laden (Hard Refresh mit Cmd+Shift+R).');
}

fix()
  .then(() => {
    console.log();
    console.log('Script beendet.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fehler:', error);
    process.exit(1);
  });
