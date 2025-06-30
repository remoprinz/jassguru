const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Player IDs und Namen
const PLAYERS = {
    'b16c1120111b7d9e7d733837': 'Remo',
    'F1uwdthL6zu7F0cYf1jbe': 'Frank',
    '9K2d1OQ1mCXddko7ft6y': 'Michael',
    'PLaDRlPBo91yu5Ij8MOT2': 'Studi'
};

async function analyzeSessionWinRates() {
    console.log('🔍 Analysiere Session-Siegquoten für alle Spieler...\n');

    for (const [playerId, playerName] of Object.entries(PLAYERS)) {
        console.log(`\n==== ${playerName} (${playerId}) ====`);
        
        try {
            // Hole alle Sessions, in denen der Spieler teilgenommen hat
            const sessionsRef = db.collection('jassGameSummaries');
            const query = sessionsRef.where('participantPlayerIds', 'array-contains', playerId);
            const sessionsSnapshot = await query.get();
            
            console.log(`📊 Gefundene Sessions: ${sessionsSnapshot.size}`);
            
            let totalSessions = 0;
            let wins = 0;
            let losses = 0;
            let draws = 0;
            
            const sessionDetails = [];
            
            for (const sessionDoc of sessionsSnapshot.docs) {
                const sessionData = sessionDoc.data();
                const sessionId = sessionDoc.id;
                
                // Überspringe Sessions ohne gameWinsByPlayer
                if (!sessionData.gameWinsByPlayer || !sessionData.gameWinsByPlayer[playerId]) {
                    console.log(`⚠️  Session ${sessionId}: Keine gameWinsByPlayer für ${playerName}`);
                    continue;
                }
                
                const playerStats = sessionData.gameWinsByPlayer[playerId];
                const playerWins = playerStats.wins || 0;
                const playerLosses = playerStats.losses || 0;
                
                // Bestimme Session-Ergebnis basierend auf winnerTeamKey (nicht auf Spielen!)
                const playerTeam = sessionData.teams ? (
                    sessionData.teams.top?.players?.some(p => p.playerId === playerId) ? 'top' :
                    sessionData.teams.bottom?.players?.some(p => p.playerId === playerId) ? 'bottom' : null
                ) : null;
                
                let sessionResult;
                if (sessionData.winnerTeamKey === 'draw') {
                    sessionResult = 'DRAW';
                    draws++;
                } else if (sessionData.winnerTeamKey === playerTeam) {
                    sessionResult = 'WIN';
                    wins++;
                } else {
                    sessionResult = 'LOSS';
                    losses++;
                }
                
                totalSessions++;
                
                sessionDetails.push({
                    sessionId,
                    playerWins,
                    playerLosses,
                    result: sessionResult,
                    endedAt: sessionData.endedAt?.toDate?.() || 'N/A',
                    winnerTeamKey: sessionData.winnerTeamKey,
                    playerTeam: playerTeam || 'UNKNOWN'
                });
            }
            
            // Berechne korrekte Siegquote (nur entschiedene Spiele)
            const decidedSessions = wins + losses;
            const winRate = decidedSessions > 0 ? (wins / decidedSessions) * 100 : 0;
            
            console.log(`\n📈 Ergebnisse:`);
            console.log(`   Gesamt Sessions: ${totalSessions}`);
            console.log(`   Siege: ${wins}`);
            console.log(`   Niederlagen: ${losses}`);
            console.log(`   Unentschieden: ${draws}`);
            console.log(`   Entschiedene Sessions: ${decidedSessions}`);
            console.log(`   Korrekte Siegquote: ${winRate.toFixed(1)}%`);
            
            if (sessionDetails.length > 0) {
                console.log(`\n📋 Session Details:`);
                sessionDetails
                    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
                    .forEach((session, index) => {
                        console.log(`   ${index + 1}. ${session.sessionId}: ${session.playerWins}W-${session.playerLosses}L = ${session.result} (${session.endedAt})`);
                        console.log(`      WinnerTeamKey: ${session.winnerTeamKey}, PlayerTeam: ${session.playerTeam}`);
                    });
            }
            
        } catch (error) {
            console.error(`❌ Fehler bei ${playerName}:`, error);
        }
    }
}

// Run the analysis
analyzeSessionWinRates()
    .then(() => console.log('\n🎉 Analyse abgeschlossen!'))
    .catch(console.error); 