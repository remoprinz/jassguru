const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const SESSION_ID = 'GvshcbgPDCtbhCeqHApvk'; // 3. Juli Session
const STUDI_ID = 'PLaDRlPBo91yu5Ij8MOT2';

async function debugTrumpfAssignment() {
  console.log('🕵️ KRITISCHE ANALYSE: Trumpffarben-Zuordnung\n');
  
  try {
    // 1. Session-Daten laden
    const sessionDoc = await db.collection('jassGameSummaries').doc(SESSION_ID).get();
    const sessionData = sessionDoc.data();
    
    console.log('📋 Session Info:');
    console.log(`🎯 Session: ${SESSION_ID}`);
    console.log(`📅 Datum: ${sessionData.startedAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}`);
    
    console.log('\n👥 Teams:');
    if (sessionData.teams) {
      console.log('🔴 TOP Team:', sessionData.teams.top.players.map(p => p.displayName).join(', '));
      console.log('🔵 BOTTOM Team:', sessionData.teams.bottom.players.map(p => p.displayName).join(', '));
    }
    
    console.log('\n🎯 Studis aktuelle Trumpf-Daten (aus aggregatedTrumpfCountsByPlayer):');
    if (sessionData.aggregatedTrumpfCountsByPlayer && sessionData.aggregatedTrumpfCountsByPlayer[STUDI_ID]) {
      Object.entries(sessionData.aggregatedTrumpfCountsByPlayer[STUDI_ID]).forEach(([farbe, count]) => {
        console.log(`  ${farbe}: ${count}`);
      });
    }
    
    // 2. Spiel 1 detailliert analysieren
    const game1Doc = await sessionDoc.ref.collection('completedGames').doc('1').get();
    const game1Data = game1Doc.data();
    
    console.log('\n🎮 SPIEL 1 - Detailanalyse:');
    console.log(`⏱️ Spieldauer: ${Math.round((game1Data.durationMillis || 0) / 1000 / 60)} Minuten`);
    
    if (game1Data.roundHistory) {
      console.log(`📋 Runden: ${game1Data.roundHistory.length}`);
      
      console.log('\n🃏 Trumpf-Runden Analyse:');
      game1Data.roundHistory.forEach((round, index) => {
        if (round.farbe && round.currentPlayer) {
          const playerName = sessionData.playerNames[round.currentPlayer] || `Player ${round.currentPlayer}`;
          
          // Bestimme zu welchem Team der currentPlayer gehört
          let teamName = 'UNKNOWN';
          if (sessionData.teams) {
            const isTopTeam = sessionData.teams.top.players.some(p => p.displayName === playerName);
            const isBottomTeam = sessionData.teams.bottom.players.some(p => p.displayName === playerName);
            
            if (isTopTeam) teamName = 'TOP';
            else if (isBottomTeam) teamName = 'BOTTOM';
          }
          
          console.log(`  Runde ${index + 1}: ${round.farbe} -> ${playerName} (Team: ${teamName})`);
        }
      });
      
      // 3. Zähle Trumpffarben pro Team
      console.log('\n📊 Trumpffarben-Verteilung nach TEAMS:');
      const trumpfByTeam = { TOP: {}, BOTTOM: {} };
      
      game1Data.roundHistory.forEach(round => {
        if (round.farbe && round.currentPlayer) {
          const playerName = sessionData.playerNames[round.currentPlayer] || `Player ${round.currentPlayer}`;
          
          let teamName = 'UNKNOWN';
          if (sessionData.teams) {
            const isTopTeam = sessionData.teams.top.players.some(p => p.displayName === playerName);
            const isBottomTeam = sessionData.teams.bottom.players.some(p => p.displayName === playerName);
            
            if (isTopTeam) teamName = 'TOP';
            else if (isBottomTeam) teamName = 'BOTTOM';
          }
          
          if (teamName !== 'UNKNOWN') {
            const farbe = round.farbe.toLowerCase();
            if (!trumpfByTeam[teamName][farbe]) {
              trumpfByTeam[teamName][farbe] = 0;
            }
            trumpfByTeam[teamName][farbe]++;
          }
        }
      });
      
      console.log('\n🔴 TOP Team (Michael + Roger) Trumpffarben:');
      Object.entries(trumpfByTeam.TOP).forEach(([farbe, count]) => {
        console.log(`  ${farbe}: ${count}`);
      });
      
      console.log('\n🔵 BOTTOM Team (Studi + Remo) Trumpffarben:');
      Object.entries(trumpfByTeam.BOTTOM).forEach(([farbe, count]) => {
        console.log(`  ${farbe}: ${count}`);
      });
      
      // 4. KRITISCHE FRAGE: Wer hat Schilten gespielt?
      console.log('\n🚨 KRITISCHE ANALYSE - Wer hat SCHILTEN gespielt?');
      let schiltenByPlayer = {};
      
      game1Data.roundHistory.forEach(round => {
        if (round.farbe && round.farbe.toLowerCase() === 'schilten' && round.currentPlayer) {
          const playerName = sessionData.playerNames[round.currentPlayer] || `Player ${round.currentPlayer}`;
          if (!schiltenByPlayer[playerName]) {
            schiltenByPlayer[playerName] = 0;
          }
          schiltenByPlayer[playerName]++;
        }
      });
      
      console.log('🃏 Schilten-Verteilung:');
      Object.entries(schiltenByPlayer).forEach(([playerName, count]) => {
        console.log(`  ${playerName}: ${count}x`);
      });
      
      // 5. Vergleiche mit aggregierten Daten
      console.log('\n🔍 VERGLEICH:');
      console.log('📊 Studis aggregierte Schilten-Daten: ' + 
        (sessionData.aggregatedTrumpfCountsByPlayer?.[STUDI_ID]?.schilten || 0));
      console.log('🎮 Studis tatsächliche Schilten-Ansagen in Spiel 1: ' + 
        (schiltenByPlayer['Studi'] || 0));
      
      if ((sessionData.aggregatedTrumpfCountsByPlayer?.[STUDI_ID]?.schilten || 0) > 
          (schiltenByPlayer['Studi'] || 0)) {
        console.log('🚨 PROBLEM GEFUNDEN: Studi hat mehr Schilten in Statistik als er ansagte!');
        console.log('💡 Das deutet auf falsche Zuordnung hin!');
      }
      
    } else {
      console.log('❌ Keine roundHistory gefunden');
    }
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

debugTrumpfAssignment().then(() => {
  console.log('\n🏁 Analyse abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fehler:', err);
  process.exit(1);
}); 