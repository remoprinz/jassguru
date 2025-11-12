import * as admin from 'firebase-admin';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Admin initialisieren mit Service Account Key
const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

// PlayerHistoryEntry Interface (JavaScript Object)

async function diagnoseAllPlayersInGroup() {
  try {
    console.log('🔍 DIAGNOSE ALLER SPIELER IN DER GRUPPE');
    console.log('==========================================\n');
    
    const groupId = 'Tz0wgIHMTlhvTtFastiJ';
    
    console.log(`📁 Gruppe: ${groupId}\n`);
    
    // Alle Spieler in der Gruppe laden
    const playersRef = db.collection(`groups/${groupId}/players`);
    const playersSnap = await playersRef.get();
    
    if (playersSnap.empty) {
      console.log('❌ Keine Spieler in der Gruppe gefunden');
      return;
    }
    
    console.log(`👥 Gefundene Spieler: ${playersSnap.size}\n`);
    
    const playerAnalysis = [];
    
    for (const playerDoc of playersSnap.docs) {
      const playerId = playerDoc.id;
      const playerData = playerDoc.data();
      const playerName = playerData.name || 'Unbekannt';
      
      console.log(`👤 Analysiere: ${playerName} (${playerId})`);
      
      // Prüfen ob playerRating existiert
      const playerRatingRef = db.collection('playerRatings').doc(playerId);
      const playerRatingDoc = await playerRatingRef.get();
      
      if (playerRatingDoc.exists()) {
        const ratingData = playerRatingDoc.data();
        console.log(`  ✅ playerRating existiert`);
        console.log(`  📈 Rating: ${ratingData?.rating || 'N/A'}`);
        console.log(`  🎮 Spiele: ${ratingData?.gamesPlayed || 0}`);
        console.log(`  🏆 Siege: ${ratingData?.wins || 0}`);
        console.log(`  📊 Striche: ${ratingData?.stricheDifference || 0}`);
        
        // Historie laden
        const historyRef = db.collection(`groups/${groupId}/playerRatings/${playerId}/history`);
        const historySnap = await historyRef.orderBy('createdAt', 'asc').get();
        
        if (!historySnap.empty) {
          const lastEntry = historySnap.docs[historySnap.docs.length - 1]?.data();
          const historyGames = lastEntry?.gamesPlayed || 0;
          const historyStriche = lastEntry?.cumulative?.striche || 0;
          const historyRating = lastEntry?.rating || 0;
          
          console.log(`  📚 History-Einträge: ${historySnap.docs.length}`);
          console.log(`  📚 History-Spiele: ${historyGames}`);
          console.log(`  📚 History-Striche: ${historyStriche >= 0 ? '+' : ''}${historyStriche}`);
          console.log(`  📚 History-Rating: ${historyRating.toFixed(1)}`);
          
          // Inkonsistenzen prüfen
          const gamesInconsistent = ratingData?.gamesPlayed !== historyGames;
          const stricheInconsistent = ratingData?.stricheDifference !== historyStriche;
          const ratingInconsistent = Math.abs((ratingData?.rating || 0) - historyRating) > 0.1;
          
          if (gamesInconsistent || stricheInconsistent || ratingInconsistent) {
            console.log(`  ⚠️  INKONSISTENZEN GEFUNDEN:`);
            if (gamesInconsistent) console.log(`    - Spiele: Rating=${ratingData?.gamesPlayed} vs History=${historyGames}`);
            if (stricheInconsistent) console.log(`    - Striche: Rating=${ratingData?.stricheDifference} vs History=${historyStriche}`);
            if (ratingInconsistent) console.log(`    - Rating: Rating=${ratingData?.rating} vs History=${historyRating}`);
          } else {
            console.log(`  ✅ Alle Daten konsistent`);
          }
          
          playerAnalysis.push({
            playerId,
            name: playerName,
            hasPlayerRating: true,
            hasHistory: true,
            ratingGames: ratingData?.gamesPlayed || 0,
            ratingStriche: ratingData?.stricheDifference || 0,
            ratingRating: ratingData?.rating || 0,
            historyGames,
            historyStriche,
            historyRating,
            historyEntries: historySnap.docs.length,
            inconsistent: gamesInconsistent || stricheInconsistent || ratingInconsistent
          });
        } else {
          console.log(`  ❌ Keine History-Daten gefunden`);
          playerAnalysis.push({
            playerId,
            name: playerName,
            hasPlayerRating: true,
            hasHistory: false,
            ratingGames: ratingData?.gamesPlayed || 0,
            ratingStriche: ratingData?.stricheDifference || 0,
            ratingRating: ratingData?.rating || 0,
            historyGames: 0,
            historyStriche: 0,
            historyRating: 0,
            historyEntries: 0,
            inconsistent: false
          });
        }
      } else {
        console.log(`  ❌ playerRating fehlt komplett!`);
        playerAnalysis.push({
          playerId,
          name: playerName,
          hasPlayerRating: false,
          hasHistory: false,
          ratingGames: 0,
          ratingStriche: 0,
          ratingRating: 0,
          historyGames: 0,
          historyStriche: 0,
          historyRating: 0,
          historyEntries: 0,
          inconsistent: false
        });
      }
      
      console.log('');
    }
    
    // Zusammenfassung
    console.log('📋 ZUSAMMENFASSUNG');
    console.log('==================');
    
    const playersWithRating = playerAnalysis.filter(p => p.hasPlayerRating);
    const playersWithoutRating = playerAnalysis.filter(p => !p.hasPlayerRating);
    const playersWithHistory = playerAnalysis.filter(p => p.hasHistory);
    const playersWithoutHistory = playerAnalysis.filter(p => !p.hasHistory);
    const playersWithInconsistencies = playerAnalysis.filter(p => p.inconsistent);
    
    console.log(`✅ Spieler mit playerRating: ${playersWithRating.length}`);
    console.log(`❌ Spieler ohne playerRating: ${playersWithoutRating.length}`);
    console.log(`📚 Spieler mit History: ${playersWithHistory.length}`);
    console.log(`❌ Spieler ohne History: ${playersWithoutHistory.length}`);
    console.log(`⚠️  Spieler mit Inkonsistenzen: ${playersWithInconsistencies.length}`);
    
    if (playersWithoutRating.length > 0) {
      console.log('\n🚨 SPIELER OHNE PLAYERRATING:');
      playersWithoutRating.forEach(player => {
        console.log(`  - ${player.name} (${player.playerId})`);
      });
    }
    
    if (playersWithoutHistory.length > 0) {
      console.log('\n🚨 SPIELER OHNE HISTORY:');
      playersWithoutHistory.forEach(player => {
        console.log(`  - ${player.name} (${player.playerId})`);
      });
    }
    
    if (playersWithInconsistencies.length > 0) {
      console.log('\n⚠️  SPIELER MIT INKONSISTENZEN:');
      playersWithInconsistencies.forEach(player => {
        console.log(`  - ${player.name} (${player.playerId})`);
        console.log(`    Rating: ${player.ratingGames} Spiele, ${player.ratingStriche >= 0 ? '+' : ''}${player.ratingStriche} Striche`);
        console.log(`    History: ${player.historyGames} Spiele, ${player.historyStriche >= 0 ? '+' : ''}${player.historyStriche} Striche`);
      });
    }
    
    // Gesamtstatistiken
    const totalRatingGames = playerAnalysis.reduce((sum, p) => sum + p.ratingGames, 0);
    const totalHistoryGames = playerAnalysis.reduce((sum, p) => sum + p.historyGames, 0);
    const totalRatingStriche = playerAnalysis.reduce((sum, p) => sum + p.ratingStriche, 0);
    const totalHistoryStriche = playerAnalysis.reduce((sum, p) => sum + p.historyStriche, 0);
    
    console.log('\n📊 GRUPPENSTATISTIKEN:');
    console.log(`  Rating-Gesamtspiele: ${totalRatingGames}`);
    console.log(`  History-Gesamtspiele: ${totalHistoryGames}`);
    console.log(`  Rating-Gesamtstriche: ${totalRatingStriche >= 0 ? '+' : ''}${totalRatingStriche}`);
    console.log(`  History-Gesamtstriche: ${totalHistoryStriche >= 0 ? '+' : ''}${totalHistoryStriche}`);
    
    if (totalRatingGames !== totalHistoryGames) {
      console.log(`  ⚠️  SPIELE-INKONSISTENZ: ${totalRatingGames} vs ${totalHistoryGames} (Diff: ${totalRatingGames - totalHistoryGames})`);
    }
    
    if (totalRatingStriche !== totalHistoryStriche) {
      console.log(`  ⚠️  STRICHE-INKONSISTENZ: ${totalRatingStriche >= 0 ? '+' : ''}${totalRatingStriche} vs ${totalHistoryStriche >= 0 ? '+' : ''}${totalHistoryStriche} (Diff: ${totalRatingStriche - totalHistoryStriche})`);
    }
    
  } catch (error) {
    console.error('❌ Fehler bei der Diagnose:', error);
  }
}

// Script ausführen
diagnoseAllPlayersInGroup();
