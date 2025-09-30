/**
 * Jass-Elo Rangliste mit Spielernamen
 * 
 * Zeigt die aktuelle Jass-Elo Rangliste mit echten Spielernamen an
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

// Tier-System (15-Tier System für perfekte Granularität)
  const RATING_TIERS = [
   { minRating: 150, name: "Göpf Egg", emoji: "👼" },
   { minRating: 145, name: "Jassgott", emoji: "🔱" },
   { minRating: 140, name: "Jasskönig", emoji: "👑" },
   { minRating: 135, name: "Grossmeister", emoji: "🏆" },
   { minRating: 130, name: "Jasser mit Auszeichnung", emoji: "🎖️" },
   { minRating: 125, name: "Diamantjasser II", emoji: "💎" },
   { minRating: 120, name: "Diamantjasser I", emoji: "💍" },
   { minRating: 115, name: "Goldjasser", emoji: "🥇" },
   { minRating: 110, name: "Silberjasser", emoji: "🥈" },
   { minRating: 105, name: "Broncejasser", emoji: "🥉" },
   { minRating: 100, name: "A-Student", emoji: "👨‍🎓" },
   { minRating: 95,  name: "Kleeblatt vierblättrig", emoji: "🍀" },
   { minRating: 90,  name: "Kleeblatt dreiblättrig", emoji: "☘️" },
   { minRating: 85,  name: "Sprössling", emoji: "🌱" },
   { minRating: 80,  name: "Hahn", emoji: "🐓" },
   { minRating: 75,  name: "Huhn", emoji: "🐔" },
   { minRating: 70,  name: "Kücken", emoji: "🐥" },
   { minRating: 65,  name: "Ente", emoji: "🦆" },
   { minRating: 60,  name: "Chlaus", emoji: "🎅" },
   { minRating: 55,  name: "Chäs", emoji: "🧀" },
   { minRating: 50,  name: "Gurke", emoji: "🥒" },
   { minRating: 0, name: "Just Egg", emoji: "🥚" }
  ];

function getRatingTier(rating) {
  for (const tier of RATING_TIERS) {
    if (rating >= tier.minRating) {
      return tier;
    }
  }
  return RATING_TIERS[RATING_TIERS.length - 1]; // Bronze fallback
}

function kRampFactor(gamesPlayed) {
  // DEAKTIVIERT: Alle Spieler haben K=32 (100% K-Wirkung)
  return 1.0;
}

async function showJassEloLeaderboard() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const limit = parseInt(args[0]) || 20;
  
  console.log('🏆 JASS-ELO RANGLISTE');
  console.log('====================');
  console.log(`📊 Top ${limit} Spieler`);
  console.log('⏰ Zeit:', new Date().toLocaleString('de-CH'));
  console.log('====================\n');

  try {
    // 1. Lade alle Ratings
    console.log('📂 Lade Jass-Elo Ratings...');
    const ratingsSnapshot = await db.collection('playerRatings').get();
    
    if (ratingsSnapshot.empty) {
      console.log('❌ Keine Ratings gefunden. Führen Sie zuerst eine Rating-Berechnung durch:');
      console.log('   npm run calculate-ratings:games');
      return;
    }

    const ratings = [];
    ratingsSnapshot.forEach(doc => {
      const data = doc.data();
      ratings.push({
        playerId: doc.id,
        rating: Math.round(data.rating || 1000),
        gamesPlayed: data.gamesPlayed || 0,
        lastUpdated: data.lastUpdated || 0,
        displayName: data.displayName || `Spieler_${doc.id.slice(0, 6)}`
      });
    });

    console.log(`   ✅ ${ratings.length} Ratings geladen`);

    // 3. Sortiere und zeige Rangliste
    const sortedRatings = ratings
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);

    console.log('🥇 RANGLISTE:');
    console.log('Pos | Name                    | Rating | Spiele | Liga         ');
    console.log('----|-------------------------|--------|--------|--------------|');

    sortedRatings.forEach((player, index) => {
      const pos = (index + 1).toString().padStart(3);
      const name = player.displayName.padEnd(23).slice(0, 23);
      const rating = player.rating.toString().padStart(6);
      const games = player.gamesPlayed.toString().padStart(6);
      const tier = getRatingTier(player.rating);
      const tierDisplay = `${tier.emoji} ${tier.name}`.padEnd(12).slice(0, 12);
      console.log(`${pos} | ${name} | ${rating} | ${games} | ${tierDisplay}`);
    });

    // 4. Zeige Statistiken
    showStatistics(ratings);

  } catch (error) {
    console.error('❌ FEHLER:', error);
    process.exit(1);
  }
}

// loadPlayerNames entfernt - Namen werden jetzt direkt aus playerRatings gelesen

function showStatistics(ratings) {
  console.log('\n📊 STATISTIKEN:');
  console.log('================');
  
  // Rating-Verteilung
  const tierDistribution = {};
  let totalGames = 0;
  let ratingSum = 0;
  
  ratings.forEach(player => {
    const tier = getRatingTier(player.rating);
    tierDistribution[tier.name] = (tierDistribution[tier.name] || 0) + 1;
    totalGames += player.gamesPlayed;
    ratingSum += player.rating;
  });
  
  console.log('🏅 Liga-Verteilung:');
  RATING_TIERS.forEach(tier => {
    const count = tierDistribution[tier.name] || 0;
    if (count > 0) {
      const percentage = ((count / ratings.length) * 100).toFixed(1);
      console.log(`   ${tier.emoji} ${tier.name}: ${count} Spieler (${percentage}%)`);
    }
  });
  
  console.log('\n📈 Allgemeine Statistiken:');
  console.log(`   Gesamt Spieler: ${ratings.length}`);
  console.log(`   Durchschnitts-Rating: ${Math.round(ratingSum / ratings.length)}`);
  console.log(`   Gesamt Spiele: ${totalGames.toLocaleString()}`);
  console.log(`   Spiele pro Spieler: ${Math.round(totalGames / ratings.length)}`);
  
  // Top/Bottom Rating
  const sortedByRating = [...ratings].sort((a, b) => b.rating - a.rating);
  console.log(`   Höchstes Rating: ${sortedByRating[0].rating}`);
  console.log(`   Niedrigstes Rating: ${sortedByRating[sortedByRating.length - 1].rating}`);
  console.log(`   Rating-Spreizung: ${sortedByRating[0].rating - sortedByRating[sortedByRating.length - 1].rating} Punkte`);
  
  // K-Faktor Statistik (DEAKTIVIERT: Alle Spieler haben K=32)
  const newPlayers = ratings.filter(p => p.gamesPlayed < 50).length;
  const experiencedPlayers = ratings.filter(p => p.gamesPlayed >= 50).length;
  console.log(`   Neue Spieler (<50 Spiele): ${newPlayers} (K=32, gleich wie alle)`);
  console.log(`   Erfahrene Spieler (≥50 Spiele): ${experiencedPlayers} (K=32, gleich wie alle)`);
}

function showHelp() {
  console.log(`
🏆 Jass-Elo Rangliste

FEATURES:
✅ Aktuelle Jass-Elo Rankings mit echten Spielernamen
✅ Liga-System mit Tiers und Emojis
✅ K-Rampe Status (Rating-Stabilität)
✅ Detaillierte Statistiken

USAGE:
  node scripts/showJassEloLeaderboard.cjs [anzahl]

BEISPIELE:
  node scripts/showJassEloLeaderboard.cjs           # Top 20 (Standard)
  node scripts/showJassEloLeaderboard.cjs 50       # Top 50
  node scripts/showJassEloLeaderboard.cjs 100      # Top 100

💡 Das Leaderboard zeigt die aktuellen Ratings aus der 'playerRatings' Collection.
💡 Namen werden aus der 'players' Collection geladen (displayName Feld).
  `);
}

// === AUSFÜHRUNG ===

if (require.main === module) {
  showJassEloLeaderboard();
}
