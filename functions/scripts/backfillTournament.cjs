const admin = require("firebase-admin");
const path = require("path");
const logger = console; // Use console for local script logging

// --- Initialize Firebase Admin SDK ---
// The SDK will automatically look for the service account key in the default
// location or via the GOOGLE_APPLICATION_CREDENTIALS environment variable.
// Since the key is in the `functions` folder, we provide a relative path.
const serviceAccountKeyPath = path.join(__dirname, '../serviceAccountKey.json');
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountKeyPath),
  });
  logger.info("Firebase Admin SDK initialized successfully.");
} catch (e) {
  logger.info("Firebase Admin SDK already initialized or an error occurred:", e.message);
}

const db = admin.firestore();

// --- TYPE DEFINITIONS & LOGIC (COPIED FROM VERIFIED FUNCTIONS) ---

function calculateEventCountsForGame(game) {
    const events = {
        top: { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 },
        bottom: { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 },
    };

    if (game.roundHistory && Array.isArray(game.roundHistory)) {
        game.roundHistory.forEach(round => {
            if (round.strichInfo?.type && round.strichInfo.team) {
                const teamKey = round.strichInfo.team;
                if (round.strichInfo.type === 'matsch') {
                    events[teamKey].matsch++;
                } else if (round.strichInfo.type === 'kontermatsch') {
                    events[teamKey].kontermatsch++;
                }
            }
        });
    }

    if (game.finalStriche) {
        if (game.finalStriche.top.sieg > 0) events.top.sieg = 1;
        if (game.finalStriche.bottom.sieg > 0) events.bottom.sieg = 1;
        if (game.finalStriche.top.berg > 0) events.top.berg = 1;
        if (game.finalStriche.bottom.berg > 0) events.bottom.berg = 1;
        if (game.finalStriche.top.schneider > 0) events.top.schneider = 1;
        if (game.finalStriche.bottom.schneider > 0) events.bottom.schneider = 1;
    }
    return events;
}

const getPlayerDocIdWithCache = (cache) => async (authUid) => {
    if (cache.has(authUid)) {
        return cache.get(authUid);
    }
    const userRef = db.collection('users').doc(authUid);
    const userSnap = await userRef.get();
    if (userSnap.exists && userSnap.data()?.playerId) {
        const playerDocId = userSnap.data().playerId;
        cache.set(authUid, playerDocId);
        return playerDocId;
    }
    const playerQuery = db.collection('players').where('userId', '==', authUid).limit(1);
    const playerSnap = await playerQuery.get();
    if (!playerSnap.empty) {
        const playerDocId = playerSnap.docs[0].id;
        cache.set(authUid, playerDocId);
        return playerDocId;
    }
    logger.warn(`Could not find player document ID for authUid: ${authUid}. Returning authUid as fallback.`);
    cache.set(authUid, authUid);
    return authUid;
};

