const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function fixAllPassenPlayerIds() {
  console.log('🔧 [FIX ALLE PASSEN] Korrigiere Player-IDs in allen 15 Passen...');
  
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
  
  // KORREKTE Zuordnung Name → PlayerID
  const correctMapping = {
    'Remo': 'AaTUBO0SbWVfStdHmD7zi3qAMww2',
    'Studi': 'fJ6UUEcdzXXwY4G8Oh49dQw3yXE2',
    'Schmuddi': 'i4ij3QCqKSbjPbx2hetwWlaQhlw2',
    'Schmuuuudii': 'i4ij3QCqKSbjPbx2hetwWlaQhlw2', // Alternative Schreibweise
    'Frank': 'WQSNHuoqtBen2D3E1bu4OLgx4aI3'
  };
  
  try {
    // Lade alle Passen
    console.log('📊 Lade alle Turnier-Passen...');
    const gamesSnap = await db.collection('tournaments')
      .doc(tournamentId)
      .collection('games')
      .orderBy('passeNumber', 'asc')
      .get();
    
    console.log(`✅ ${gamesSnap.docs.length} Passen gefunden\n`);
    
    let totalCorrections = 0;
    let passenWithErrors = 0;
    
    for (const passeDoc of gamesSnap.docs) {
      const passeData = passeDoc.data();
      const passeNumber = passeData.passeNumber || 'Unknown';
      const passeId = passeDoc.id;
      
      console.log(`\n--- PASSE ${passeNumber} (${passeId}) ---`);
      
      const currentPlayerDetails = passeData.playerDetails || [];
      let hasErrors = false;
      let corrections = 0;
      
      console.log('🔍 Aktuelle Player-IDs:');
      currentPlayerDetails.forEach((player, index) => {
        const expectedId = correctMapping[player.playerName];
        const isCorrect = expectedId === player.playerId;
        const status = isCorrect ? '✅' : '❌';
        
        console.log(`  [${index}] ${player.playerName}: ${player.playerId} ${status}`);
        if (!isCorrect) {
          console.log(`      → Sollte sein: ${expectedId}`);
          hasErrors = true;
        }
      });
      
      if (hasErrors) {
        passenWithErrors++;
        console.log('🔧 Korrigiere fehlerhafte Player-IDs...');
        
        const correctedPlayerDetails = currentPlayerDetails.map((player) => {
          const correctPlayerId = correctMapping[player.playerName];
          if (correctPlayerId && correctPlayerId !== player.playerId) {
            console.log(`  ✏️  ${player.playerName}: ${player.playerId} → ${correctPlayerId}`);
            corrections++;
            totalCorrections++;
            return {
              ...player,
              playerId: correctPlayerId
            };
          }
          return player;
        });
        
        // Schreibe korrigierte Daten
        await db.collection('tournaments')
          .doc(tournamentId)
          .collection('games')
          .doc(passeId)
          .update({
            playerDetails: correctedPlayerDetails,
            fixedPlayerIds: true,
            fixedAt: admin.firestore.FieldValue.serverTimestamp(),
            fixNote: `Player-IDs korrigiert: ${corrections} Korrekturen in Passe ${passeNumber}`
          });
        
        console.log(`  ✅ ${corrections} Korrekturen gespeichert`);
      } else {
        console.log('  ✅ Alle Player-IDs bereits korrekt');
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 KORREKTUR ABGESCHLOSSEN!');
    console.log(`📊 Zusammenfassung:`);
    console.log(`  - Passen überprüft: ${gamesSnap.docs.length}`);
    console.log(`  - Passen mit Fehlern: ${passenWithErrors}`);
    console.log(`  - Gesamte Korrekturen: ${totalCorrections}`);
    
    if (totalCorrections > 0) {
      console.log('\n🎯 AUSWIRKUNG:');
      console.log('  - Alle Striche-Berechnungen werden jetzt korrekt sein');
      console.log('  - Die Rangliste wird die korrekten Werte anzeigen');
      console.log('  - Das schriftliche Ergebnis sollte mit Firebase übereinstimmen');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Korrigieren:', error);
  }
  
  process.exit(0);
}

fixAllPassenPlayerIds().catch(console.error); 