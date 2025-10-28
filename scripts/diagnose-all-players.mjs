import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Firebase Admin SDK mit Service Account initialisieren
const serviceAccount = JSON.parse(readFileSync('serviceAccountKey.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'jasstafel'
  });
}

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

async function diagnoseAllPlayers() {
  console.log('🔍 DIAGNOSE ALLER SPIELER IN GRUPPE');
  console.log('=====================================');
  
  try {
    // Alle Spieler in der Gruppe laden
    const playersSnapshot = await db.collection('groups').doc(GROUP_ID).collection('players').get();
    
    console.log(`📊 Gefundene Spieler: ${playersSnapshot.size}`);
    console.log('');
    
    const playerAnalysis = [];
    
    for (const playerDoc of playersSnapshot.docs) {
      const playerId = playerDoc.id;
      const playerData = playerDoc.data();
      
      console.log(`👤 Spieler: ${playerData.name} (${playerId})`);
      
      // Prüfen ob playerRating existiert
      const playerRatingDoc = await db.collection('playerRatings').doc(playerId).get();
      
      if (playerRatingDoc.exists()) {
        const ratingData = playerRatingDoc.data();
        console.log(`  ✅ playerRating existiert`);
        console.log(`  📈 Rating: ${ratingData.rating || 'N/A'}`);
        console.log(`  🎮 Spiele: ${ratingData.gamesPlayed || 0}`);
        console.log(`  🏆 Siege: ${ratingData.wins || 0}`);
        console.log(`  📊 Striche: ${ratingData.stricheDifference || 0}`);
        
        playerAnalysis.push({
          playerId,
          name: playerData.name,
          hasPlayerRating: true,
          rating: ratingData.rating || 0,
          gamesPlayed: ratingData.gamesPlayed || 0,
          wins: ratingData.wins || 0,
          stricheDifference: ratingData.stricheDifference || 0
        });
      } else {
        console.log(`  ❌ playerRating fehlt komplett!`);
        playerAnalysis.push({
          playerId,
          name: playerData.name,
          hasPlayerRating: false,
          rating: 0,
          gamesPlayed: 0,
          wins: 0,
          stricheDifference: 0
        });
      }
      
      console.log('');
    }
    
    // Zusammenfassung
    console.log('📋 ZUSAMMENFASSUNG');
    console.log('==================');
    const playersWithRating = playerAnalysis.filter(p => p.hasPlayerRating);
    const playersWithoutRating = playerAnalysis.filter(p => !p.hasPlayerRating);
    
    console.log(`✅ Spieler mit playerRating: ${playersWithRating.length}`);
    console.log(`❌ Spieler ohne playerRating: ${playersWithoutRating.length}`);
    
    if (playersWithoutRating.length > 0) {
      console.log('');
      console.log('🚨 BETROFFENE SPIELER:');
      playersWithoutRating.forEach(player => {
        console.log(`  - ${player.name} (${player.playerId})`);
      });
    }
    
    // Gesamtstatistiken
    const totalGames = playerAnalysis.reduce((sum, p) => sum + p.gamesPlayed, 0);
    const totalWins = playerAnalysis.reduce((sum, p) => sum + p.wins, 0);
    const totalStriche = playerAnalysis.reduce((sum, p) => sum + p.stricheDifference, 0);
    
    console.log('');
    console.log('📊 GRUPPENSTATISTIKEN:');
    console.log(`  Gesamtspiele: ${totalGames}`);
    console.log(`  Gesamtsiege: ${totalWins}`);
    console.log(`  Gesamtstriche: ${totalStriche}`);
    
  } catch (error) {
    console.error('❌ Fehler bei der Diagnose:', error);
  }
}

diagnoseAllPlayers();
