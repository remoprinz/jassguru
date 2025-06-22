const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

async function triggerRecalculationForRemo() {
  const playerId = 'b16c1120111b7d9e7d733837'; // Remo
  
  try {
    console.log('🔧 Lösche alte playerComputedStats für Remo...');
    await db.collection('playerComputedStats').doc(playerId).delete();
    
    console.log('⚡ Triggere Neukalkulation durch jassGameSummary Update...');
    // Triggere über ein beliebiges jassGameSummary Update
    const sessionRef = db.collection('jassGameSummaries').doc('83fBU_l0Rcok3a_DRt0-Z');
    await sessionRef.update({
      triggerRecalculation: admin.firestore.Timestamp.now()
    });
    
    console.log('⏳ Warte 10 Sekunden auf Cloud Function Processing...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('📊 Überprüfe neue Statistiken...');
    const newStatsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    
    if (!newStatsDoc.exists) {
      console.log('❌ Keine neuen Statistiken gefunden!');
      return;
    }
    
    const newStats = newStatsDoc.data();
    
    console.log('\n🎯 === NEUE PARTNER/GEGNER STATISTIKEN ===');
    
    // Finde Schmuuuudii in Partner-Statistiken
    const schmuuuudiiPartner = newStats.partnerAggregates?.find(p => 
      p.partnerDisplayName?.includes('Schmuuuudii') || 
      p.partnerDisplayName?.includes('Schmuddi')
    );
    
    if (schmuuuudiiPartner) {
      console.log(`\n👥 SCHMUUUUDII ALS PARTNER:`);
      console.log(`   Sessions: ${schmuuuudiiPartner.sessionsPlayedWith} (Siege: ${schmuuuudiiPartner.sessionsWonWith})`);
      console.log(`   Spiele: ${schmuuuudiiPartner.gamesPlayedWith} (Siege: ${schmuuuudiiPartner.gamesWonWith})`);
      console.log(`   Session Win-Rate: ${schmuuuudiiPartner.sessionWinRateInfo?.displayText || 'N/A'}`);
      console.log(`   Game Win-Rate: ${schmuuuudiiPartner.gameWinRateInfo?.displayText || 'N/A'}`);
    } else {
      console.log('❌ Schmuuuudii nicht in Partner-Statistiken gefunden!');
    }
    
    // Finde Marc in Partner-Statistiken
    const marcPartner = newStats.partnerAggregates?.find(p => 
      p.partnerDisplayName === 'Marc'
    );
    
    if (marcPartner) {
      console.log(`\n👥 MARC ALS PARTNER:`);
      console.log(`   Sessions: ${marcPartner.sessionsPlayedWith} (Siege: ${marcPartner.sessionsWonWith})`);
      console.log(`   Spiele: ${marcPartner.gamesPlayedWith} (Siege: ${marcPartner.gamesWonWith})`);
      console.log(`   Session Win-Rate: ${marcPartner.sessionWinRateInfo?.displayText || 'N/A'}`);
      console.log(`   Game Win-Rate: ${marcPartner.gameWinRateInfo?.displayText || 'N/A'}`);
    } else {
      console.log('❌ Marc nicht in Partner-Statistiken gefunden!');
    }
    
    console.log(`\n📈 GESAMT-STATISTIKEN:`);
    console.log(`   Sessions: ${newStats.totalSessions || 0} (${newStats.sessionWins || 0} Siege, ${newStats.sessionLosses || 0} Niederlagen, ${newStats.sessionTies || 0} Unentschieden)`);
    console.log(`   Spiele: ${newStats.totalGames || 0} (${newStats.gameWins || 0} Siege, ${newStats.gameLosses || 0} Niederlagen)`);
    console.log(`   Session Win-Rate: ${newStats.sessionWinRateInfo?.displayText || 'N/A'}`);
    console.log(`   Game Win-Rate: ${newStats.gameWinRateInfo?.displayText || 'N/A'}`);
    console.log(`   Turniere: ${newStats.totalTournamentsParticipated || 0} (${newStats.totalTournamentGamesPlayed || 0} Spiele)`);
    
    console.log('\n✅ === KORREKTUR-TEST ABGESCHLOSSEN ===');
    
  } catch (error) {
    console.error('❌ Fehler beim Triggern der Neukalkulation:', error);
  }
}

// Führe das Script aus
triggerRecalculationForRemo()
  .then(() => {
    console.log('\n🎉 Script erfolgreich abgeschlossen!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script-Fehler:', error);
    process.exit(1);
  }); 