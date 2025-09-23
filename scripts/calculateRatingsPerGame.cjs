/**
 * Jass-Elo Rating Berechnung: Pro einzelnes Spiel
 * 
 * FEATURES:
 * - Per-Spieler K-Rampe: 10% Wirkung (1. Spiel) → 100% (ab 50. Spiel)
 * - Gruppenübergreifende Ratings (globaler Skill)
 * - Nur Striche-basierte Bewertung (Wikipedia-konform mit MoV)
 * - Zero-sum garantiert
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

// Command-Line-Argumente parsen
const parseArgInt = (flag, fallback) => {
  const idx = process.argv.indexOf(flag);
  if (idx > -1 && idx + 1 < process.argv.length) {
    const val = parseInt(process.argv[idx + 1], 10);
    return Number.isFinite(val) ? val : fallback;
  }
  return fallback;
};

// Import des neuen Jass-Elo Moduls (Node.js kompatibel)
// Note: Da wir CommonJS verwenden, simulieren wir den Import
const JASS_ELO_CONFIG = {
  K_TARGET: parseArgInt('--K', 32),           // FINAL: K=32 (optimale Volatilität)
  RAMP_MAX_GAMES: 50,                         // IRRELEVANT: K-Rampe deaktiviert
  RAMP_MIN_FACTOR: 0.1,                       // IRRELEVANT: K-Rampe deaktiviert
  DEFAULT_RATING: 1000,                       // Startwert auf 1000 umgestellt (Durchschnitt)
  ELO_SCALE: parseArgInt('--scale', 1000),    // FINAL: Skala=1000 (optimale Spreizung)
};

// Elo-Funktionen (aus src/services/jassElo.ts kopiert für CJS)
function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

function teamRating(team) {
  return (team.player1.rating + team.player2.rating) / 2;
}

function stricheScore(stricheA, stricheB) {
  const total = stricheA + stricheB;
  if (total === 0) return 0.5;
  return stricheA / total;
}

function kRampFactor(gamesPlayed) {
  // DEAKTIVIERT: Fixer K-Faktor 20 für alle Spieler
  return 1.0; // 100% K-Wirkung für alle
}

function effectiveK(team) {
  // FIXER K-FAKTOR: Alle Spieler bekommen K=20
  const player1K = JASS_ELO_CONFIG.K_TARGET; // = 20
  const player2K = JASS_ELO_CONFIG.K_TARGET; // = 20
  const teamK = JASS_ELO_CONFIG.K_TARGET;    // = 20
  
  return { player1K, player2K, teamK };
}

function updateMatchRatings(match) {
  // Team-Ratings und Erwartungswerte
  const ratingA = teamRating(match.teamA);
  const ratingB = teamRating(match.teamB);
  const expectedA = expectedScore(ratingA, ratingB);
  
  // Striche-Score
  const S = stricheScore(match.stricheA, match.stricheB);
  
  // Effektive K-Faktoren
  const kA = effectiveK(match.teamA);
  const kB = effectiveK(match.teamB);
  
  // Team-Deltas (Zero-sum)
  const teamKAvg = (kA.teamK + kB.teamK) / 2;
  const deltaA = teamKAvg * (S - expectedA);
  const deltaB = -deltaA;
  
  // Spieler-Updates
  const updates = [
    // Team A - OHNE /2: Voller Delta für jeden Spieler
    {
      playerId: match.teamA.player1.id,
      oldRating: match.teamA.player1.rating,
      newRating: match.teamA.player1.rating + deltaA,
      delta: deltaA,
      oldGamesPlayed: match.teamA.player1.gamesPlayed,
      newGamesPlayed: match.teamA.player1.gamesPlayed + 1,
      kEffective: kA.player1K,
    },
    {
      playerId: match.teamA.player2.id,
      oldRating: match.teamA.player2.rating,
      newRating: match.teamA.player2.rating + deltaA,
      delta: deltaA,
      oldGamesPlayed: match.teamA.player2.gamesPlayed,
      newGamesPlayed: match.teamA.player2.gamesPlayed + 1,
      kEffective: kA.player2K,
    },
    // Team B - OHNE /2: Voller Delta für jeden Spieler
    {
      playerId: match.teamB.player1.id,
      oldRating: match.teamB.player1.rating,
      newRating: match.teamB.player1.rating + deltaB,
      delta: deltaB,
      oldGamesPlayed: match.teamB.player1.gamesPlayed,
      newGamesPlayed: match.teamB.player1.gamesPlayed + 1,
      kEffective: kB.player1K,
    },
    {
      playerId: match.teamB.player2.id,
      oldRating: match.teamB.player2.rating,
      newRating: match.teamB.player2.rating + deltaB,
      delta: deltaB,
      oldGamesPlayed: match.teamB.player2.gamesPlayed,
      newGamesPlayed: match.teamB.player2.gamesPlayed + 1,
      kEffective: kB.player2K,
    },
  ];
  
  return {
    teamAExpected: expectedA,
    stricheScore: S,
    teamADelta: deltaA,
    teamBDelta: deltaB,
    updates,
  };
}

// === HAUPT-FUNKTION ===

async function calculateRatingsPerGame() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const groupId = args[0] || null;
  const freshStart = true; // Bei gruppenweiser Neuberechnung stets deterministisch ab 1000
  
  console.log('🚀 Jass-Elo Rating Berechnung PER SPIEL gestartet...');
  console.log(`📊 Gruppe: ${groupId || 'ALLE GRUPPEN (gruppenübergreifend)'}`);
  console.log(`⚙️  K-Faktor: FEST ${JASS_ELO_CONFIG.K_TARGET} (KEINE Rampe)`);
  console.log(`🎯 Startwert: ${JASS_ELO_CONFIG.DEFAULT_RATING} Rating`);
  console.log('⏰ Zeit:', new Date().toISOString());
  console.log('=====================================\n');

  try {
    // 1. Lade alle Sessions (gruppenübergreifend oder gefiltert)
    const sessions = await loadSessions(groupId);
    console.log(`📈 ${sessions.length} Sessions gefunden`);

    if (sessions.length === 0) {
      console.log('❌ Keine Sessions gefunden. Beende...');
      return;
    }

    // 2. Lade alle einzelnen Spiele
    const allGames = await loadAllGamesFromSessions(sessions);
    console.log(`🎮 ${allGames.length} einzelne Spiele gefunden\n`);

    if (allGames.length === 0) {
      console.log('❌ Keine Spiele gefunden. Beende...');
      return;
    }

    // 3. Berechne Ratings pro Spiel
    const results = await calculateRatingsFromGames(allGames, { freshStart });
    
    // 4. Speichere in Firestore (inkl. Spiegelung in Gruppen-Subcollections)
    await saveRatings(results.playerRatings, results.playerGroupsMap);

    // 5. Zeige Zusammenfassung
    showSummary(results);

  } catch (error) {
    console.error('❌ FEHLER:', error);
    process.exit(1);
  }
}

async function loadSessions(groupId) {
  console.log('📊 Lade Sessions...');
  
  if (groupId) {
    // Spezifische Gruppe
    const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`);
    const snapshot = await sessionsRef.where('status', '==', 'completed').get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      groupId: groupId,
      ...doc.data()
    }));
  } else {
    // Gruppenübergreifend: Alle Gruppen durchsuchen
    console.log('🌍 Lade Sessions aus ALLEN Gruppen...');
    const allSessions = [];
    
    const groupsSnapshot = await db.collection('groups').get();
    console.log(`   🔍 Durchsuche ${groupsSnapshot.size} Gruppen...`);
    
    for (const groupDoc of groupsSnapshot.docs) {
      try {
        const sessionsRef = db.collection(`groups/${groupDoc.id}/jassGameSummaries`);
        const snapshot = await sessionsRef.where('status', '==', 'completed').get();
        
        const groupSessions = snapshot.docs.map(doc => ({
          id: doc.id,
          groupId: groupDoc.id,
          ...doc.data()
        }));
        
        allSessions.push(...groupSessions);
        
        if (groupSessions.length > 0) {
          console.log(`   📈 Gruppe ${groupDoc.id}: ${groupSessions.length} Sessions`);
        }
      } catch (error) {
        console.warn(`   ⚠️  Fehler bei Gruppe ${groupDoc.id}:`, error.message);
      }
    }
    
    return allSessions;
  }
}

async function loadAllGamesFromSessions(sessions) {
  console.log('🎮 Lade alle einzelnen Spiele...');
  
  const allGames = [];
  
  for (const session of sessions) {
    try {
      if (session.tournamentId) {
        // TURNIER-SPIELE: Aus gameResults Array
        console.log(`   🏆 Turnier-Session ${session.id}: Lade aus gameResults...`);
        
        if (session.gameResults && Array.isArray(session.gameResults)) {
          session.gameResults.forEach(gameData => {
            // WICHTIG: Turnierspiele verwenden NICHT participantPlayerIds der Session,
            // sondern die Spieler aus der teams-Struktur des jeweiligen Spiels
            allGames.push({
              ...gameData,
              sessionId: session.id,
              groupId: session.groupId,
              tournamentId: session.tournamentId,
              sessionTimestamp: session.startedAt?.toMillis?.() || session.startedAt || 0,
              // participantPlayerIds NICHT aus Session übernehmen!
              isTournamentGame: true
            });
          });
          
          console.log(`   🏆 Turnier ${session.id}: ${session.gameResults.length} Spiele`);
        } else {
          console.warn(`   ⚠️  Turnier-Session ${session.id} hat keine gameResults`);
        }
        
      } else {
        // REGULÄRE SPIELE: Aus completedGames Subcollection
        const gamesRef = db.collection(`groups/${session.groupId}/jassGameSummaries/${session.id}/completedGames`);
        const gamesSnapshot = await gamesRef.orderBy('gameNumber', 'asc').get();
        
        gamesSnapshot.forEach(gameDoc => {
          const gameData = gameDoc.data();
          
          allGames.push({
            ...gameData,
            sessionId: session.id,
            groupId: session.groupId,
            sessionTimestamp: session.startedAt?.toMillis?.() || session.startedAt || 0,
            participantPlayerIds: session.participantPlayerIds || session.participantUids || [],
            isTournamentGame: false
          });
        });
        
        if (gamesSnapshot.size > 0) {
          console.log(`   📊 Session ${session.id}: ${gamesSnapshot.size} Spiele`);
        }
      }
      
    } catch (error) {
      console.warn(`⚠️  Fehler beim Laden der Spiele für Session ${session.id}:`, error.message);
    }
  }
  
  // Sortiere alle Spiele chronologisch (Sessions + individuelle Spiel-Timestamps)
  allGames.sort((a, b) => {
    // Priorität: completedAt (Turnier) > timestampCompleted (regulär) > sessionTimestamp
    const timeA = a.completedAt?.toMillis?.() || a.completedAt || 
                  a.timestampCompleted?.toMillis?.() || a.timestampCompleted || 
                  a.sessionTimestamp;
    const timeB = b.completedAt?.toMillis?.() || b.completedAt || 
                  b.timestampCompleted?.toMillis?.() || b.timestampCompleted || 
                  b.sessionTimestamp;
    
    if (timeA !== timeB) return timeA - timeB;
    return (a.gameNumber || 0) - (b.gameNumber || 0);
  });
  
  return allGames;
}

async function calculateRatingsFromGames(games, { freshStart = false } = {}) {
  console.log('🧮 Berechne Jass-Elo Ratings pro Spiel...');

  // Lade bestehende Ratings (gruppenübergreifend)
  const playerRatings = await loadExistingRatings(freshStart);
  // NEU: Mapping Spieler -> Gruppen, in denen sie gespielt haben (für Gruppen-Subcollections)
  const playerGroupsMap = new Map(); // playerId -> Set(groupId)
  
  let processedCount = 0;
  let skippedCount = 0;

  for (const game of games) {
    try {
      const match = convertGameToMatch(game, playerRatings);
      if (!match) {
        skippedCount++;
        continue;
      }

      const result = updateMatchRatings(match);
      
      // Update lokale Ratings
      for (const update of result.updates) {
        playerRatings.set(update.playerId, {
          id: update.playerId,
          rating: update.newRating,
          gamesPlayed: update.newGamesPlayed,
          lastUpdated: Date.now()
        });
        // NEU: Gruppen-Zuordnung merken
        if (game.groupId) {
          if (!playerGroupsMap.has(update.playerId)) {
            playerGroupsMap.set(update.playerId, new Set());
          }
          playerGroupsMap.get(update.playerId).add(game.groupId);
        }
      }

      processedCount++;
      
      if (processedCount % 50 === 0) {
        console.log(`   📈 ${processedCount} Spiele verarbeitet...`);
      }

    } catch (error) {
      console.warn(`⚠️  Fehler bei Spiel ${game.sessionId}/${game.gameNumber}:`, error.message);
      skippedCount++;
    }
  }

  return {
    processedGames: processedCount,
    skippedGames: skippedCount,
    playerRatings,
    playerGroupsMap
  };
}

async function loadExistingRatings(freshStart = false) {
  console.log('📂 Lade bestehende Ratings...');
  
  const playerRatings = new Map();
  if (freshStart) {
    console.log('   🧼 FRESH START: Initialisiere alle beteiligten Spieler mit 1000');
    return playerRatings; // leer → Spieler werden bei erstem Auftreten mit DEFAULT_RATING initialisiert
  }
  
  try {
    const ratingsSnapshot = await db.collection('playerRatings').get();
    
    ratingsSnapshot.forEach(doc => {
      const data = doc.data();
      playerRatings.set(doc.id, {
        id: doc.id,
        rating: data.rating || JASS_ELO_CONFIG.DEFAULT_RATING,
        gamesPlayed: data.gamesPlayed || 0,
        lastUpdated: data.lastUpdated || Date.now()
      });
    });
    
    console.log(`   📊 ${playerRatings.size} bestehende Ratings geladen`);
  } catch (error) {
    console.warn('⚠️  Fehler beim Laden bestehender Ratings:', error.message);
  }
  
  return playerRatings;
}

function convertGameToMatch(game, playerRatings) {
  const getPlayerRating = (playerId) => {
    return playerRatings.get(playerId) || {
      id: playerId,
      rating: JASS_ELO_CONFIG.DEFAULT_RATING,
      gamesPlayed: 0,
      lastUpdated: Date.now()
    };
  };

  if (game.isTournamentGame) {
    // TURNIER-SPIELE: Verwende teams-Struktur
    if (!game.teams || !game.teams.top || !game.teams.bottom) {
      return null;
    }
    
    if (!game.finalStriche) {
      return null;
    }

    // Team-Spieler aus teams-Struktur extrahieren
    const topPlayers = game.teams.top.players || [];
    const bottomPlayers = game.teams.bottom.players || [];
    
    if (topPlayers.length !== 2 || bottomPlayers.length !== 2) {
      return null;
    }

    // Striche berechnen
    const stricheTop = sumStriche(game.finalStriche.top);
    const stricheBottom = sumStriche(game.finalStriche.bottom);
    
    return {
      sessionId: game.sessionId,
      gameNumber: game.gameNumber || 1,
      isTournamentGame: true,
      tournamentId: game.tournamentId,
      teamA: {
        player1: getPlayerRating(topPlayers[0].playerId),
        player2: getPlayerRating(topPlayers[1].playerId)
      },
      teamB: {
        player1: getPlayerRating(bottomPlayers[0].playerId),
        player2: getPlayerRating(bottomPlayers[1].playerId)
      },
      stricheA: stricheTop,
      stricheB: stricheBottom
    };
    
  } else {
    // REGULÄRE SPIELE: Verwende participantPlayerIds
    if (!game.participantPlayerIds || game.participantPlayerIds.length !== 4) {
      return null;
    }

    if (!game.finalStriche) {
      return null;
    }

    // Team-Zuordnung (Index 0,2 = bottom, Index 1,3 = top)
    const topTeam = [game.participantPlayerIds[1], game.participantPlayerIds[3]];
    const bottomTeam = [game.participantPlayerIds[0], game.participantPlayerIds[2]];

    // Striche berechnen
    const stricheTop = sumStriche(game.finalStriche.top);
    const stricheBottom = sumStriche(game.finalStriche.bottom);
    
    return {
      sessionId: game.sessionId,
      gameNumber: game.gameNumber || 1,
      isTournamentGame: false,
      teamA: {
        player1: getPlayerRating(topTeam[0]),
        player2: getPlayerRating(topTeam[1])
      },
      teamB: {
        player1: getPlayerRating(bottomTeam[0]),
        player2: getPlayerRating(bottomTeam[1])
      },
      stricheA: stricheTop,
      stricheB: stricheBottom
    };
  }
}

function sumStriche(striche) {
  if (!striche) return 0;
  return (striche.berg || 0) + 
         (striche.sieg || 0) + 
         (striche.matsch || 0) + 
         (striche.schneider || 0) + 
         (striche.kontermatsch || 0);
}

async function saveRatings(playerRatings, playerGroupsMap) {
  console.log('\n💾 Speichere Jass-Elo Ratings in Firestore...');
  
  const ratingsArray = Array.from(playerRatings.values());
  
  // Lade Spielernamen für alle Player IDs
  console.log('👥 Lade Spielernamen...');
  const playerNames = await loadPlayerNames(ratingsArray.map(r => r.id));
  console.log(`   ✅ ${Object.keys(playerNames).length} Namen geladen`);
  
  const batch = db.batch();
  
  for (const rating of ratingsArray) {
    const docRef = db.collection('playerRatings').doc(rating.id);
    
    // Erweitere Rating um Spielernamen
    const ratingWithName = {
      ...rating,
      displayName: playerNames[rating.id] || `Spieler_${rating.id.slice(0, 6)}`,
      lastUpdated: Date.now()
    };
    
    batch.set(docRef, ratingWithName);

    // NEU: Spiegeln in Gruppen-Subcollections
    const groupsSet = playerGroupsMap?.get(rating.id);
    if (groupsSet && groupsSet.size > 0) {
      for (const groupId of groupsSet) {
        const groupDocRef = db.collection(`groups/${groupId}/playerRatings`).doc(rating.id);
        batch.set(groupDocRef, ratingWithName);
      }
    }
  }
  
  await batch.commit();
  console.log(`✅ ${ratingsArray.length} Ratings mit Namen gespeichert`);
}

async function loadPlayerNames(playerIds) {
  const playerNames = {};
  
  try {
    // Batch-Load in Gruppen von 10 (Firestore 'in' limit)
    const batches = [];
    for (let i = 0; i < playerIds.length; i += 10) {
      batches.push(playerIds.slice(i, i + 10));
    }
    
    for (const batch of batches) {
      const playersSnapshot = await db.collection('players')
        .where(admin.firestore.FieldPath.documentId(), 'in', batch)
        .get();
      
      playersSnapshot.forEach(doc => {
        const data = doc.data();
        playerNames[doc.id] = data.displayName || data.nickname || `Spieler_${doc.id.slice(0, 6)}`;
      });
    }
  } catch (error) {
    console.warn('⚠️  Fehler beim Laden der Spielernamen:', error.message);
  }
  
  return playerNames;
}

function showSummary(results) {
  console.log('\n=====================================');
  console.log('📊 JASS-ELO ZUSAMMENFASSUNG');
  console.log('=====================================');
  console.log(`✅ Verarbeitete Spiele: ${results.processedGames}`);
  console.log(`⚠️  Übersprungene Spiele: ${results.skippedGames}`);
  console.log(`👥 Spieler mit Ratings: ${results.playerRatings.size}`);
  
  // Top 15 Spieler
  const topPlayers = Array.from(results.playerRatings.values())
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 15);
  
  console.log('\n🏆 TOP 15 SPIELER:');
  topPlayers.forEach((player, index) => {
    const tier = getRatingTier(player.rating);
    console.log(`${index + 1}. ${player.id}: ${Math.round(player.rating)} (${player.gamesPlayed} Spiele) - ${tier}`);
  });
  
  console.log('\n📈 RATING-VERTEILUNG:');
  const distribution = {};
  Array.from(results.playerRatings.values()).forEach(player => {
    const tier = getRatingTier(player.rating);
    distribution[tier] = (distribution[tier] || 0) + 1;
  });
  
  Object.entries(distribution).forEach(([tier, count]) => {
    console.log(`   ${tier}: ${count} Spieler`);
  });
  
  console.log('\n🎉 Jass-Elo Berechnung abgeschlossen!');
  console.log(`💡 K-Faktor: FEST ${JASS_ELO_CONFIG.K_TARGET} für alle Spieler`);
  console.log('💡 Alle Ratings sind gruppenübergreifend (globaler Skill)');
}

function getRatingTier(rating) {
  // Finale Schweizer Jass-Tier System
  if (rating >= 1100) return "👼 Göpf Egg";
  if (rating >= 1090) return "🔱 Jassgott";
  if (rating >= 1080) return "👑 Jasskönig";
  if (rating >= 1070) return "🇨🇭 Eidgenoss";
  if (rating >= 1060) return "🍀 Kranzjasser";
  if (rating >= 1050) return "🏆 Grossmeister";
  if (rating >= 1040) return "💎 Jassmeister";
  if (rating >= 1030) return "🥇 Goldjasser";
  if (rating >= 1020) return "🥈 Silberjasser";
  if (rating >= 1010) return "🥉 Bronzejasser";
  if (rating >= 1000) return "👨‍🎓 Akademiker";
  if (rating >= 990) return "💡 Aspirant";
  if (rating >= 980) return "☘️ Praktikant";
  if (rating >= 970) return "📚 Schüler";
  if (rating >= 960) return "🐓 Hahn";
  if (rating >= 950) return "🐔 Huhn";
  if (rating >= 940) return "🐥 Kücken";
  if (rating >= 930) return "🌱 Anfänger";
  if (rating >= 920) return "🎅 Chlaus";
  if (rating >= 910) return "🧀 Käse";
  if (rating >= 900) return "🦆 Ente";
  if (rating >= 890) return "🥒 Gurke";
  return "🥚 Just Egg";
}

function showHelp() {
  console.log(`
🎯 Jass-Elo Rating Calculator

FEATURES:
✅ Per-Spieler K-Rampe: ${JASS_ELO_CONFIG.RAMP_MIN_FACTOR * 100}% (1. Spiel) → 100% (ab ${JASS_ELO_CONFIG.RAMP_MAX_GAMES}. Spiel)
✅ Gruppenübergreifende Ratings (globaler Skill)  
✅ Nur Striche-basierte Bewertung (Wikipedia-konform)
✅ Zero-sum garantiert

USAGE:
  node scripts/calculateRatingsPerGame.cjs [groupId]

BEISPIELE:
  node scripts/calculateRatingsPerGame.cjs                    # Alle Gruppen
  node scripts/calculateRatingsPerGame.cjs Tz0wgIHMTlhvTtFastiJ  # Spezifische Gruppe

🎮 Das Script berechnet Jass-Elo für JEDES einzelne Spiel!
💾 Überschreibt die bestehenden Ratings in 'playerRatings' Collection.
  `);
}

// === AUSFÜHRUNG ===

if (require.main === module) {
  calculateRatingsPerGame();
}