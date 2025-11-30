const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function checkPlayerId() {
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  const correctPlayerId = '8f45eac1b70c8ad7a9a9d9cb';

  console.log('Checking for player with ID matching group ID:', groupId);
  const playerDoc = await db.collection('players').doc(groupId).get();
  
  if (playerDoc.exists) {
    console.log('FOUND PLAYER WITH GROUP ID AS DOC ID!');
    console.log('Data:', JSON.stringify(playerDoc.data(), null, 2));
  } else {
    console.log('No player found with ID:', groupId);
  }

  console.log('\nChecking correct player:', correctPlayerId);
  const correctPlayerDoc = await db.collection('players').doc(correctPlayerId).get();
  if (correctPlayerDoc.exists) {
    console.log('Correct player found.');
    console.log('DisplayName:', correctPlayerDoc.data().displayName);
    console.log('GroupIds:', correctPlayerDoc.data().groupIds);
  } else {
    console.log('Correct player NOT found.');
  }
  
  // Check all members of the group
  console.log('\nChecking all members of group:', groupId);
  const playersQuery = await db.collection('players').where('groupIds', 'array-contains', groupId).get();
  playersQuery.forEach(doc => {
    console.log(`- Member: ${doc.id} (${doc.data().displayName})`);
  });
}

checkPlayerId().catch(console.error);

