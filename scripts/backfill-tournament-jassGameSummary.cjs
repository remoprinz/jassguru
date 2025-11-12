/**
 * Backfill-Script für Tournament jassGameSummaries
 * 
 * Ergänzt fehlendes jassGameSummary mit allen Feldern aus Games:
 * - gameResults[].teams (mit players[])
 * - gameResults[].passeId und passeLabel
 * - gameResults[].eventCounts, completedAt, durationSeconds
 * - totalEventCountsByPlayer
 * - totalPointsByPlayer
 * - totalStricheByPlayer
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
const DRY_RUN = false; // true = nur Ausgabe, kein Schreiben

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
 * Berechnet eventCounts aus teamStrichePasse und finalStriche
 * 
 * Sieg-Anzahl = finalStriche.sieg (nicht teamStrichePasse.sieg, da Sieg erst am Ende vergeben wird)
 */
function calculateEventCounts(teamStrichePasse, finalStriche) {
  return {
    bottom: {
      berg: teamStrichePasse.bottom?.berg || 0,
      kontermatsch: teamStrichePasse.bottom?.kontermatsch || 0,
      matsch: teamStrichePasse.bottom?.matsch || 0,
      schneider: teamStrichePasse.bottom?.schneider || 0,
      sieg: finalStriche?.bottom?.sieg || 0,
    },
    top: {
      berg: teamStrichePasse.top?.berg || 0,
      kontermatsch: teamStrichePasse.top?.kontermatsch || 0,
      matsch: teamStrichePasse.top?.matsch || 0,
      schneider: teamStrichePasse.top?.schneider || 0,
      sieg: finalStriche?.top?.sieg || 0,
    },
  };
}

/**
 * Extrahiert teams-Struktur aus playerDetails
 */
function extractTeams(playerDetails) {
  const bottomPlayers = playerDetails
    .filter(p => p.team === 'bottom')
    .map(p => ({
      playerId: p.playerId,
      displayName: p.playerName,
    }));

  const topPlayers = playerDetails
    .filter(p => p.team === 'top')
    .map(p => ({
      playerId: p.playerId,
      displayName: p.playerName,
    }));

  return {
    bottom: { players: bottomPlayers },
    top: { players: topPlayers },
  };
}

/**
 * Berechnet finalStriche aus teamStrichePasse und teamScoresPasse
 * 
 * Sieg wird basierend auf Punktestand vergeben
 */
function calculateFinalStriche(teamStrichePasse, teamScoresPasse) {
  const bottomWins = teamScoresPasse.bottom > teamScoresPasse.top ? 2 : 0;
  const topWins = teamScoresPasse.top > teamScoresPasse.bottom ? 2 : 0;

  return {
    bottom: {
      berg: teamStrichePasse.bottom?.berg || 0,
      kontermatsch: teamStrichePasse.bottom?.kontermatsch || 0,
      matsch: teamStrichePasse.bottom?.matsch || 0,
      schneider: teamStrichePasse.bottom?.schneider || 0,
      sieg: bottomWins,
    },
    top: {
      berg: teamStrichePasse.top?.berg || 0,
      kontermatsch: teamStrichePasse.top?.kontermatsch || 0,
      matsch: teamStrichePasse.top?.matsch || 0,
      schneider: teamStrichePasse.top?.schneider || 0,
      sieg: topWins,
    },
  };
}

/**
 * Erstellt ein vollständiges gameResult aus einem Game
 */
