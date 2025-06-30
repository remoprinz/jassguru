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

async function fixStricheGame4() {
    try {
        console.log('\n🔍 Korrigiere Spiel 4 mit 5 Strichen für Claudia/Frank...');
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // Spiel 4: Marc/Roger (1 Sieg), Claudia/Frank (2 Matsch + Berg + Sieg = 5)
        const game4Ref = sessionRef.collection('completedGames').doc('4');
        await game4Ref.update({
            'finalStriche.bottom': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 1
            },
            'finalStriche.top': {
                berg: 1,      // 1 Berg = 1 Strich
                kontermatsch: 0,
                matsch: 2,    // 2 Matsche = 2 Striche
                schneider: 0,
                sieg: 1       // 1 Sieg = 2 Striche (wegen Berg)
            }
        });
        console.log('✅ Spiel 4 korrigiert');

        // Aktualisiere die Session mit den korrekten finalen Strichen
        const finalStriche = {
            bottom: {
                berg: 1,    // Spiel 1
                kontermatsch: 0,
                matsch: 2,  // Spiel 2
                schneider: 0,
                sieg: 3     // Spiel 1 + 2 + 4
            },
            top: {
                berg: 2,    // Spiel 3 + 4
                kontermatsch: 0,
                matsch: 3,  // Spiel 3 (1) + Spiel 4 (2)
                schneider: 0,
                sieg: 3     // Spiel 2 + 3 + 4
            }
        };

        await sessionRef.update({
            finalStriche,
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: admin.firestore.Timestamp.now()
        });

        console.log('\n✅ Finale Striche der Session aktualisiert:');
        console.log('Bottom (Marc/Roger):', finalStriche.bottom);
        console.log('Top (Claudia/Frank):', finalStriche.top);
        console.log('\nSpiel 4 hat jetzt:');
        console.log('- Marc/Roger: 1 Strich (Sieg)');
        console.log('- Claudia/Frank: 5 Striche (Berg + Sieg = 3 Striche, plus 2 Matsche = 5)');
        console.log('\nEndergebnis: 7:9 für Claudia/Frank');

    } catch (error) {
        console.error('❌ Fehler beim Korrigieren der Striche:', error);
    }
}

// Führe die Korrektur aus
fixStricheGame4()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 