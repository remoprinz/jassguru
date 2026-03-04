/**
 * DEBUG: Untersuche die 2 Spieler mit 0-Werten
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

// Die 2 Spieler mit 0-Werten
const PLAYER_IDS = ['PLaDRlPBo91yU6iOD6tyu', '1sDvqN_kvqZLGDEJHiDAy'];

async function debug() {
  console.log('🔍 DEBUG: Spieler mit 0-Werten\n');
  
  // Lade jassGameSummary
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  const data = summaryDoc.data();
  const gameResults = data.gameResults || [];
  
  for (const playerId of PLAYER_IDS) {
    console.log('='.repeat(70));
    console.log(`📊 Spieler: ${playerId}`);
    console.log('='.repeat(70));
    
    // Prüfe in welchen Games der Spieler war
    let gamesPlayed = 0;
    let totalPoints = 0;
    let opponentPoints = 0;
    let playerStricheTotal = 0;
    let opponentStricheTotal = 0;
    
    gameResults.forEach((game, idx) => {
      const playerInTop = game.teams?.top?.players?.some(p => p.playerId === playerId);
      const playerInBottom = game.teams?.bottom?.players?.some(p => p.playerId === playerId);
      
      if (playerInTop || playerInBottom) {
        gamesPlayed++;
        console.log(`\n   Game ${idx + 1} (${game.passeLabel}):`);
        console.log(`      Spieler in Team: ${playerInTop ? 'TOP' : 'BOTTOM'}`);
        console.log(`      Score: top=${game.topScore}, bottom=${game.bottomScore}`);
        
        if (playerInTop) {
          totalPoints += game.topScore || 0;
          opponentPoints += game.bottomScore || 0;
          playerStricheTotal += sumStriche(game.finalStriche?.top);
          opponentStricheTotal += sumStriche(game.finalStriche?.bottom);
        } else {
          totalPoints += game.bottomScore || 0;
          opponentPoints += game.topScore || 0;
          playerStricheTotal += sumStriche(game.finalStriche?.bottom);
          opponentStricheTotal += sumStriche(game.finalStriche?.top);
        }
      }
    });
    
    console.log(`\n   📊 Zusammenfassung:`);
    console.log(`      Spiele gespielt: ${gamesPlayed}`);
    console.log(`      Punkte: ${totalPoints} (Gegner: ${opponentPoints}) → Diff: ${totalPoints - opponentPoints}`);
    console.log(`      Striche: ${playerStricheTotal} (Gegner: ${opponentStricheTotal}) → Diff: ${playerStricheTotal - opponentStricheTotal}`);
    
    // Prüfe totalEventCountsByPlayer
    const playerEvents = data.totalEventCountsByPlayer?.[playerId];
    if (playerEvents) {
      const matschBilanz = (playerEvents.matschMade || 0) - (playerEvents.matschReceived || 0);
      console.log(`      Matsch-Bilanz: ${matschBilanz}`);
    } else {
      console.log(`      ⚠️ Keine totalEventCountsByPlayer Daten`);
    }
    
    // Was ist in participantPlayerIds?
    const isInParticipants = data.participantPlayerIds?.includes(playerId);
    console.log(`      In participantPlayerIds: ${isInParticipants ? 'JA' : 'NEIN'}`);
    
    console.log('');
  }
}

function sumStriche(stricheRecord) {
  if (!stricheRecord) return 0;
  return (
    (stricheRecord.berg || 0) +
    (stricheRecord.sieg || 0) +
    (stricheRecord.matsch || 0) +
    (stricheRecord.schneider || 0) +
    (stricheRecord.kontermatsch || 0)
  );
}

debug()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
