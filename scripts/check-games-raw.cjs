/**
 * Prüfe die ROHDATEN der Games (Passen) im Turnier
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';
const REMO_ID = 'b16c1120111b7d9e7d733837';

async function check() {
  console.log('📊 ROHDATEN DER GAMES (PASSEN) IM TURNIER\n');
  
  // Lade alle Games des Turniers
  const gamesSnap = await db.collection(`tournaments/${TOURNAMENT_ID}/games`)
    .orderBy('passeNumber', 'asc')
    .get();
  
  console.log(`Anzahl Games: ${gamesSnap.size}\n`);
  
  let remoMatschMade = 0;
  let remoMatschReceived = 0;
  
  for (const doc of gamesSnap.docs) {
    const game = doc.data();
    console.log('='.repeat(80));
    console.log(`📌 GAME ${game.passeNumber} (${game.passeLabel}): ${doc.id}`);
    console.log('='.repeat(80));
    
    // Teams
    const topPlayers = game.teams?.top?.players?.map(p => p.displayName).join(' & ') || '?';
    const bottomPlayers = game.teams?.bottom?.players?.map(p => p.displayName).join(' & ') || '?';
    console.log(`   Top:    ${topPlayers}`);
    console.log(`   Bottom: ${bottomPlayers}`);
    
    // Scores
    console.log(`   Score:  ${game.finalScores?.top || 0} : ${game.finalScores?.bottom || 0}`);
    
    // Event Counts
    const topEvents = game.eventCounts?.top || {};
    const bottomEvents = game.eventCounts?.bottom || {};
    console.log(`   Events Top:    Matsch=${topEvents.matsch || 0}, Sieg=${topEvents.sieg || 0}, Berg=${topEvents.berg || 0}`);
    console.log(`   Events Bottom: Matsch=${bottomEvents.matsch || 0}, Sieg=${bottomEvents.sieg || 0}, Berg=${bottomEvents.berg || 0}`);
    
    // Final Striche
    const topStriche = game.finalStriche?.top || {};
    const bottomStriche = game.finalStriche?.bottom || {};
    console.log(`   Striche Top:    matsch=${topStriche.matsch || 0}, sieg=${topStriche.sieg || 0}, berg=${topStriche.berg || 0}`);
    console.log(`   Striche Bottom: matsch=${bottomStriche.matsch || 0}, sieg=${bottomStriche.sieg || 0}, berg=${bottomStriche.berg || 0}`);
    
    // Ist Remo in diesem Game?
    const remoInTop = game.teams?.top?.players?.some(p => p.playerId === REMO_ID);
    const remoInBottom = game.teams?.bottom?.players?.some(p => p.playerId === REMO_ID);
    
    if (remoInTop || remoInBottom) {
      const remoTeam = remoInTop ? 'top' : 'bottom';
      const opponentTeam = remoInTop ? 'bottom' : 'top';
      const madeInGame = game.eventCounts?.[remoTeam]?.matsch || 0;
      const receivedInGame = game.eventCounts?.[opponentTeam]?.matsch || 0;
      
      remoMatschMade += madeInGame;
      remoMatschReceived += receivedInGame;
      
      console.log(`\n   ⭐ REMO SPIELTE (Team ${remoTeam}):`);
      console.log(`      Matsch gemacht:  ${madeInGame}`);
      console.log(`      Matsch bekommen: ${receivedInGame}`);
    } else {
      console.log(`\n   ❌ REMO hat nicht gespielt`);
    }
    
    console.log('');
  }
  
  console.log('='.repeat(80));
  console.log('📊 ZUSAMMENFASSUNG REMO AUS ROHDATEN (games collection):');
  console.log('='.repeat(80));
  console.log(`   Matsch GEMACHT:   ${remoMatschMade}`);
  console.log(`   Matsch BEKOMMEN:  ${remoMatschReceived}`);
  console.log(`   DIFFERENZ:        ${remoMatschMade - remoMatschReceived}`);
}

check()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
