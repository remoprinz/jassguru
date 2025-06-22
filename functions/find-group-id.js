const admin = require('firebase-admin');

// Firebase Admin SDK initialisieren mit serviceAccountKey.json
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

async function findGroupId() {
  console.log('🔍 Searching for the correct group ID...\n');
  
  try {
    // Finde Gruppen über Sessions
    const sessionsQuery = await db.collection('jassGameSummaries')
      .where('status', '==', 'completed')
      .limit(10)
      .get();
    
    const groupIds = new Set();
    
    console.log(`📊 Analyzing ${sessionsQuery.docs.length} sessions for group IDs...`);
    
    for (const sessionDoc of sessionsQuery.docs) {
      const sessionData = sessionDoc.data();
      
      if (sessionData.groupId) {
        groupIds.add(sessionData.groupId);
        console.log(`Session ${sessionDoc.id}: groupId = ${sessionData.groupId}`);
      }
      
      // Check alternativ benannte Felder
      if (sessionData.gruppeId) {
        groupIds.add(sessionData.gruppeId);
        console.log(`Session ${sessionDoc.id}: gruppeId = ${sessionData.gruppeId}`);
      }
    }
    
    console.log(`\n🎯 Found ${groupIds.size} unique group IDs:`);
    for (const groupId of groupIds) {
      console.log(`   - ${groupId}`);
    }
    
    // Prüfe auch die groups Collection direkt
    console.log('\n📚 Checking groups collection directly...');
    const groupsQuery = await db.collection('groups').limit(10).get();
    
    console.log(`Found ${groupsQuery.docs.length} groups in collection:`);
    for (const groupDoc of groupsQuery.docs) {
      const groupData = groupDoc.data();
      console.log(`   - ${groupDoc.id}: ${groupData.name || 'Unnamed Group'} (${Object.keys(groupData.players || {}).length} members)`);
      
      // Prüfe ob Remo in dieser Gruppe ist
      if (groupData.players && groupData.players['b16c1120111b7d9e7d733837']) {
        console.log(`     🎯 FOUND REMO'S GROUP: ${groupDoc.id}`);
      }
    }
    
    // Spezifische Prüfung: Finde Sessions mit Remo
    console.log('\n👤 Finding sessions with Remo...');
    const remoSessions = await db.collection('jassGameSummaries')
      .where('participantPlayerIds', 'array-contains', 'b16c1120111b7d9e7d733837')
      .limit(5)
      .get();
    
    console.log(`Found ${remoSessions.docs.length} sessions with Remo:`);
    for (const sessionDoc of remoSessions.docs) {
      const sessionData = sessionDoc.data();
      console.log(`   Session ${sessionDoc.id}: groupId = ${sessionData.groupId || sessionData.gruppeId || 'NONE'}`);
    }
    
  } catch (error) {
    console.error('❌ Error finding group ID:', error);
  }
}

// Führe die Suche aus
findGroupId()
  .then(() => {
    console.log('\n🎉 Group ID search completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Group ID search failed:', error);
    process.exit(1);
  }); 