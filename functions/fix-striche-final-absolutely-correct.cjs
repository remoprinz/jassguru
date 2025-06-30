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

async function fixStricheFinalAbsolutelyCorrect() {
    try {
        console.log('\n🔍 Korrigiere finale Striche und Berge...');
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // Spiel 1: Marc/Roger bekommen Berg + 1 Strich
        const game1Ref = sessionRef.collection('completedGames').doc('1');
        await game1Ref.update({
            'finalStriche.bottom': {
                berg: 1,      // Berg für Marc/Roger
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 1       // Plus 1 Strich
            },
            'finalStriche.top': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            }
        });
        console.log('✅ Spiel 1 korrigiert: Berg + 1 Strich für Marc/Roger');

        // Spiel 2 ist korrekt, lassen wir unverändert
        console.log('✅ Spiel 2 ist bereits korrekt');

        // Spiel 3: +1 Berg für Claudia/Frank
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
                berg: 1,      // Berg für Claudia/Frank
                kontermatsch: 0,
                matsch: 1,
                schneider: 0,
                sieg: 1
            }
        });
        console.log('✅ Spiel 3 korrigiert: +1 Berg für Claudia/Frank');

        // Spiel 4: -1 Berg von Marc/Roger, +1 Berg zu Claudia/Frank
        const game4Ref = sessionRef.collection('completedGames').doc('4');
        await game4Ref.update({
            'finalStriche.bottom': {
                berg: 0,      // Kein Berg für Marc/Roger
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 1
            },
            'finalStriche.top': {
                berg: 1,      // Berg für Claudia/Frank
                kontermatsch: 0,
                matsch: 2,
                schneider: 0,
                sieg: 1
            }
        });
        console.log('✅ Spiel 4 korrigiert: Berg von Marc/Roger zu Claudia/Frank verschoben');

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
        console.log('\nSpiel 1: Marc/Roger - Berg + 1 Strich');
        console.log('Spiel 2: Unverändert (korrekt)');
        console.log('Spiel 3: Claudia/Frank - +1 Berg');
        console.log('Spiel 4: Berg von Marc/Roger zu Claudia/Frank verschoben');
        console.log('\nEndergebnis: 7:9 für Claudia/Frank');

    } catch (error) {
        console.error('❌ Fehler beim Korrigieren der Striche:', error);
    }
}

// Führe die Korrektur aus
fixStricheFinalAbsolutelyCorrect()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 