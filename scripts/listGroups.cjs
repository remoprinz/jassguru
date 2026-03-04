/**
 * Einfaches Script um alle verfügbaren Gruppen anzuzeigen
 */

const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin initialisieren
const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

async function listGroups() {
  console.log('📊 Lade alle verfügbaren Gruppen...\n');
  
  try {
    const groupsRef = db.collection('groups');
    const snapshot = await groupsRef.limit(20).get(); // Erste 20 Gruppen
    
    if (snapshot.empty) {
      console.log('❌ Keine Gruppen gefunden');
      return;
    }
    
    console.log('🎯 Verfügbare Gruppen:');
    console.log('=====================\n');
    
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`Name: ${data.name || 'Unbekannt'}`);
      console.log(`Mitglieder: ${data.playerIds?.length || 0}`);
      console.log(`Öffentlich: ${data.isPublic ? 'Ja' : 'Nein'}`);
      console.log('---');
    });
    
    console.log('\n💡 Usage:');
    console.log('npm run calculate-ratings:group [GROUP_ID]');
    console.log('\nBeispiel:');
    console.log(`npm run calculate-ratings:group ${snapshot.docs[0]?.id || 'abc123'}`);
    
  } catch (error) {
    console.error('❌ Fehler beim Laden der Gruppen:', error);
  }
}

listGroups();
