import * as admin from 'firebase-admin';
import * as path from 'path';

const serviceAccount = require(path.resolve(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

async function findGroupsWithTournamentSummaries() {
  console.log('🔍 Suche nach Gruppen mit Turnier-jassGameSummaries...\n');

  try {
    // Hole alle Gruppen
    const groupsSnap = await db.collection('groups').get();
    console.log(`📊 Gefunden: ${groupsSnap.size} Gruppen\n`);

    let groupsWithTournamentSummaries = 0;

    for (const groupDoc of groupsSnap.docs) {
      const groupData = groupDoc.data();
      const groupName = groupData.name || 'Unbenannt';
      
      // Prüfe jassGameSummaries
      const summariesSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`)
        .where('isTournamentSession', '==', true)
        .limit(1)
        .get();

      if (!summariesSnap.empty) {
        groupsWithTournamentSummaries++;
        console.log(`✅ ${groupName} (${groupDoc.id})`);
        console.log(`   Hat Turnier-Summaries: ${summariesSnap.size}`);
        
        // Zeige Details des ersten Turnier-Summarys
        const firstSummary = summariesSnap.docs[0];
        const summaryData = firstSummary.data();
        console.log(`   Beispiel: ${firstSummary.id}`);
        console.log(`   - tournamentName: ${summaryData.tournamentName}`);
        console.log(`   - has gameResults: ${!!summaryData.gameResults}`);
        console.log(`   - gameResults length: ${summaryData.gameResults?.length || 0}`);
        console.log(`   - completedAt: ${summaryData.completedAt?.toDate?.()}`);
        console.log('');
      }
    }

    console.log(`\n📈 ZUSAMMENFASSUNG:`);
    console.log(`   Gruppen mit Turnier-Summaries: ${groupsWithTournamentSummaries}`);
    console.log(`   Gruppen ohne Turnier-Summaries: ${groupsSnap.size - groupsWithTournamentSummaries}`);

  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

findGroupsWithTournamentSummaries().then(() => {
  console.log('\n✅ Suche abgeschlossen');
  process.exit(0);
});

