const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}

const db = admin.firestore();

async function fixJuly3TeamsProperty() {
  console.log('🔧 Entferne teams-Eigenschaft aus Juli 3. Spielen...');
  
  const sessionId = 'GvshcbgPDCtbhCeqHApvk';
  const gameDocIds = ['1', '2', '3'];
  
  const batch = db.batch();
  let updatedCount = 0;
  
  for (const docId of gameDocIds) {
    try {
      const docRef = db.collection('jassGameSummaries').doc(sessionId).collection('completedGames').doc(docId);
      const docSnap = await docRef.get();
      
      if (!docSnap.exists) {
        console.log(`⚠️  Dokument ${docId} nicht gefunden`);
        continue;
      }
      
      const data = docSnap.data();
      
      if (data.teams) {
        console.log(`📝 Entferne teams-Eigenschaft von Game ${docId}...`);
        
        // Remove teams property using FieldValue.delete()
        batch.update(docRef, {
          teams: admin.firestore.FieldValue.delete()
        });
        
        updatedCount++;
      } else {
        console.log(`✅ Game ${docId} hat bereits keine teams-Eigenschaft`);
      }
      
    } catch (error) {
      console.error(`❌ Fehler bei Game ${docId}:`, error);
    }
  }
  
  if (updatedCount > 0) {
    console.log(`\n💾 Speichere ${updatedCount} Updates...`);
    await batch.commit();
    console.log('✅ Updates erfolgreich gespeichert!');
  } else {
    console.log('ℹ️  Keine Updates erforderlich');
  }
  
  console.log('\n🎯 Verify fix: Re-run debug script...');
}

async function main() {
  await fixJuly3TeamsProperty();
}

main().catch(console.error); 