// --- Main Script Logic ---
const backfillTournament = async (tournamentId) => {
    if (!tournamentId) {
        logger.error("Tournament ID is required.");
        return;
    }
    logger.info(`Starting backfill for tournament: ${tournamentId}`);

    try {
        const tournamentRef = db.collection("tournaments").doc(tournamentId);
        const tournamentSnap = await tournamentRef.get();

        if (!tournamentSnap.exists) {
            logger.error(`Tournament ${tournamentId} not found.`);
            return;
        }

        const afterData = tournamentSnap.data();
        const groupId = afterData.groupId;

        if (!groupId) {
            logger.error(`Tournament ${tournamentId} has no groupId.`);
            return;
        }

        const gamesSnapshot = await tournamentRef.collection("games").get();
        if (gamesSnapshot.empty) {
            logger.warn(`No games found for tournament ${tournamentId}.`);
            return;
        }

        logger.info(`Found ${gamesSnapshot.size} games to process.`);

        const games = gamesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                finalStriche: data.teamStrichePasse,
            };
        });
        games.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());

        const idCache = new Map();
        const getPlayerDocId = getPlayerDocIdWithCache(idCache);
        
        const summary = {
            finalScores: { top: 0, bottom: 0 },
            finalStriche: { top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } },
            eventCounts: { top: { berg: 0, sieg: 0, matsch: 0, kontermatsch: 0, schneider: 0 }, bottom: { berg: 0, sieg: 0, matsch: 0, kontermatsch: 0, schneider: 0 } },
            gameResults: [],
            gameWinsByPlayer: {},
            gameWinsByTeam: { top: 0, bottom: 0, ties: 0 },
            sessionTotalWeisPoints: { top: 0, bottom: 0 },
            participantPlayerIds: [],
            gamesPlayed: 0,
            durationSeconds: 0,
            createdAt: afterData.createdAt,
            startedAt: games.length > 0 ? games[0].completedAt : afterData.createdAt,
            endedAt: games.length > 0 ? games[games.length - 1].completedAt : afterData.completedAt,
            status: 'completed',
            groupId: groupId,
            tournamentId: tournamentId,
            teams: { top: { players: [] }, bottom: { players: [] } },
            playerNames: {},
            winnerTeamKey: 'tie',
        };

        let totalDurationMillis = 0;
        const allPlayerAuthIds = new Set();

        for (let i = 0; i < games.length; i++) {
            const game = games[i];
            totalDurationMillis += game.durationMillis || 0;
            summary.finalScores.top += game.teamScoresPasse.top || 0;
            summary.finalScores.bottom += game.teamScoresPasse.bottom || 0;

            let winnerTeam = 'tie';
            if (game.teamScoresPasse.top > game.teamScoresPasse.bottom) winnerTeam = 'top';
            else if (game.teamScoresPasse.bottom > game.teamScoresPasse.top) winnerTeam = 'bottom';

            if (winnerTeam === 'top') summary.gameWinsByTeam.top++;
            else if (winnerTeam === 'bottom') summary.gameWinsByTeam.bottom++;
            else summary.gameWinsByTeam.ties++;

            const gameTeams = {
                top: { players: await Promise.all(game.playerDetails.filter(p => p.team === 'top').map(async p => ({ playerId: await getPlayerDocId(p.playerId), displayName: p.playerName }))) },
                bottom: { players: await Promise.all(game.playerDetails.filter(p => p.team === 'bottom').map(async p => ({ playerId: await getPlayerDocId(p.playerId), displayName: p.playerName }))) },
            };

            summary.gameResults.push({
                gameNumber: i + 1,
                topScore: game.teamScoresPasse.top,
                bottomScore: game.teamScoresPasse.bottom,
                winnerTeam: winnerTeam,
                teams: gameTeams,
            });

            for (const p of game.playerDetails) {
                allPlayerAuthIds.add(p.playerId);
                const playerDocId = await getPlayerDocId(p.playerId);
                if (!summary.gameWinsByPlayer[playerDocId]) summary.gameWinsByPlayer[playerDocId] = { wins: 0, losses: 0 };
                if (winnerTeam === p.team) summary.gameWinsByPlayer[playerDocId].wins++;
                else if (winnerTeam !== 'tie') summary.gameWinsByPlayer[playerDocId].losses++;
                if (p.team === 'top') summary.sessionTotalWeisPoints.top += p.weisInPasse || 0;
                else summary.sessionTotalWeisPoints.bottom += p.weisInPasse || 0;
            }

            const gameEvents = calculateEventCountsForGame(game);
            ['top', 'bottom'].forEach(team => {
                Object.keys(summary.eventCounts[team]).forEach(key => {
                    summary.eventCounts[team][key] += gameEvents[team][key] || 0;
                });
            });

            ['top', 'bottom'].forEach(team => {
                const teamGameStriche = game.teamStrichePasse?.[team];
                if (teamGameStriche) {
                    Object.keys(summary.finalStriche[team]).forEach(key => {
                        summary.finalStriche[team][key] += teamGameStriche[key] || 0;
                    });
                }
            });
        }

        const resolvedPlayerIds = await Promise.all(Array.from(allPlayerAuthIds).map(uid => getPlayerDocId(uid)));
        summary.participantPlayerIds = [...new Set(resolvedPlayerIds)];
        summary.gamesPlayed = games.length;
        summary.durationSeconds = Math.round(totalDurationMillis / 1000);

        const firstGame = games[0];
        summary.teams.top.players = await Promise.all(firstGame.playerDetails.filter(p => p.team === 'top').map(async p => ({ playerId: await getPlayerDocId(p.playerId), displayName: p.playerName })));
        summary.teams.bottom.players = await Promise.all(firstGame.playerDetails.filter(p => p.team === 'bottom').map(async p => ({ playerId: await getPlayerDocId(p.playerId), displayName: p.playerName })));
        
        if (summary.finalScores.top > summary.finalScores.bottom) summary.winnerTeamKey = 'top';
        else if (summary.finalScores.bottom > summary.finalScores.top) summary.winnerTeamKey = 'bottom';
        else summary.winnerTeamKey = 'tie';

        const newSummaryRef = await db.collection("jassGameSummaries").add(summary);
        logger.info(`Successfully created JassGameSummary ${newSummaryRef.id} for tournament ${tournamentId}.`);
    } catch (error) {
        logger.error(`Failed to backfill tournament ${tournamentId}.`, { error });
    }
};

// --- Execute the script ---
const tournamentIdToBackfill = "kjoeh4ZPGtGr8GA8gp9p";
backfillTournament(tournamentIdToBackfill).then(() => {
    logger.info("Script finished successfully.");
    process.exit(0);
}).catch(err => {
    logger.error("Script failed with an unhandled error:", err);
    process.exit(1);
}); 