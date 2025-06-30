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

async function fixStricheAbsolutelyFinal79() {
    try {
        console.log('\n🔍 Korrigiere finale Striche für 7:9 Endergebnis...');
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // Spiel 1: Marc/Roger 1 Berg + 1 Sieg = 3 Striche
        const game1Ref = sessionRef.collection('completedGames').doc('1');
        await game1Ref.update({
            'finalStriche.bottom': {
                berg: 1,      // 1 Berg = 1 Strich
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 1       // 1 Sieg = 2 Striche
            },
            'finalStriche.top': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            }
        });
        console.log('✅ Spiel 1 korrigiert: Marc/Roger 1 Berg + 1 Sieg = 3 Striche');

        // Spiel 2: Marc/Roger 2 Matsch + 1 Sieg = 4 Striche, Claudia/Frank 1 Berg = 1 Strich
        const game2Ref = sessionRef.collection('completedGames').doc('2');
        await game2Ref.update({
            'finalStriche.bottom': {
                berg: 0,
                kontermatsch: 0,
                matsch: 2,    // 2 Matsch = 2 Striche
                schneider: 0,
                sieg: 1       // 1 Sieg = 2 Striche
            },
            'finalStriche.top': {
                berg: 1,      // 1 Berg = 1 Strich
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            }
        });
        console.log('✅ Spiel 2 korrigiert: Marc/Roger 4 Striche, Claudia/Frank 1 Strich');

        // Spiel 3: Claudia/Frank 1 Berg + 1 Sieg + 1 Matsch = 4 Striche
        const game3Ref = sessionRef.collection('completedGames').doc('3');
        await game3Ref.update({
            'finalStriche.bottom': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            },
            'finalStriche.top': {
                berg: 1,      // 1 Berg = 1 Strich
                kontermatsch: 0,
                matsch: 1,    // 1 Matsch = 1 Strich
                schneider: 0,
                sieg: 1       // 1 Sieg = 2 Striche
            }
        });
        console.log('✅ Spiel 3 korrigiert: Claudia/Frank 1 Berg + 1 Sieg + 1 Matsch = 4 Striche');

        // Spiel 4: Claudia/Frank 1 Berg + 1 Sieg + 2 Matsch = 5 Striche
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
                berg: 1,      // 1 Berg = 1 Strich
                kontermatsch: 0,
                matsch: 2,    // 2 Matsch = 2 Striche
                schneider: 0,
                sieg: 1       // 1 Sieg = 2 Striche
            }
        });
        console.log('✅ Spiel 4 korrigiert: Claudia/Frank 1 Berg + 1 Sieg + 2 Matsch = 5 Striche');

        // Aktualisiere die Session mit den korrekten finalen Strichen
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

        await sessionRef.update({
            finalStriche,
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: admin.firestore.Timestamp.now()
        });

        console.log('\n✅ Finale Striche der Session aktualisiert:');
        console.log('\nMarc/Roger (7 Striche total):');
        console.log('- Spiel 1: 1 Berg + 1 Sieg (2) = 3 Striche');
        console.log('- Spiel 2: 2 Matsch + 1 Sieg (2) = 4 Striche');
        console.log('- Spiel 3: 0 Striche');
        console.log('- Spiel 4: 0 Striche');
        console.log('\nClaudia/Frank (9 Striche total):');
        console.log('- Spiel 1: 0 Striche');
        console.log('- Spiel 2: 1 Berg = 1 Strich');
        console.log('- Spiel 3: 1 Berg + 1 Sieg (2) + 1 Matsch = 4 Striche');
        console.log('- Spiel 4: 1 Berg + 1 Sieg (2) + 2 Matsch = 5 Striche');
        console.log('\nEndergebnis: 7:9 für Claudia/Frank');

    } catch (error) {
        console.error('❌ Fehler beim Korrigieren der Striche:', error);
    }
}

// Führe die Korrektur aus
fixStricheAbsolutelyFinal79()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 