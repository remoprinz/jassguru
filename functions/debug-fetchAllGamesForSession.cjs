const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}

const db = admin.firestore();

// Repliziere die fetchAllGamesForSession Funktion
async function debugFetchAllGamesForSession(sessionId) {
  if (!sessionId) {
    console.error("[fetchAllGamesForSession] sessionId is required.");
    return [];
  }
  console.log(`[fetchAllGamesForSession] Fetching games for session: ${sessionId}`);

  try {
    const gamesRef = db.collection('jassGameSummaries').doc(sessionId).collection('completedGames');
    const q = gamesRef.orderBy('timestampCompleted', 'asc');

    const querySnapshot = await q.get();
    const games = [];

    console.log(`🔍 Query snapshot size: ${querySnapshot.size}`);
    
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      console.log(`\n📄 Document ID: ${docSnap.id}`);
      console.log(`   - gameNumber: ${data.gameNumber}`);
      console.log(`   - finalScores: ${JSON.stringify(data.finalScores)}`);
      console.log(`   - finalStriche exists: ${!!data.finalStriche}`);
      if (data.finalStriche) {
        console.log(`   - finalStriche.top: ${JSON.stringify(data.finalStriche.top)}`);
        console.log(`   - finalStriche.bottom: ${JSON.stringify(data.finalStriche.bottom)}`);
      }
      console.log(`   - roundHistory: ${data.roundHistory?.length || 0} rounds`);
      console.log(`   - teams exists: ${!!data.teams}`);
      console.log(`   - participantUids: ${JSON.stringify(data.participantUids)}`);
      
      // Explizites Mapping zu CompletedGameSummary Feldern (wie in sessionService.ts)
      const gameEntry = {
        gameNumber: data.gameNumber || 0,
        timestampCompleted: data.timestampCompleted,
        durationMillis: data.durationMillis || 0,
        finalScores: data.finalScores || { top: 0, bottom: 0 },
        finalStriche: data.finalStriche || { 
          top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, 
          bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } 
        },
        weisPoints: data.weisPoints || { top: 0, bottom: 0 },
        startingPlayer: data.startingPlayer || 1,
        initialStartingPlayer: data.initialStartingPlayer || 1,
        playerNames: data.playerNames || {},
        trumpColorsPlayed: data.trumpColorsPlayed || [],
        roundHistory: data.roundHistory || [],
        participantUids: data.participantUids || [],
        groupId: data.groupId || null,
        activeGameId: data.activeGameId || docSnap.id,
        completedAt: data.completedAt,
        teams: data.teams || null,
      };
      
      console.log(`   📊 Mapped finalStriche.top: ${JSON.stringify(gameEntry.finalStriche.top)}`);
      console.log(`   📊 Mapped finalStriche.bottom: ${JSON.stringify(gameEntry.finalStriche.bottom)}`);
      
      games.push(gameEntry);
    });

    console.log(`\n📈 Total games found: ${games.length}`);
    
    // Teste die GameViewerKreidetafel Logik
    console.log(`\n🧮 Testing GameViewerKreidetafel logic...`);
    
    let totalStricheTop = 0;
    let totalStricheBottom = 0;
    
    games.forEach((game, index) => {
      console.log(`\n🎮 Game ${index + 1}:`);
      
      // Type Guard logic from GameViewerKreidetafel
      let gameStricheTop = null;
      let gameStricheBottom = null;
      
      if ('teams' in game && game.teams) {
        console.log('   → Detected as GameEntry (teams property)');
        gameStricheTop = game.teams.top?.striche;
        gameStricheBottom = game.teams.bottom?.striche;
      } else if ('finalStriche' in game && game.finalStriche) {
        console.log('   → Detected as CompletedGameSummary (finalStriche property)');
        gameStricheTop = game.finalStriche?.top;
        gameStricheBottom = game.finalStriche?.bottom;
      } else {
        console.log('   → ❌ No valid striche data detected!');
      }
      
      console.log(`   - gameStricheTop: ${JSON.stringify(gameStricheTop)}`);
      console.log(`   - gameStricheBottom: ${JSON.stringify(gameStricheBottom)}`);
      
      // Simplified striche calculation (only count individual values, not weighted)
      const topValue = gameStricheTop ? 
        (gameStricheTop.berg || 0) + (gameStricheTop.sieg || 0) + (gameStricheTop.matsch || 0) + 
        (gameStricheTop.schneider || 0) + (gameStricheTop.kontermatsch || 0) : 0;
      const bottomValue = gameStricheBottom ? 
        (gameStricheBottom.berg || 0) + (gameStricheBottom.sieg || 0) + (gameStricheBottom.matsch || 0) + 
        (gameStricheBottom.schneider || 0) + (gameStricheBottom.kontermatsch || 0) : 0;
        
      console.log(`   - Top striche value: ${topValue}`);
      console.log(`   - Bottom striche value: ${bottomValue}`);
      
      totalStricheTop += topValue;
      totalStricheBottom += bottomValue;
    });
    
    console.log(`\n🏆 TOTALS:`);
    console.log(`   - Total top striche: ${totalStricheTop}`);
    console.log(`   - Total bottom striche: ${totalStricheBottom}`);

    return games;
  } catch (error) {
    console.error(`[fetchAllGamesForSession] Error fetching games for session ${sessionId}:`, error);
    return [];
  }
}

async function main() {
  console.log('🔍 Debugging fetchAllGamesForSession für Juli 3. Session...');
  
  const sessionId = 'GvshcbgPDCtbhCeqHApvk'; // Juli 3. Session
  const games = await debugFetchAllGamesForSession(sessionId);
  
  console.log('\n✅ Debug completed!');
}

main().catch(console.error); 