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

const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

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
  K_TARGET: parseArgInt('--K', 15),           // KONSTANT: K=15 für alle (moderate Änderungen)wi
  RAMP_MAX_GAMES: 50,                         // IRRELEVANT: K-Rampe deaktiviert
  RAMP_MIN_FACTOR: 0.1,                       // IRRELEVANT: K-Rampe deaktiviert
  DEFAULT_RATING: 100,                        // Startwert bei 100 (niedrigere Basis)
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
  // KONSTANTER K-FAKTOR: K=15 für alle Spieler (moderate Änderungen)
  const player1K = JASS_ELO_CONFIG.K_TARGET; // = 15
  const player2K = JASS_ELO_CONFIG.K_TARGET; // = 15
  const teamK = JASS_ELO_CONFIG.K_TARGET;    // = 15
  
  return { player1K, player2K, teamK };
}

// ✅ NEU: Dynamische Verteilung basierend auf Rating-Unterschied
function calculateDynamicDistribution(rating1, rating2, teamDelta) {
  // Gleichverteilung im Team: je 50% des Team-Deltas
  const half = teamDelta / 2;
  return { delta1: half, delta2: half };
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
  
  // ✅ Gleichverteilung innerhalb der Teams (50/50)
  const distributionA = calculateDynamicDistribution(
    match.teamA.player1.rating, 
    match.teamA.player2.rating, 
    deltaA
  );
  const distributionB = calculateDynamicDistribution(
    match.teamB.player1.rating, 
    match.teamB.player2.rating, 
    deltaB
  );

  // Spieler-Updates mit individuellen Deltas
  const updates = [
    // Team A - Dynamische Verteilung
    {
      playerId: match.teamA.player1.id,
      oldRating: match.teamA.player1.rating,
      newRating: match.teamA.player1.rating + distributionA.delta1,
      delta: distributionA.delta1,
      oldGamesPlayed: match.teamA.player1.gamesPlayed,
      newGamesPlayed: match.teamA.player1.gamesPlayed + 1,
      kEffective: kA.player1K,
    },
    {
      playerId: match.teamA.player2.id,
      oldRating: match.teamA.player2.rating,
      newRating: match.teamA.player2.rating + distributionA.delta2,
      delta: distributionA.delta2,
      oldGamesPlayed: match.teamA.player2.gamesPlayed,
      newGamesPlayed: match.teamA.player2.gamesPlayed + 1,
      kEffective: kA.player2K,
    },
    // Team B - Dynamische Verteilung
    {
      playerId: match.teamB.player1.id,
      oldRating: match.teamB.player1.rating,
      newRating: match.teamB.player1.rating + distributionB.delta1,
      delta: distributionB.delta1,
      oldGamesPlayed: match.teamB.player1.gamesPlayed,
      newGamesPlayed: match.teamB.player1.gamesPlayed + 1,
      kEffective: kB.player1K,
    },
    {
      playerId: match.teamB.player2.id,
      oldRating: match.teamB.player2.rating,
      newRating: match.teamB.player2.rating + distributionB.delta2,
      delta: distributionB.delta2,
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
    const results = await calculateRatingsFromGames(allGames, { freshStart, sessions });
    
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

async function calculateRatingsFromGames(games, { freshStart = false, sessions = [] } = {}) {
  console.log('🧮 Berechne Jass-Elo Ratings pro Spiel...');

  // Lade bestehende Ratings (gruppenübergreifend)
  const playerRatings = await loadExistingRatings(freshStart);
  // NEU: Mapping Spieler -> Gruppen, in denen sie gespielt haben (für Gruppen-Subcollections)
  const playerGroupsMap = new Map(); // playerId -> Set(groupId)
  
  // ✅ NEU: Session-Start-Ratings für korrektes Session-Delta
  const sessionStartRatings = new Map(); // sessionId -> Map<playerId, startRating>
  const sessionEndRatings = new Map(); // sessionId -> Map<playerId, endRating>
  const playerSessionHistory = new Map(); // playerId -> [{ sessionId, endRating }, ...]
  
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
      
       // ✅ NEU: Speichere Start-Ratings für erste Spiele einer Session
       if (game.sessionId && game.gameNumber === 1) {
         const sessionPlayerRatings = new Map();
         for (const update of result.updates) {
           sessionPlayerRatings.set(update.playerId, update.oldRating);
         }
         sessionStartRatings.set(game.sessionId, sessionPlayerRatings);
       }
      
      // Update lokale Ratings
      for (const update of result.updates) {
        const updateData = {
          id: update.playerId,
          rating: update.newRating,
          gamesPlayed: update.newGamesPlayed,
          lastUpdated: Date.now()
        };
        
        // ✅ Für Turnier-Spiele: Delta sofort setzen (pro Spiel)
        if (game.tournamentId && !game.sessionId) {
          updateData.lastDelta = Math.round(update.newRating - update.oldRating);
        }
        // Für Session-Spiele: lastDelta wird später am Ende der Session gesetzt
        
        playerRatings.set(update.playerId, updateData);
        // NEU: Gruppen-Zuordnung merken
        if (game.groupId) {
          if (!playerGroupsMap.has(update.playerId)) {
            playerGroupsMap.set(update.playerId, new Set());
          }
          playerGroupsMap.get(update.playerId).add(game.groupId);
        }
      }

      // ✅ VEREINFACHT: Speichere immer End-Ratings (überschreibt bei mehreren Spielen)
      if (game.sessionId) {
        if (!sessionEndRatings.has(game.sessionId)) {
          sessionEndRatings.set(game.sessionId, new Map());
        }
        const endRatings = sessionEndRatings.get(game.sessionId);
        
        for (const update of result.updates) {
          endRatings.set(update.playerId, update.newRating);
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

  // ✅ NEU: Berechne Session-Deltas am Ende (Cloud Function Logik)
  // Gruppiere Spiele nach Session
  const sessionGames = new Map(); // sessionId -> array of games
  for (const game of games) {
    if (game.sessionId) {
      if (!sessionGames.has(game.sessionId)) {
        sessionGames.set(game.sessionId, []);
      }
      sessionGames.get(game.sessionId).push(game);
    }
  }
  
   // ✅ KORRIGIERT: Verwende Session-endedAt aus den ursprünglichen Session-Daten
   const sessionTimestamps = new Map(); // sessionId -> endedAt timestamp
   
   // Lade Session-Timestamps aus den ursprünglichen Sessions
   for (const session of sessions) {
     let timestamp = 0;
     
     // 1. Versuche endedAt (PRIMÄR)
     if (session.endedAt) {
       if (typeof session.endedAt === 'object' && session.endedAt.toMillis) {
         timestamp = session.endedAt.toMillis();
       } else if (typeof session.endedAt === 'object' && session.endedAt.seconds) {
         timestamp = session.endedAt.seconds * 1000;
       } else if (typeof session.endedAt === 'number') {
         timestamp = session.endedAt;
       }
     }
     // 2. Fallback: startedAt
     else if (session.startedAt) {
       if (typeof session.startedAt === 'object' && session.startedAt.toMillis) {
         timestamp = session.startedAt.toMillis();
       } else if (typeof session.startedAt === 'object' && session.startedAt.seconds) {
         timestamp = session.startedAt.seconds * 1000;
       } else if (typeof session.startedAt === 'number') {
         timestamp = session.startedAt;
       }
     }
     // 3. Fallback: createdAt
     else if (session.createdAt) {
       if (typeof session.createdAt === 'object' && session.createdAt.toMillis) {
         timestamp = session.createdAt.toMillis();
       } else if (typeof session.createdAt === 'object' && session.createdAt.seconds) {
         timestamp = session.createdAt.seconds * 1000;
       } else if (typeof session.createdAt === 'number') {
         timestamp = session.createdAt;
       }
     }
     
     if (timestamp > 0) {
       sessionTimestamps.set(session.id, timestamp);
     } else {
       console.warn(`⚠️ Session ${session.id} hat keinen verwertbaren Timestamp`);
       sessionTimestamps.set(session.id, 0);
     }
   }
  
  // Sortiere Sessions chronologisch mit sekundärer Session-ID Sortierung
  const sortedSessionIds = Array.from(sessionGames.keys()).sort((a, b) => {
    const timestampA = sessionTimestamps.get(a) || 0;
    const timestampB = sessionTimestamps.get(b) || 0;
    
    // Primäre Sortierung: Timestamp
    if (timestampA !== timestampB) {
      return timestampA - timestampB;
    }
    
    // Sekundäre Sortierung: Session-ID alphabetisch (bei gleichen/fehlenden Timestamps)
    return a.localeCompare(b);
  });
  
  // ✅ SESSION-BASIERTE DELTA-BERECHNUNG: Speichere Start- UND End-Rating pro Session
  for (const sessionId of sortedSessionIds) {
    const startRatings = sessionStartRatings.get(sessionId);
    const endRatings = sessionEndRatings.get(sessionId);
    
    if (startRatings && endRatings) {
      for (const [playerId, startRating] of startRatings) {
        const endRating = endRatings.get(playerId);
        if (endRating !== undefined) {
          // Initialisiere History für Spieler
          if (!playerSessionHistory.has(playerId)) {
            playerSessionHistory.set(playerId, []);
          }
          
          // Füge Session-Daten mit Start- UND End-Rating hinzu
          const playerHistory = playerSessionHistory.get(playerId);
          playerHistory.push({
            sessionId,
            startRating: startRating,  // ✅ NEU: Start-Rating der Session
            endRating: endRating,
            sessionDelta: Math.round(endRating - startRating)  // ✅ NEU: Delta INNERHALB der Session
          });
        }
      }
    }
  }
   
   // ✅ KRITISCHES DEBUG: Zeige Session-Timestamps für Remo & Michael
   const debugSessionIds = ['xe38yaG8mn6BpwVUP2-Ln', 'fNGTXwzTxxinFXW1EF91B'];
   console.log('\n🚨 CHRONOLOGIE-DEBUG:');
   for (const sessionId of debugSessionIds) {
     const timestamp = sessionTimestamps.get(sessionId);
     const date = timestamp ? new Date(timestamp).toISOString() : 'UNBEKANNT';
     console.log(`   ${sessionId}: ${timestamp} (${date})`);
   }
   
   // Debug: Zeige alle Sessions von Remo UND Michael
   const playerNames = { 'b16c1120111b7d9e7d733837': 'REMO', '9K2d1OQ1mCXddko7ft6y': 'MICHAEL' };
   
   for (const [playerId, playerName] of Object.entries(playerNames)) {
     const history = playerSessionHistory.get(playerId);
     if (history) {
       console.log(`\n📅 ${playerName}'s SESSIONS (chronologisch):`);
       history.forEach((session, index) => {
         const isLast = index === history.length - 1;
         const isSecondLast = index === history.length - 2;
         const marker = isLast ? '🔴 LETZTE' : isSecondLast ? '🟡 VORLETZTE' : '';
         const deltaStr = session.sessionDelta >= 0 ? `+${session.sessionDelta}` : `${session.sessionDelta}`;
         console.log(`   ${index + 1}. ${session.sessionId} → Rating: ${Math.round(session.startRating)} → ${Math.round(session.endRating)} (${deltaStr}) ${marker}`);
       });
       
       if (history.length > 0) {
         const lastSession = history[history.length - 1];
         console.log(`   💡 ${playerName} lastDelta (letzte Session): ${lastSession.sessionDelta >= 0 ? '+' : ''}${lastSession.sessionDelta}`);
       }
     }
   }
   
   // ✅ KORREKT: lastDelta = Änderung INNERHALB der letzten Session
   for (const [playerId, history] of playerSessionHistory) {
     const currentPlayerData = playerRatings.get(playerId);
     if (!currentPlayerData) continue;
     
     if (history.length > 0) {
       // Nimm das Delta der LETZTEN Session (Änderung innerhalb dieser Session)
       const lastSession = history[history.length - 1];
       currentPlayerData.lastDelta = lastSession.sessionDelta;
     } else {
       // Keine Sessions: Delta = 0
       currentPlayerData.lastDelta = 0;
     }
     
     playerRatings.set(playerId, currentPlayerData);
   }
  
  // Für Turnier-Spiele (kein sessionId): Delta ist bereits korrekt gesetzt
  for (const game of games) {
    if (!game.sessionId && game.tournamentId) {
      // Bei Turnier-Spielen ist das Delta pro Spiel bereits korrekt
      // Nichts zu tun
    }
  }

  // 🆕 PEAK/LOW TRACKING: Berechne echte Peaks aus kompletter Historie
  for (const [playerId, playerData] of playerRatings) {
    const sessionHistory = playerSessionHistory.get(playerId) || [];
    
    // Alle Ratings sammeln: Start (100) + alle Session-Endwerte mit Timestamps
    const allRatingsWithDates = [{ rating: 100, timestamp: Date.now() }]; // Startwert
    sessionHistory.forEach(session => {
      allRatingsWithDates.push({ 
        rating: session.endRating, 
        timestamp: session.timestamp || Date.now() 
      });
    });
    
    // Peak und Low berechnen mit echten Datums
    let truePeak = 100;
    let trueLow = 100;
    let peakDate = Date.now();
    let lowDate = Date.now();
    
    allRatingsWithDates.forEach(entry => {
      if (entry.rating > truePeak) {
        truePeak = entry.rating;
        peakDate = entry.timestamp;
      }
      if (entry.rating < trueLow) {
        trueLow = entry.rating;
        lowDate = entry.timestamp;
      }
    });
    
    // Erweitere playerData
    playerData.peakRating = truePeak;
    playerData.peakRatingDate = peakDate;
    playerData.lowestRating = trueLow;
    playerData.lowestRatingDate = lowDate;
    
    playerRatings.set(playerId, playerData);
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
    // ✅ WICHTIG: Tier und Emoji mit neuer 100er-Skala berechnen!
    const tierInfo = getRatingTier(rating.rating);
    
    const ratingWithName = {
      ...rating,
      displayName: playerNames[rating.id] || `Spieler_${rating.id.slice(0, 6)}`,
      lastUpdated: Date.now(),
      tier: tierInfo.name,
      tierEmoji: tierInfo.emoji,
      // 🆕 PEAK/LOW TRACKING: Berechne aus Session-History
      peakRating: Math.max(rating.rating, rating.peakRating || 100),
      peakRatingDate: rating.rating > (rating.peakRating || 100) ? Date.now() : rating.peakRatingDate,
      lowestRating: Math.min(rating.rating, rating.lowestRating || 100),
      lowestRatingDate: rating.rating < (rating.lowestRating || 100) ? Date.now() : rating.lowestRatingDate,
      // lastDelta ist bereits korrekt aus der Game-Iteration gesetzt
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
    console.log(`${index + 1}. ${player.id}: ${Math.round(player.rating)} (${player.gamesPlayed} Spiele) - ${tier.emoji} ${tier.name}`);
  });
  
  console.log('\n📈 RATING-VERTEILUNG:');
  const distribution = {};
  Array.from(results.playerRatings.values()).forEach(player => {
    const tier = getRatingTier(player.rating);
    const tierKey = `${tier.emoji} ${tier.name}`;
    distribution[tierKey] = (distribution[tierKey] || 0) + 1;
  });
  
  Object.entries(distribution).forEach(([tier, count]) => {
    console.log(`   ${tier}: ${count} Spieler`);
  });
  
  console.log('\n🎉 Jass-Elo Berechnung abgeschlossen!');
  console.log(`💡 K-Faktor: FEST ${JASS_ELO_CONFIG.K_TARGET} für alle Spieler`);
  console.log('💡 Alle Ratings sind gruppenübergreifend (globaler Skill)');
}

function getRatingTier(rating) {
  // ✅ PERFEKTE JASS-TIERS: Exakt synchronisiert mit shared/rating-tiers.ts
  if (rating >= 150) return { name: "Göpf Egg", emoji: "👼" };
  if (rating >= 145) return { name: "Jassgott", emoji: "🔱" };
  if (rating >= 140) return { name: "Jasskönig", emoji: "👑" };
  if (rating >= 135) return { name: "Grossmeister", emoji: "🏆" };
  if (rating >= 130) return { name: "Jasser mit Auszeichnung", emoji: "🎖️" };
  if (rating >= 125) return { name: "Diamantjasser II", emoji: "💎" };
  if (rating >= 120) return { name: "Diamantjasser I", emoji: "💍" };
  if (rating >= 115) return { name: "Goldjasser", emoji: "🥇" };
  if (rating >= 110) return { name: "Silberjasser", emoji: "🥈" };
  if (rating >= 105) return { name: "Broncejasser", emoji: "🥉" };
  if (rating >= 100) return { name: "Jassstudent", emoji: "👨‍🎓" };
  if (rating >= 95)  return { name: "Kleeblatt vierblättrig", emoji: "🍀" };
  if (rating >= 90)  return { name: "Kleeblatt dreiblättrig", emoji: "☘️" };
  if (rating >= 85)  return { name: "Sprössling", emoji: "🌱" };
  if (rating >= 80)  return { name: "Hahn", emoji: "🐓" };
  if (rating >= 75)  return { name: "Huhn", emoji: "🐔" };
  if (rating >= 70)  return { name: "Kücken", emoji: "🐥" };
  if (rating >= 65)  return { name: "Ente", emoji: "🦆" };
  if (rating >= 60)  return { name: "Chlaus", emoji: "🎅" };
  if (rating >= 55)  return { name: "Chäs", emoji: "🧀" };
  if (rating >= 50)  return { name: "Gurke", emoji: "🥒" };
  return { name: "Just Egg", emoji: "🥚" };
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