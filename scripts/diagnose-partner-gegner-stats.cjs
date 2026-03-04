/**
 * Diagnose: Partner- und Gegner-Stats für Turnierteilnehmer
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

const DAVESTER_ID = '4nhOwuVONajPArNERzyEj';
const MAZI_ID = 'ZLvyUYt_E5jhaUc0oF7O0';
const FABINSKI_ID = 'NEROr2WAYG41YEiV9v4ba';

async function diagnose() {
  console.log('🔍 DIAGNOSE: Partner- und Gegner-Stats für Turnierteilnehmer\n');
  
  // 1. Lade das Turnier jassGameSummary
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  const tournamentData = summaryDoc.data();
  
  console.log('='.repeat(100));
  console.log('📌 TURNIER STRUKTUR');
  console.log('='.repeat(100));
  console.log(`   isTournamentSession: ${tournamentData.isTournamentSession}`);
  console.log(`   gameResults: ${tournamentData.gameResults?.length} Spiele`);
  console.log(`   teams (root): ${tournamentData.teams ? 'JA' : 'NEIN'}`);
  console.log(`   participantPlayerIds: ${tournamentData.participantPlayerIds?.length} Spieler`);
  
  // 2. Prüfe was in players/{playerId}/groupStats steht
  console.log('\n' + '='.repeat(100));
  console.log('📌 PLAYER GROUP STATS');
  console.log('='.repeat(100));
  
  const players = [
    { id: DAVESTER_ID, name: 'Davester' },
    { id: MAZI_ID, name: 'Mazi' },
    { id: FABINSKI_ID, name: 'Fabinski' }
  ];
  
  for (const player of players) {
    console.log(`\n   ${player.name}:`);
    
    // Lade groupStats für diese Gruppe
    const groupStatsDoc = await db.doc(`players/${player.id}/groupStats/${GROUP_ID}`).get();
    
    if (!groupStatsDoc.exists) {
      console.log(`      ❌ Keine groupStats für Gruppe ${GROUP_ID}`);
    } else {
      const stats = groupStatsDoc.data();
      console.log(`      partnerAggregates: ${stats.partnerAggregates?.length || 0} Partner`);
      console.log(`      opponentAggregates: ${stats.opponentAggregates?.length || 0} Gegner`);
      
      if (stats.partnerAggregates?.length > 0) {
        console.log('      Top 3 Partner:');
        stats.partnerAggregates.slice(0, 3).forEach((p, i) => {
          console.log(`         ${i+1}. ${p.partnerName}: ${p.sessionsPlayedWith} Sessions, ${p.gamesPlayedWith} Spiele`);
        });
      }
    }
    
    // Prüfe auch welche jassGameSummaries den Spieler enthalten
    const summariesSnap = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`)
      .where('participantPlayerIds', 'array-contains', player.id)
      .get();
    
    console.log(`      jassGameSummaries: ${summariesSnap.size} Sessions gefunden`);
    
    let tournamentCount = 0;
    let regularCount = 0;
    summariesSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.isTournamentSession) {
        tournamentCount++;
      } else {
        regularCount++;
      }
    });
    console.log(`         - Turniere: ${tournamentCount}`);
    console.log(`         - Reguläre Sessions: ${regularCount}`);
  }
  
  // 3. Prüfe wie ProfileView Partner-Stats berechnet
  console.log('\n' + '='.repeat(100));
  console.log('📌 TURNIER SPIELE DETAILS (für Partner-Berechnung)');
  console.log('='.repeat(100));
  
  // Zeige alle Spiele des Turniers mit Teams
  for (let i = 0; i < tournamentData.gameResults?.length; i++) {
    const game = tournamentData.gameResults[i];
    console.log(`\n   Spiel ${i + 1}:`);
    
    const topPlayers = game.teams?.top?.players?.map(p => p.displayName || p.playerId.substring(0, 8)).join(' & ') || '?';
    const bottomPlayers = game.teams?.bottom?.players?.map(p => p.displayName || p.playerId.substring(0, 8)).join(' & ') || '?';
    
    console.log(`      Top: ${topPlayers}`);
    console.log(`      Bottom: ${bottomPlayers}`);
    console.log(`      Score: ${game.topScore} : ${game.bottomScore}`);
  }
  
  // 4. Prüfe ob Mazi in irgendeinem Spiel als Partner vorkommt
  console.log('\n' + '='.repeat(100));
  console.log('📌 MAZI PARTNER IM TURNIER');
  console.log('='.repeat(100));
  
  const maziPartners = new Set();
  const maziOpponents = new Set();
  
  for (const game of tournamentData.gameResults || []) {
    const topPlayers = game.teams?.top?.players || [];
    const bottomPlayers = game.teams?.bottom?.players || [];
    
    const maziInTop = topPlayers.some(p => p.playerId === MAZI_ID);
    const maziInBottom = bottomPlayers.some(p => p.playerId === MAZI_ID);
    
    if (maziInTop) {
      topPlayers.forEach(p => {
        if (p.playerId !== MAZI_ID) maziPartners.add(p.displayName || p.playerId);
      });
      bottomPlayers.forEach(p => {
        maziOpponents.add(p.displayName || p.playerId);
      });
    } else if (maziInBottom) {
      bottomPlayers.forEach(p => {
        if (p.playerId !== MAZI_ID) maziPartners.add(p.displayName || p.playerId);
      });
      topPlayers.forEach(p => {
        maziOpponents.add(p.displayName || p.playerId);
      });
    }
  }
  
  console.log(`   Mazi's Partner: ${[...maziPartners].join(', ') || 'KEINE'}`);
  console.log(`   Mazi's Gegner: ${[...maziOpponents].join(', ') || 'KEINE'}`);
}

diagnose()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
