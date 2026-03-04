/**
 * Simuliere calculateSessionDelta exakt wie im Backend
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';
const MAZI_ID = 'ZLvyUYt_E5jhaUc0oF7O0';

async function simulate() {
  console.log('🔍 SIMULIERE calculateSessionDelta für Mazi\n');
  
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  const sessionData = summaryDoc.data();
  const playerId = MAZI_ID;
  
  // Exakt wie im Backend:
  let playerTeam = null;
  
  // Erst in Root-Level teams suchen (normale Sessions)
  console.log('1. Prüfe sessionData.teams?.top?.players:');
  console.log(`   sessionData.teams: ${sessionData.teams ? 'VORHANDEN' : 'UNDEFINED'}`);
  
  if (sessionData.teams?.top?.players?.some(p => p.playerId === playerId)) {
    playerTeam = 'top';
    console.log('   → Gefunden in teams.top');
  } else if (sessionData.teams?.bottom?.players?.some(p => p.playerId === playerId)) {
    playerTeam = 'bottom';
    console.log('   → Gefunden in teams.bottom');
  } else {
    console.log('   → NICHT GEFUNDEN in Root-Level teams');
  }
  
  // Falls nicht gefunden und Turnier, suche in gameResults
  console.log('\n2. Prüfe gameResults (da playerTeam null):');
  if (!playerTeam && sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
    for (const game of sessionData.gameResults) {
      if (game.teams?.top?.players?.some(p => p.playerId === playerId)) {
        playerTeam = 'top';
        console.log('   → Gefunden in gameResults.teams.top');
        break;
      } else if (game.teams?.bottom?.players?.some(p => p.playerId === playerId)) {
        playerTeam = 'bottom';
        console.log('   → Gefunden in gameResults.teams.bottom');
        break;
      }
    }
  }
  
  console.log(`\n3. playerTeam = ${playerTeam}`);
  
  if (!playerTeam) {
    console.log('\n❌ FEHLER: playerTeam ist null → calculateSessionDelta returned früh!');
    return;
  }
  
  // Jetzt die Partner/Gegner-Logik
  const isTournament = sessionData.isTournamentSession || sessionData.tournamentId;
  console.log(`\n4. isTournament = ${isTournament}`);
  
  let teamPlayers = [];
  let opponentPlayers = [];
  
  console.log('\n5. Partner/Gegner-Logik:');
  console.log(`   sessionData.teams: ${sessionData.teams ? 'VORHANDEN' : 'UNDEFINED'}`);
  console.log(`   sessionData.teams?.[playerTeam]: ${sessionData.teams?.[playerTeam] ? 'VORHANDEN' : 'UNDEFINED'}`);
  
  // Hier ist das Problem: Die Bedingung!
  // if (isTournament && (!sessionData.teams || !sessionData.teams[playerTeam]) && sessionData.gameResults)
  const condition1 = isTournament;
  const condition2 = !sessionData.teams || !sessionData.teams[playerTeam];
  const condition3 = !!sessionData.gameResults;
  
  console.log(`\n   Bedingung für Turnier-Logik:`);
  console.log(`      isTournament: ${condition1}`);
  console.log(`      !sessionData.teams || !sessionData.teams[playerTeam]: ${condition2}`);
  console.log(`      sessionData.gameResults: ${condition3}`);
  console.log(`      → Alle true? ${condition1 && condition2 && condition3}`);
  
  if (condition1 && condition2 && condition3) {
    // Sammle alle Partner und Gegner aus allen Games
    const partnerSet = new Map();
    const opponentSet = new Map();
    
    sessionData.gameResults.forEach((game, i) => {
      const topPlayers = game.teams?.top?.players || [];
      const bottomPlayers = game.teams?.bottom?.players || [];
      
      const playerInTop = topPlayers.some(p => p.playerId === playerId);
      const playerInBottom = bottomPlayers.some(p => p.playerId === playerId);
      
      if (playerInTop) {
        topPlayers.forEach(p => {
          if (p.playerId !== playerId) partnerSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
        bottomPlayers.forEach(p => {
          opponentSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
      } else if (playerInBottom) {
        bottomPlayers.forEach(p => {
          if (p.playerId !== playerId) partnerSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
        topPlayers.forEach(p => {
          opponentSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
      }
    });
    
    teamPlayers = Array.from(partnerSet.entries()).map(([pid, name]) => ({ playerId: pid, displayName: name }));
    opponentPlayers = Array.from(opponentSet.entries()).map(([pid, name]) => ({ playerId: pid, displayName: name }));
    
    console.log('\n   → Turnier-Logik verwendet:');
    console.log(`      teamPlayers: ${teamPlayers.length}`);
    console.log(`      opponentPlayers: ${opponentPlayers.length}`);
  } else {
    teamPlayers = sessionData.teams?.[playerTeam]?.players || [];
    opponentPlayers = sessionData.teams?.[playerTeam === 'top' ? 'bottom' : 'top']?.players || [];
    
    console.log('\n   → Normale Session-Logik verwendet:');
    console.log(`      teamPlayers: ${teamPlayers.length}`);
    console.log(`      opponentPlayers: ${opponentPlayers.length}`);
  }
  
  // Final: partnerIds
  const partnerIds = [];
  const partnerNames = {};
  const opponentIds = [];
  const opponentNames = {};
  
  teamPlayers.forEach(p => {
    if (p.playerId !== playerId) {
      partnerIds.push(p.playerId);
      partnerNames[p.playerId] = p.displayName || 'Unbekannt';
    }
  });
  
  opponentPlayers.forEach(p => {
    opponentIds.push(p.playerId);
    opponentNames[p.playerId] = p.displayName || 'Unbekannt';
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('📌 ERGEBNIS:');
  console.log('='.repeat(80));
  console.log(`   partnerIds: ${partnerIds.length}`);
  partnerIds.forEach(id => console.log(`      - ${partnerNames[id]} (${id.substring(0, 10)}...)`));
  console.log(`   opponentIds: ${opponentIds.length}`);
  opponentIds.forEach(id => console.log(`      - ${opponentNames[id]} (${id.substring(0, 10)}...)`));
  
  if (partnerIds.length === 0) {
    console.log('\n❌ PROBLEM: partnerIds ist leer → updatePartnerStatsSubcollection schreibt nichts!');
  }
}

simulate()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
