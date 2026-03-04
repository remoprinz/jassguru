/**
 * Diagnose-Script: Prüft wie Members geladen werden und ob photoURL vorhanden ist
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

const GROUP_ID = '1op99awMEoKJjp8wZpxj';
const GTO_PLAYER_ID = 'q79AtQHIxvXnUmgdh4kyF';

async function diagnose() {
  console.log('=' .repeat(80));
  console.log('DIAGNOSE: Members Loading und photoURL');
  console.log('=' .repeat(80));
  console.log();

  // 1. Teste die Query wie getGroupMembersSortedByGames
  console.log('1️⃣ QUERY: players where groupIds contains groupId');
  console.log('-'.repeat(60));
  
  const playersSnapshot = await db.collection('players')
    .where('groupIds', 'array-contains', GROUP_ID)
    .get();
  
  console.log(`   Gefunden: ${playersSnapshot.size} Spieler`);
  console.log();
  
  playersSnapshot.forEach(doc => {
    const data = doc.data();
    console.log(`   📄 ${doc.id}:`);
    console.log(`      displayName: ${data.displayName}`);
    console.log(`      photoURL: ${data.photoURL || '❌ NICHT GESETZT'}`);
    console.log(`      userId: ${data.userId}`);
    console.log();
  });

  // 2. Teste die loadGroupLeaderboard Logik
  console.log('2️⃣ MEMBERS SUBCOLLECTION (groups/1op99awMEoKJjp8wZpxj/members)');
  console.log('-'.repeat(60));
  
  const membersSnapshot = await db.collection('groups').doc(GROUP_ID).collection('members').get();
  
  console.log(`   Gefunden: ${membersSnapshot.size} Member-Dokumente`);
  console.log();
  
  membersSnapshot.forEach(doc => {
    const data = doc.data();
    console.log(`   📄 ${doc.id}:`);
    console.log(`      displayName: ${data.displayName}`);
    console.log(`      photoURL: ${data.photoURL || '❌ NICHT GESETZT'}`);
    console.log(`      Alle Felder: ${JSON.stringify(data, null, 2)}`);
    console.log();
  });

  // 3. Simuliere den Code in GroupView (Zeile 2010)
  console.log('3️⃣ SIMULATION: members.find() wie in GroupView');
  console.log('-'.repeat(60));
  
  // Simuliere das "members" Array (aus getGroupMembersSortedByGames)
  const members = [];
  playersSnapshot.forEach(doc => {
    const data = doc.data();
    members.push({
      ...data,
      id: doc.id,
    });
  });
  
  // Simuliere rating.id (aus loadPlayerRatings)
  const ratingsArray = [
    { id: 'b16c1120111b7d9e7d733837', displayName: 'Remo', rating: 134 },
    { id: GTO_PLAYER_ID, displayName: 'GTO', rating: 100 }
  ];
  
  for (const rating of ratingsArray) {
    const playerData = members.find(m => (m.id || m.userId) === rating.id);
    console.log(`   Suche nach rating.id: ${rating.id}`);
    console.log(`   Gefundenes playerData:`, playerData ? {
      id: playerData.id,
      displayName: playerData.displayName,
      photoURL: playerData.photoURL || '❌ NICHT GESETZT'
    } : '❌ NICHT GEFUNDEN');
    console.log();
  }

  // 4. Fazit
  console.log('=' .repeat(80));
  console.log('📋 FAZIT');
  console.log('=' .repeat(80));
  
  const gtoInPlayersQuery = playersSnapshot.docs.find(doc => doc.id === GTO_PLAYER_ID);
  const gtoPhotoURL = gtoInPlayersQuery?.data()?.photoURL;
  
  if (gtoInPlayersQuery && gtoPhotoURL) {
    console.log('✅ GTO ist in der players-Query und hat eine photoURL!');
    console.log(`   photoURL: ${gtoPhotoURL}`);
    console.log();
    console.log('Das bedeutet: Das Problem liegt NICHT am Laden der Daten.');
    console.log('Möglicherweise:');
    console.log('   - Cache-Problem in der App');
    console.log('   - Die App ist nicht aktuell deployed');
    console.log('   - Die Bild-URL ist nicht erreichbar (CORS, Token, etc.)');
  } else if (!gtoInPlayersQuery) {
    console.log('❌ GTO wurde NICHT in der players-Query gefunden!');
    console.log('   Das bedeutet: groupIds fehlt oder ist falsch.');
  } else {
    console.log('❌ GTO hat KEINE photoURL im Player-Dokument!');
  }
}

diagnose()
  .then(() => {
    console.log();
    console.log('Diagnose abgeschlossen.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fehler bei der Diagnose:', error);
    process.exit(1);
  });
