const admin = require('firebase-admin');

// Firebase Admin SDK initialisieren mit serviceAccountKey.json
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

// Frank's Daten
const FRANK_PLAYER_DOC_ID = 'F1uwdthL6zu7F0cYf1jbe';
const FRANK_AUTH_UID = 'WQSNHuoqtBen2D3E1bu4OLgx4aI3';
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

async function analyzeFrankStatistics() {
  console.log('🔍 Analyzing Frank\'s statistics in detail...\n');
  console.log(`Frank's Player Doc ID: ${FRANK_PLAYER_DOC_ID}`);
  console.log(`Frank's Auth UID: ${FRANK_AUTH_UID}\n`);
  
  try {
    // Lade alle Sessions mit Frank
    const sessionsQuery = await db.collection('jassGameSummaries')
      .where('participantPlayerIds', 'array-contains', FRANK_PLAYER_DOC_ID)
      .where('status', '==', 'completed')
      .get();
    
    console.log(`📊 Found ${sessionsQuery.docs.length} sessions with Frank\n`);
    
    let manualCalculation = {
      totalSessions: 0,
      totalGames: 0,
      strichesMade: 0,
      strichesReceived: 0,
      stricheDifference: 0,
      sessions: []
    };
    
    for (const sessionDoc of sessionsQuery.docs) {
      const sessionData = sessionDoc.data();
      
      console.log(`🎯 Session: ${sessionDoc.id}`);
      console.log(`   Games played: ${sessionData.gamesPlayed}`);
      console.log(`   Winner: ${sessionData.winnerTeamKey}`);
      
      // Bestimme Frank's Team
      let frankTeam = null;
      let frankTeamPosition = null;
      
      // KORRIGIERT: Suche sowohl nach Auth UID als auch Player Doc ID
      if (sessionData.teams?.teamA?.players) {
        for (const player of sessionData.teams.teamA.players) {
          if (player.playerId === FRANK_AUTH_UID || player.playerId === FRANK_PLAYER_DOC_ID) {
            frankTeam = 'teamA';
            console.log(`   Found Frank in teamA with playerId: ${player.playerId}`);
            break;
          }
        }
      }
      
      if (!frankTeam && sessionData.teams?.teamB?.players) {
        for (const player of sessionData.teams.teamB.players) {
          if (player.playerId === FRANK_AUTH_UID || player.playerId === FRANK_PLAYER_DOC_ID) {
            frankTeam = 'teamB';
            console.log(`   Found Frank in teamB with playerId: ${player.playerId}`);
            break;
          }
        }
      }
      
      // Bestimme Position (top/bottom) basierend auf teamScoreMapping
      if (frankTeam && sessionData.teamScoreMapping) {
        frankTeamPosition = sessionData.teamScoreMapping[frankTeam];
      } else if (frankTeam) {
        // Fallback: teamA = bottom, teamB = top (default mapping)
        frankTeamPosition = frankTeam === 'teamA' ? 'bottom' : 'top';
      }
      
      console.log(`   Frank's team: ${frankTeam} (position: ${frankTeamPosition})`);
      
      if (frankTeam && frankTeamPosition && sessionData.finalStriche) {
        const frankStriche = sessionData.finalStriche[frankTeamPosition] || {};
        const opponentPosition = frankTeamPosition === 'top' ? 'bottom' : 'top';
        const opponentStriche = sessionData.finalStriche[opponentPosition] || {};
        
        const frankTotal = (frankStriche.berg || 0) + (frankStriche.sieg || 0) + 
                          (frankStriche.matsch || 0) + (frankStriche.schneider || 0) + 
                          (frankStriche.kontermatsch || 0);
        
        const opponentTotal = (opponentStriche.berg || 0) + (opponentStriche.sieg || 0) + 
                             (opponentStriche.matsch || 0) + (opponentStriche.schneider || 0) + 
                             (opponentStriche.kontermatsch || 0);
        
        const sessionDifference = frankTotal - opponentTotal;
        
        console.log(`   Frank's striche (${frankTeamPosition}): ${frankTotal}`);
        console.log(`   Opponent striche (${opponentPosition}): ${opponentTotal}`);
        console.log(`   Session difference: ${sessionDifference >= 0 ? '+' : ''}${sessionDifference}`);
        
        manualCalculation.strichesMade += frankTotal;
        manualCalculation.strichesReceived += opponentTotal;
        manualCalculation.sessions.push({
          sessionId: sessionDoc.id,
          team: frankTeam,
          position: frankTeamPosition,
          made: frankTotal,
          received: opponentTotal,
          difference: sessionDifference,
          games: sessionData.gamesPlayed || 0,
          winner: sessionData.winnerTeamKey,
          frankWon: sessionData.winnerTeamKey === frankTeam
        });
      } else {
        console.log(`   ⚠️  Could not determine Frank's team or striche data`);
      }
      
      manualCalculation.totalSessions++;
      manualCalculation.totalGames += sessionData.gamesPlayed || 0;
      
      console.log('');
    }
    
    manualCalculation.stricheDifference = manualCalculation.strichesMade - manualCalculation.strichesReceived;
    
    console.log('📈 MANUAL CALCULATION SUMMARY:');
    console.log(`   Sessions: ${manualCalculation.totalSessions}`);
    console.log(`   Games: ${manualCalculation.totalGames}`);
    console.log(`   Striche made: ${manualCalculation.strichesMade}`);
    console.log(`   Striche received: ${manualCalculation.strichesReceived}`);
    console.log(`   Striche difference: ${manualCalculation.stricheDifference >= 0 ? '+' : ''}${manualCalculation.stricheDifference}`);
    console.log('');
    
    // Jetzt lade die Backend-berechneten Statistiken
    const statsDoc = await db.collection('groupComputedStats').doc(GROUP_ID).get();
    
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      
      // Finde Frank in den verschiedenen Statistiken
      const frankGamesData = stats.playerWithMostGames?.find(p => p.playerId === FRANK_PLAYER_DOC_ID);
      const frankStricheData = stats.playerWithHighestStricheDiff?.find(p => p.playerId === FRANK_PLAYER_DOC_ID);
      
      console.log('🤖 BACKEND CALCULATION RESULTS:');
      console.log(`   Frank games: ${frankGamesData?.value || 'NOT FOUND'}`);
      console.log(`   Frank striche difference: ${frankStricheData?.value || 'NOT FOUND'}`);
      console.log('');
      
      console.log('🔍 COMPARISON:');
      console.log(`   Manual Games: ${manualCalculation.totalGames}`);
      console.log(`   Backend Games: ${frankGamesData?.value || 'NOT FOUND'}`);
      console.log(`   Games Match: ${manualCalculation.totalGames === (frankGamesData?.value || 0) ? '✅' : '❌'}`);
      console.log('');
      console.log(`   Manual Striche Diff: ${manualCalculation.stricheDifference}`);
      console.log(`   Backend Striche Diff: ${frankStricheData?.value || 'NOT FOUND'}`);
      console.log(`   Striche Match: ${manualCalculation.stricheDifference === (frankStricheData?.value || 0) ? '✅' : '❌'}`);
      
      if (manualCalculation.stricheDifference !== (frankStricheData?.value || 0)) {
        console.log('\n🚨 STRICHE-DIFFERENZ STIMMT NICHT ÜBEREIN!');
        console.log('Detaillierte Session-Aufschlüsselung:');
        manualCalculation.sessions.forEach((session, index) => {
          console.log(`   ${index + 1}. ${session.sessionId}: ${session.difference >= 0 ? '+' : ''}${session.difference}`);
        });
      }
      
    } else {
      console.log('❌ Group statistics document not found');
    }
    
  } catch (error) {
    console.error('❌ Error during Frank analysis:', error);
  }
}

// Führe die Analyse aus
analyzeFrankStatistics()
  .then(() => {
    console.log('\n🎉 Frank analysis completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Frank analysis failed:', error);
    process.exit(1);
  }); 