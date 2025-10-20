import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

// Initialize Firebase Admin
const serviceAccountPath = join(__dirname, '../../../serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

const app = initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore(app);

// Hilfsfunktion zur Berechnung der Strichdifferenz für einen Spieler
function calculatePlayerStricheDiff(session: any, playerId: string): number {
  // 🎯 NEU: Turnier-Session mit gameResults
  if (session.gameResults && Array.isArray(session.gameResults)) {
    return calculateTournamentPlayerStricheDiff(session, playerId);
  }
  
  // 🎯 BESTEHEND: Normale Session mit finalStriche
  const finalStriche = session.finalStriche;
  
  if (!finalStriche || !finalStriche.top || !finalStriche.bottom) {
    return 0;
  }
  
  let playerTeam: 'top' | 'bottom' | null = null;
  
  if (session.teams) {
    if (session.teams.top && session.teams.top.players) {
      const inTopTeam = session.teams.top.players.some((p: any) => p.playerId === playerId);
      if (inTopTeam) playerTeam = 'top';
    }
    if (!playerTeam && session.teams.bottom && session.teams.bottom.players) {
      const inBottomTeam = session.teams.bottom.players.some((p: any) => p.playerId === playerId);
      if (inBottomTeam) playerTeam = 'bottom';
    }
  }
  
  if (!playerTeam) {
    return 0; // Spieler nicht in dieser Session
  }
  
  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  
  const myTeamStriche = sumPlayerStriche(finalStriche[playerTeam]);
  const opponentTeamStriche = sumPlayerStriche(finalStriche[opponentTeam]);
  
  return myTeamStriche - opponentTeamStriche;
}

// 🆕 NEU: Berechnung für Turnier-Sessions mit gameResults
function calculateTournamentPlayerStricheDiff(session: any, playerId: string): number {
  let totalDiff = 0;
  
  console.log(`🎯 Berechne Turnier-Strichdifferenz für Spieler ${playerId} über ${session.gameResults.length} Spiele`);
  
  for (const game of session.gameResults) {
    // Finde das Team des Spielers in diesem Spiel
    const playerTeam = findPlayerTeamInGame(game, playerId);
    if (!playerTeam) {
      console.log(`  ⚠️ Spieler ${playerId} nicht in Spiel ${game.gameNumber}`);
      continue;
    }
    
    // Berechne Strichdifferenz für dieses Spiel
    const gameDiff = calculateGameStricheDiff(game, playerTeam);
    totalDiff += gameDiff;
    
    console.log(`  🎮 Spiel ${game.gameNumber}: Team ${playerTeam}, Diff: ${gameDiff}, Total: ${totalDiff}`);
  }
  
  return totalDiff;
}

// 🆕 Hilfsfunktion: Finde das Team eines Spielers in einem Spiel
function findPlayerTeamInGame(game: any, playerId: string): 'top' | 'bottom' | null {
  if (game.teams?.top?.players) {
    const inTopTeam = game.teams.top.players.some((p: any) => p.playerId === playerId);
    if (inTopTeam) return 'top';
  }
  
  if (game.teams?.bottom?.players) {
    const inBottomTeam = game.teams.bottom.players.some((p: any) => p.playerId === playerId);
    if (inBottomTeam) return 'bottom';
  }
  
  return null;
}

// 🆕 Hilfsfunktion: Berechne Strichdifferenz für ein einzelnes Spiel
function calculateGameStricheDiff(game: any, playerTeam: 'top' | 'bottom'): number {
  const finalStriche = game.finalStriche;
  
  if (!finalStriche || !finalStriche.top || !finalStriche.bottom) {
    return 0;
  }
  
  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  
  const myTeamStriche = sumPlayerStriche(finalStriche[playerTeam]);
  const opponentTeamStriche = sumPlayerStriche(finalStriche[opponentTeam]);
  
  return myTeamStriche - opponentTeamStriche;
}

function sumPlayerStriche(stricheData: any): number {
  if (!stricheData) return 0;
  if (typeof stricheData === 'number') return stricheData;
  return (stricheData.berg || 0) + 
         (stricheData.sieg || 0) + 
         (stricheData.matsch || 0) + 
         (stricheData.schneider || 0) + 
         (stricheData.kontermatsch || 0);
}

async function testStricheDiffCalculation() {
  console.log('🧪 Teste Strichdifferenz-Berechnung für Turnier-Session');
  
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  try {
    // Lade Turnier-Session
    const sessionRef = db.collection(`groups/${groupId}/jassGameSummaries`).doc('6eNr8fnsTO06jgCqjelt');
    const sessionSnap = await sessionRef.get();
    
    if (!sessionSnap.exists) {
      console.log('❌ Session nicht gefunden');
      return;
    }
    
    const sessionData = sessionSnap.data();
    console.log('📊 Session-Daten geladen:', {
      sessionId: sessionSnap.id,
      createdAt: sessionData?.createdAt,
      participantPlayerIds: sessionData?.participantPlayerIds,
      hasTeams: !!sessionData?.teams,
      hasFinalStriche: !!sessionData?.finalStriche
    });
    
    // Berechne Strichdifferenz für alle Spieler
    const playerDiffs: { [playerId: string]: number } = {};
    
    if (sessionData?.participantPlayerIds) {
      for (const playerId of sessionData.participantPlayerIds) {
        const diff = calculatePlayerStricheDiff(sessionData, playerId);
        playerDiffs[playerId] = diff;
        
        console.log(`🎯 Spieler ${playerId}: Strichdifferenz = ${diff}`);
      }
    }
    
    // Teste Update (nur wenn gewünscht)
    const shouldUpdate = process.argv.includes('--update');
    if (shouldUpdate) {
      console.log('💾 Schreibe Strichdifferenz in Session...');
      
      await sessionRef.update({
        playerStricheDiffs: playerDiffs,
        _stricheDiffCalculatedAt: new Date()
      });
      
      console.log('✅ Strichdifferenz erfolgreich gespeichert!');
    } else {
      console.log('ℹ️  Verwende --update um die Daten zu speichern');
    }
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

// Führe Test aus
testStricheDiffCalculation()
  .then(() => {
    console.log('✅ Test abgeschlossen');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test fehlgeschlagen:', error);
    process.exit(1);
  });
