const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const SESSION_ID = 'NPA6LXHaLLeeNaF49vf5l';

async function fixJassGameSummaries58() {
    try {
        console.log('\n🔍 Aktualisiere jassGameSummaries Dokument für 5:8 Endergebnis...');
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // Die korrekten Striche für die Session
        const finalStriche = {
            bottom: {
                berg: 1,    // 1 Strich
                kontermatsch: 0,
                matsch: 2,  // 2 Striche
                schneider: 0,
                sieg: 2     // 2 Siege = 2 Striche
            },
            top: {
                berg: 3,    // 3 Striche
                kontermatsch: 0,
                matsch: 3,  // 3 Striche
                schneider: 0,
                sieg: 2     // 2 Siege = 2 Striche
            }
        };

        // Die korrekten Event Counts (identisch mit finalStriche)
        const eventCounts = {
            bottom: {
                berg: 1,
                kontermatsch: 0,
                matsch: 2,
                schneider: 0,
                sieg: 2
            },
            top: {
                berg: 3,
                kontermatsch: 0,
                matsch: 3,
                schneider: 0,
                sieg: 2
            }
        };

        // Update das jassGameSummaries Dokument
        await sessionRef.update({
            finalStriche,
            eventCounts,
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: admin.firestore.Timestamp.now()
        });

        console.log('\n✅ jassGameSummaries Dokument aktualisiert:');
        console.log('\nFinale Striche:');
        console.log('Bottom (Marc/Roger):', finalStriche.bottom);
        console.log('Top (Claudia/Frank):', finalStriche.top);
        console.log('\nStriche-Berechnung:');
        console.log('Bottom (Marc/Roger) - 5 Striche:');
        console.log('- Berg: 1');
        console.log('- Matsch: 2');
        console.log('- Siege: 2 (= 2 Striche)');
        console.log('Top (Claudia/Frank) - 8 Striche:');
        console.log('- Berg: 3');
        console.log('- Matsch: 3');
        console.log('- Siege: 2 (= 2 Striche)');
        console.log('\nEndergebnis: 5:8 für Claudia/Frank');

    } catch (error) {
        console.error('❌ Fehler beim Aktualisieren des jassGameSummaries Dokuments:', error);
    }
}

// Führe die Korrektur aus
fixJassGameSummaries58()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 