const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function checkKarimDetails() {
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  const karimId = '8f45eac1b70c8ad7a9a9d9cb';

  console.log('--- CHECKING GROUP ---');
  const groupDoc = await db.collection('groups').doc(groupId).get();
  if (groupDoc.exists) {
    const data = groupDoc.data();
    console.log('Group Name:', data.name);
    console.log('Group Players Map keys:', Object.keys(data.players || {}));
    if (data.players && data.players[karimId]) {
      console.log('Karim in players map:', data.players[karimId]);
    } else {
      console.log('Karim NOT in players map!');
    }
    
    // Check for weird entries in players map
    if (data.players && data.players[groupId]) {
      console.log('WARNING: Group ID found in players map!', data.players[groupId]);
    }
  } else {
    console.log('Group not found!');
  }

  console.log('\n--- CHECKING KARIM PLAYER DOC ---');
  const playerDoc = await db.collection('players').doc(karimId).get();
  if (playerDoc.exists) {
    const data = playerDoc.data();
    console.log('ID in data:', data.id); // Should match doc ID
    console.log('DisplayName:', data.displayName);
    console.log('GroupIds:', data.groupIds);
  } else {
    console.log('Player doc not found!');
  }

  console.log('\n--- CHECKING QUERY USED IN APP ---');
  const playersQuery = await db.collection('players').where('groupIds', 'array-contains', groupId).get();
  console.log(`Found ${playersQuery.size} players in group.`);
  
  playersQuery.forEach(doc => {
    if (doc.id === karimId || doc.data().displayName === 'Karim') {
      console.log(`Found Karim via query. Doc ID: ${doc.id}, Data ID: ${doc.data().id}, Name: ${doc.data().displayName}`);
    }
    if (doc.id === groupId) {
      console.log('CRITICAL: Found player doc with group ID!');
    }
  });
}

checkKarimDetails().catch(console.error);

