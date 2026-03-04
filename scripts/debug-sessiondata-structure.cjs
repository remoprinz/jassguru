/**
 * Prüfe: Hat das Turnier-jassGameSummary die Struktur, die calculateSessionDelta braucht?
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';
const MAZI_ID = 'ZLvyUYt_E5jhaUc0oF7O0';

async function debug() {
  console.log('🔍 DEBUG: sessionData-Struktur für calculateSessionDelta\n');
  
  // Lade das Turnier-jassGameSummary (das ist das sessionData)
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  const sessionData = summaryDoc.data();
  
  console.log('='.repeat(100));
  console.log('📌 WICHTIGE FELDER FÜR calculateSessionDelta:');
  console.log('='.repeat(100));
  
  console.log(`\n1. teams (root): ${sessionData.teams ? 'VORHANDEN' : '❌ FEHLT'}`);
  console.log(`   → Wenn FEHLT, muss calculateSessionDelta durch gameResults iterieren`);
  
  console.log(`\n2. gameResults: ${sessionData.gameResults?.length || 0} Spiele`);
  
  console.log(`\n3. isTournamentSession: ${sessionData.isTournamentSession}`);
  console.log(`   tournamentId: ${sessionData.tournamentId || 'NICHT GESETZT'}`);
  
  console.log(`\n4. Für Mazi (${MAZI_ID}):`);
  
  // Simuliere calculateSessionDelta für Mazi
  const playerId = MAZI_ID;
  const partnerSet = new Map();
  const opponentSet = new Map();
  
  let gamesPlayed = 0;
  
  (sessionData.gameResults || []).forEach((game, i) => {
    const topPlayers = game.teams?.top?.players || [];
    const bottomPlayers = game.teams?.bottom?.players || [];
    
    const playerInTop = topPlayers.some(p => p.playerId === playerId);
    const playerInBottom = bottomPlayers.some(p => p.playerId === playerId);
    
    if (playerInTop || playerInBottom) {
      gamesPlayed++;
      
      if (playerInTop) {
        topPlayers.forEach(p => {
          if (p.playerId !== playerId) partnerSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
        bottomPlayers.forEach(p => {
          opponentSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
      } else {
        bottomPlayers.forEach(p => {
          if (p.playerId !== playerId) partnerSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
        topPlayers.forEach(p => {
          opponentSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
      }
    }
  });
  
  console.log(`   Spiele: ${gamesPlayed}`);
  console.log(`   Partner gefunden: ${partnerSet.size}`);
  partnerSet.forEach((name, id) => console.log(`      - ${name} (${id.substring(0, 10)}...)`));
  console.log(`   Gegner gefunden: ${opponentSet.size}`);
  opponentSet.forEach((name, id) => console.log(`      - ${name} (${id.substring(0, 10)}...)`));
  
  // Prüfe ob die Partner/Gegner auch in partnerStats/opponentStats geschrieben wurden
  console.log('\n' + '='.repeat(100));
  console.log('📌 WAS STEHT IN FIRESTORE FÜR MAZI?');
  console.log('='.repeat(100));
  
  const partnerSnap = await db.collection(`players/${MAZI_ID}/partnerStats`).get();
  console.log(`   partnerStats: ${partnerSnap.size} Einträge`);
  
  const opponentSnap = await db.collection(`players/${MAZI_ID}/opponentStats`).get();
  console.log(`   opponentStats: ${opponentSnap.size} Einträge`);
  
  // Prüfe ob updatePlayerDataAfterSession aufgerufen wurde
  // Das können wir indirekt prüfen, indem wir die scoresHistory anschauen
  const scoresSnap = await db.collection(`players/${MAZI_ID}/scoresHistory`)
    .where('sessionId', '==', TOURNAMENT_ID)
    .get();
  
  console.log(`\n   scoresHistory für Turnier: ${scoresSnap.size > 0 ? '✅ VORHANDEN' : '❌ FEHLT'}`);
  
  if (scoresSnap.size > 0) {
    const entry = scoresSnap.docs[0].data();
    console.log(`      → updatePlayerDataAfterSession wurde aufgerufen`);
    console.log(`      → Aber partnerStats wurden trotzdem nicht geschrieben?`);
  }
}

debug()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
