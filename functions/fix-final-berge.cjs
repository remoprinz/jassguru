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

async function fixFinalBerge() {
    try {
        console.log('\n🔍 Korrigiere die letzten Berge...');
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // Spiel 1: +1 Berg für Roger/Marc
        const game1Ref = sessionRef.collection('completedGames').doc('1');
        await game1Ref.update({
            'finalStriche.bottom': {
                berg: 2,      // Jetzt 2 Berge
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 2       // 1 Sieg = 2 Striche
            },
            'finalStriche.top': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            }
        });
        console.log('✅ Spiel 1 korrigiert: +1 Berg für Roger/Marc');

        // Spiel 4: +1 Berg für Claudia/Frank
        const game4Ref = sessionRef.collection('completedGames').doc('4');
        await game4Ref.update({
            'finalStriche.bottom': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            },
            'finalStriche.top': {
                berg: 2,      // Jetzt 2 Berge
                kontermatsch: 0,
                matsch: 2,
                schneider: 0,
                sieg: 2       // 1 Sieg = 2 Striche
            }
        });
        console.log('✅ Spiel 4 korrigiert: +1 Berg für Claudia/Frank');

        // Die korrekten finalen Striche für die Session
        const finalStriche = {
            bottom: {
                berg: 2,    // Spiel 1: 2 Berge = 2 Striche
                kontermatsch: 0,
                matsch: 2,  // Spiel 2: 2 Matsch = 2 Striche
                schneider: 0,
                sieg: 2     // Spiel 1 + 2: je 1 Sieg = 2 Striche
            },
            top: {
                berg: 4,    // Spiel 2 + 3 + 4 (2) = 4 Berge
                kontermatsch: 0,
                matsch: 3,  // Spiel 3 (1) + Spiel 4 (2) = 3 Matsch
                schneider: 0,
                sieg: 2     // Spiel 3 + 4: je 1 Sieg = 2 Striche
            }
        };

        // Die korrekten Event Counts (identisch mit finalStriche)
        const eventCounts = {
            bottom: {
                berg: 2,    // Spiel 1: 2 Berge
                kontermatsch: 0,
                matsch: 2,  // Spiel 2: 2 Matsch
                schneider: 0,
                sieg: 2     // Spiel 1 + 2: je 1 Sieg
            },
            top: {
                berg: 4,    // Spiel 2 + 3 + 4 (2)
                kontermatsch: 0,
                matsch: 3,  // Spiel 3 (1) + Spiel 4 (2)
                schneider: 0,
                sieg: 2     // Spiel 3 + 4: je 1 Sieg
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
        console.log('\nStriche pro Spiel:');
        console.log('Spiel 1: Marc/Roger 4 (2 Berg + Sieg)');
        console.log('Spiel 2: Marc/Roger 4 (2 Matsch + Sieg), Claudia/Frank 1 (Berg)');
        console.log('Spiel 3: Claudia/Frank 4 (Berg + Sieg + Matsch)');
        console.log('Spiel 4: Claudia/Frank 6 (2 Berg + Sieg + 2 Matsch)');
        console.log('\nStriche-Berechnung:');
        console.log('Bottom (Marc/Roger) - 6 Striche:');
        console.log('- Berg: 2 (Spiel 1: 2)');
        console.log('- Matsch: 2 (Spiel 2: 2)');
        console.log('- Siege: 2 (Spiel 1 + 2)');
        console.log('Top (Claudia/Frank) - 9 Striche:');
        console.log('- Berg: 4 (Spiel 2: 1, Spiel 3: 1, Spiel 4: 2)');
        console.log('- Matsch: 3 (Spiel 3: 1, Spiel 4: 2)');
        console.log('- Siege: 2 (Spiel 3 + 4)');
        console.log('\nEndergebnis: 6:9 für Claudia/Frank');

    } catch (error) {
        console.error('❌ Fehler beim Korrigieren der Berge:', error);
    }
}

// Führe die Korrektur aus
fixFinalBerge()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 