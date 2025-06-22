const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

async function debugFrontendData() {
  const playerId = 'b16c1120111b7d9e7d733837'; // Remo
  
  try {
    console.log('🔍 === FRONTEND FIRESTORE DEBUG ===');
    console.log(`Lade playerComputedStats für: ${playerId}`);
    
    // Lade die Daten, die das Frontend sehen würde
    const statsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    
    if (!statsDoc.exists) {
      console.log('❌ Dokument existiert nicht!');
      return;
    }
    
    const data = statsDoc.data();
    console.log('\n📊 === ROHDATEN AUS FIRESTORE ===');
    console.log(`Dokument-ID: ${statsDoc.id}`);
    console.log(`Letzte Aktualisierung: ${data.lastUpdateTimestamp?.toDate?.()}`);
    
    // Überprüfe die Partner-Aggregate
    if (data.partnerAggregates && Array.isArray(data.partnerAggregates)) {
      console.log(`\n👥 === PARTNER AGGREGATES (${data.partnerAggregates.length} Partner) ===`);
      
      // Finde Schmuddi
      const schmuddi = data.partnerAggregates.find(p => 
        p.partnerDisplayName === 'Schmuddi' || p.partnerDisplayName === 'Schmuuuudii'
      );
      
      if (schmuddi) {
        console.log('\n🎯 SCHMUDDI (gefunden):');
        console.log(`   Partner-ID: ${schmuddi.partnerId}`);
        console.log(`   Sessions gespielt: ${schmuddi.sessionsPlayedWith}`);
        console.log(`   Sessions gewonnen: ${schmuddi.sessionsWonWith}`);
        console.log(`   Spiele gespielt: ${schmuddi.gamesPlayedWith}`);
        console.log(`   Spiele gewonnen: ${schmuddi.gamesWonWith}`);
        console.log(`   sessionWinRateInfo:`, schmuddi.sessionWinRateInfo);
        console.log(`   gameWinRateInfo:`, schmuddi.gameWinRateInfo);
      } else {
        console.log('\n❌ SCHMUDDI NICHT GEFUNDEN!');
        console.log('Verfügbare Partner:');
        data.partnerAggregates.forEach((p, i) => {
          console.log(`   ${i + 1}. ${p.partnerDisplayName} (ID: ${p.partnerId})`);
        });
      }
      
      // Finde Marc
      const marc = data.partnerAggregates.find(p => 
        p.partnerDisplayName === 'Marc'
      );
      
      if (marc) {
        console.log('\n🎯 MARC (gefunden):');
        console.log(`   Partner-ID: ${marc.partnerId}`);
        console.log(`   Sessions gespielt: ${marc.sessionsPlayedWith}`);
        console.log(`   Sessions gewonnen: ${marc.sessionsWonWith}`);
        console.log(`   Spiele gespielt: ${marc.gamesPlayedWith}`);
        console.log(`   Spiele gewonnen: ${marc.gamesWonWith}`);
        console.log(`   sessionWinRateInfo:`, marc.sessionWinRateInfo);
        console.log(`   gameWinRateInfo:`, marc.gameWinRateInfo);
      } else {
        console.log('\n❌ MARC NICHT GEFUNDEN!');
      }
      
      // Zeige die Top 3 Partner
      console.log('\n🏆 === TOP 3 PARTNER (nach Spielen sortiert) ===');
      const topPartners = data.partnerAggregates
        .sort((a, b) => (b.gamesPlayedWith || 0) - (a.gamesPlayedWith || 0))
        .slice(0, 3);
        
      topPartners.forEach((partner, index) => {
        console.log(`\n${index + 1}. ${partner.partnerDisplayName}:`);
        console.log(`   Sessions: ${partner.sessionsPlayedWith} gespielt, ${partner.sessionsWonWith} gewonnen`);
        console.log(`   Spiele: ${partner.gamesPlayedWith} gespielt, ${partner.gamesWonWith} gewonnen`);
        
        if (partner.sessionWinRateInfo) {
          console.log(`   📊 Session Win-Rate: ${partner.sessionWinRateInfo.displayText}`);
        } else {
          const sessionRate = partner.sessionsPlayedWith > 0 
            ? (partner.sessionsWonWith / partner.sessionsPlayedWith * 100).toFixed(1)
            : '0.0';
          console.log(`   📊 Session Win-Rate (berechnet): ${partner.sessionsWonWith}/${partner.sessionsPlayedWith} = ${sessionRate}%`);
        }
        
        if (partner.gameWinRateInfo) {
          console.log(`   🎮 Game Win-Rate: ${partner.gameWinRateInfo.displayText}`);
        } else {
          const gameRate = partner.gamesPlayedWith > 0 
            ? (partner.gamesWonWith / partner.gamesPlayedWith * 100).toFixed(1)
            : '0.0';
          console.log(`   🎮 Game Win-Rate (berechnet): ${partner.gamesWonWith}/${partner.gamesPlayedWith} = ${gameRate}%`);
        }
      });
      
    } else {
      console.log('\n❌ Keine partnerAggregates gefunden!');
    }
    
    // Überprüfe die Gesamt-Statistiken
    console.log('\n📈 === GESAMT-STATISTIKEN ===');
    console.log(`Sessions: ${data.totalSessions || 0} (${data.sessionWins || 0} Siege, ${data.sessionLosses || 0} Niederlagen, ${data.sessionTies || 0} Unentschieden)`);
    console.log(`Spiele: ${data.totalGames || 0} (${data.gameWins || 0} Siege, ${data.gameLosses || 0} Niederlagen)`);
    
    if (data.sessionWinRateInfo) {
      console.log(`Session Win-Rate: ${data.sessionWinRateInfo.displayText}`);
    }
    if (data.gameWinRateInfo) {
      console.log(`Game Win-Rate: ${data.gameWinRateInfo.displayText}`);
    }
    
    console.log('\n✅ Frontend Debug abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Fehler beim Laden der Frontend-Daten:', error);
  }
}

debugFrontendData(); 