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

// Die 4 Spiele vom 26. Juni 2025
const GAME_IDS = {
    game1: 'McwZp97kiOhAJXwhEFAh',  // 19:15 - Marc/Roger gewinnen
    game2: 'b6WgosKliW94lXKnPIM7',  // 20:21 - Marc/Roger gewinnen
    game3: 'zGrHNzF6EE05kKtnzu0b',  // 21:26 - Claudia/Frank gewinnen
    game4: 'e7O072Iy9vSHuO0cZZKF'   // 22:44 - Claudia/Frank gewinnen
};

async function createPerfectSessionStructure() {
    try {
        // 1. Hole alle activeGames und ihre Runden
        const games = {};
        for (const [key, gameId] of Object.entries(GAME_IDS)) {
            const gameRef = db.collection('activeGames').doc(gameId);
            const game = await gameRef.get();
            const gameData = game.data();

            // Hole alle Runden für dieses Spiel
            const roundsRef = gameRef.collection('rounds');
            const roundsSnapshot = await roundsRef.get();
            const rounds = [];
            roundsSnapshot.forEach(doc => {
                rounds.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Sortiere Runden nach roundNumber
            rounds.sort((a, b) => {
                const numA = a.roundState?.roundNumber || 0;
                const numB = b.roundState?.roundNumber || 0;
                return numA - numB;
            });

            games[key] = {
                gameData,
                rounds
            };

            console.log(`✅ Loaded ${key} with ${rounds.length} rounds`);
        }

        // 2. Erstelle das neue jassGameSummaries Dokument
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);
        
        // Timestamps für die Session
        const startTime = new Date('2025-06-26T19:15:16+02:00').getTime();
        const completedTime = new Date('2025-06-27T01:27:20+02:00').getTime();
        const startedAtTimestamp = admin.firestore.Timestamp.fromMillis(startTime);
        const completedAtTimestamp = admin.firestore.Timestamp.fromMillis(completedTime);

        // 3. Setze das Hauptdokument
        await sessionRef.set({
            aggregatedRoundDurationsByPlayer: {
                '1sDvqN_kvqZLB-4eSZFqZ': { roundCount: 13, totalDuration: 1800138 },
                'xr0atZ7eLJgr7egkAfrE': { roundCount: 13, totalDuration: 1950834 },
                'lW2UwWY80w3q8pyj4xufu': { roundCount: 13, totalDuration: 1848764 },
                'F1uwdthL6zu7F0cYf1jbe': { roundCount: 12, totalDuration: 1750000 }
            },
            aggregatedTrumpfCountsByPlayer: {
                '1sDvqN_kvqZLB-4eSZFqZ': { 'rosen': 2, 'eichel': 1, 'schellen': 1, '3x3': 1 },
                'xr0atZ7eLJgr7egkAfrE': { 'misère': 2, 'eichel': 1, 'schilten': 1 },
                'lW2UwWY80w3q8pyj4xufu': { 'unde': 1, 'quer': 1, 'rosen': 1, '3x3': 1 },
                'F1uwdthL6zu7F0cYf1jbe': { 'eichel': 2, 'schellen': 1, 'slalom': 1 }
            },
            durationSeconds: 20459,
            endedAt: admin.firestore.Timestamp.fromDate(new Date('2025-06-27T00:56:16+02:00')),
            eventCounts: {
                bottom: { berg: 1, kontermatsch: 0, matsch: 2, schneider: 0, sieg: 4 },
                top: { berg: 3, kontermatsch: 0, matsch: 3, schneider: 0, sieg: 3 }
            },
            finalScores: {
                bottom: 19587,
                top: 19239
            },
            finalStriche: {
                bottom: { berg: 1, kontermatsch: 0, matsch: 2, schneider: 0, sieg: 4 },
                top: { berg: 3, kontermatsch: 0, matsch: 3, schneider: 0, sieg: 3 }
            },
            gameResults: [
                { bottomScore: 5129, gameNumber: 1, topScore: 4451, winnerTeam: 'bottom' },
                { bottomScore: 5481, gameNumber: 2, topScore: 4177, winnerTeam: 'bottom' },
                { bottomScore: 4212, gameNumber: 3, topScore: 5030, winnerTeam: 'top' },
                { bottomScore: 4765, gameNumber: 4, topScore: 5581, winnerTeam: 'top' }
            ],
            gameWinsByPlayer: {
                '1sDvqN_kvqZLB-4eSZFqZ': { losses: 2, wins: 2 },
                'xr0atZ7eLJgr7egkAfrE': { losses: 2, wins: 2 },
                'lW2UwWY80w3q8pyj4xufu': { losses: 2, wins: 2 },
                'F1uwdthL6zu7F0cYf1jbe': { losses: 2, wins: 2 }
            },
            gameWinsByTeam: {
                bottom: 2,
                top: 2
            },
            gamesPlayed: 4,
            groupId: 'Tz0wgIHMTlhvTtFastiJ',
            lastActivity: completedAtTimestamp,
            lastCompletedGameUpdate: completedAtTimestamp,
            migratedAt: admin.firestore.Timestamp.fromDate(new Date('2025-06-27T01:11:57+02:00')),
            migratedBy: 'manual-june-26-completion-script',
            migrationHistory: [
                {
                    description: 'Struktur-Vereinheitlichung: teams und pairingIdentifiers von teamA/B auf top/bottom umgeschrieben.',
                    script: 'unifyTeamStructure.js',
                    timestamp: admin.firestore.Timestamp.fromDate(new Date('2025-06-18T00:08:00+02:00')),
                    version: '7.0'
                },
                {
                    description: 'KRITISCHE SYSTEM-KORREKTUR: Teams waren in fast allen Sessions vertauscht! Bottom ↔ Top getauscht.',
                    script: 'fixAllTeamSwaps.js',
                    timestamp: admin.firestore.Timestamp.fromDate(new Date('2025-06-18T01:02:33+02:00')),
                    version: '7.3'
                },
                {
                    description: 'Manuelle Vervollständigung der Session vom 26. Juni 2025 mit korrektem Endergebnis 9:7 für Claudia/Frank.',
                    script: 'manual-june-26-completion-script',
                    timestamp: admin.firestore.Timestamp.fromDate(new Date('2025-06-27T01:11:57+02:00')),
                    version: '7.4'
                }
            ],
            migrationVersion: 7,
            pairingIdentifiers: {
                bottom: 'JmluPJeG6wbQzLkoJjlU7uVVYyw1_j6joaEvLqKayu4GV580Dt7EsZQg1',
                top: 'CF5nVG3vW7SS2omMu0ltF0zhKHs1_WQSNHuoqtBen2D3E1bu4OLgx4aI3'
            },
            participantPlayerIds: [
                '1sDvqN_kvqZLB-4eSZFqZ',
                'xr0atZ7eLJgr7egkAfrE',
                'lW2UwWY80w3q8pyj4xufu',
                'F1uwdthL6zu7F0cYf1jbe'
            ],
            participantUids: [
                'JmluPJeG6wbQzLkoJjlU7uVVYyw1',
                'CF5nVG3vW7SS2omMu0ltF0zhKHs1',
                'j6joaEvLqKayu4GV580Dt7EsZQg1',
                'WQSNHuoqtBen2D3E1bu4OLgx4aI3'
            ],
            playerNames: {
                '1': 'Marc',
                '2': 'Claudia',
                '3': 'Roger',
                '4': 'Frank'
            },
            sessionId: SESSION_ID,
            sessionTotalWeisPoints: {
                bottom: 0,
                top: 0
            },
            startedAt: startedAtTimestamp,
            status: 'completed',
            teams: {
                bottom: {
                    players: [
                        { displayName: 'Marc', playerId: '1sDvqN_kvqZLB-4eSZFqZ' },
                        { displayName: 'Roger', playerId: 'lW2UwWY80w3q8pyj4xufu' }
                    ]
                },
                top: {
                    players: [
                        { displayName: 'Claudia', playerId: 'xr0atZ7eLJgr7egkAfrE' },
                        { displayName: 'Frank', playerId: 'F1uwdthL6zu7F0cYf1jbe' }
                    ]
                }
            },
            timestampCompleted: completedAtTimestamp,
            totalRounds: 51,
            weisPoints: {
                bottom: 0,
                top: 0
            },
            winnerTeamKey: 'top',
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: completedAtTimestamp
        });

        console.log('✅ Created main session document');

        // 4. Erstelle die completedGames mit roundHistory
        const completedGames = [
            {
                gameNumber: 1,
                bottomScore: 5129,
                topScore: 4451,
                winnerTeam: 'bottom',
                completedAt: admin.firestore.Timestamp.fromDate(new Date('2025-06-26T20:15:00+02:00')),
                rounds: games.game1.rounds
            },
            {
                gameNumber: 2,
                bottomScore: 5481,
                topScore: 4177,
                winnerTeam: 'bottom',
                completedAt: admin.firestore.Timestamp.fromDate(new Date('2025-06-26T21:30:00+02:00')),
                rounds: games.game2.rounds
            },
            {
                gameNumber: 3,
                bottomScore: 4212,
                topScore: 5030,
                winnerTeam: 'top',
                completedAt: admin.firestore.Timestamp.fromDate(new Date('2025-06-26T22:45:00+02:00')),
                rounds: games.game3.rounds
            },
            {
                gameNumber: 4,
                bottomScore: 4765,
                topScore: 5581,
                winnerTeam: 'top',
                completedAt: admin.firestore.Timestamp.fromDate(new Date('2025-06-27T00:56:16+02:00')),
                rounds: games.game4.rounds
            }
        ];

        // Erstelle die completedGames
        for (const game of completedGames) {
            const gameRef = sessionRef.collection('completedGames').doc(game.gameNumber.toString());
            
            await gameRef.set({
                gameNumber: game.gameNumber,
                bottomScore: game.bottomScore,
                topScore: game.topScore,
                winnerTeam: game.winnerTeam,
                status: 'completed',
                completedAt: game.completedAt,
                participantPlayerIds: [
                    '1sDvqN_kvqZLB-4eSZFqZ',
                    'xr0atZ7eLJgr7egkAfrE',
                    'lW2UwWY80w3q8pyj4xufu',
                    'F1uwdthL6zu7F0cYf1jbe'
                ],
                participantUids: [
                    'JmluPJeG6wbQzLkoJjlU7uVVYyw1',
                    'CF5nVG3vW7SS2omMu0ltF0zhKHs1',
                    'j6joaEvLqKayu4GV580Dt7EsZQg1',
                    'WQSNHuoqtBen2D3E1bu4OLgx4aI3'
                ],
                playerNames: {
                    '1': 'Marc',
                    '2': 'Claudia',
                    '3': 'Roger',
                    '4': 'Frank'
                },
                sessionId: SESSION_ID,
                groupId: 'Tz0wgIHMTlhvTtFastiJ',
                activeGameId: GAME_IDS[`game${game.gameNumber}`],
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

            console.log(`✅ Created completedGame ${game.gameNumber} with ${game.rounds.length} rounds`);
        }

        console.log('🎉 Session structure created successfully!');
        console.log('📊 Summary:');
        console.log('   - Main document created');
        console.log('   - 4 completedGames created');
        console.log('   - All rounds converted to roundHistory arrays');
        console.log('\n⏰ Session timeframe:', {
            start: startedAtTimestamp.toDate(),
            end: completedAtTimestamp.toDate()
        });

    } catch (error) {
        console.error('❌ Error creating session structure:', error);
        console.error('Error details:', error.stack);
    }
}

// Run the script
createPerfectSessionStructure()
    .then(() => console.log('🎉 Script completed!'))
    .catch(console.error); 