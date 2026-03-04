/**
 * 🔍 Prüfe originale Tournament-Games für Event-Counts
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const TOURNAMENT_ID = 'kjoeh4ZPGtGr8GA8gp9p';

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔍 PRÜFE ORIGINALE TOURNAMENT-GAMES                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Lade alle Games
    const gamesSnap = await db
      .collection('tournaments')
      .doc(TOURNAMENT_ID)
      .collection('games')
      .orderBy('passeNumber', 'asc')
      .get();

    console.log(`📊 Gefundene Games: ${gamesSnap.size}\n`);

    const playerEvents = new Map();

    gamesSnap.docs.forEach((gameDoc, index) => {
      const game = gameDoc.data();
      const playerDetails = game.playerDetails || [];

      console.log(`\n🎮 Passe ${game.passeNumber || (index + 1)}:`);
      
      playerDetails.forEach(player => {
        const playerId = player.playerId;
        const striche = player.stricheInPasse || {};
        
        if (!playerEvents.has(playerId)) {
          playerEvents.set(playerId, {
            displayName: player.playerName || playerId,
            matschMade: 0,
            matschReceived: 0,
            schneiderMade: 0,
            schneiderReceived: 0
          });
        }
        
        const events = playerEvents.get(playerId);
        
        // Made: Eigene Striche
        events.matschMade += striche.matsch || 0;
        events.schneiderMade += striche.schneider || 0;
        
        // Received: Muss aus anderen Spielern im gegnerischen Team kommen
        // ABER: In Tournament-Games sind die Events pro Spieler gespeichert!
        // Wir müssen durch alle anderen Spieler iterieren
      });
      
      // Zeige playerDetails
      playerDetails.forEach(player => {
        const striche = player.stricheInPasse || {};
        console.log(`   ${player.playerName} (${player.team}): Matsch ${striche.matsch || 0}, Schneider ${striche.schneider || 0}`);
      });
    });

    // Berechne Received: Für jeden Spieler, zähle Events von GEGNERISCHEN Spielern
    gamesSnap.docs.forEach((gameDoc) => {
      const game = gameDoc.data();
      const playerDetails = game.playerDetails || [];

      playerDetails.forEach(player => {
        const playerId = player.playerId;
        const playerTeam = player.team;
        const playerStriche = player.stricheInPasse || {};
        
        // Finde alle gegnerischen Spieler
        const opponentPlayers = playerDetails.filter(p => p.team !== playerTeam);
        
        opponentPlayers.forEach(opponent => {
          const opponentStriche = opponent.stricheInPasse || {};
          const events = playerEvents.get(playerId);
          
          if (events) {
            events.matschReceived += opponentStriche.matsch || 0;
            events.schneiderReceived += opponentStriche.schneider || 0;
          }
        });
      });
    });

    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📊 BERECHNETE EVENT-COUNTS (aus originalen Games)     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    playerEvents.forEach((events, playerId) => {
      const matschBilanz = events.matschMade - events.matschReceived;
      const schneiderBilanz = events.schneiderMade - events.schneiderReceived;
      
      console.log(`👤 ${events.displayName}:`);
      console.log(`   Matsch: ${matschBilanz} (Made: ${events.matschMade}, Received: ${events.matschReceived})`);
      console.log(`   Schneider: ${schneiderBilanz} (Made: ${events.schneiderMade}, Received: ${events.schneiderReceived})`);
    });

    // Vergleiche mit jassGameSummary
    const summaryDoc = await db
      .collection('groups')
      .doc('Tz0wgIHMTlhvTtFastiJ')
      .collection('jassGameSummaries')
      .doc('6eNr8fnsTO06jgCqjelt')
      .get();

    const summary = summaryDoc.data();
    const totalEventCountsByPlayer = summary.totalEventCountsByPlayer || {};

    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📊 VERGLEICH: Original Games vs. jassGameSummary        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    playerEvents.forEach((calculatedEvents, playerId) => {
      const dbEvents = totalEventCountsByPlayer[playerId] || {};
      
      const calculatedMatschBilanz = calculatedEvents.matschMade - calculatedEvents.matschReceived;
      const dbMatschBilanz = (dbEvents.matschMade || 0) - (dbEvents.matschReceived || 0);
      
      const calculatedSchneiderBilanz = calculatedEvents.schneiderMade - calculatedEvents.schneiderReceived;
      const dbSchneiderBilanz = (dbEvents.schneiderMade || 0) - (dbEvents.schneiderReceived || 0);
      
      console.log(`\n👤 ${calculatedEvents.displayName}:`);
      
      if (calculatedMatschBilanz === dbMatschBilanz && calculatedSchneiderBilanz === dbSchneiderBilanz) {
        console.log(`   ✅ ÜBEREINSTIMMUNG!`);
        console.log(`   Matsch: ${calculatedMatschBilanz} (${calculatedEvents.matschMade}/${calculatedEvents.matschReceived})`);
        console.log(`   Schneider: ${calculatedSchneiderBilanz} (${calculatedEvents.schneiderMade}/${calculatedEvents.schneiderReceived})`);
      } else {
        console.log(`   ❌ UNTERSCHIED!`);
        console.log(`   Matsch: Berechnet ${calculatedMatschBilanz} (${calculatedEvents.matschMade}/${calculatedEvents.matschReceived}), DB ${dbMatschBilanz} (${dbEvents.matschMade || 0}/${dbEvents.matschReceived || 0})`);
        console.log(`   Schneider: Berechnet ${calculatedSchneiderBilanz} (${calculatedEvents.schneiderMade}/${calculatedEvents.schneiderReceived}), DB ${dbSchneiderBilanz} (${dbEvents.schneiderMade || 0}/${dbEvents.schneiderReceived || 0})`);
      }
    });

    console.log('\n🎉 Analyse abgeschlossen!');

  } catch (error) {
    console.error('\n❌ Fehler:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Script fehlgeschlagen:', error);
    process.exit(1);
  });

