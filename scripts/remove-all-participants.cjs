const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialisiere Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function removeAllParticipants() {
  console.log('🗑️  Entferne alle Teilnehmer aus dem Turnier...\n');

  const tournamentId = '6RdW4o4PRv0UzsZWysex';

  // 1. Lade Turnier
  const tournamentRef = db.collection('tournaments').doc(tournamentId);
  const tournamentDoc = await tournamentRef.get();
  
  if (!tournamentDoc.exists) {
    console.error('❌ Turnier nicht gefunden!');
    return;
  }

  const tournamentData = tournamentDoc.data();
  const participantPlayerIds = tournamentData.participantPlayerIds || [];
  const participantUids = tournamentData.participantUids || [];
  const adminIds = tournamentData.adminIds || [];
  const createdBy = tournamentData.createdBy;

  console.log(`🏆 Turnier: ${tournamentData.name}`);
  console.log(`   Aktuelle Teilnehmer: ${participantPlayerIds.length} Player IDs, ${participantUids.length} User IDs`);
  console.log(`   Admins: ${adminIds.length}`);
  console.log(`   Erstellt von: ${createdBy}\n`);

  // 2. Sicherheitscheck: Behalte den Ersteller als Admin
  const finalAdminIds = createdBy ? [createdBy] : [];
  
  if (adminIds.includes(createdBy) && adminIds.length > 1) {
    console.log(`⚠️  Warnung: Es gibt ${adminIds.length} Admins.`);
    console.log(`   Nur der Ersteller (${createdBy}) bleibt als Admin.\n`);
  }

  // 3. Entferne alle Teilnehmer
  console.log('💾 Entferne alle Teilnehmer...');
  
  await tournamentRef.update({
    participantPlayerIds: [],
    participantUids: [],
    adminIds: finalAdminIds, // Nur Ersteller bleibt Admin
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('✅ Alle Teilnehmer erfolgreich entfernt!\n');

  // 4. Finale Überprüfung
  const updatedDoc = await tournamentRef.get();
  const updatedData = updatedDoc.data();

  console.log('📊 Finale Statistik:');
  console.log(`   participantPlayerIds: ${updatedData.participantPlayerIds.length}`);
  console.log(`   participantUids: ${updatedData.participantUids.length}`);
  console.log(`   adminIds: ${updatedData.adminIds.length} (${updatedData.adminIds.join(', ')})`);
  
  console.log('\n✅ Turnier ist jetzt leer und bereit für manuelle Tests!');
  console.log('   Sie können jetzt Spieler manuell über die UI hinzufügen.');
}

removeAllParticipants()
  .then(() => {
    console.log('\n🎉 Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  });

