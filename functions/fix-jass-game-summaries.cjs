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

async function fixJassGameSummaries() {
    try {
        console.log('\n🔍 Aktualisiere jassGameSummaries Dokument...');
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // Die korrekten Striche für die Session
        const finalStriche = {
            bottom: {
                berg: 1,    // Spiel 1: 1 Berg = 1 Strich
                kontermatsch: 0,
                matsch: 2,  // Spiel 2: 2 Matsch = 2 Striche
                schneider: 0,
                sieg: 2     // Spiel 1 + 2: je 1 Sieg = 4 Striche
            },
            top: {
                berg: 3,    // Spiel 2 + 3 + 4: je 1 Berg = 3 Striche
                kontermatsch: 0,
                matsch: 3,  // Spiel 3: 1 Matsch + Spiel 4: 2 Matsch = 3 Striche
                schneider: 0,
                sieg: 2     // Spiel 3 + 4: je 1 Sieg = 4 Striche
            }
        };

        // Die korrekten Event Counts
        const eventCounts = {
            bottom: {
                berg: 1,    // Spiel 1
                kontermatsch: 0,
                matsch: 2,  // Spiel 2
                schneider: 0,
                sieg: 2     // Spiel 1 + 2
            },
            top: {
                berg: 3,    // Spiel 2 + 3 + 4
                kontermatsch: 0,
                matsch: 3,  // Spiel 3 (1) + Spiel 4 (2)
                schneider: 0,
                sieg: 2     // Spiel 3 + 4
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
        console.log('\nEvent Counts:');
        console.log('Bottom (Marc/Roger):', eventCounts.bottom);
        console.log('Top (Claudia/Frank):', eventCounts.top);
        console.log('\nStriche pro Spiel:');
        console.log('Spiel 1: Marc/Roger 3 (Berg + Sieg)');
        console.log('Spiel 2: Marc/Roger 4 (2 Matsch + Sieg), Claudia/Frank 1 (Berg)');
        console.log('Spiel 3: Claudia/Frank 4 (Berg + Sieg + Matsch)');
        console.log('Spiel 4: Claudia/Frank 5 (Berg + Sieg + 2 Matsch)');
        console.log('\nEndergebnis: 7:9 für Claudia/Frank');

    } catch (error) {
        console.error('❌ Fehler beim Aktualisieren des jassGameSummaries Dokuments:', error);
    }
}

// Führe die Korrektur aus
fixJassGameSummaries()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 