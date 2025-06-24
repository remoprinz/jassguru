const admin = require('firebase-admin');

// Service Account Key laden
const serviceAccount = require('./serviceAccountKey.json');

// Firebase Admin SDK initialisieren
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru-1d7c5-default-rtdb.firebaseio.com'
});

const db = admin.firestore();

async function debugFinalBilanz() {
  console.log('🎯 FINALE BILANZ-ÜBERPRÜFUNG nach Deployment & Neuberechnung');
  
  try {
    // Remo's Player ID
    const playerId = 'b16c1120111b7d9e7d733837';
    
    // Player Stats laden
    const playerStatsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    const playerStats = playerStatsDoc.data();
    
    if (!playerStats) {
      console.log('❌ Keine Player Stats gefunden');
      return;
    }
    
    console.log('\n🔍 SCHMUUUUDII PARTNER-BILANZ TEST:');
    const schmuudiiPartner = playerStats.partnerAggregates?.find(p => p.partnerDisplayName === 'Schmuuuudii');
    if (schmuudiiPartner) {
      console.log(`📊 Matsch Events: Made=${schmuudiiPartner.matschEventsMadeWith}, Received=${schmuudiiPartner.matschEventsReceivedWith}`);
      console.log(`💰 Matsch Bilanz: ${schmuudiiPartner.matschBilanz} (Erwartet: ${(schmuudiiPartner.matschEventsMadeWith || 0) - (schmuudiiPartner.matschEventsReceivedWith || 0)})`);
      
      if ((schmuudiiPartner.matschBilanz || 0) === ((schmuudiiPartner.matschEventsMadeWith || 0) - (schmuudiiPartner.matschEventsReceivedWith || 0))) {
        console.log('✅ BILANZ KORREKT! Schmuuuudii Matsch-Bilanz stimmt');
      } else {
        console.log('❌ BILANZ FALSCH! Problem besteht weiterhin');
      }
      
      console.log(`📊 Schneider Events: Made=${schmuudiiPartner.schneiderEventsMadeWith}, Received=${schmuudiiPartner.schneiderEventsReceivedWith}`);
      console.log(`💰 Schneider Bilanz: ${schmuudiiPartner.schneiderBilanz} (Erwartet: ${(schmuudiiPartner.schneiderEventsMadeWith || 0) - (schmuudiiPartner.schneiderEventsReceivedWith || 0)})`);
      
      if ((schmuudiiPartner.schneiderBilanz || 0) === ((schmuudiiPartner.schneiderEventsMadeWith || 0) - (schmuudiiPartner.schneiderEventsReceivedWith || 0))) {
        console.log('✅ SCHNEIDER BILANZ KORREKT!');
      } else {
        console.log('❌ SCHNEIDER BILANZ FALSCH!');
      }
    } else {
      console.log('❌ Schmuuuudii als Partner nicht gefunden');
    }
    
    console.log('\n🔍 FRANK OPPONENT-BILANZ TEST:');
    const frankOpponent = playerStats.opponentAggregates?.find(o => o.opponentDisplayName === 'Frank');
    if (frankOpponent) {
      console.log(`📊 Matsch Events: Made=${frankOpponent.matschEventsMadeAgainst}, Received=${frankOpponent.matschEventsReceivedAgainst}`);
      console.log(`💰 Matsch Bilanz: ${frankOpponent.matschBilanz} (Erwartet: ${(frankOpponent.matschEventsMadeAgainst || 0) - (frankOpponent.matschEventsReceivedAgainst || 0)})`);
      
      if ((frankOpponent.matschBilanz || 0) === ((frankOpponent.matschEventsMadeAgainst || 0) - (frankOpponent.matschEventsReceivedAgainst || 0))) {
        console.log('✅ FRANK OPPONENT BILANZ KORREKT!');
      } else {
        console.log('❌ FRANK OPPONENT BILANZ FALSCH!');
      }
    } else {
      console.log('❌ Frank als Opponent nicht gefunden');
    }
    
    // Zusammenfassung
    console.log('\n📈 ZUSAMMENFASSUNG:');
    let korrektCount = 0;
    let totalCount = 0;
    
    playerStats.partnerAggregates?.forEach(partner => {
      totalCount += 3; // 3 Bilanz-Typen
      if ((partner.matschBilanz || 0) === ((partner.matschEventsMadeWith || 0) - (partner.matschEventsReceivedWith || 0))) korrektCount++;
      if ((partner.schneiderBilanz || 0) === ((partner.schneiderEventsMadeWith || 0) - (partner.schneiderEventsReceivedWith || 0))) korrektCount++;
      if ((partner.kontermatschBilanz || 0) === ((partner.kontermatschEventsMadeWith || 0) - (partner.kontermatschEventsReceivedWith || 0))) korrektCount++;
    });
    
    playerStats.opponentAggregates?.forEach(opponent => {
      totalCount += 3; // 3 Bilanz-Typen
      if ((opponent.matschBilanz || 0) === ((opponent.matschEventsMadeAgainst || 0) - (opponent.matschEventsReceivedAgainst || 0))) korrektCount++;
      if ((opponent.schneiderBilanz || 0) === ((opponent.schneiderEventsMadeAgainst || 0) - (opponent.schneiderEventsReceivedAgainst || 0))) korrektCount++;
      if ((opponent.kontermatschBilanz || 0) === ((opponent.kontermatschEventsMadeAgainst || 0) - (opponent.kontermatschEventsReceivedAgainst || 0))) korrektCount++;
    });
    
    console.log(`✅ Korrekte Bilanzen: ${korrektCount}/${totalCount}`);
    
    if (korrektCount === totalCount) {
      console.log('🎉 ALLE BILANZEN KORREKT! Problem gelöst!');
    } else {
      console.log('⚠️ Einige Bilanzen sind noch falsch');
    }
    
  } catch (error) {
    console.error('💥 Fehler beim Debug:', error);
  } finally {
    await admin.app().delete();
    process.exit(0);
  }
}

// Script ausführen
debugFinalBilanz(); 