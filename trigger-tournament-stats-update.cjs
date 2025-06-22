const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./functions/serviceAccountKey.json'),
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

async function triggerTournamentStatsUpdate() {
  const playerId = 'b16c1120111b7d9e7d733837'; // Remo
  
  try {
    console.log('🎯 === TURNIER-STATISTIKEN UPDATE ===');
    console.log(`Lösche alte playerComputedStats für Remo...`);
    await db.collection('playerComputedStats').doc(playerId).delete();
    
    console.log('⚡ Triggere Neukalkulation mit erweiterten Turnier-Statistiken...');
    // Triggere über ein beliebiges jassGameSummary Update
    const sessionRef = db.collection('jassGameSummaries').doc('83fBU_l0Rcok3a_DRt0-Z');
    await sessionRef.update({
      triggerTournamentStatsUpdate: admin.firestore.Timestamp.now()
    });
    
    console.log('⏳ Warte 8 Sekunden auf Verarbeitung...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Prüfe die neuen Statistiken
    const statsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    
    if (!statsDoc.exists) {
      console.log('❌ Keine Statistiken gefunden!');
      return;
    }
    
    const data = statsDoc.data();
    console.log('\\n🎉 === NEUE TURNIER-STATISTIKEN ===');
    
    // Partner-Statistiken prüfen
    if (data.partnerAggregates && data.partnerAggregates.length > 0) {
      console.log('\\n👥 === PARTNER MIT TURNIER-DATEN ===');
      
      // Finde Schmuddi (sollte jetzt Turnier-Punkte haben)
      const schmuddi = data.partnerAggregates.find(p => 
        p.partnerDisplayName === 'Schmuddi' || p.partnerDisplayName === 'Schmuuuudii'
      );
      
      if (schmuddi) {
        console.log(`📊 Schmuddi:`)
        console.log(`   Sessions: ${schmuddi.sessionsPlayedWith} (Siege: ${schmuddi.sessionsWonWith})`)
        console.log(`   Spiele: ${schmuddi.gamesPlayedWith} (Siege: ${schmuddi.gamesWonWith})`)
        console.log(`   🆕 Punkte Total: ${schmuddi.totalPointsWith}`)
        console.log(`   🆕 Punktdifferenz: ${schmuddi.totalPointsDifferenceWith > 0 ? '+' : ''}${schmuddi.totalPointsDifferenceWith}`)
        console.log(`   🆕 Strichdifferenz: ${schmuddi.totalStricheDifferenceWith > 0 ? '+' : ''}${schmuddi.totalStricheDifferenceWith}`)
        console.log(`   Session Win-Rate: ${schmuddi.sessionWinRateInfo?.displayText || 'N/A'}`)
        console.log(`   Game Win-Rate: ${schmuddi.gameWinRateInfo?.displayText || 'N/A'}`)
      } else {
        console.log('⚠️ Schmuddi nicht in Partner-Aggregaten gefunden');
      }
      
      // Zeige alle Partner mit ihren neuen Statistiken
      console.log('\\n📈 === ALLE PARTNER (TOP 5) ===');
      data.partnerAggregates
        .sort((a, b) => b.totalPointsDifferenceWith - a.totalPointsDifferenceWith)
        .slice(0, 5)
        .forEach((partner, index) => {
          console.log(`${index + 1}. ${partner.partnerDisplayName}:`);
          console.log(`   Punktdiff: ${partner.totalPointsDifferenceWith > 0 ? '+' : ''}${partner.totalPointsDifferenceWith}`);
          console.log(`   Strichdiff: ${partner.totalStricheDifferenceWith > 0 ? '+' : ''}${partner.totalStricheDifferenceWith}`);
          console.log(`   Sessions: ${partner.sessionsPlayedWith}, Spiele: ${partner.gamesPlayedWith}`);
        });
    }
    
    console.log('\\n✅ === TURNIER-STATISTIKEN ERFOLGREICH ERWEITERT ===');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

triggerTournamentStatsUpdate(); 