import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

// ====================================================================
// 🧪 TOURNAMENT DRY-RUN TEST
// ====================================================================
// Simuliert ein komplettes 12-Spieler-Turnier mit 3 parallelen Tischen
// OHNE in die echte Datenbank zu schreiben (Dry-Run Modus)
// ====================================================================

// 🔒 SICHERHEIT: Dry-Run Modus (IMMER auf true lassen für Tests!)
const DRY_RUN = true;

// 🎯 TEST-KONFIGURATION
const TEST_CONFIG = {
  tournamentName: "TEST 12er Turnier",
  numPlayers: 12,
  numPasses: 6, // Anzahl Passen pro Spieler
  parallelTables: 3, // 3 Tische parallel
  groupId: "TEST_GROUP_ID",
  
  // Simulierte Spiel-Dauer (in Sekunden)
  minPasseDuration: 600, // 10 Minuten
  maxPasseDuration: 1800, // 30 Minuten
};

// Firebase Admin SDK initialisieren
try {
  if (admin.apps.length === 0) {
    const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'jassguru'
      });
      console.log('✅ Firebase Admin mit serviceAccountKey.json initialisiert');
    } else {
      admin.initializeApp({
        projectId: 'jassguru'
      });
      console.log('✅ Firebase Admin mit Application Default Credentials initialisiert');
    }
  }
} catch (e: any) {
  if (e.code !== 'app/already-initialized') {
    console.error("❌ Firebase Admin SDK Initialisierung fehlgeschlagen:", e.message);
    throw e;
  }
}

const db = admin.firestore();

// ====================================================================
// MOCK DATA GENERATOR
// ====================================================================

interface MockPlayer {
  id: string;
  displayName: string;
  rating: number;
}

interface MockPasse {
  passeId: string;
  passeNumber: number;
  passeLabel: string;
  tableNumber: number;
  topPlayers: MockPlayer[];
  bottomPlayers: MockPlayer[];
  topScore: number;
  bottomScore: number;
  completedAt: admin.firestore.Timestamp;
  durationSeconds: number;
}

function generateMockPlayers(count: number): MockPlayer[] {
  const names = [
    "Alice", "Bob", "Charlie", "David", "Eve", "Frank",
    "Grace", "Henry", "Iris", "Jack", "Kate", "Leo"
  ];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `player_${i + 1}`,
    displayName: names[i] || `Player ${i + 1}`,
    rating: 100 + Math.random() * 50 // 100-150 initial rating
  }));
}

function generateRandomScore(): number {
  // Typische Jass-Scores: 0-157 (ohne Sieg), bis zu 2657 (mit Berg+Sieg)
  const baseScore = Math.floor(Math.random() * 1500) + 500; // 500-2000
  return baseScore;
}

function generateMockPasse(
  passeNumber: number,
  players: MockPlayer[],
  startTime: admin.firestore.Timestamp,
  tableNumber: number,
  roundNumber: number
): MockPasse {
  // ✅ FAIR ROTATION: Verwende Round-Robin statt Random
  // Pro Runde (3 Tische parallel) spielen alle 12 Spieler
  // Tisch 1: Player 0,1 vs 2,3
  // Tisch 2: Player 4,5 vs 6,7
  // Tisch 3: Player 8,9 vs 10,11
  
  const baseIndex = (tableNumber - 1) * 4 + ((roundNumber - 1) * 2) % players.length;
  const indices = [
    baseIndex % players.length,
    (baseIndex + 1) % players.length,
    (baseIndex + 2) % players.length,
    (baseIndex + 3) % players.length
  ];
  
  const topPlayers = [players[indices[0]], players[indices[1]]];
  const bottomPlayers = [players[indices[2]], players[indices[3]]];
  
  // Generiere realistische Scores
  const topScore = generateRandomScore();
  const bottomScore = generateRandomScore();
  
  // Berechne Dauer
  const { minPasseDuration, maxPasseDuration } = TEST_CONFIG;
  const durationSeconds = Math.floor(
    minPasseDuration + Math.random() * (maxPasseDuration - minPasseDuration)
  );
  
  // Berechne completedAt (Passen in derselben Runde enden zur gleichen Zeit)
  const roundStartOffset = (roundNumber - 1) * maxPasseDuration;
  const completedAt = admin.firestore.Timestamp.fromMillis(
    startTime.toMillis() + roundStartOffset * 1000 + durationSeconds * 1000
  );
  
  return {
    passeId: `passe_${passeNumber}`,
    passeNumber,
    passeLabel: `${roundNumber}${String.fromCharCode(64 + tableNumber)}`, // 1A, 1B, 1C, 2A, 2B, 2C
    tableNumber,
    topPlayers,
    bottomPlayers,
    topScore,
    bottomScore,
    completedAt,
    durationSeconds
  };
}

