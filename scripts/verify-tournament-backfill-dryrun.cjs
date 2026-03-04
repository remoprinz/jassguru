/**
 * 🔍 DRY RUN: Vergleiche Tournament-Session Backfill-Daten
 * 
 * Vergleicht aktuelle DB-Daten mit neu berechneten Werten aus originalen Games
 * für die Tournament-Session vom 11.5.2025 (Krakau 2025)
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Konfiguration
const TOURNAMENT_ID = 'kjoeh4ZPGtGr8GA8gp9p';
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const JASS_GAME_SUMMARY_ID = '6eNr8fnsTO06jgCqjelt';

/**
 * Lädt alle Games eines Turniers
 */
async function loadAllTournamentGames(tournamentId) {
  console.log(`\n📥 Lade alle Games für Tournament ${tournamentId}...`);
  
  const gamesSnapshot = await db
    .collection('tournaments')
    .doc(tournamentId)
    .collection('games')
    .orderBy('passeNumber', 'asc')
    .get();

  const games = [];
  gamesSnapshot.forEach(doc => {
    games.push({ id: doc.id, ...doc.data() });
  });

  console.log(`✅ ${games.length} Games geladen`);
  return games;
}

/**
 * Lädt das bestehende jassGameSummary
 */
async function loadJassGameSummary(groupId, summaryId) {
  console.log(`\n📥 Lade jassGameSummary ${summaryId}...`);
  
  const doc = await db
    .collection('groups')
    .doc(groupId)
    .collection('jassGameSummaries')
    .doc(summaryId)
    .get();

  if (!doc.exists) {
    throw new Error(`jassGameSummary ${summaryId} nicht gefunden!`);
  }

  console.log(`✅ jassGameSummary geladen`);
  return doc.data();
}

/**
 * Berechnet aggregierte Spieler-Statistiken aus allen Games
 */
function calculatePlayerAggregates(games) {
  const totalEventCountsByPlayer = {};
  const totalPointsByPlayer = {};
  const totalStricheByPlayer = {};

  for (const game of games) {
    for (const player of game.playerDetails) {
      const playerId = player.playerId;

      // Initialisiere falls nötig
      if (!totalEventCountsByPlayer[playerId]) {
        totalEventCountsByPlayer[playerId] = {
          kontermatschMade: 0,
          kontermatschReceived: 0,
          matschMade: 0,
          matschReceived: 0,
          schneiderMade: 0,
          schneiderReceived: 0,
        };
      }

      if (!totalPointsByPlayer[playerId]) {
        totalPointsByPlayer[playerId] = 0;
      }

      if (!totalStricheByPlayer[playerId]) {
        totalStricheByPlayer[playerId] = {
          berg: 0,
          kontermatsch: 0,
          matsch: 0,
          schneider: 0,
          sieg: 0,
        };
      }

      // Summiere Punkte
      totalPointsByPlayer[playerId] += player.scoreInPasse || 0;

      // Summiere Striche
      const striche = player.stricheInPasse || {};
      totalStricheByPlayer[playerId].berg += striche.berg || 0;
      totalStricheByPlayer[playerId].kontermatsch += striche.kontermatsch || 0;
      totalStricheByPlayer[playerId].matsch += striche.matsch || 0;
      totalStricheByPlayer[playerId].schneider += striche.schneider || 0;
      totalStricheByPlayer[playerId].sieg += striche.sieg || 0;

      // Berechne Made/Received für Events
      const team = player.team;
      const opponentTeam = team === 'bottom' ? 'top' : 'bottom';

      // Kontermatsch
      const kontermatsch = striche.kontermatsch || 0;
      totalEventCountsByPlayer[playerId].kontermatschMade += kontermatsch;

      // Matsch
      const matsch = striche.matsch || 0;
      totalEventCountsByPlayer[playerId].matschMade += matsch;

      // Schneider
      const schneider = striche.schneider || 0;
      totalEventCountsByPlayer[playerId].schneiderMade += schneider;

      // Received: Aus gegnerischem Team
      const opponentPlayers = game.playerDetails.filter(p => p.team === opponentTeam);
      for (const opponent of opponentPlayers) {
        const oppStriche = opponent.stricheInPasse || {};
        totalEventCountsByPlayer[playerId].kontermatschReceived += oppStriche.kontermatsch || 0;
        totalEventCountsByPlayer[playerId].matschReceived += oppStriche.matsch || 0;
        totalEventCountsByPlayer[playerId].schneiderReceived += oppStriche.schneider || 0;
      }
    }
  }

  return {
    totalEventCountsByPlayer,
    totalPointsByPlayer,
    totalStricheByPlayer,
  };
}

