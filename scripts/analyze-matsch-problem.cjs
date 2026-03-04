/**
 * 🔍 ANALYSE: Matsch-Event-Counts Problem
 * 
 * Frank fällt im Chart total ab - warum?
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
  console.log('║  🔍 ANALYSE: Matsch-Event-Counts Problem                  ║');
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

    // Tracking: In welchen Spielen hat jeder Spieler gespielt?
    const playerParticipation = new Map(); // playerId -> [gameNumbers]
    
    gamesSnap.docs.forEach((gameDoc, index) => {
      const game = gameDoc.data();
      const playerDetails = game.playerDetails || [];
      const gameNumber = game.passeNumber || (index + 1);
      
      playerDetails.forEach(player => {
        const playerId = player.playerId;
        if (!playerParticipation.has(playerId)) {
          playerParticipation.set(playerId, []);
        }
        playerParticipation.get(playerId).push(gameNumber);
      });
    });

    console.log('📊 Spieler-Teilnahme:\n');
    playerParticipation.forEach((games, playerId) => {
      const firstName = playerId.substring(0, 8);
      console.log(`${firstName}...: ${games.length} Spiele (${games.join(', ')})`);
    });

    // Jetzt: FALSCHE Berechnung (aktuell im Backfill)
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  ❌ FALSCHE BERECHNUNG (aktuell)                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const wrongPlayerEvents = new Map();
    
    gamesSnap.docs.forEach((gameDoc, index) => {
      const game = gameDoc.data();
      const playerDetails = game.playerDetails || [];
      const gameNumber = game.passeNumber || (index + 1);
      
      playerDetails.forEach(player => {
        const playerId = player.playerId;
        const playerTeam = player.team;
        const playerStriche = player.stricheInPasse || {};
        
        if (!wrongPlayerEvents.has(playerId)) {
          wrongPlayerEvents.set(playerId, {
            displayName: player.playerName || playerId,
            matschMade: 0,
            matschReceived: 0,
            gamesPlayed: 0
          });
        }
        
        const events = wrongPlayerEvents.get(playerId);
        events.matschMade += playerStriche.matsch || 0;
        events.gamesPlayed++;
        
        // FALSCH: Zählt ALLE Gegner in DIESEM Spiel
        const opponentPlayers = playerDetails.filter(p => p.team !== playerTeam);
        opponentPlayers.forEach(opponent => {
          const opponentStriche = opponent.stricheInPasse || {};
          events.matschReceived += opponentStriche.matsch || 0;
        });
      });
    });

    wrongPlayerEvents.forEach((events, playerId) => {
      const bilanz = events.matschMade - events.matschReceived;
      console.log(`${events.displayName}: Bilanz ${bilanz} (Made: ${events.matschMade}, Received: ${events.matschReceived}, Games: ${events.gamesPlayed})`);
    });

    // Jetzt: RICHTIGE Berechnung
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  ✅ RICHTIGE BERECHNUNG (nur Gegner in eigenen Spielen)  ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const correctPlayerEvents = new Map();
    
    gamesSnap.docs.forEach((gameDoc, index) => {
      const game = gameDoc.data();
      const playerDetails = game.playerDetails || [];
      const gameNumber = game.passeNumber || (index + 1);
      
      // Für JEDEN Spieler in diesem Spiel
      playerDetails.forEach(player => {
        const playerId = player.playerId;
        const playerTeam = player.team;
        const playerStriche = player.stricheInPasse || {};
        
        if (!correctPlayerEvents.has(playerId)) {
          correctPlayerEvents.set(playerId, {
            displayName: player.playerName || playerId,
            matschMade: 0,
            matschReceived: 0,
            gamesPlayed: 0,
            details: []
          });
        }
        
        const events = correctPlayerEvents.get(playerId);
        events.matschMade += playerStriche.matsch || 0;
        events.gamesPlayed++;
        
        // RICHTIG: Zähle nur Gegner-Striche aus DIESEM Spiel (in dem der Spieler auch spielt)
        const opponentPlayers = playerDetails.filter(p => p.team !== playerTeam);
        let receivedInThisGame = 0;
        opponentPlayers.forEach(opponent => {
          const opponentStriche = opponent.stricheInPasse || {};
          receivedInThisGame += opponentStriche.matsch || 0;
        });
        
        events.matschReceived += receivedInThisGame;
        events.details.push({
          game: gameNumber,
          made: playerStriche.matsch || 0,
          received: receivedInThisGame
        });
      });
    });

    correctPlayerEvents.forEach((events, playerId) => {
      const bilanz = events.matschMade - events.matschReceived;
      console.log(`\n${events.displayName}: Bilanz ${bilanz} (Made: ${events.matschMade}, Received: ${events.matschReceived}, Games: ${events.gamesPlayed})`);
      
      // Zeige erste 3 Spiele
      console.log(`   Erste 3 Spiele:`);
      events.details.slice(0, 3).forEach(detail => {
        console.log(`     Spiel ${detail.game}: Made ${detail.made}, Received ${detail.received}`);
      });
    });

    // Vergleich
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📊 VERGLEICH: Falsch vs. Richtig                         ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    correctPlayerEvents.forEach((correctEvents, playerId) => {
      const wrongEvents = wrongPlayerEvents.get(playerId);
      const correctBilanz = correctEvents.matschMade - correctEvents.matschReceived;
      const wrongBilanz = wrongEvents.matschMade - wrongEvents.matschReceived;
      
      console.log(`${correctEvents.displayName}:`);
      console.log(`   Falsch: ${wrongBilanz} (${wrongEvents.matschMade}/${wrongEvents.matschReceived})`);
      console.log(`   Richtig: ${correctBilanz} (${correctEvents.matschMade}/${correctEvents.matschReceived})`);
      
      if (correctBilanz !== wrongBilanz) {
        console.log(`   ❌ UNTERSCHIED: ${wrongBilanz - correctBilanz}`);
      } else {
        console.log(`   ✅ ÜBEREINSTIMMUNG`);
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

