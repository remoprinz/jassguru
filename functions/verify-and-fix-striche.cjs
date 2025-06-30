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

async function verifyAndFixStriche() {
    try {
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);
        const sessionDoc = await sessionRef.get();
        const sessionData = sessionDoc.data();

        if (!sessionData) {
            console.error('❌ Session nicht gefunden!');
            return;
        }

        console.log('\n🔍 Überprüfe Striche in Session:', SESSION_ID);

        // Sammle alle Striche aus den CompletedGames
        const allStriche = {
            bottom: { berg: 0, kontermatsch: 0, matsch: 0, schneider: 0, sieg: 0 },
            top: { berg: 0, kontermatsch: 0, matsch: 0, schneider: 0, sieg: 0 }
        };

        // Durchlaufe alle CompletedGames
        for (let i = 1; i <= sessionData.gamesPlayed; i++) {
            const gameRef = sessionRef.collection('completedGames').doc(i.toString());
            const gameDoc = await gameRef.get();
            const gameData = gameDoc.data();

            if (!gameData) {
                console.error(`❌ Spiel ${i} nicht gefunden!`);
                continue;
            }

            console.log(`\n📊 Analysiere Spiel ${i}:`);
            
            // Analysiere die roundHistory für Striche
            const roundHistory = gameData.roundHistory || [];
            let gameStriche = {
                bottom: { berg: 0, kontermatsch: 0, matsch: 0, schneider: 0, sieg: 0 },
                top: { berg: 0, kontermatsch: 0, matsch: 0, schneider: 0, sieg: 0 }
            };

            let lastRound = null;
            roundHistory.forEach((round, idx) => {
                if (round.striche) {
                    lastRound = round;
                    // Speichere den letzten Stand der Striche
                    gameStriche = {
                        bottom: { ...round.striche.bottom },
                        top: { ...round.striche.top }
                    };
                }
            });

            if (lastRound) {
                console.log('Finale Striche im Spiel:');
                console.log('Bottom:', JSON.stringify(gameStriche.bottom));
                console.log('Top:', JSON.stringify(gameStriche.top));

                // Addiere die Striche zum Gesamt
                ['bottom', 'top'].forEach(team => {
                    ['berg', 'kontermatsch', 'matsch', 'schneider', 'sieg'].forEach(type => {
                        allStriche[team][type] += gameStriche[team][type] || 0;
                    });
                });

                // Bestimme den Gewinner basierend auf den Punkten
                const winner = gameData.bottomScore > gameData.topScore ? 'bottom' : 'top';
                
                // Überprüfe, ob die Siege korrekt gezählt wurden
                if (gameStriche[winner].sieg !== 1) {
                    console.log(`⚠️ Korrigiere Sieg für Spiel ${i} (${winner})`);
                    gameStriche[winner].sieg = 1;
                    gameStriche[winner === 'bottom' ? 'top' : 'bottom'].sieg = 0;

                    // Update das Spiel mit korrigierten Strichen
                    await gameRef.update({
                        finalStriche: gameStriche
                    });
                }
            }
        }

        console.log('\n📊 Gesamte Striche der Session:');
        console.log('Bottom:', JSON.stringify(allStriche.bottom));
        console.log('Top:', JSON.stringify(allStriche.top));

        // Vergleiche mit den gespeicherten finalStriche
        const storedFinalStriche = sessionData.finalStriche;
        console.log('\n🔄 Gespeicherte finale Striche:');
        console.log('Bottom:', JSON.stringify(storedFinalStriche.bottom));
        console.log('Top:', JSON.stringify(storedFinalStriche.top));

        // Überprüfe auf Unterschiede
        let needsUpdate = false;
        ['bottom', 'top'].forEach(team => {
            ['berg', 'kontermatsch', 'matsch', 'schneider', 'sieg'].forEach(type => {
                if (allStriche[team][type] !== storedFinalStriche[team][type]) {
                    console.log(`⚠️ Differenz gefunden in ${team}.${type}:`);
                    console.log(`Gespeichert: ${storedFinalStriche[team][type]}`);
                    console.log(`Berechnet: ${allStriche[team][type]}`);
                    needsUpdate = true;
                }
            });
        });

        if (needsUpdate) {
            console.log('\n🔄 Aktualisiere finale Striche...');
            await sessionRef.update({
                finalStriche: allStriche
            });
            console.log('✅ Finale Striche aktualisiert!');
        } else {
            console.log('\n✅ Finale Striche sind korrekt!');
        }

    } catch (error) {
        console.error('❌ Fehler beim Überprüfen der Striche:', error);
    }
}

// Führe die Überprüfung aus
verifyAndFixStriche()
    .then(() => console.log('\n🎉 Überprüfung abgeschlossen!'))
    .catch(console.error); 