/**
 * Vergleicht zwei Objekte und gibt Unterschiede aus
 */
function compareObjects(label, expected, actual) {
  console.log(`\n🔍 Vergleich: ${label}`);
  console.log('═'.repeat(80));
  
  const allKeys = new Set([
    ...Object.keys(expected || {}),
    ...Object.keys(actual || {})
  ]);
  
  let hasDifferences = false;
  
  allKeys.forEach(key => {
    const exp = expected?.[key];
    const act = actual?.[key];
    
    if (JSON.stringify(exp) !== JSON.stringify(act)) {
      hasDifferences = true;
      console.log(`\n❌ Unterschied bei Key: ${key}`);
      console.log(`   Erwartet: ${JSON.stringify(exp)}`);
      console.log(`   Aktuell:  ${JSON.stringify(act)}`);
    }
  });
  
  if (!hasDifferences) {
    console.log(`✅ Keine Unterschiede gefunden`);
  }
  
  return hasDifferences;
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔍 DRY RUN: Tournament Backfill Verifikation           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log(`Tournament: ${TOURNAMENT_ID}`);
  console.log(`Group: ${GROUP_ID}`);
  console.log(`jassGameSummary: ${JASS_GAME_SUMMARY_ID}\n`);

  try {
    // 1. Lade alle Games
    const games = await loadAllTournamentGames(TOURNAMENT_ID);

    if (games.length === 0) {
      console.error('❌ Keine Games gefunden!');
      return;
    }

    // 2. Lade bestehendes jassGameSummary
    const summary = await loadJassGameSummary(GROUP_ID, JASS_GAME_SUMMARY_ID);

    // 3. Berechne NEU aggregierte Spieler-Statistiken
    console.log('\n🔧 Berechne aggregierte Spieler-Statistiken NEU...');
    const { totalEventCountsByPlayer, totalPointsByPlayer, totalStricheByPlayer } = 
      calculatePlayerAggregates(games);

    console.log(`✅ Statistiken für ${Object.keys(totalPointsByPlayer).length} Spieler berechnet`);

    // 4. Vergleiche mit aktuellen DB-Daten
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📊 VERGLEICH: DB vs. NEU BERECHNET                      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    
    // A) Vergleiche totalPointsByPlayer
    const pointsDiff = compareObjects(
      'totalPointsByPlayer',
      totalPointsByPlayer,
      summary.totalPointsByPlayer
    );
    
    // B) Vergleiche totalStricheByPlayer
    const stricheDiff = compareObjects(
      'totalStricheByPlayer',
      totalStricheByPlayer,
      summary.totalStricheByPlayer
    );
    
    // C) Vergleiche totalEventCountsByPlayer
    const eventsDiff = compareObjects(
      'totalEventCountsByPlayer',
      totalEventCountsByPlayer,
      summary.totalEventCountsByPlayer
    );
    
    // D) Vergleiche gameResults Anzahl
    console.log(`\n🔍 Vergleich: gameResults`);
    console.log('═'.repeat(80));
    const expectedGameResultsCount = games.length;
    const actualGameResultsCount = summary.gameResults?.length || 0;
    
    if (expectedGameResultsCount !== actualGameResultsCount) {
      console.log(`\n❌ gameResults Anzahl stimmt nicht überein`);
      console.log(`   Erwartet: ${expectedGameResultsCount} Games`);
      console.log(`   Aktuell:  ${actualGameResultsCount} gameResults`);
    } else {
      console.log(`✅ gameResults Anzahl korrekt: ${actualGameResultsCount} Games`);
    }
    
    // E) Zeige gameResults[0] zum Vergleich
    console.log(`\n📊 Beispiel gameResults[0] (Passe 1):`);
    console.log('─'.repeat(80));
    console.log(JSON.stringify(summary.gameResults?.[0] || {}, null, 2));
    
    // ZUSAMMENFASSUNG
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📋 ZUSAMMENFASSUNG                                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    const totalDifferences = [pointsDiff, stricheDiff, eventsDiff].filter(Boolean).length;
    
    if (totalDifferences === 0 && expectedGameResultsCount === actualGameResultsCount) {
      console.log('✅ ✅ ✅ ALLE DATEN STIMMEN ÜBEREIN!');
      console.log('Die Tournament-Session ist korrekt backfilled.');
    } else {
      console.log(`❌ ❌ ❌ ${totalDifferences} KATEGORIEN MIT UNTERSCHIEDEN GEFUNDEN!`);
      console.log('\nDie folgenden Daten sollten aktualisiert werden:');
      if (pointsDiff) console.log('  - totalPointsByPlayer');
      if (stricheDiff) console.log('  - totalStricheByPlayer');
      if (eventsDiff) console.log('  - totalEventCountsByPlayer');
      if (expectedGameResultsCount !== actualGameResultsCount) console.log('  - gameResults');
      
      console.log('\n💡 Vorschlag:');
      console.log('   1. Prüfe die Ausgabe oben für Details');
      console.log('   2. Wenn Korrektur nötig: Führe backfill-tournament-jassGameSummary.cjs aus');
    }
    
    // F) Detaillierte Spieler-Ausgabe
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  👥 DETAILLIERTE SPIELER-STATISTIKEN                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    Object.keys(totalPointsByPlayer).forEach(playerId => {
      // Finde Spielernamen
      const playerName = (() => {
        for (const game of games) {
          const p = game.playerDetails.find(pd => pd.playerId === playerId);
          if (p) return p.playerName;
        }
        return playerId;
      })();
      
      console.log(`\n👤 ${playerName} (${playerId}):`);
      console.log('─'.repeat(80));
      
      // Punkte
      const expectedPoints = totalPointsByPlayer[playerId];
      const actualPoints = summary.totalPointsByPlayer?.[playerId] || 0;
      const pointsMatch = expectedPoints === actualPoints;
      console.log(`   Punkte:     ${expectedPoints} ${pointsMatch ? '✅' : `❌ (DB: ${actualPoints})`}`);
      
      // Striche
      const expectedStriche = totalStricheByPlayer[playerId];
      const actualStriche = summary.totalStricheByPlayer?.[playerId] || {};
      const stricheMatch = JSON.stringify(expectedStriche) === JSON.stringify(actualStriche);
      console.log(`   Striche:    ${JSON.stringify(expectedStriche)} ${stricheMatch ? '✅' : `❌`}`);
      if (!stricheMatch) {
        console.log(`               DB: ${JSON.stringify(actualStriche)}`);
      }
      
      // Events
      const expectedEvents = totalEventCountsByPlayer[playerId];
      const actualEvents = summary.totalEventCountsByPlayer?.[playerId] || {};
      const eventsMatch = JSON.stringify(expectedEvents) === JSON.stringify(actualEvents);
      console.log(`   Events:     ${JSON.stringify(expectedEvents)} ${eventsMatch ? '✅' : `❌`}`);
      if (!eventsMatch) {
        console.log(`               DB: ${JSON.stringify(actualEvents)}`);
      }
    });

    console.log('\n🎉 Dry Run abgeschlossen!');

  } catch (error) {
    console.error('\n❌ Fehler beim Dry Run:', error);
    throw error;
  }
}

// Skript ausführen
main()
  .then(() => {
    console.log('\n✅ Script beendet');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script fehlgeschlagen:', error);
    process.exit(1);
  });