function createGameResult(game, gameNumber, existingGameResult) {
  const teams = extractTeams(game.playerDetails);
  const finalStriche = calculateFinalStriche(game.teamStrichePasse, game.teamScoresPasse);
  const eventCounts = calculateEventCounts(game.teamStrichePasse, finalStriche);

  // passeLabel: Bei 4 Spielern immer "XA" (X = passeNumber)
  const passeLabel = `${game.passeNumber}A`;

  return {
    bottomScore: game.teamScoresPasse.bottom,
    topScore: game.teamScoresPasse.top,
    gameNumber: gameNumber,
    winnerTeam: game.teamScoresPasse.bottom > game.teamScoresPasse.top ? 'bottom' : 'top',
    passeId: game.passeId,
    passeLabel: passeLabel,
    teams: teams,
    eventCounts: eventCounts,
    finalStriche: finalStriche,
    completedAt: game.completedAt,
    durationSeconds: Math.round(game.durationMillis / 1000),
    // Weis falls vorhanden
    ...(game.playerDetails.some(p => p.weisInPasse > 0) ? {
      weisPoints: {
        bottom: game.playerDetails
          .filter(p => p.team === 'bottom')
          .reduce((sum, p) => sum + (p.weisInPasse || 0), 0),
        top: game.playerDetails
          .filter(p => p.team === 'top')
          .reduce((sum, p) => sum + (p.weisInPasse || 0), 0),
      }
    } : {}),
  };
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
 * Hauptfunktion
 */
async function main() {
  console.log('🚀 Starte Backfill für Tournament jassGameSummary...\n');
  console.log(`Tournament: ${TOURNAMENT_ID}`);
  console.log(`Group: ${GROUP_ID}`);
  console.log(`jassGameSummary: ${JASS_GAME_SUMMARY_ID}`);
  console.log(`Dry Run: ${DRY_RUN ? 'JA (keine Änderungen)' : 'NEIN (schreibt in DB)'}\n`);

  try {
    // 1. Lade alle Games
    const games = await loadAllTournamentGames(TOURNAMENT_ID);

    if (games.length === 0) {
      console.error('❌ Keine Games gefunden!');
      return;
    }

    // 2. Lade bestehendes jassGameSummary
    const summary = await loadJassGameSummary(GROUP_ID, JASS_GAME_SUMMARY_ID);

    // 3. Erstelle neue gameResults mit allen Feldern
    console.log('\n🔧 Erstelle gameResults mit vollständigen Daten...');
    const newGameResults = games.map((game, index) => {
      const gameNumber = index + 1;
      const existingGameResult = summary.gameResults?.[index] || {};
      return createGameResult(game, gameNumber, existingGameResult);
    });

    console.log(`✅ ${newGameResults.length} gameResults erstellt`);

    // 4. Berechne aggregierte Spieler-Statistiken
    console.log('\n🔧 Berechne aggregierte Spieler-Statistiken...');
    const { totalEventCountsByPlayer, totalPointsByPlayer, totalStricheByPlayer } = 
      calculatePlayerAggregates(games);

    console.log(`✅ Statistiken für ${Object.keys(totalPointsByPlayer).length} Spieler berechnet`);

    // 5. Erstelle Update-Objekt
    const updates = {
      gameResults: newGameResults,
      totalEventCountsByPlayer,
      totalPointsByPlayer,
      totalStricheByPlayer,
      // Ties explizit hinzufügen falls nicht vorhanden
      'gameWinsByTeam.ties': summary.gameWinsByTeam?.ties ?? 0,
      // Backfill-Marker
      _backfilledTeamsAndAggregates: true,
      _backfilledTeamsAndAggregatesAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // 6. Ausgabe zur Kontrolle
    console.log('\n📊 Vorschau der Änderungen:');
    console.log('─'.repeat(60));
    console.log(`gameResults[0] (Passe 1):`);
    console.log(JSON.stringify(newGameResults[0], null, 2));
    console.log('\n' + '─'.repeat(60));
    console.log(`totalPointsByPlayer:`);
    console.log(JSON.stringify(totalPointsByPlayer, null, 2));
    console.log('\n' + '─'.repeat(60));
    console.log(`totalStricheByPlayer (Spieler 1):`);
    const firstPlayerId = Object.keys(totalStricheByPlayer)[0];
    console.log(JSON.stringify({ [firstPlayerId]: totalStricheByPlayer[firstPlayerId] }, null, 2));
    console.log('─'.repeat(60));

    // 7. Schreibe in DB (außer bei Dry Run)
    if (DRY_RUN) {
      console.log('\n⚠️  DRY RUN: Keine Änderungen geschrieben');
      console.log('Setze DRY_RUN = false zum Schreiben');
    } else {
      console.log('\n💾 Schreibe Updates in Firestore...');
      await db
        .collection('groups')
        .doc(GROUP_ID)
        .collection('jassGameSummaries')
        .doc(JASS_GAME_SUMMARY_ID)
        .update(updates);

      console.log('✅ Updates erfolgreich geschrieben!');
    }

    console.log('\n🎉 Backfill abgeschlossen!');

  } catch (error) {
    console.error('\n❌ Fehler beim Backfill:', error);
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

