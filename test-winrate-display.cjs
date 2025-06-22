const admin = require('firebase-admin');

// Firebase Admin SDK initialisieren
const serviceAccount = require('./functions/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

async function testWinRateDisplayFormat() {
  console.log('🎯 Testing Enhanced Win-Rate Display Format...\n');
  
  const playerId = 'b16c1120111b7d9e7d733837'; // Remo
  
  try {
    // Lese die aktuellen Statistiken aus Firestore
    console.log(`📖 Reading player stats from Firestore...`);
    const statsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    
    if (!statsDoc.exists) {
      console.log('❌ Keine Statistiken gefunden!');
      return;
    }
    
    const stats = statsDoc.data();
    
    // Zeige die grundlegenden Statistiken
    console.log('\n📊 === GRUNDLEGENDE STATISTIKEN ===');
    console.log(`Sessions: ${stats.totalSessions} (${stats.sessionWins} Siege, ${stats.sessionLosses} Niederlagen, ${stats.sessionTies} Unentschieden)`);
    console.log(`Games: ${stats.totalGames} (${stats.gameWins} Siege, ${stats.gameLosses} Niederlagen)`);
    
    // 3. Zeige die neuen Win-Rate Informationen an
    console.log('\n🏆 === WIN-RATE ANZEIGEN ===');
    
    console.log('\n📊 Session Win-Rate:');
    if (stats.sessionWinRateInfo) {
      console.log(`   ✅ Strukturiert: ${stats.sessionWinRateInfo.displayText}`);
      console.log(`   📈 Details: ${stats.sessionWinRateInfo.wins} Siege von ${stats.sessionWinRateInfo.total} entschiedenen Partien`);
    } else {
      const decidedSessions = stats.sessionWins + stats.sessionLosses;
      const rate = decidedSessions > 0 ? (stats.sessionWins / decidedSessions * 100).toFixed(1) : '0.0';
      console.log(`   ⚠️  Fallback: ${stats.sessionWins}/${decidedSessions} = ${rate}%`);
    }
    
    console.log('\n🎮 Game Win-Rate:');
    if (stats.gameWinRateInfo) {
      console.log(`   ✅ Strukturiert: ${stats.gameWinRateInfo.displayText}`);
      console.log(`   📈 Details: ${stats.gameWinRateInfo.wins} Siege von ${stats.gameWinRateInfo.total} Spielen`);
    } else {
      const rate = stats.totalGames > 0 ? (stats.gameWins / stats.totalGames * 100).toFixed(1) : '0.0';
      console.log(`   ⚠️  Fallback: ${stats.gameWins}/${stats.totalGames} = ${rate}%`);
    }
    
    // 4. Zeige Partner-Statistiken
    console.log('\n👥 === PARTNER WIN-RATES ===');
    if (stats.partnerAggregates && stats.partnerAggregates.length > 0) {
      stats.partnerAggregates.slice(0, 3).forEach((partner, index) => {
        console.log(`\n${index + 1}. ${partner.partnerDisplayName}:`);
        console.log(`   Sessions: ${partner.sessionsPlayedWith} gespielt, ${partner.sessionsWonWith} gewonnen`);
        console.log(`   Games: ${partner.gamesPlayedWith} gespielt, ${partner.gamesWonWith} gewonnen`);
        
        if (partner.sessionWinRateInfo) {
          console.log(`   📊 Partien: ${partner.sessionWinRateInfo.displayText}`);
        } else {
          const rate = partner.sessionsPlayedWith > 0 ? (partner.sessionsWonWith / partner.sessionsPlayedWith * 100).toFixed(1) : '0.0';
          console.log(`   📊 Partien (Fallback): ${partner.sessionsWonWith}/${partner.sessionsPlayedWith} = ${rate}%`);
        }
        
        if (partner.gameWinRateInfo) {
          console.log(`   🎮 Spiele: ${partner.gameWinRateInfo.displayText}`);
        } else {
          const rate = partner.gamesPlayedWith > 0 ? (partner.gamesWonWith / partner.gamesPlayedWith * 100).toFixed(1) : '0.0';
          console.log(`   🎮 Spiele (Fallback): ${partner.gamesWonWith}/${partner.gamesPlayedWith} = ${rate}%`);
        }
      });
    }
    
    console.log('\n✅ Test erfolgreich abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Fehler beim Testen:', error);
  }
}

testWinRateDisplayFormat().then(() => {
  console.log('\n🎉 Win-Rate Display Format Test beendet!');
  process.exit(0);
}).catch(err => {
  console.error('💥 Unerwarteter Fehler:', err);
  process.exit(1);
}); 