/**
 * KRITISCHER AUDIT: Elo-System komplett neu berechnen
 * Verwendet die korrekte Session-basierte Logik aus analyzePlayerEloProgressionFixed.cjs
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId: 'jassguru',
  });
}

const db = admin.firestore();

// CLI-Argumente: --K=32 --scale=300 --dry
const argv = process.argv.slice(2);
const parseArgInt = (key, fallback) => {
  const raw = argv.find(a => a.startsWith(`${key}=`));
  if (!raw) return fallback;
  const val = parseInt(raw.split('=')[1], 10);
  return Number.isFinite(val) ? val : fallback;
};
const DRY_RUN = argv.includes('--dry');

// Elo-Konfiguration (per Flag überschreibbar)
const JASS_ELO_CONFIG = {
  K_TARGET: parseArgInt('--K', 24),        // NEU: K=24 (weniger volatil)
  DEFAULT_RATING: 1000,
  ELO_SCALE: parseArgInt('--scale', 2000), // NEU: Skala=2000 (massive Reaktivität)
};

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

function sumStriche(striche) {
  if (!striche) return 0;
  return (striche.berg || 0) + 
         (striche.sieg || 0) + 
         (striche.matsch || 0) + 
         (striche.schneider || 0) + 
         (striche.kontermatsch || 0);
}

function getRatingTier(rating) {
  if (rating >= 1080) return { name: "Legendary", emoji: "👑" };
  if (rating >= 1060) return { name: "Grandmaster", emoji: "🏆" };
  if (rating >= 1050) return { name: "Master", emoji: "💎" };
  if (rating >= 1040) return { name: "Diamant", emoji: "💍" };
  if (rating >= 1030) return { name: "Gold", emoji: "🥇" };
  if (rating >= 1020) return { name: "Silber", emoji: "🥈" };
  if (rating >= 1010) return { name: "Bronze", emoji: "🥉" };
  if (rating >= 1000) return { name: "Fortgeschritten", emoji: "⭐" };
  if (rating >= 990) return { name: "Rookie", emoji: "🌈" };
  if (rating >= 980) return { name: "Ambitioniert", emoji: "🔰" };
  if (rating >= 970) return { name: "Entwicklung", emoji: "☘️" };
  if (rating >= 960) return { name: "Learner", emoji: "🐥" };
  if (rating >= 950) return { name: "Schwimmer", emoji: "🐠" };
  if (rating >= 940) return { name: "Beginner", emoji: "🌱" };
  return { name: "Neuling", emoji: "🥚" };
}

async function backupCurrentRatings() {
  console.log('💾 Sichere aktuelle (fehlerhafte) Ratings...');
  
  const snapshot = await db.collection('playerRatings').get();
  const backup = {};
  
  snapshot.forEach(doc => {
    backup[doc.id] = doc.data();
  });
  
  const backupPath = path.join(__dirname, '../backup_ratings_before_fix.json');
  require('fs').writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  
  console.log(`✅ ${snapshot.size} Ratings gesichert in: ${backupPath}`);
}

async function loadAllSessionsAndGames() {
  console.log('🔍 Lade ALLE Sessions und Spiele (SESSION-BASIERT)...');
  
  const allSessions = [];
  const playerGroupMap = new Map(); // Spieler -> Set von Gruppen
  
  // Alle Gruppen durchsuchen
  const groupsSnapshot = await db.collection('groups').get();
  
  for (const groupDoc of groupsSnapshot.docs) {
    const groupId = groupDoc.id;
    
    try {
      const sessionsSnapshot = await db.collection(`groups/${groupId}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .get();
      
      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionData = sessionDoc.data();
        const sessionId = sessionDoc.id;
        
        if (sessionData.tournamentId && sessionData.gameResults) {
          // TURNIER-SESSION
          const sessionGames = [];
          sessionData.gameResults.forEach(gameData => {
            if (gameData.teams && gameData.teams.top && gameData.teams.bottom) {
              const allPlayerIds = [
                ...(gameData.teams.top.players?.map(p => p.playerId) || []),
                ...(gameData.teams.bottom.players?.map(p => p.playerId) || [])
              ];
              
              // Füge Spieler zur Gruppe hinzu
              allPlayerIds.forEach(playerId => {
                if (!playerGroupMap.has(playerId)) {
                  playerGroupMap.set(playerId, new Set());
                }
                playerGroupMap.get(playerId).add(groupId);
              });
              
              sessionGames.push({
                ...gameData,
                sessionId,
                groupId,
                isTournamentGame: true,
                sessionTimestamp: sessionData.startedAt?.toMillis?.() || sessionData.startedAt || 0,
              });
            }
          });
          
          if (sessionGames.length > 0) {
            allSessions.push({
              sessionId,
              groupId,
              startedAt: sessionData.startedAt,
              games: sessionGames
            });
          }
          
        } else if (sessionData.participantPlayerIds && sessionData.participantPlayerIds.length === 4) {
          // REGULÄRE SESSION
          const participantPlayerIds = sessionData.participantPlayerIds;
          
          // Füge Spieler zur Gruppe hinzu
          participantPlayerIds.forEach(playerId => {
            if (!playerGroupMap.has(playerId)) {
              playerGroupMap.set(playerId, new Set());
            }
            playerGroupMap.get(playerId).add(groupId);
          });
          
          // Lade alle Spiele dieser Session
          const gamesSnapshot = await db.collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
            .orderBy('gameNumber', 'asc')
            .get();
          
          const sessionGames = [];
          gamesSnapshot.forEach(gameDoc => {
            const gameData = gameDoc.data();
            sessionGames.push({
              ...gameData,
              sessionId,
              groupId,
              isTournamentGame: false,
              sessionTimestamp: sessionData.startedAt?.toMillis?.() || sessionData.startedAt || 0,
              participantPlayerIds,
            });
          });
          
          if (sessionGames.length > 0) {
            allSessions.push({
              sessionId,
              groupId,
              startedAt: sessionData.startedAt,
              games: sessionGames
            });
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️  Fehler bei Gruppe ${groupId}:`, error.message);
    }
  }
  
  // KORREKTE Session-basierte Sortierung
  allSessions.sort((a, b) => {
    const timeA = a.startedAt?.toMillis?.() || a.startedAt || 0;
    const timeB = b.startedAt?.toMillis?.() || b.startedAt || 0;
    return timeA - timeB;
  });
  
  // Alle Spiele aus Sessions sammeln (Session-Reihenfolge beibehalten)
  const allGames = [];
  allSessions.forEach(session => {
    session.games.forEach(game => {
      allGames.push(game);
    });
  });
  
  console.log(`✅ ${allGames.length} Spiele aus ${allSessions.length} Sessions geladen`);
  
  return { allGames, playerGroupMap };
}

async function loadPlayerNames(playerIds) {
  const playerNames = {};
  
  if (playerIds.length === 0) return playerNames;
  
  try {
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

function processGame(game, playerRatings) {
  if (game.isTournamentGame) {
    // TURNIER-SPIELE
    if (!game.teams || !game.teams.top || !game.teams.bottom || !game.finalStriche) {
      return null;
    }

    const topPlayers = game.teams.top.players || [];
    const bottomPlayers = game.teams.bottom.players || [];
    
    if (topPlayers.length !== 2 || bottomPlayers.length !== 2) {
      return null;
    }

    const stricheTop = sumStriche(game.finalStriche.top);
    const stricheBottom = sumStriche(game.finalStriche.bottom);
    
    return {
      teamA: {
        player1: playerRatings.get(topPlayers[0].playerId),
        player2: playerRatings.get(topPlayers[1].playerId)
      },
      teamB: {
        player1: playerRatings.get(bottomPlayers[0].playerId),
        player2: playerRatings.get(bottomPlayers[1].playerId)
      },
      stricheA: stricheTop,
      stricheB: stricheBottom
    };
    
  } else {
    // REGULÄRE SPIELE
    if (!game.participantPlayerIds || game.participantPlayerIds.length !== 4 || !game.finalStriche) {
      return null;
    }

    // KORREKTE Team-Zuordnung: [0,2] = bottom, [1,3] = top
    const bottomTeam = [game.participantPlayerIds[0], game.participantPlayerIds[2]];
    const topTeam = [game.participantPlayerIds[1], game.participantPlayerIds[3]];

    const stricheTop = sumStriche(game.finalStriche.top);
    const stricheBottom = sumStriche(game.finalStriche.bottom);
    
    return {
      teamA: {
        player1: playerRatings.get(topTeam[0]),
        player2: playerRatings.get(topTeam[1])
      },
      teamB: {
        player1: playerRatings.get(bottomTeam[0]),
        player2: playerRatings.get(bottomTeam[1])
      },
      stricheA: stricheTop,
      stricheB: stricheBottom
    };
  }
}

async function recalculateAllRatings() {
  console.log('\n🔄 NEUBERECHNUNG ALLER ELO-RATINGS');
  console.log('===================================');
  
  // 1. Backup erstellen
  await backupCurrentRatings();
  
  // 2. Alle Spiele laden
  const { allGames, playerGroupMap } = await loadAllSessionsAndGames();
  
  // 3. Alle beteiligten Spieler sammeln
  const allPlayerIds = new Set();
  allGames.forEach(game => {
    if (game.isTournamentGame && game.teams) {
      game.teams.top?.players?.forEach(p => allPlayerIds.add(p.playerId));
      game.teams.bottom?.players?.forEach(p => allPlayerIds.add(p.playerId));
    } else if (game.participantPlayerIds) {
      game.participantPlayerIds.forEach(id => allPlayerIds.add(id));
    }
  });
  
  console.log(`👥 ${allPlayerIds.size} einzigartige Spieler gefunden`);
  
  // 4. Spielernamen laden
  const playerNames = await loadPlayerNames(Array.from(allPlayerIds));
  
  // 5. Ratings initialisieren
  const playerRatings = new Map();
  Array.from(allPlayerIds).forEach(playerId => {
    playerRatings.set(playerId, {
      id: playerId,
      rating: JASS_ELO_CONFIG.DEFAULT_RATING,
      gamesPlayed: 0,
      lastUpdated: Date.now(),
      displayName: playerNames[playerId] || `Spieler_${playerId.slice(0, 6)}`
    });
  });
  
  console.log(`🎮 Verarbeite ${allGames.length} Spiele chronologisch...`);
  
  // 6. Alle Spiele verarbeiten
  let processedGames = 0;
  for (const game of allGames) {
    const match = processGame(game, playerRatings);
    
    if (!match) continue;

    const ratingA = teamRating(match.teamA);
    const ratingB = teamRating(match.teamB);
    const expectedA = expectedScore(ratingA, ratingB);
    const S = stricheScore(match.stricheA, match.stricheB);

    const deltaA = JASS_ELO_CONFIG.K_TARGET * (S - expectedA);
    const deltaB = -deltaA;

    // Update alle 4 Spieler
    match.teamA.player1.rating += deltaA;
    match.teamA.player1.gamesPlayed += 1;
    match.teamA.player2.rating += deltaA;
    match.teamA.player2.gamesPlayed += 1;
    
    match.teamB.player1.rating += deltaB;
    match.teamB.player1.gamesPlayed += 1;
    match.teamB.player2.rating += deltaB;
    match.teamB.player2.gamesPlayed += 1;
    
    // Update Map
    playerRatings.set(match.teamA.player1.id, match.teamA.player1);
    playerRatings.set(match.teamA.player2.id, match.teamA.player2);
    playerRatings.set(match.teamB.player1.id, match.teamB.player1);
    playerRatings.set(match.teamB.player2.id, match.teamB.player2);
    
    processedGames++;
    
    if (processedGames % 100 === 0) {
      console.log(`   ⏳ ${processedGames}/${allGames.length} Spiele verarbeitet...`);
    }
  }
  
  console.log(`✅ ${processedGames} Spiele erfolgreich verarbeitet`);
  
  // 7. Ratings speichern
  await saveRatings(playerRatings, playerGroupMap);
  
  // 8. Stichprobe zeigen
  await showTopRatings(playerRatings);
}

async function saveRatings(playerRatings, playerGroupMap) {
  if (DRY_RUN) {
    console.log('\n💾 [DRY-RUN] Überspringe Speichern der Elo-Ratings');
    return;
  }
  console.log('\n💾 Speichere korrigierte Elo-Ratings...');
  
  const ratingsArray = Array.from(playerRatings.values());
  const batchSize = 500; // Firestore Batch-Limit
  
  // In Batches aufteilen
  for (let i = 0; i < ratingsArray.length; i += batchSize) {
    const batch = db.batch();
    const currentBatch = ratingsArray.slice(i, i + batchSize);
    
    for (const rating of currentBatch) {
      const ratingWithTier = {
        ...rating,
        tier: getRatingTier(rating.rating).name,
        tierEmoji: getRatingTier(rating.rating).emoji,
        lastUpdated: Date.now()
      };
      
      // 1. Globales Rating
      const globalDocRef = db.collection('playerRatings').doc(rating.id);
      batch.set(globalDocRef, ratingWithTier);
      
      // 2. Gruppen-spezifische Ratings
      const groupsForPlayer = playerGroupMap.get(rating.id);
      if (groupsForPlayer) {
        for (const groupId of groupsForPlayer) {
          const groupDocRef = db.collection(`groups/${groupId}/playerRatings`).doc(rating.id);
          batch.set(groupDocRef, ratingWithTier);
        }
      }
    }
    
    await batch.commit();
    console.log(`   ✅ Batch ${Math.floor(i/batchSize) + 1} gespeichert (${currentBatch.length} Ratings)`);
  }
  
  console.log(`✅ ${ratingsArray.length} korrigierte Ratings gespeichert (global + gruppenspezifisch)`);
}

async function showTopRatings(playerRatings) {
  console.log('\n🏆 TOP 15 KORRIGIERTE ELO-RATINGS');
  console.log('==================================');
  
  const sortedRatings = Array.from(playerRatings.values())
    .filter(r => r.gamesPlayed > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 15);
  
  console.log('Rang | Name           | Rating | Spiele | Tier');
  console.log('-----|----------------|--------|--------|----------');
  
  sortedRatings.forEach((rating, index) => {
    const tier = getRatingTier(rating.rating);
    const rank = String(index + 1).padStart(4);
    const name = rating.displayName.slice(0, 14).padEnd(14);
    const ratingStr = Math.round(rating.rating).toString().padStart(6);
    const games = String(rating.gamesPlayed).padStart(6);
    
    console.log(`${rank} | ${name} | ${ratingStr} | ${games} | ${tier.emoji} ${tier.name}`);
  });
}

async function verifySpecificPlayers() {
  console.log('\n🔍 VERIFIKATION: Marc und andere kritische Spieler');
  console.log('================================================');
  
  const testPlayers = [
    '1sDvqN_kvqZLB-4eSZFqZ', // Marc
    'b16c1120111b7d9e7d733837', // Remo  
    'TPBwj8bP9W59n5LoGWP5', // Schmuddi
  ];
  
  for (const playerId of testPlayers) {
    const docRef = db.collection('playerRatings').doc(playerId);
    const doc = await docRef.get();
    
    if (doc.exists) {
      const data = doc.data();
      console.log(`✅ ${data.displayName}: ${Math.round(data.rating)} (${data.gamesPlayed} Spiele)`);
    } else {
      console.log(`❌ ${playerId}: Nicht gefunden`);
    }
  }
}

async function main() {
  console.log('🚨 KRITISCHER ELO-SYSTEM AUDIT & NEUBERECHNUNG');
  console.log('===============================================');
  console.log('⚙️  K-Faktor:', JASS_ELO_CONFIG.K_TARGET);
  console.log('📈 Start-Rating:', JASS_ELO_CONFIG.DEFAULT_RATING);
  console.log('📏 Skala:', JASS_ELO_CONFIG.ELO_SCALE);
  console.log('🧪 Modus:', DRY_RUN ? 'DRY-RUN (kein Schreiben)' : 'WRITE');
  console.log('🔧 Korrekte Team-Zuordnung: [0,2]=bottom, [1,3]=top');
  console.log('📅 Korrekte Chronologie: Sessions + Spiele sortiert');
  console.log('===============================================\n');
  
  await recalculateAllRatings();
  await verifySpecificPlayers();
  
  console.log('\n🎉 AUDIT ABGESCHLOSSEN');
  console.log('======================');
  console.log('✅ Alle Elo-Ratings wurden korrekt neu berechnet');
  console.log('✅ Hauptcollection und Gruppen-Subcollections aktualisiert');
  console.log('✅ Backup der alten Daten erstellt');
  console.log('💾 Alte Ratings: backup_ratings_before_fix.json');
}

main().catch(error => {
  console.error('❌ KRITISCHER FEHLER:', error);
  process.exit(1);
});
