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

async function fixFinalStriche() {
    try {
        console.log('\n🔍 Korrigiere finale Striche...');
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // Korrigiere Spiel 2 (Berg bei Top entfernen)
        const game2Ref = sessionRef.collection('completedGames').doc('2');
        await game2Ref.update({
            'finalStriche.top': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            }
        });
        console.log('✅ Spiel 2 korrigiert');

        // Korrigiere Spiel 4
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
                berg: 1,
                kontermatsch: 0,
                matsch: 2,
                schneider: 0,
                sieg: 1
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
                sieg: 2     // Spiel 1 + 2
            },
            top: {
                berg: 2,    // Spiel 3 + 4
                kontermatsch: 0,
                matsch: 3,  // Spiel 3 (1) + Spiel 4 (2)
                schneider: 0,
                sieg: 2     // Spiel 3 + 4
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
        console.log('\nEndergebnis: 7 (Marc/Roger) : 9 (Claudia/Frank)');

    } catch (error) {
        console.error('❌ Fehler beim Korrigieren der Striche:', error);
    }
}

// Führe die Korrektur aus
fixFinalStriche()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 