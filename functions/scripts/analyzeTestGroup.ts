import * as admin from 'firebase-admin';
import * as path from 'path';

const serviceAccount = require(path.resolve(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

async function analyzeTestGroup() {
  const groupId = 'BhEdUmwb7tb4ka8BLUfM'; // Testgruppe
  console.log(`\n🔍 Detaillierte Analyse der Testgruppe: ${groupId}\n`);
  console.log('='.repeat(80));

  try {
    // 1. Turnier-Summary analysieren
    const tournamentSummariesSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('isTournamentSession', '==', true)
      .get();

    console.log(`\n🏆 TURNIER-SUMMARIES (${tournamentSummariesSnap.size}):\n`);

    for (const summaryDoc of tournamentSummariesSnap.docs) {
      const data = summaryDoc.data();
      console.log(`📋 ${summaryDoc.id}`);
      console.log('-'.repeat(80));
      console.log(`Tournament ID: ${data.tournamentId}`);
      console.log(`Tournament Name: ${data.tournamentName}`);
      console.log(`Status: ${data.status}`);
      console.log(`isTournamentSession: ${data.isTournamentSession}`);
      console.log(`Participants: ${data.participantPlayerIds?.length || 0}`);
      console.log(`Has gameResults: ${!!data.gameResults}`);
      console.log(`gameResults length: ${data.gameResults?.length || 0}`);
      
      // Alle Felder im Root-Level
      console.log(`\n📊 ROOT-LEVEL FELDER:`);
      Object.keys(data).forEach(key => {
        if (key !== 'gameResults') {
          const value = data[key];
          const type = typeof value;
          if (type === 'object' && value !== null) {
            if (Array.isArray(value)) {
              console.log(`   ${key}: Array[${value.length}]`);
            } else if (value.toDate) {
              console.log(`   ${key}: Timestamp = ${value.toDate()}`);
            } else {
              console.log(`   ${key}: Object = ${JSON.stringify(value).slice(0, 80)}`);
            }
          } else {
            console.log(`   ${key}: ${type} = ${value}`);
          }
        }
      });

      // Detaillierte Analyse von gameResults
      if (data.gameResults && data.gameResults.length > 0) {
        console.log(`\n📋 GAME RESULTS STRUKTUR (Erste Passe):`);
        console.log('-'.repeat(80));
        
        const firstGame = data.gameResults[0];
        
        Object.keys(firstGame).forEach(key => {
          const value = firstGame[key];
          const type = typeof value;
          
          if (key === 'playerDetails' && Array.isArray(value)) {
            console.log(`\n   ${key}: Array[${value.length}]`);
            console.log(`   └─ Erster Spieler:`);
            Object.keys(value[0]).forEach(playerKey => {
              const playerValue = value[0][playerKey];
              console.log(`      - ${playerKey}: ${typeof playerValue} = ${JSON.stringify(playerValue).slice(0, 80)}`);
            });
          } else if (key === 'roundHistory') {
            console.log(`   ${key}: Array[${value.length}] (Runden)`);
          } else if (type === 'object' && value !== null) {
            if (Array.isArray(value)) {
              console.log(`   ${key}: Array[${value.length}]`);
            } else if (value.toDate) {
              console.log(`   ${key}: Timestamp = ${value.toDate()}`);
            } else {
              console.log(`   ${key}: Object = ${JSON.stringify(value).slice(0, 80)}`);
            }
          } else {
            console.log(`   ${key}: ${type} = ${value}`);
          }
        });
      }

      // Prüfe ob es Elo-Daten gibt
      console.log(`\n🔍 ELO-DATEN PRÜFUNG:`);
      console.log('-'.repeat(80));
      
      const hasRootLevelElo = !!(data.playerFinalRatings || data.playerRatings || data.eloData);
      console.log(`Root-Level Elo-Felder: ${hasRootLevelElo ? 'JA' : 'NEIN'}`);
      
      if (data.gameResults && data.gameResults.length > 0) {
        const firstGame = data.gameResults[0];
        const hasGameElo = firstGame.playerDetails && firstGame.playerDetails.some((p: any) => 
          p.rating !== undefined || p.elo !== undefined || p.eloAfterGame !== undefined
        );
        console.log(`In gameResults[0].playerDetails: ${hasGameElo ? 'JA' : 'NEIN'}`);
        
        if (!hasGameElo && firstGame.playerDetails) {
          console.log(`Verfügbare Felder in playerDetails:`);
          console.log(`   ${Object.keys(firstGame.playerDetails[0]).join(', ')}`);
        }
      }

      // Vergleiche mit tournaments Collection
      if (data.tournamentId) {
        console.log(`\n🏆 VERGLEICH MIT tournaments/${data.tournamentId}:`);
        console.log('-'.repeat(80));
        
        const tournamentDoc = await db.collection('tournaments').doc(data.tournamentId).get();
        if (tournamentDoc.exists) {
          const tournamentData = tournamentDoc.data();
          console.log(`Tournament Status: ${tournamentData?.status}`);
          console.log(`Tournament Participants: ${tournamentData?.participantPlayerIds?.length || 0}`);
          
          const gamesSnap = await db.collection(`tournaments/${data.tournamentId}/games`).get();
          console.log(`tournaments/{id}/games count: ${gamesSnap.size}`);
          console.log(`jassGameSummary.gameResults count: ${data.gameResults?.length || 0}`);
          
          if (gamesSnap.size > 0) {
            const firstTournamentGame = gamesSnap.docs[0].data();
            console.log(`\nVerfügbare Felder in tournaments/{id}/games[0]:`);
            console.log(`   ${Object.keys(firstTournamentGame).join(', ')}`);
            
            if (firstTournamentGame.playerDetails) {
              console.log(`\nFelder in tournaments/{id}/games[0].playerDetails[0]:`);
              console.log(`   ${Object.keys(firstTournamentGame.playerDetails[0]).join(', ')}`);
            }
          }
        }
      }
    }

    // 2. Prüfe normale Sessions dieser Gruppe
    console.log(`\n\n📝 NORMALE SESSIONS:`);
    console.log('='.repeat(80));
    
    const normalSessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('isTournamentSession', '!=', true)
      .limit(3)
      .get();
    
    console.log(`Anzahl normale Sessions: ${normalSessionsSnap.size}`);
    
    if (normalSessionsSnap.size > 0) {
      const firstSession = normalSessionsSnap.docs[0];
      const sessionData = firstSession.data();
      console.log(`\nBeispiel Session: ${firstSession.id}`);
      console.log(`Verfügbare Felder: ${Object.keys(sessionData).join(', ')}`);
    }

  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

analyzeTestGroup().then(() => {
  console.log('\n✅ Analyse abgeschlossen');
  process.exit(0);
});

