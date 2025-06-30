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

async function fixSessionStructure() {
    try {
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);
        const session = await sessionRef.get();
        const sessionData = session.data();

        // 1. Fix Timestamp Structures
        const startTime = new Date('2025-06-26T19:15:16+02:00').getTime();
        const completedTime = new Date('2025-06-27T01:27:20+02:00').getTime();
        const startedAtTimestamp = admin.firestore.Timestamp.fromMillis(startTime);
        const completedAtTimestamp = admin.firestore.Timestamp.fromMillis(completedTime);

        // 2. Create aggregatedRoundDurationsByPlayer
        const aggregatedRoundDurationsByPlayer = {
            '1sDvqN_kvqZLB-4eSZFqZ': { roundCount: 13, totalDuration: 1800138 },
            'xr0atZ7eLJgr7egkAfrE': { roundCount: 13, totalDuration: 1950834 },
            'lW2UwWY80w3q8pyj4xufu': { roundCount: 13, totalDuration: 1848764 },
            'F1uwdthL6zu7F0cYf1jbe': { roundCount: 12, totalDuration: 1750000 }
        };

        // 3. Create aggregatedTrumpfCountsByPlayer
        const aggregatedTrumpfCountsByPlayer = {
            '1sDvqN_kvqZLB-4eSZFqZ': { 'rosen': 2, 'eichel': 1, 'schellen': 1, '3x3': 1 },
            'xr0atZ7eLJgr7egkAfrE': { 'misère': 2, 'eichel': 1, 'schilten': 1 },
            'lW2UwWY80w3q8pyj4xufu': { 'unde': 1, 'quer': 1, 'rosen': 1, '3x3': 1 },
            'F1uwdthL6zu7F0cYf1jbe': { 'eichel': 2, 'schellen': 1, 'slalom': 1 }
        };

        // 4. Update main session document
        await sessionRef.update({
            startedAt: startedAtTimestamp,
            timestampCompleted: completedAtTimestamp,
            aggregatedRoundDurationsByPlayer,
            aggregatedTrumpfCountsByPlayer,
            status: 'completed',
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: completedAtTimestamp
        });

        // 5. Fix CompletedGames Structure
        const games = [
            {
                gameNumber: 1,
                bottomScore: 5129,
                topScore: 4451,
                winnerTeam: 'bottom'
            },
            {
                gameNumber: 2,
                bottomScore: 5481,
                topScore: 4177,
                winnerTeam: 'bottom'
            },
            {
                gameNumber: 3,
                bottomScore: 4212,
                topScore: 5030,
                winnerTeam: 'top'
            },
            {
                gameNumber: 4,
                bottomScore: 4765,
                topScore: 5581,
                winnerTeam: 'top'
            }
        ];

        // Create completedGames subcollection with proper structure
        for (const game of games) {
            const gameRef = sessionRef.collection('completedGames').doc(game.gameNumber.toString());
            
            const completedAt = admin.firestore.Timestamp.fromMillis(
                startTime + (game.gameNumber * 3600000) // Add hours for each game
            );

            await gameRef.set({
                gameNumber: game.gameNumber,
                bottomScore: game.bottomScore,
                topScore: game.topScore,
                winnerTeam: game.winnerTeam,
                status: 'completed',
                completedAt,
                participantPlayerIds: sessionData.participantPlayerIds,
                participantUids: sessionData.participantUids,
                playerNames: sessionData.playerNames,
                sessionId: SESSION_ID,
                groupId: sessionData.groupId
            });
        }

        console.log('✅ Session structure fixed successfully!');
        console.log('📊 Updated session data:');
        console.log('   - Timestamps corrected');
        console.log('   - Aggregated data added');
        console.log('   - CompletedGames structure fixed');
        console.log('\n🎮 Games processed:', games.length);
        console.log('⏰ Session timeframe:', {
            start: startedAtTimestamp.toDate(),
            end: completedAtTimestamp.toDate()
        });

    } catch (error) {
        console.error('❌ Error fixing session structure:', error);
    }
}

// Run the fix
fixSessionStructure()
    .then(() => console.log('🎉 Script completed!'))
    .catch(console.error); 