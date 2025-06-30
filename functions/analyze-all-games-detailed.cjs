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

async function analyzeAllGamesDetailed() {
    try {
        console.log('\n🔍 Detaillierte Analyse aller Spiele...');
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // Spiel 1
        console.log('\n📊 SPIEL 1:');
        const game1Ref = sessionRef.collection('completedGames').doc('1');
        const game1Doc = await game1Ref.get();
        const game1Data = game1Doc.data();
        console.log('Punkte:', game1Data.bottomScore, 'vs', game1Data.topScore);
        console.log('Gewinner:', game1Data.winnerTeam);
        console.log('Runden:', game1Data.roundHistory.length);
        console.log('Finale Striche Bottom (Marc/Roger):', JSON.stringify(game1Data.finalStriche?.bottom));
        console.log('Finale Striche Top (Claudia/Frank):', JSON.stringify(game1Data.finalStriche?.top));
        
        // Spiel 2
        console.log('\n📊 SPIEL 2:');
        const game2Ref = sessionRef.collection('completedGames').doc('2');
        const game2Doc = await game2Ref.get();
        const game2Data = game2Doc.data();
        console.log('Punkte:', game2Data.bottomScore, 'vs', game2Data.topScore);
        console.log('Gewinner:', game2Data.winnerTeam);
        console.log('Runden:', game2Data.roundHistory.length);
        console.log('Finale Striche Bottom (Marc/Roger):', JSON.stringify(game2Data.finalStriche?.bottom));
        console.log('Finale Striche Top (Claudia/Frank):', JSON.stringify(game2Data.finalStriche?.top));

        // Spiel 3
        console.log('\n📊 SPIEL 3:');
        const game3Ref = sessionRef.collection('completedGames').doc('3');
        const game3Doc = await game3Ref.get();
        const game3Data = game3Doc.data();
        console.log('Punkte:', game3Data.bottomScore, 'vs', game3Data.topScore);
        console.log('Gewinner:', game3Data.winnerTeam);
        console.log('Runden:', game3Data.roundHistory.length);
        console.log('Finale Striche Bottom (Marc/Roger):', JSON.stringify(game3Data.finalStriche?.bottom));
        console.log('Finale Striche Top (Claudia/Frank):', JSON.stringify(game3Data.finalStriche?.top));

        // Spiel 4
        console.log('\n📊 SPIEL 4:');
        const game4Ref = sessionRef.collection('completedGames').doc('4');
        const game4Doc = await game4Ref.get();
        const game4Data = game4Doc.data();
        console.log('Punkte:', game4Data.bottomScore, 'vs', game4Data.topScore);
        console.log('Gewinner:', game4Data.winnerTeam);
        console.log('Runden:', game4Data.roundHistory.length);
        console.log('Finale Striche Bottom (Marc/Roger):', JSON.stringify(game4Data.finalStriche?.bottom));
        console.log('Finale Striche Top (Claudia/Frank):', JSON.stringify(game4Data.finalStriche?.top));

        // Zusammenfassung
        console.log('\n📈 ZUSAMMENFASSUNG:');
        console.log('Spiel 1: Marc/Roger - Berg + Sieg = 2 Striche');
        console.log('Spiel 2: Marc/Roger - Sieg + 2 Matsche = 4 Striche');
        console.log('Spiel 3: Claudia/Frank - Berg + Sieg + Matsch = 4 Striche');
        console.log('Spiel 4: Claudia/Frank - Berg + Sieg + 2 Matsche = 5 Striche');
        console.log('\nEndergebnis: 7 (Marc/Roger) : 9 (Claudia/Frank)');

        // Überprüfe, ob Korrekturen notwendig sind
        const correctionsNeeded = [];
        
        // Spiel 1 sollte haben: Bottom (Berg + Sieg), Top (nichts)
        if (game1Data.finalStriche?.bottom?.berg !== 1 || game1Data.finalStriche?.bottom?.sieg !== 1) {
            correctionsNeeded.push('Spiel 1: Bottom braucht Berg + Sieg');
        }

        // Spiel 2 sollte haben: Bottom (Sieg + 2 Matsche), Top (nichts)
        if (game2Data.finalStriche?.bottom?.matsch !== 2 || game2Data.finalStriche?.bottom?.sieg !== 1) {
            correctionsNeeded.push('Spiel 2: Bottom braucht Sieg + 2 Matsche');
        }

        // Spiel 3 sollte haben: Top (Berg + Sieg + Matsch), Bottom (nichts)
        if (game3Data.finalStriche?.top?.berg !== 1 || game3Data.finalStriche?.top?.sieg !== 1 || game3Data.finalStriche?.top?.matsch !== 1) {
            correctionsNeeded.push('Spiel 3: Top braucht Berg + Sieg + Matsch');
        }

        // Spiel 4 sollte haben: Top (Berg + Sieg + 2 Matsche), Bottom (nichts)
        if (game4Data.finalStriche?.top?.berg !== 1 || game4Data.finalStriche?.top?.sieg !== 1 || game4Data.finalStriche?.top?.matsch !== 2) {
            correctionsNeeded.push('Spiel 4: Top braucht Berg + Sieg + 2 Matsche');
        }

        if (correctionsNeeded.length > 0) {
            console.log('\n⚠️ Notwendige Korrekturen:');
            correctionsNeeded.forEach(correction => console.log('- ' + correction));
        } else {
            console.log('\n✅ Alle Striche sind korrekt gesetzt!');
        }

    } catch (error) {
        console.error('❌ Fehler bei der Analyse:', error);
    }
}

// Führe die Analyse aus
analyzeAllGamesDetailed()
    .then(() => console.log('\n🎉 Analyse abgeschlossen!'))
    .catch(console.error); 