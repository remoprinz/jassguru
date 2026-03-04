const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialisiere Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function addRemoToTournament() {
  console.log('➕ Füge Remo zum Turnier hinzu...\n');

  const tournamentId = '6RdW4o4PRv0UzsZWysex';
  const userId = 'AaTUBO0SbWVfStdHmD7zi3qAMww2'; // Remo
  const playerId = 'b16c1120111b7d9e7d733837'; // Remo's Player ID

  // 1. Lade Turnier
  const tournamentRef = db.collection('tournaments').doc(tournamentId);
  const tournamentDoc = await tournamentRef.get();
  
  if (!tournamentDoc.exists) {
    console.error('❌ Turnier nicht gefunden!');
    return;
  }

  const tournament = tournamentDoc.data();
  const participantUids = tournament.participantUids || [];
  const participantPlayerIds = tournament.participantPlayerIds || [];

  console.log(`🏆 Turnier: ${tournament.name}`);
  console.log(`   Aktuelle Teilnehmer: ${participantUids.length} UIDs, ${participantPlayerIds.length} Player IDs\n`);

  // 2. Prüfe ob bereits vorhanden
  if (participantUids.includes(userId)) {
    console.log('✅ Remo ist bereits Teilnehmer!');
    return;
  }

  // 3. Füge hinzu
  console.log('➕ Füge Remo hinzu...');
  
  await tournamentRef.update({
    participantUids: admin.firestore.FieldValue.arrayUnion(userId),
    participantPlayerIds: admin.firestore.FieldValue.arrayUnion(playerId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('✅ Remo erfolgreich hinzugefügt!\n');

  // 4. Finale Überprüfung
  const updatedDoc = await tournamentRef.get();
  const updatedData = updatedDoc.data();

  console.log('📊 Neue Statistik:');
  console.log(`   participantUids: ${updatedData.participantUids.length}`);
  console.log(`   participantPlayerIds: ${updatedData.participantPlayerIds.length}`);
  console.log('');
  console.log('✅ Turnier sollte jetzt in der BottomNavigation erscheinen!');
}

addRemoToTournament()
  .then(() => {
    console.log('\n🎉 Erfolgreich abgeschlossen');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  });

