const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function debugJuly3Games() {
  console.log('🔍 [JULY 3 DEBUG] Suche nach Spielen vom 3. Juli 2025 (19:00-23:45)...');
  
  try {
    // Zeitraum definieren (3. Juli 2025, 19:00 bis 23:45 UTC+2)
    const startTime = new Date('2025-07-03T17:00:00.000Z'); // 19:00 UTC+2 = 17:00 UTC
    const endTime = new Date('2025-07-03T21:45:00.000Z');   // 23:45 UTC+2 = 21:45 UTC
    
    console.log(`📅 Suchzeitraum: ${startTime.toISOString()} bis ${endTime.toISOString()}`);
    
    // 1. Suche in activeGames
    console.log('\n🎮 SUCHE IN ACTIVEGAMES...');
    const activeGamesRef = db.collection('activeGames');
    const activeGamesQuery = activeGamesRef
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
      .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endTime));
    
    const activeGamesSnapshot = await activeGamesQuery.get();
    console.log(`📊 ${activeGamesSnapshot.docs.length} aktive Spiele gefunden`);
    
    if (activeGamesSnapshot.docs.length > 0) {
      activeGamesSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate();
        console.log(`\n--- AKTIVES SPIEL ${index + 1} ---`);
        console.log(`ID: ${doc.id}`);
        console.log(`Status: ${data.status}`);
        console.log(`Erstellt: ${createdAt?.toLocaleString('de-CH')}`);
        console.log(`Session ID: ${data.sessionId}`);
        console.log(`Teilnehmer: ${data.participantUids?.length || 0}`);
        console.log(`Spieler-Namen: ${JSON.stringify(data.playerNames || {})}`);
        
        if (data.currentRound) {
          console.log(`Aktuelle Runde: ${data.currentRound}`);
        }
        if (data.finalScores) {
          console.log(`Final Scores: Top=${data.finalScores.top}, Bottom=${data.finalScores.bottom}`);
        }
      });
    }
    
    // 2. Suche in sessions
    console.log('\n📋 SUCHE IN SESSIONS...');
    const sessionsRef = db.collection('sessions');
    const sessionsQuery = sessionsRef
      .where('startedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
      .where('startedAt', '<=', admin.firestore.Timestamp.fromDate(endTime));
    
    const sessionsSnapshot = await sessionsQuery.get();
    console.log(`📊 ${sessionsSnapshot.docs.length} Sessions gefunden`);
    
    if (sessionsSnapshot.docs.length > 0) {
      sessionsSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        const startedAt = data.startedAt?.toDate();
        const lastActivity = data.lastActivity?.toDate();
        console.log(`\n--- SESSION ${index + 1} ---`);
        console.log(`ID: ${doc.id}`);
        console.log(`Status: ${data.status || 'undefined'}`);
        console.log(`Gestartet: ${startedAt?.toLocaleString('de-CH')}`);
        console.log(`Letzte Aktivität: ${lastActivity?.toLocaleString('de-CH')}`);
        console.log(`Spiele gespielt: ${data.gamesPlayed || 0}`);
        console.log(`Aktuelle Game ID: ${data.currentActiveGameId || 'none'}`);
        console.log(`Teilnehmer: ${data.participantUids?.length || 0}`);
        console.log(`Spieler-Namen: ${JSON.stringify(data.playerNames || {})}`);
      });
    }
    
    // 3. Suche in jassGameSummaries
    console.log('\n📚 SUCHE IN JASSGAMESUMMARIES...');
    const summariesRef = db.collection('jassGameSummaries');
    const summariesQuery = summariesRef
      .where('startedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
      .where('startedAt', '<=', admin.firestore.Timestamp.fromDate(endTime));
    
    const summariesSnapshot = await summariesQuery.get();
    console.log(`📊 ${summariesSnapshot.docs.length} JassGameSummaries gefunden`);
    
    if (summariesSnapshot.docs.length > 0) {
      for (const doc of summariesSnapshot.docs) {
        const data = doc.data();
        const startedAt = data.startedAt?.toDate();
        const endedAt = data.endedAt?.toDate();
        console.log(`\n--- JASS SUMMARY ${doc.id} ---`);
        console.log(`Status: ${data.status}`);
        console.log(`Gestartet: ${startedAt?.toLocaleString('de-CH')}`);
        console.log(`Beendet: ${endedAt?.toLocaleString('de-CH')}`);
        console.log(`Spiele gespielt: ${data.gamesPlayed || 0}`);
        console.log(`Spieler-Namen: ${JSON.stringify(data.playerNames || {})}`);
        
        // Prüfe completedGames Subcollection
        const completedGamesRef = doc.ref.collection('completedGames');
        const completedGamesSnapshot = await completedGamesRef.get();
        console.log(`  📋 ${completedGamesSnapshot.docs.length} completedGames in Subcollection`);
        
        if (completedGamesSnapshot.docs.length > 0) {
          completedGamesSnapshot.docs.forEach(gameDoc => {
            const gameData = gameDoc.data();
            console.log(`    Spiel ${gameData.gameNumber}: ${gameData.finalScores?.top || 0} - ${gameData.finalScores?.bottom || 0}`);
          });
        }
      }
    }
    
    // 4. Suche nach timestamp-basierten activeGames (falls createdAt fehlt)
    console.log('\n🔍 ALTERNATIVE SUCHE IN ACTIVEGAMES (ohne Zeitfilter)...');
    const allActiveGamesSnapshot = await activeGamesRef.limit(50).get();
    
    let july3ActiveGames = [];
    allActiveGamesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      
      // Prüfe verschiedene Zeitfelder
      const timestamps = [
        data.createdAt?.toDate(),
        data.startedAt?.toDate(),
        data.lastActivity?.toDate(),
        data.timestampCreated?.toDate()
      ].filter(Boolean);
      
      const hasJuly3Timestamp = timestamps.some(timestamp => {
        return timestamp >= startTime && timestamp <= endTime;
      });
      
      if (hasJuly3Timestamp) {
        july3ActiveGames.push({ id: doc.id, data });
      }
    });
    
    if (july3ActiveGames.length > 0) {
      console.log(`📊 ${july3ActiveGames.length} zusätzliche Juli-3-Spiele gefunden:`);
      july3ActiveGames.forEach((game, index) => {
        console.log(`\n--- ZUSÄTZLICHES SPIEL ${index + 1} ---`);
        console.log(`ID: ${game.id}`);
        console.log(`Status: ${game.data.status}`);
        console.log(`Session ID: ${game.data.sessionId}`);
        console.log(`Spieler: ${JSON.stringify(game.data.playerNames || {})}`);
      });
    }
    
    // 5. Zusammenfassung
    console.log('\n📋 ZUSAMMENFASSUNG:');
    console.log(`✅ Aktive Spiele: ${activeGamesSnapshot.docs.length + july3ActiveGames.length}`);
    console.log(`✅ Sessions: ${sessionsSnapshot.docs.length}`);
    console.log(`✅ JassGameSummaries: ${summariesSnapshot.docs.length}`);
    
    if (activeGamesSnapshot.docs.length > 0 || july3ActiveGames.length > 0) {
      console.log('\n⚠️  PROBLEM IDENTIFIZIERT:');
      console.log('Es gibt noch aktive Spiele, die nicht finalisiert wurden!');
      console.log('Mögliche Ursachen:');
      console.log('- finalizeSession wurde nicht aufgerufen');
      console.log('- finalizeSession ist fehlgeschlagen');
      console.log('- Spiele sind in einem unvollständigen Zustand');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Suchen der Juli-3-Spiele:', error);
  }
  
  process.exit(0);
}

debugJuly3Games().catch(console.error); 