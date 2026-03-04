/**
 * FIX: Korrigiere globalStats für Spieler, die NUR Turniere gespielt haben
 * 
 * Problem: Ältere Turniere wurden als Sessions gezählt
 * Lösung: Setze totalSessions auf Anzahl der echten Partien (nicht Turniere)
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

async function fix() {
  console.log('🔧 FIX: Korrigiere globalStats für Turnierteilnehmer\n');
  
  // 1. Lade alle jassGameSummaries
  const summariesSnap = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`)
    .where('status', '==', 'completed')
    .get();
  
  console.log(`Gefunden: ${summariesSnap.size} abgeschlossene Sessions/Turniere\n`);
  
  // 2. Sammle Sessions pro Spieler (NUR normale Sessions, NICHT Turniere)
  const playerSessionCounts = new Map(); // playerId -> { won, lost, draw }
  
  summariesSnap.docs.forEach(doc => {
    const data = doc.data();
    
    // NUR normale Sessions zählen (KEINE Turniere)
    if (data.isTournamentSession || data.tournamentId) {
      return; // Skip Turniere
    }
    
    // Muss teams haben
    if (!data.teams?.top?.players || !data.teams?.bottom?.players) {
      return;
    }
    
    const topPlayers = data.teams.top.players.map(p => p.playerId);
    const bottomPlayers = data.teams.bottom.players.map(p => p.playerId);
    const allPlayers = [...topPlayers, ...bottomPlayers];
    
    const winnerTeam = data.winnerTeamKey;
    
    allPlayers.forEach(playerId => {
      if (!playerSessionCounts.has(playerId)) {
        playerSessionCounts.set(playerId, { played: 0, won: 0, lost: 0, draw: 0 });
      }
      
      const counts = playerSessionCounts.get(playerId);
      counts.played++;
      
      const playerTeam = topPlayers.includes(playerId) ? 'top' : 'bottom';
      
      if (winnerTeam === playerTeam) {
        counts.won++;
      } else if (winnerTeam === 'draw' || winnerTeam === 'tie') {
        counts.draw++;
      } else {
        counts.lost++;
      }
    });
  });
  
  console.log(`Spieler mit Session-Daten: ${playerSessionCounts.size}\n`);
  
  // 3. Korrigiere globalStats für jeden Spieler
  for (const [playerId, counts] of playerSessionCounts) {
    const playerDoc = await db.doc(`players/${playerId}`).get();
    if (!playerDoc.exists) continue;
    
    const data = playerDoc.data();
    const playerName = data.displayName || playerId.substring(0, 10);
    
    // Prüfe aktuelle Werte
    const globalStats = data?.globalStats?.current || data?.globalStats || {};
    const currentTotalSessions = globalStats.totalSessions || 0;
    const correctTotalSessions = counts.played;
    
    if (currentTotalSessions !== correctTotalSessions) {
      console.log(`📌 ${playerName}:`);
      console.log(`   totalSessions: ${currentTotalSessions} → ${correctTotalSessions}`);
      console.log(`   sessionsWon: ${globalStats.sessionsWon || 0} → ${counts.won}`);
      console.log(`   sessionsLost: ${globalStats.sessionsLost || 0} → ${counts.lost}`);
      console.log(`   sessionsDraw: ${globalStats.sessionsDraw || 0} → ${counts.draw}`);
      
      // Update
      if (data.globalStats?.current) {
        await db.doc(`players/${playerId}`).update({
          'globalStats.current.totalSessions': counts.played,
          'globalStats.current.sessionsWon': counts.won,
          'globalStats.current.sessionsLost': counts.lost,
          'globalStats.current.sessionsDraw': counts.draw,
        });
      } else {
        await db.doc(`players/${playerId}`).update({
          'globalStats.totalSessions': counts.played,
          'globalStats.sessionsWon': counts.won,
          'globalStats.sessionsLost': counts.lost,
          'globalStats.sessionsDraw': counts.draw,
        });
      }
      console.log(`   ✅ Korrigiert\n`);
    }
  }
  
  // 4. Prüfe Spieler die NUR Turniere haben (0 normale Sessions)
  console.log('\n📋 PRÜFE SPIELER MIT 0 NORMALEN SESSIONS:');
  
  const tournamentParticipants = new Set();
  summariesSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.isTournamentSession || data.tournamentId) {
      (data.participantPlayerIds || []).forEach(pid => tournamentParticipants.add(pid));
    }
  });
  
  for (const playerId of tournamentParticipants) {
    if (!playerSessionCounts.has(playerId)) {
      // Spieler hat NUR Turniere, keine normalen Sessions
      const playerDoc = await db.doc(`players/${playerId}`).get();
      if (!playerDoc.exists) continue;
      
      const data = playerDoc.data();
      const playerName = data.displayName || playerId.substring(0, 10);
      const globalStats = data?.globalStats?.current || data?.globalStats || {};
      const currentTotalSessions = globalStats.totalSessions || 0;
      
      if (currentTotalSessions !== 0) {
        console.log(`📌 ${playerName}: totalSessions ${currentTotalSessions} → 0 (nur Turniere)`);
        
        if (data.globalStats?.current) {
          await db.doc(`players/${playerId}`).update({
            'globalStats.current.totalSessions': 0,
            'globalStats.current.sessionsWon': 0,
            'globalStats.current.sessionsLost': 0,
            'globalStats.current.sessionsDraw': 0,
          });
        } else {
          await db.doc(`players/${playerId}`).update({
            'globalStats.totalSessions': 0,
            'globalStats.sessionsWon': 0,
            'globalStats.sessionsLost': 0,
            'globalStats.sessionsDraw': 0,
          });
        }
        console.log(`   ✅ Korrigiert\n`);
      } else {
        console.log(`📌 ${playerName}: totalSessions bereits 0 ✅`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ FIX ABGESCHLOSSEN');
  console.log('='.repeat(80));
}

fix()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
