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

async function fixSessionStructureExactFinal() {
    try {
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);
        const session = await sessionRef.get();
        const sessionData = session.data();

        // 1. Get all rounds from the session's rounds collection
        const roundsRef = sessionRef.collection('rounds');
        const roundsSnapshot = await roundsRef.get();
        const allRounds = [];
        roundsSnapshot.forEach(doc => {
            allRounds.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Sort rounds by timestamp
        allRounds.sort((a, b) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeA - timeB;
        });

        console.log('Found rounds:', allRounds.length);

        // 2. Delete existing completedGames subcollection
        const completedGamesRef = sessionRef.collection('completedGames');
        const games = await completedGamesRef.get();
        for (const doc of games.docs) {
            // Delete any subcollections first
            const gameRoundsRef = completedGamesRef.doc(doc.id).collection('rounds');
            const gameRounds = await gameRoundsRef.get();
            for (const roundDoc of gameRounds.docs) {
                await roundDoc.ref.delete();
            }
            // Then delete the document
            await doc.ref.delete();
        }

        // 3. Create proper completedGames structure with roundHistory
        const roundsPerGame = Math.ceil(allRounds.length / 4);
        const newGames = [
            {
                gameNumber: 1,
                bottomScore: 5129,
                topScore: 4451,
                winnerTeam: 'bottom',
                completedAt: admin.firestore.Timestamp.fromDate(new Date('2025-06-26T20:15:00+02:00')),
                rounds: allRounds.slice(0, roundsPerGame)
            },
            {
                gameNumber: 2,
                bottomScore: 5481,
                topScore: 4177,
                winnerTeam: 'bottom',
                completedAt: admin.firestore.Timestamp.fromDate(new Date('2025-06-26T21:30:00+02:00')),
                rounds: allRounds.slice(roundsPerGame, roundsPerGame * 2)
            },
            {
                gameNumber: 3,
                bottomScore: 4212,
                topScore: 5030,
                winnerTeam: 'top',
                completedAt: admin.firestore.Timestamp.fromDate(new Date('2025-06-26T22:45:00+02:00')),
                rounds: allRounds.slice(roundsPerGame * 2, roundsPerGame * 3)
            },
            {
                gameNumber: 4,
                bottomScore: 4765,
                topScore: 5581,
                winnerTeam: 'top',
                completedAt: admin.firestore.Timestamp.fromDate(new Date('2025-06-27T00:56:16+02:00')),
                rounds: allRounds.slice(roundsPerGame * 3)
            }
        ];

        // Create completedGames with proper structure
        for (const game of newGames) {
            const gameRef = completedGamesRef.doc(game.gameNumber.toString());
            
            await gameRef.set({
                gameNumber: game.gameNumber,
                bottomScore: game.bottomScore,
                topScore: game.topScore,
                winnerTeam: game.winnerTeam,
                status: 'completed',
                completedAt: game.completedAt,
                participantPlayerIds: sessionData.participantPlayerIds,
                participantUids: sessionData.participantUids,
                playerNames: sessionData.playerNames,
                sessionId: SESSION_ID,
                groupId: sessionData.groupId,
                activeGameId: `game${game.gameNumber}`,
                durationMillis: 3600000,
                roundHistory: game.rounds.map(round => ({
                    actionType: round.actionType,
                    cardStyle: round.cardStyle,
                    currentPlayer: round.currentPlayer,
                    farbe: round.farbe,
                    id: round.id,
                    isActive: true,
                    isCompleted: true,
                    isRoundFinalized: true,
                    jassPoints: round.jassPoints,
                    roundId: round.roundId,
                    roundState: round.roundState,
                    scores: round.scores,
                    startingPlayer: round.startingPlayer,
                    striche: round.striche,
                    timestamp: round.timestamp,
                    weisActions: round.weisActions || [],
                    weisPoints: round.weisPoints || { bottom: 0, top: 0 },
                    _savedWeisPoints: round._savedWeisPoints || { bottom: 0, top: 0 }
                })),
                timestampCompleted: game.completedAt
            });

            console.log(`Game ${game.gameNumber} created with ${game.rounds.length} rounds`);
        }

        // 4. Delete rounds collection
        for (const doc of roundsSnapshot.docs) {
            await doc.ref.delete();
        }

        // 5. Update main session document timestamps
        const startTime = new Date('2025-06-26T19:15:16+02:00').getTime();
        const completedTime = new Date('2025-06-27T01:27:20+02:00').getTime();
        const startedAtTimestamp = admin.firestore.Timestamp.fromMillis(startTime);
        const completedAtTimestamp = admin.firestore.Timestamp.fromMillis(completedTime);

        // 6. Update main session document
        await sessionRef.update({
            startedAt: startedAtTimestamp,
            timestampCompleted: completedAtTimestamp,
            status: 'completed',
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: completedAtTimestamp,
            lastActivity: completedAtTimestamp,
            lastCompletedGameUpdate: completedAtTimestamp,
            // Remove any fields that shouldn't be there
            startetAt: admin.firestore.FieldValue.delete()
        });

        console.log('✅ Session structure fixed successfully!');
        console.log('📊 Updated session data:');
        console.log('   - CompletedGames structure corrected with roundHistory');
        console.log('   - Timestamps fixed');
        console.log('   - Rounds collection removed');
        console.log('\n🎮 Games processed:', newGames.length);
        console.log('📝 Total rounds:', allRounds.length);
        console.log('⏰ Session timeframe:', {
            start: startedAtTimestamp.toDate(),
            end: completedAtTimestamp.toDate()
        });

    } catch (error) {
        console.error('❌ Error fixing session structure:', error);
        console.error('Error details:', error.stack);
    }
}

// Run the fix
fixSessionStructureExactFinal()
    .then(() => console.log('🎉 Script completed!'))
    .catch(console.error); 