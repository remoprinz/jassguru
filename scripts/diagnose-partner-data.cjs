const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';

// Remo's ID
const REMO_ID = 'b16c1120111b7d9e7d733837';

// Partner/Gegner IDs
const DAVESTER_ID = '4nhOwuVONajPArNERzyEj';
const SCHAELLENURSLI_ID = 'mgn9a1L5tM8iAJk5S2hkE';
const MICHAEL_ID = '9K2d1OQ1mCXddko7ft6y';

async function diagnoseProblem() {
  console.log('\n🔍 DIAGNOSE: Partner/Gegner und Matsch-Problem\n');
  console.log('='.repeat(120));
  
  // ========== TEIL 1: Turnier-Daten prüfen ==========
  console.log('\n📋 TEIL 1: TURNIER-DATEN (jassGameSummary)\n');
  console.log('-'.repeat(120));
  
  const tournamentRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
  const tournamentSnap = await tournamentRef.get();
  
  if (!tournamentSnap.exists) {
    console.log('❌ Turnier-Dokument nicht gefunden!');
    return;
  }
  
  const tournamentData = tournamentSnap.data();
  
  console.log(`✅ Turnier gefunden: ${tournamentData.tournamentName || 'Unbekannt'}`);
  console.log(`   - Anzahl Spiele: ${tournamentData.gameResults?.length || 0}`);
  console.log(`   - Teilnehmer: ${tournamentData.participantPlayerIds?.length || 0}`);
  console.log(`   - isTournamentSession: ${tournamentData.isTournamentSession}`);
  
  // Prüfe: Haben alle Spiele eventCounts und teams?
  let gamesWithEventCounts = 0;
  let gamesWithTeams = 0;
  let remoGames = 0;
  let remoDavesterGames = 0;
  let remoSchaellenursliGames = 0;
  let remoMichaelGames = 0;
  
  if (tournamentData.gameResults) {
    for (const game of tournamentData.gameResults) {
      if (game.eventCounts) gamesWithEventCounts++;
      if (game.teams) gamesWithTeams++;
      
      const topPlayers = game.teams?.top?.players?.map(p => p.playerId) || [];
      const bottomPlayers = game.teams?.bottom?.players?.map(p => p.playerId) || [];
      const allPlayers = [...topPlayers, ...bottomPlayers];
      
      if (allPlayers.includes(REMO_ID)) {
        remoGames++;
        
        const remoTeam = topPlayers.includes(REMO_ID) ? 'top' : 'bottom';
        const remoPartners = remoTeam === 'top' ? topPlayers : bottomPlayers;
        const remoOpponents = remoTeam === 'top' ? bottomPlayers : topPlayers;
        
        if (remoPartners.includes(DAVESTER_ID)) remoDavesterGames++;
        if (remoOpponents.includes(SCHAELLENURSLI_ID)) remoSchaellenursliGames++;
        if (remoPartners.includes(MICHAEL_ID)) remoMichaelGames++;
      }
    }
  }
  
  console.log(`\n   📊 Spiel-Daten Qualität:`);
  console.log(`      - Spiele mit eventCounts: ${gamesWithEventCounts}/${tournamentData.gameResults?.length || 0}`);
  console.log(`      - Spiele mit teams: ${gamesWithTeams}/${tournamentData.gameResults?.length || 0}`);
  console.log(`\n   👤 Remo's Spiele:`);
  console.log(`      - Gesamt: ${remoGames}`);
  console.log(`      - Mit Davester als Partner: ${remoDavesterGames}`);
  console.log(`      - Mit Schällenursli als Gegner: ${remoSchaellenursliGames}`);
  console.log(`      - Mit Michael als Partner: ${remoMichaelGames}`);
  
  // ========== TEIL 2: Remo's Player Stats prüfen ==========
  console.log('\n\n📋 TEIL 2: REMO\'S PLAYER STATS (computedStats)\n');
  console.log('-'.repeat(120));
  
  const remoStatsRef = db.collection(`players/${REMO_ID}/computedStats`).doc('all');
  const remoStatsSnap = await remoStatsRef.get();
  
  if (!remoStatsSnap.exists) {
    console.log('❌ Remo\'s computedStats nicht gefunden!');
  } else {
    const remoStats = remoStatsSnap.data();
    
    console.log(`✅ Remo's Stats gefunden:`);
    console.log(`   - Gesamt Spiele: ${remoStats.totalGames || 0}`);
    console.log(`   - Gesamt Sessions: ${remoStats.totalSessions || 0}`);
    console.log(`   - Gesamt Turniere: ${remoStats.totalTournaments || 0}`);
    console.log(`   - Partner-Aggregates: ${remoStats.partnerAggregates?.length || 0}`);
    console.log(`   - Opponent-Aggregates: ${remoStats.opponentAggregates?.length || 0}`);
    
    // Suche nach Davester in Partner-Aggregates
    console.log(`\n   🔍 Davester als Partner:`);
    const davesterPartner = remoStats.partnerAggregates?.find(p => p.partnerId === DAVESTER_ID);
    if (davesterPartner) {
      console.log(`      ✅ GEFUNDEN!`);
      console.log(`         - displayName: ${davesterPartner.partnerDisplayName}`);
      console.log(`         - sessionsPlayedWith: ${davesterPartner.sessionsPlayedWith}`);
      console.log(`         - gamesPlayedWith: ${davesterPartner.gamesPlayedWith}`);
      console.log(`         - gamesWonWith: ${davesterPartner.gamesWonWith}`);
      console.log(`         - totalStricheDifferenceWith: ${davesterPartner.totalStricheDifferenceWith}`);
      console.log(`         - totalPointsDifferenceWith: ${davesterPartner.totalPointsDifferenceWith}`);
      console.log(`         - matschEventsMadeWith: ${davesterPartner.matschEventsMadeWith}`);
      console.log(`         - matschEventsReceivedWith: ${davesterPartner.matschEventsReceivedWith}`);
      console.log(`         - matschBilanz: ${davesterPartner.matschBilanz}`);
    } else {
      console.log(`      ❌ NICHT GEFUNDEN!`);
    }
    
    // Suche nach Schällenursli in Opponent-Aggregates
    console.log(`\n   🔍 Schällenursli als Gegner:`);
    const schaellenursliOpponent = remoStats.opponentAggregates?.find(o => o.opponentId === SCHAELLENURSLI_ID);
    if (schaellenursliOpponent) {
      console.log(`      ✅ GEFUNDEN!`);
      console.log(`         - displayName: ${schaellenursliOpponent.opponentDisplayName}`);
      console.log(`         - sessionsPlayedAgainst: ${schaellenursliOpponent.sessionsPlayedAgainst}`);
      console.log(`         - gamesPlayedAgainst: ${schaellenursliOpponent.gamesPlayedAgainst}`);
      console.log(`         - gamesWonAgainst: ${schaellenursliOpponent.gamesWonAgainst}`);
      console.log(`         - totalStricheDifferenceAgainst: ${schaellenursliOpponent.totalStricheDifferenceAgainst}`);
      console.log(`         - totalPointsDifferenceAgainst: ${schaellenursliOpponent.totalPointsDifferenceAgainst}`);
      console.log(`         - matschEventsMadeAgainst: ${schaellenursliOpponent.matschEventsMadeAgainst}`);
      console.log(`         - matschEventsReceivedAgainst: ${schaellenursliOpponent.matschEventsReceivedAgainst}`);
      console.log(`         - matschBilanz: ${schaellenursliOpponent.matschBilanz}`);
    } else {
      console.log(`      ❌ NICHT GEFUNDEN!`);
    }
    
    // Suche nach Michael in Partner-Aggregates (für Matsch-Problem)
    console.log(`\n   🔍 Michael als Partner (Matsch-Problem):`);
    const michaelPartner = remoStats.partnerAggregates?.find(p => p.partnerId === MICHAEL_ID);
    if (michaelPartner) {
      console.log(`      ✅ GEFUNDEN!`);
      console.log(`         - displayName: ${michaelPartner.partnerDisplayName}`);
      console.log(`         - sessionsPlayedWith: ${michaelPartner.sessionsPlayedWith}`);
      console.log(`         - gamesPlayedWith: ${michaelPartner.gamesPlayedWith}`);
      console.log(`         - matschEventsMadeWith: ${michaelPartner.matschEventsMadeWith}`);
      console.log(`         - matschEventsReceivedWith: ${michaelPartner.matschEventsReceivedWith}`);
      console.log(`         - matschBilanz: ${michaelPartner.matschBilanz}`);
      console.log(`         - schneiderEventsMadeWith: ${michaelPartner.schneiderEventsMadeWith}`);
      console.log(`         - schneiderEventsReceivedWith: ${michaelPartner.schneiderEventsReceivedWith}`);
      console.log(`         - kontermatschEventsMadeWith: ${michaelPartner.kontermatschEventsMadeWith}`);
      console.log(`         - kontermatschEventsReceivedWith: ${michaelPartner.kontermatschEventsReceivedWith}`);
    } else {
      console.log(`      ❌ NICHT GEFUNDEN!`);
    }
  }
  
  // ========== TEIL 3: Matsch-Events im Turnier prüfen ==========
  console.log('\n\n📋 TEIL 3: MATSCH-EVENTS IM TURNIER (Game-by-Game)\n');
  console.log('-'.repeat(120));
  
  if (tournamentData.gameResults) {
    console.log(`\nAnalysiere alle Spiele wo Remo und Michael zusammen spielen...\n`);
    
    let totalMatschMade = 0;
    let totalMatschReceived = 0;
    
    for (const game of tournamentData.gameResults) {
      const topPlayers = game.teams?.top?.players?.map(p => p.playerId) || [];
      const bottomPlayers = game.teams?.bottom?.players?.map(p => p.playerId) || [];
      
      const remoTeam = topPlayers.includes(REMO_ID) ? 'top' : bottomPlayers.includes(REMO_ID) ? 'bottom' : null;
      if (!remoTeam) continue;
      
      const remoPartners = remoTeam === 'top' ? topPlayers.filter(id => id !== REMO_ID) : bottomPlayers.filter(id => id !== REMO_ID);
      
      if (remoPartners.includes(MICHAEL_ID)) {
        const opponentTeam = remoTeam === 'top' ? 'bottom' : 'top';
        const matschMade = game.eventCounts?.[remoTeam]?.matsch || 0;
        const matschReceived = game.eventCounts?.[opponentTeam]?.matsch || 0;
        
        totalMatschMade += matschMade;
        totalMatschReceived += matschReceived;
        
        console.log(`   Spiel ${game.gameNumber} (Passe ${game.passeLabel || 'N/A'}):`);
        console.log(`      - Remo's Team: ${remoTeam}`);
        console.log(`      - Partner: ${game.teams?.[remoTeam]?.players?.map(p => p.displayName).join(', ')}`);
        console.log(`      - Matsch Made: ${matschMade}`);
        console.log(`      - Matsch Received: ${matschReceived}`);
        console.log(`      - eventCounts vorhanden: ${game.eventCounts ? 'JA' : 'NEIN'}`);
      }
    }
    
    console.log(`\n   📊 GESAMT (Remo + Michael):`);
    console.log(`      - Total Matsch Made: ${totalMatschMade}`);
    console.log(`      - Total Matsch Received: ${totalMatschReceived}`);
    console.log(`      - Matsch-Bilanz: ${totalMatschMade - totalMatschReceived}`);
  }
  
  // ========== TEIL 4: Vergleich mit totalEventCountsByPlayer ==========
  console.log('\n\n📋 TEIL 4: VERGLEICH MIT totalEventCountsByPlayer\n');
  console.log('-'.repeat(120));
  
  console.log(`\n   📊 totalEventCountsByPlayer (Turnier-Level):`);
  console.log(`      Remo:`);
  console.log(`         - matschMade: ${tournamentData.totalEventCountsByPlayer?.[REMO_ID]?.matschMade || 0}`);
  console.log(`         - matschReceived: ${tournamentData.totalEventCountsByPlayer?.[REMO_ID]?.matschReceived || 0}`);
  console.log(`      Michael:`);
  console.log(`         - matschMade: ${tournamentData.totalEventCountsByPlayer?.[MICHAEL_ID]?.matschMade || 0}`);
  console.log(`         - matschReceived: ${tournamentData.totalEventCountsByPlayer?.[MICHAEL_ID]?.matschReceived || 0}`);
  
  console.log('\n' + '='.repeat(120));
  console.log('\n✅ DIAGNOSE ABGESCHLOSSEN\n');
}

diagnoseProblem().catch(console.error);

