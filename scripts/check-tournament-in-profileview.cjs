/**
 * Prüfe: Wird das Turnier korrekt in ProfileView gefunden?
 * ProfileView lädt jassGameSummaries und iteriert über gameResults
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';
const REMO_ID = 'b16c1120111b7d9e7d733837';
const DAVESTER_ID = '4nhOwuVONajPArNERzyEj';
const MAZI_ID = 'ZLvyUYt_E5jhaUc0oF7O0';
const FABINSKI_ID = 'NEROr2WAYG41YEiV9v4ba';

async function check() {
  console.log('🔍 PRÜFE: Wird Turnier korrekt in ProfileView gefunden?\n');
  
  // 1. Lade das Turnier als jassGameSummary
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  
  if (!summaryDoc.exists) {
    console.log('❌ jassGameSummary existiert nicht!');
    return;
  }
  
  const summary = summaryDoc.data();
  
  console.log('='.repeat(80));
  console.log('📌 TURNIER jassGameSummary EIGENSCHAFTEN:');
  console.log('='.repeat(80));
  console.log(`   status: ${summary.status}`);
  console.log(`   isTournamentSession: ${summary.isTournamentSession}`);
  console.log(`   completedAt: ${summary.completedAt?.toDate?.()}`);
  console.log(`   gameResults: ${summary.gameResults?.length || 0} Spiele`);
  
  // 2. Prüfe ob die gameResults die erwartete Struktur haben
  console.log('\n📌 PRÜFE GAME-STRUKTUR FÜR PROFILEVIEW:');
  
  const testPlayers = [
    { id: REMO_ID, name: 'Remo' },
    { id: DAVESTER_ID, name: 'Davester' },
    { id: MAZI_ID, name: 'Mazi' },
    { id: FABINSKI_ID, name: 'Fabinski' }
  ];
  
  for (const testPlayer of testPlayers) {
    console.log(`\n   ${testPlayer.name}:`);
    
    let totalPointsDiff = 0;
    let totalStricheDiff = 0;
    let gamesPlayed = 0;
    
    for (const game of summary.gameResults || []) {
      // Prüfe ob Spieler in diesem Game war
      const playerInTop = game.teams?.top?.players?.some(p => p.playerId === testPlayer.id);
      const playerInBottom = game.teams?.bottom?.players?.some(p => p.playerId === testPlayer.id);
      
      if (!playerInTop && !playerInBottom) continue;
      
      gamesPlayed++;
      const playerTeam = playerInTop ? 'top' : 'bottom';
      
      // Berechne Punkte-Diff (wie ProfileView)
      const playerScore = playerTeam === 'top' ? game.topScore : game.bottomScore;
      const opponentScore = playerTeam === 'top' ? game.bottomScore : game.topScore;
      const pointsDiff = playerScore - opponentScore;
      totalPointsDiff += pointsDiff;
      
      // Berechne Striche-Diff (wie ProfileView)
      const playerStriche = playerTeam === 'top' ? game.finalStriche?.top : game.finalStriche?.bottom;
      const opponentStriche = playerTeam === 'top' ? game.finalStriche?.bottom : game.finalStriche?.top;
      
      let stricheDiff = 0;
      if (playerStriche && opponentStriche) {
        const playerTotal = (playerStriche.berg || 0) + (playerStriche.sieg || 0) + 
                           (playerStriche.matsch || 0) + (playerStriche.schneider || 0) + 
                           (playerStriche.kontermatsch || 0);
        const opponentTotal = (opponentStriche.berg || 0) + (opponentStriche.sieg || 0) + 
                             (opponentStriche.matsch || 0) + (opponentStriche.schneider || 0) + 
                             (opponentStriche.kontermatsch || 0);
        stricheDiff = playerTotal - opponentTotal;
      }
      totalStricheDiff += stricheDiff;
    }
    
    console.log(`      Spiele: ${gamesPlayed}`);
    console.log(`      Punkte-Diff: ${totalPointsDiff}`);
    console.log(`      Striche-Diff: ${totalStricheDiff}`);
    
    // Vergleiche mit scoresHistory
    const scoresSnap = await db.collection(`players/${testPlayer.id}/scoresHistory`)
      .where('sessionId', '==', TOURNAMENT_ID)
      .limit(1)
      .get();
    
    if (!scoresSnap.empty) {
      const scores = scoresSnap.docs[0].data();
      console.log(`      scoresHistory.pointsDiff: ${scores.pointsDiff}`);
      console.log(`      scoresHistory.stricheDiff: ${scores.stricheDiff}`);
      
      if (scores.pointsDiff !== totalPointsDiff) {
        console.log(`      ❌ MISMATCH Punkte: ${scores.pointsDiff} vs ${totalPointsDiff}`);
      } else {
        console.log(`      ✅ Punkte stimmen überein`);
      }
      
      if (scores.stricheDiff !== totalStricheDiff) {
        console.log(`      ❌ MISMATCH Striche: ${scores.stricheDiff} vs ${totalStricheDiff}`);
      } else {
        console.log(`      ✅ Striche stimmen überein`);
      }
    }
  }
  
  // 3. Prüfe welche Labels ProfileView erzeugen würde
  console.log('\n' + '='.repeat(80));
  console.log('📌 WAS WÜRDE PROFILEVIEW BERECHNEN?');
  console.log('='.repeat(80));
  
  // Simuliere ProfileView-Logik: Iteriert über alle Sessions und berechnet kumulative Werte
  // Das Problem könnte sein, dass das Turnier nicht korrekt in die Berechnung einfliesst
  
  // Lade ALLE jassGameSummaries für diese Gruppe
  const allSummaries = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`)
    .orderBy('completedAt', 'asc')
    .get();
  
  console.log(`\n   Total Sessions in Gruppe: ${allSummaries.size}`);
  
  // Finde das Turnier
  let tournamentFound = false;
  let tournamentIndex = 0;
  
  allSummaries.docs.forEach((doc, index) => {
    if (doc.id === TOURNAMENT_ID) {
      tournamentFound = true;
      tournamentIndex = index + 1;
    }
  });
  
  console.log(`   Turnier gefunden: ${tournamentFound ? '✅ JA' : '❌ NEIN'}`);
  console.log(`   Turnier Position: ${tournamentIndex} von ${allSummaries.size}`);
}

check()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
