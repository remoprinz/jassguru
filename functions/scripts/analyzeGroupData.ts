import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin mit serviceAccountKey aus Hauptverzeichnis
const serviceAccount = require(path.resolve(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

async function analyzeGroupData(groupId: string) {
  console.log(`\n🔍 Analysiere Gruppe: ${groupId}\n`);
  console.log('='.repeat(80));

  try {
    // 1. Gruppe Info
    const groupDoc = await db.collection('groups').doc(groupId).get();
    if (!groupDoc.exists) {
      console.log('❌ Gruppe nicht gefunden!');
      return;
    }
    
    console.log('\n📋 GRUPPE INFO:');
    console.log('-'.repeat(80));
    const groupData = groupDoc.data();
    console.log(`Name: ${groupData?.name}`);
    console.log(`Mitglieder: ${groupData?.memberCount || 'N/A'}`);
    console.log(`Theme: ${groupData?.theme || 'N/A'}`);

    // 2. Mitglieder
    const membersSnap = await db.collection(`groups/${groupId}/members`).get();
    console.log(`\n👥 MITGLIEDER (${membersSnap.size}):`);
    console.log('-'.repeat(80));
    membersSnap.docs.forEach((doc, idx) => {
      const data = doc.data();
      console.log(`${idx + 1}. ${data.displayName} (${doc.id})`);
    });

    // 3. jassGameSummaries
    const summariesSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .orderBy('completedAt', 'desc')
      .get();
    
    console.log(`\n📊 JASS GAME SUMMARIES (${summariesSnap.size}):`);
    console.log('-'.repeat(80));
    
    let normalSessions = 0;
    let tournamentSummaries = 0;
    
    summariesSnap.docs.forEach((doc, idx) => {
      const data = doc.data();
      const isTournament = data.isTournamentSession === true;
      
      if (isTournament) {
        tournamentSummaries++;
        console.log(`\n${idx + 1}. 🏆 TURNIER-SUMMARY: ${doc.id}`);
        console.log(`   Tournament ID: ${data.tournamentId}`);
        console.log(`   Tournament Name: ${data.tournamentName}`);
        console.log(`   Participants: ${data.participantPlayerIds?.length || 0}`);
        console.log(`   Status: ${data.status || 'N/A'}`);
        console.log(`   Completed: ${data.completedAt?.toDate?.() || 'N/A'}`);
        console.log(`   Has gameResults: ${!!data.gameResults}`);
        if (data.gameResults) {
          console.log(`   gameResults length: ${data.gameResults.length}`);
          console.log(`   gameResults[0] structure:`, Object.keys(data.gameResults[0] || {}));
        }
        
        // Zeige Struktur des ersten gameResult
        if (data.gameResults && data.gameResults.length > 0) {
          const firstGame = data.gameResults[0];
          console.log(`\n   📋 Erste Passe Details:`);
          console.log(`      passeLabel: ${firstGame.passeLabel}`);
          console.log(`      passeNumber: ${firstGame.passeNumber}`);
          console.log(`      playerDetails: ${firstGame.playerDetails?.length || 0} Spieler`);
          
          if (firstGame.playerDetails && firstGame.playerDetails.length > 0) {
            console.log(`\n      Spieler-Struktur (erster Spieler):`);
            const firstPlayer = firstGame.playerDetails[0];
            Object.keys(firstPlayer).forEach(key => {
              console.log(`         ${key}: ${typeof firstPlayer[key]} = ${JSON.stringify(firstPlayer[key]).slice(0, 100)}`);
            });
          }
        }
      } else {
        normalSessions++;
        if (idx < 3) { // Zeige nur erste 3 normale Sessions
          console.log(`\n${idx + 1}. 📝 SESSION: ${doc.id}`);
          console.log(`   Participants: ${data.participantPlayerIds?.length || 0}`);
          console.log(`   Status: ${data.status || 'N/A'}`);
          console.log(`   Completed: ${data.completedAt?.toDate?.() || 'N/A'}`);
        }
      }
    });
    
    console.log(`\n📈 ZUSAMMENFASSUNG:`);
    console.log(`   Normale Sessions: ${normalSessions}`);
    console.log(`   Turnier-Summaries: ${tournamentSummaries}`);

    // 4. Tournaments Collection
    const tournamentsSnap = await db.collection('tournaments')
      .where('groupId', '==', groupId)
      .get();
    
    console.log(`\n\n🏆 TOURNAMENTS COLLECTION (${tournamentsSnap.size}):`);
    console.log('-'.repeat(80));
    
    for (const tournamentDoc of tournamentsSnap.docs) {
      const tournamentData = tournamentDoc.data();
      console.log(`\nTournament: ${tournamentDoc.id}`);
      console.log(`   Name: ${tournamentData.name}`);
      console.log(`   Status: ${tournamentData.status}`);
      console.log(`   Participants: ${tournamentData.participantPlayerIds?.length || 0}`);
      console.log(`   Created: ${tournamentData.createdAt?.toDate?.() || 'N/A'}`);
      console.log(`   Ended: ${tournamentData.endedAt?.toDate?.() || 'N/A'}`);
      
      // Hole games subcollection
      const gamesSnap = await db.collection(`tournaments/${tournamentDoc.id}/games`).get();
      console.log(`   Games (Passen): ${gamesSnap.size}`);
      
      if (gamesSnap.size > 0) {
        console.log(`\n   📋 Erste Passe Details (aus tournaments/games):`);
        const firstGame = gamesSnap.docs[0];
        const gameData = firstGame.data();
        console.log(`      Game ID: ${firstGame.id}`);
        console.log(`      passeLabel: ${gameData.passeLabel}`);
        console.log(`      Struktur:`, Object.keys(gameData).slice(0, 15).join(', '));
        
        if (gameData.playerDetails) {
          console.log(`\n      Spieler-Struktur (erster Spieler aus tournaments/games):`);
          const firstPlayer = gameData.playerDetails[0];
          Object.keys(firstPlayer).forEach(key => {
            console.log(`         ${key}: ${typeof firstPlayer[key]} = ${JSON.stringify(firstPlayer[key]).slice(0, 100)}`);
          });
        }
      }
    }

    // 5. Rating History Analyse für einen Spieler
    if (membersSnap.size > 0) {
      const firstPlayerId = membersSnap.docs[0].id;
      const firstPlayerName = membersSnap.docs[0].data().displayName;
      
      console.log(`\n\n⭐ RATING HISTORY ANALYSE (Spieler: ${firstPlayerName}):`);
      console.log('-'.repeat(80));
      
      const ratingHistorySnap = await db.collection(`players/${firstPlayerId}/ratingHistory`)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      
      console.log(`Letzte ${ratingHistorySnap.size} Einträge:`);
      ratingHistorySnap.docs.forEach((doc, idx) => {
        const data = doc.data();
        console.log(`\n${idx + 1}. ${doc.id}`);
        console.log(`   Event Type: ${data.eventType}`);
        console.log(`   Rating: ${data.rating}`);
        console.log(`   Delta: ${data.ratingDelta || 'N/A'}`);
        console.log(`   Session ID: ${data.sessionId || 'N/A'}`);
        console.log(`   Tournament ID: ${data.tournamentId || 'N/A'}`);
        console.log(`   Created: ${data.createdAt?.toDate?.() || 'N/A'}`);
        console.log(`   Struktur:`, Object.keys(data).join(', '));
      });

      // Check Player Document
      const playerDoc = await db.collection('players').doc(firstPlayerId).get();
      const playerData = playerDoc.data();
      console.log(`\n📊 PLAYER DOCUMENT:`);
      console.log(`   Global Rating: ${playerData?.globalRating || 'N/A'}`);
      console.log(`   Games Played: ${playerData?.gamesPlayed || 0}`);
      console.log(`   Last Delta: ${playerData?.lastDelta || 'N/A'}`);
      console.log(`   Last Session Delta: ${playerData?.lastSessionDelta || 'N/A'}`);
    }

  } catch (error) {
    console.error('❌ Fehler bei der Analyse:', error);
  }
}

// Ausführung
const groupId = 'Tz0wgIHMTlhvTtFastiJ'; // fürDich OGs
analyzeGroupData(groupId).then(() => {
  console.log('\n✅ Analyse abgeschlossen');
  process.exit(0);
});