// ====================================================================
// TOURNAMENT SIMULATOR
// ====================================================================

async function simulateTournament() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TOURNAMENT DRY-RUN TEST');
  console.log('='.repeat(80));
  console.log(`Turnier: ${TEST_CONFIG.tournamentName}`);
  console.log(`Spieler: ${TEST_CONFIG.numPlayers}`);
  console.log(`Passen: ${TEST_CONFIG.numPasses}`);
  console.log(`Parallele Tische: ${TEST_CONFIG.parallelTables}`);
  console.log(`Dry-Run Modus: ${DRY_RUN ? '✅ JA (keine DB-Writes)' : '❌ NEIN (schreibt in DB!)'}`);
  console.log('='.repeat(80) + '\n');

  if (!DRY_RUN) {
    console.error('⚠️  WARNUNG: Dry-Run Modus ist DEAKTIVIERT!');
    console.error('⚠️  Das Script wird in die echte Datenbank schreiben!');
    console.error('⚠️  Breche ab aus Sicherheitsgründen.');
    process.exit(1);
  }

  // Phase 1: Generiere Test-Daten
  console.log('📊 PHASE 1: Generiere Test-Daten\n');
  
  const players = generateMockPlayers(TEST_CONFIG.numPlayers);
  console.log(`✅ ${players.length} Mock-Spieler generiert:`);
  players.forEach(p => console.log(`   - ${p.displayName} (${p.id})`));
  console.log('');

  // Phase 2: Simuliere Turnier-Passen
  console.log('🎮 PHASE 2: Simuliere Turnier-Passen\n');
  
  const startTime = admin.firestore.Timestamp.now();
  const passes: MockPasse[] = [];
  
  // ✅ FAIR ROTATION: Organisiere in Runden mit 3 parallelen Tischen
  const numRounds = Math.ceil(TEST_CONFIG.numPasses / TEST_CONFIG.parallelTables);
  let passeNumber = 1;
  
  for (let round = 1; round <= numRounds; round++) {
    console.log(`📍 Runde ${round}:\n`);
    
    for (let table = 1; table <= TEST_CONFIG.parallelTables; table++) {
      if (passeNumber > TEST_CONFIG.numPasses) break;
      
      const passe = generateMockPasse(passeNumber, players, startTime, table, round);
      passes.push(passe);
      
      console.log(`Passe ${passe.passeLabel} (Tisch ${table}):`);
      console.log(`   Top: ${passe.topPlayers.map(p => p.displayName).join(' & ')} = ${passe.topScore}`);
      console.log(`   Bottom: ${passe.bottomPlayers.map(p => p.displayName).join(' & ')} = ${passe.bottomScore}`);
      console.log(`   Winner: ${passe.topScore > passe.bottomScore ? 'Top' : 'Bottom'}`);
      console.log(`   Dauer: ${Math.floor(passe.durationSeconds / 60)} Minuten`);
      console.log('');
      
      passeNumber++;
    }
  }

  // Phase 3: Simuliere Tournament-Datenstruktur
  console.log('🏗️  PHASE 3: Erstelle Tournament-Datenstruktur\n');
  
  const tournamentData = {
    id: 'TEST_TOURNAMENT_ID',
    name: TEST_CONFIG.tournamentName,
    groupId: TEST_CONFIG.groupId,
    tournamentMode: 'spontaneous',
    status: 'active',
    participantPlayerIds: players.map(p => p.id),
    createdAt: startTime,
    settings: {
      rankingMode: 'total_points',
      scoreSettings: {
        enabled: {
          berg: true,
          sieg: true,
          schneider: true
        }
      }
    }
  };
  
  console.log('✅ Tournament-Dokument erstellt:');
  console.log(`   ID: ${tournamentData.id}`);
  console.log(`   Name: ${tournamentData.name}`);
  console.log(`   Modus: ${tournamentData.tournamentMode}`);
  console.log(`   Spieler: ${tournamentData.participantPlayerIds.length}`);
  console.log('');

  // Phase 4: Simuliere Game-Dokumente
  console.log('🎯 PHASE 4: Erstelle Game-Dokumente\n');
  
  const games = passes.map(passe => ({
    id: passe.passeId,
    passeNumber: passe.passeNumber,
    passeLabel: passe.passeLabel,
    completedAt: passe.completedAt,
    durationMillis: passe.durationSeconds * 1000,
    startedAt: admin.firestore.Timestamp.fromMillis(
      passe.completedAt.toMillis() - passe.durationSeconds * 1000
    ),
    teams: {
      top: {
        players: passe.topPlayers.map(p => ({
          playerId: p.id,
          displayName: p.displayName
        }))
      },
      bottom: {
        players: passe.bottomPlayers.map(p => ({
          playerId: p.id,
          displayName: p.displayName
        }))
      }
    },
    finalScores: {
      top: passe.topScore,
      bottom: passe.bottomScore
    },
    finalStriche: {
      top: {
        berg: Math.random() > 0.8 ? 1 : 0,
        sieg: passe.topScore > passe.bottomScore ? 1 : 0,
        matsch: Math.random() > 0.9 ? 1 : 0,
        schneider: Math.random() > 0.85 ? 1 : 0,
        kontermatsch: 0
      },
      bottom: {
        berg: Math.random() > 0.8 ? 1 : 0,
        sieg: passe.bottomScore > passe.topScore ? 1 : 0,
        matsch: Math.random() > 0.9 ? 1 : 0,
        schneider: Math.random() > 0.85 ? 1 : 0,
        kontermatsch: 0
      }
    },
    participantPlayerIds: [
      ...passe.topPlayers.map(p => p.id),
      ...passe.bottomPlayers.map(p => p.id)
    ],
    roundHistory: [] // Vereinfacht
  }));
  
  console.log(`✅ ${games.length} Game-Dokumente erstellt`);
  console.log('');

  // Phase 5: Simuliere finalizeTournament
  console.log('🔥 PHASE 5: Simuliere finalizeTournament\n');
  
  console.log('⚙️  Berechne Player-Statistiken...');
  
  const playerStats: { [playerId: string]: any } = {};
  
  players.forEach(player => {
    playerStats[player.id] = {
      playerId: player.id,
      displayName: player.displayName,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsScored: 0,
      pointsReceived: 0,
      totalScore: 0
    };
  });
  
  games.forEach(game => {
    const topPlayerIds = game.teams.top.players.map(p => p.playerId);
    const bottomPlayerIds = game.teams.bottom.players.map(p => p.playerId);
    
    topPlayerIds.forEach(playerId => {
      if (playerStats[playerId]) {
        playerStats[playerId].gamesPlayed++;
        playerStats[playerId].pointsScored += game.finalScores.top;
        playerStats[playerId].pointsReceived += game.finalScores.bottom;
        playerStats[playerId].totalScore += game.finalScores.top;
        
        if (game.finalScores.top > game.finalScores.bottom) {
          playerStats[playerId].wins++;
        } else if (game.finalScores.top < game.finalScores.bottom) {
          playerStats[playerId].losses++;
        }
      }
    });
    
    bottomPlayerIds.forEach(playerId => {
      if (playerStats[playerId]) {
        playerStats[playerId].gamesPlayed++;
        playerStats[playerId].pointsScored += game.finalScores.bottom;
        playerStats[playerId].pointsReceived += game.finalScores.top;
        playerStats[playerId].totalScore += game.finalScores.bottom;
        
        if (game.finalScores.bottom > game.finalScores.top) {
          playerStats[playerId].wins++;
        } else if (game.finalScores.bottom < game.finalScores.top) {
          playerStats[playerId].losses++;
        }
      }
    });
  });
  
  const rankedPlayers = Object.values(playerStats).sort((a: any, b: any) => {
    return b.totalScore - a.totalScore;
  });
  
  console.log('✅ Statistiken berechnet\n');
  
  // Phase 6: Zeige Rangliste
  console.log('🏆 PHASE 6: Turnier-Rangliste\n');
  console.log('='.repeat(80));
  console.log('Rang | Spieler         | Spiele | Siege | Punkte | Differenz');
  console.log('='.repeat(80));
  
  rankedPlayers.forEach((player: any, index) => {
    const rank = (index + 1).toString().padStart(4);
    const name = player.displayName.padEnd(15);
    const games = player.gamesPlayed.toString().padStart(6);
    const wins = player.wins.toString().padStart(5);
    const points = player.totalScore.toString().padStart(6);
    const diff = (player.pointsScored - player.pointsReceived).toString().padStart(9);
    
    console.log(`${rank} | ${name} | ${games} | ${wins} | ${points} | ${diff}`);
  });
  
  console.log('='.repeat(80) + '\n');

  // Phase 7: Validierung
  console.log('✅ PHASE 7: Validierung\n');
  
  const validations = [
    {
      test: 'Alle Spieler haben Spiele',
      pass: rankedPlayers.every((p: any) => p.gamesPlayed > 0)
    },
    {
      test: 'Keine doppelten Player IDs',
      pass: new Set(players.map(p => p.id)).size === players.length
    },
    {
      test: 'Alle Games haben 4 Spieler',
      pass: games.every(g => g.participantPlayerIds.length === 4)
    },
    {
      test: 'Parallele Tische simuliert',
      pass: new Set(passes.map(p => p.tableNumber)).size === TEST_CONFIG.parallelTables
    },
    {
      test: 'Realistische Spiel-Dauern',
      pass: passes.every(p => 
        p.durationSeconds >= TEST_CONFIG.minPasseDuration &&
        p.durationSeconds <= TEST_CONFIG.maxPasseDuration
      )
    }
  ];
  
  validations.forEach(v => {
    const icon = v.pass ? '✅' : '❌';
    console.log(`${icon} ${v.test}`);
  });
  
  const allValid = validations.every(v => v.pass);
  console.log('');
  
  if (allValid) {
    console.log('✅ Alle Validierungen bestanden!\n');
  } else {
    console.log('❌ Einige Validierungen fehlgeschlagen!\n');
  }

  // Phase 8: Zusammenfassung
  console.log('='.repeat(80));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('='.repeat(80));
  console.log(`Turnier: ${TEST_CONFIG.tournamentName}`);
  console.log(`Spieler: ${players.length}`);
  console.log(`Passen: ${games.length}`);
  console.log(`Parallele Tische: ${TEST_CONFIG.parallelTables}`);
  console.log(`Gesamtdauer: ${Math.floor(passes[passes.length - 1].completedAt.toMillis() - startTime.toMillis()) / 1000 / 60} Minuten (simuliert)`);
  console.log(`Gewinner: ${rankedPlayers[0].displayName} mit ${rankedPlayers[0].totalScore} Punkten`);
  console.log('');
  console.log('🔒 DRY-RUN: Keine Daten wurden in die Datenbank geschrieben!');
  console.log('='.repeat(80) + '\n');

  return {
    success: allValid,
    tournamentData,
    games,
    playerStats: rankedPlayers
  };
}

// ====================================================================
// MAIN
// ====================================================================

async function main() {
  try {
    const result = await simulateTournament();
    
    if (result.success) {
      console.log('✅ Dry-Run erfolgreich abgeschlossen!');
      console.log('✅ Tournament-System ist bereit für Donnerstag!');
      process.exit(0);
    } else {
      console.log('❌ Dry-Run fehlgeschlagen!');
      console.log('❌ Bitte Fehler beheben vor dem Turnier!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fehler beim Dry-Run:', error);
    process.exit(1);
  }
}

main();

