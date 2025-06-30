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

async function fixStricheFinalCorrection() {
    try {
        console.log('\n🔍 Korrigiere finale Striche...');
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // Spiel 1: Marc/Roger bekommen +1 Berg (jetzt 2 Berg + Sieg)
        const game1Ref = sessionRef.collection('completedGames').doc('1');
        await game1Ref.update({
            'finalStriche.bottom': {
                berg: 2,      // Jetzt 2 Berge
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 1
            },
            'finalStriche.top': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            }
        });
        console.log('✅ Spiel 1 korrigiert: Marc/Roger jetzt 2 Berg + Sieg');

        // Spiel 2: Marc/Roger Sieg (1 Strich), Claudia/Frank Berg (1 Strich)
        const game2Ref = sessionRef.collection('completedGames').doc('2');
        await game2Ref.update({
            'finalStriche.bottom': {
                berg: 0,
                kontermatsch: 0,
                matsch: 2,    // 2 Matsch bleiben
                schneider: 0,
                sieg: 1       // +1 Strich für Sieg
            },
            'finalStriche.top': {
                berg: 1,      // Berg statt Sieg
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            }
        });
        console.log('✅ Spiel 2 korrigiert: Marc/Roger Sieg, Claudia/Frank Berg');

        // Spiel 3 bleibt unverändert
        console.log('✅ Spiel 3 bleibt unverändert');

        // Spiel 4: Marc/Roger keine Striche mehr, Rest bleibt
        const game4Ref = sessionRef.collection('completedGames').doc('4');
        await game4Ref.update({
            'finalStriche.bottom': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0       // Keine Striche mehr
            },
            'finalStriche.top': {
                berg: 2,      // Bleibt gleich
                kontermatsch: 0,
                matsch: 2,
                schneider: 0,
                sieg: 1
            }
        });
        console.log('✅ Spiel 4 korrigiert: Marc/Roger Striche entfernt');

        // Aktualisiere die Session mit den korrekten finalen Strichen
        const finalStriche = {
            bottom: {
                berg: 2,    // 2 Berg in Spiel 1
                kontermatsch: 0,
                matsch: 2,  // 2 Matsch in Spiel 2
                schneider: 0,
                sieg: 1     // 1 Sieg in Spiel 2
            },
            top: {
                berg: 3,    // 1 Berg in Spiel 2 + 2 Berg in Spiel 4
                kontermatsch: 0,
                matsch: 3,  // 1 in Spiel 3 + 2 in Spiel 4
                schneider: 0,
                sieg: 3     // Je 1 in Spiel 3 und 4
            }
        };

        await sessionRef.update({
            finalStriche,
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: admin.firestore.Timestamp.now()
        });

        console.log('\n✅ Finale Striche der Session aktualisiert:');
        console.log('\nSpiel 1: Marc/Roger 2 Berg + Sieg');
        console.log('Spiel 2: Marc/Roger 2 Matsch + Sieg, Claudia/Frank Berg');
        console.log('Spiel 3: Unverändert');
        console.log('Spiel 4: Marc/Roger keine Striche mehr');
        console.log('\nEndergebnis: 7:9 für Claudia/Frank');

    } catch (error) {
        console.error('❌ Fehler beim Korrigieren der Striche:', error);
    }
}

// Führe die Korrektur aus
fixStricheFinalCorrection()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 