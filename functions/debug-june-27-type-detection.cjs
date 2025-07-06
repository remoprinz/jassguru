const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru-c3c0a.firebaseio.com'
});

const db = admin.firestore();

// Repliziere die fetchAllGamesForSession Logik
async function fetchAllGamesForSession(sessionId) {
  console.log(`🔍 Lade alle Spiele für Session: ${sessionId}`);
  
  const sessionDoc = await db.collection('jassGameSummaries').doc(sessionId).get();
  if (!sessionDoc.exists) {
    console.log('❌ Session nicht gefunden');
    return [];
  }

  const sessionData = sessionDoc.data();
  const games = [];

  // Lade completed games aus subcollection
  const completedGamesSnap = await db.collection('jassGameSummaries')
    .doc(sessionId)
    .collection('completedGames')
    .orderBy('gameNumber', 'asc')
    .get();

  completedGamesSnap.forEach(doc => {
    const gameData = doc.data();
    games.push({
      id: doc.id,
      ...gameData
    });
  });

  console.log(`✅ ${games.length} Spiele geladen`);
  return games;
}

// Repliziere die Typ-Erkennung aus GameViewerKreidetafel
function analyzeGameTypeDetection(games) {
  console.log('\n🔍 TYP-ERKENNUNG ANALYSE:');
  console.log('='.repeat(50));
  
  games.forEach((game, index) => {
    console.log(`\n--- Spiel ${index + 1} (gameNumber: ${game.gameNumber}) ---`);
    console.log(`Game ID: ${game.id}`);
    
    // Prüfe teams property
    const hasTeams = 'teams' in game && game.teams;
    console.log(`teams exists: ${hasTeams}`);
    
    // Prüfe finalStriche property
    const hasFinalStriche = 'finalStriche' in game && game.finalStriche;
    console.log(`finalStriche exists: ${hasFinalStriche}`);
    
    // Typ-Erkennung basierend auf GameViewerKreidetafel Logik
    if (hasTeams) {
      console.log('🔴 Detected as: GameEntry');
      console.log('   Looking for: game.teams.top.striche');
      
      if (game.teams.top && game.teams.top.striche) {
        console.log('   ✅ game.teams.top.striche found:', game.teams.top.striche);
      } else {
        console.log('   ❌ game.teams.top.striche is undefined');
      }
      
      if (game.teams.bottom && game.teams.bottom.striche) {
        console.log('   ✅ game.teams.bottom.striche found:', game.teams.bottom.striche);
      } else {
        console.log('   ❌ game.teams.bottom.striche is undefined');
      }
    } else if (hasFinalStriche) {
      console.log('🟢 Detected as: CompletedGameSummary');
      console.log('   Looking for: game.finalStriche');
      console.log('   ✅ finalStriche.top:', game.finalStriche.top);
      console.log('   ✅ finalStriche.bottom:', game.finalStriche.bottom);
    } else {
      console.log('⚪ Unknown type - neither teams nor finalStriche');
    }
  });
}

// Berechne Striche-Totals wie in GameViewerKreidetafel
function calculateStricheTotals(games) {
  console.log('\n🧮 STRICHE-BERECHNUNG:');
  console.log('='.repeat(50));
  
  let totalTop = 0;
  let totalBottom = 0;
  
  games.forEach((game, index) => {
    console.log(`\n--- Spiel ${index + 1} ---`);
    
    let gameStricheTop = null;
    let gameStricheBottom = null;
    
    // Type Guard wie in GameViewerKreidetafel
    if ('teams' in game && game.teams) {
      console.log('🔴 Using GameEntry logic');
      if (game.teams.top && game.teams.bottom) {
        gameStricheTop = game.teams.top.striche;
        gameStricheBottom = game.teams.bottom.striche;
      }
    } else if ('finalStriche' in game && game.finalStriche) {
      console.log('🟢 Using CompletedGameSummary logic');
      gameStricheTop = game.finalStriche.top;
      gameStricheBottom = game.finalStriche.bottom;
    }
    
    console.log('gameStricheTop:', gameStricheTop);
    console.log('gameStricheBottom:', gameStricheBottom);
    
    // Berechne Werte für dieses Spiel
    const gameTopValue = gameStricheTop ? 
      Object.values(gameStricheTop).reduce((sum, val) => sum + val, 0) : 0;
    const gameBottomValue = gameStricheBottom ? 
      Object.values(gameStricheBottom).reduce((sum, val) => sum + val, 0) : 0;
    
    console.log(`Spiel ${index + 1} Werte - Top: ${gameTopValue}, Bottom: ${gameBottomValue}`);
    
    totalTop += gameTopValue;
    totalBottom += gameBottomValue;
  });
  
  console.log(`\n🎯 FINALE TOTALS:`);
  console.log(`Total Top: ${totalTop}`);
  console.log(`Total Bottom: ${totalBottom}`);
  
  return { top: totalTop, bottom: totalBottom };
}

async function debugJune27TypeDetection() {
  console.log('🔍 DEBUG: JUNI 27 TYP-ERKENNUNG');
  console.log('='.repeat(50));
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  
  try {
    // Lade Games
    const games = await fetchAllGamesForSession(sessionId);
    
    // Analysiere Typ-Erkennung
    analyzeGameTypeDetection(games);
    
    // Berechne Totals
    const totals = calculateStricheTotals(games);
    
    console.log('\n📊 ERWARTETE WERTE:');
    console.log('Top Team sollte haben: 10 Striche');
    console.log('Bottom Team sollte haben: 7 Striche');
    console.log(`\nBERECHNET: Top ${totals.top}, Bottom ${totals.bottom}`);
    console.log(`KORREKT: ${totals.top === 10 && totals.bottom === 7 ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

debugJune27TypeDetection().then(() => {
  console.log('\n✅ Debug abgeschlossen');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fehler:', error);
  process.exit(1);
}); 