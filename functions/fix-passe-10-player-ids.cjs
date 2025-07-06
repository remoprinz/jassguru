const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function fixPasse10PlayerIds() {
  console.log('🔧 [FIX PASSE 10] Korrigiere Player-IDs in Passe 10...');
  
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
  const passe10Id = '8aQ1d5Q0cXSv1ci5WFAP';
  
  // Korrekte Zuordnung
  const correctMapping = {
    'Remo': 'AaTUBO0SbWVfStdHmD7zi3qAMww2',
    'Studi': 'fJ6UUEcdzXXwY4G8Oh49dQw3yXE2',
    'Schmuuuudii': 'i4ij3QCqKSbjPbx2hetwWlaQhlw2', 
    'Frank': 'WQSNHuoqtBen2D3E1bu4OLgx4aI3'
  };
  
  try {
    console.log('📊 Lade aktuelle Daten...');
    const passeRef = db.collection('tournaments')
      .doc(tournamentId)
      .collection('games')
      .doc(passe10Id);
    
    const passeDoc = await passeRef.get();
    if (!passeDoc.exists) {
      console.log('❌ Passe 10 nicht gefunden!');
      return;
    }
    
    const passeData = passeDoc.data();
    const currentPlayerDetails = passeData.playerDetails || [];
    
    console.log('\n🔍 AKTUELLE FEHLERHAFTE DATEN:');
    currentPlayerDetails.forEach((player, index) => {
      console.log(`[${index}] ${player.playerName}: ${player.playerId} (Team: ${player.team})`);
    });
    
    console.log('\n✅ KORRIGIERE PLAYER-IDS:');
    const correctedPlayerDetails = currentPlayerDetails.map((player, index) => {
      const correctPlayerId = correctMapping[player.playerName];
      if (correctPlayerId && correctPlayerId !== player.playerId) {
        console.log(`  → ${player.playerName}: ${player.playerId} → ${correctPlayerId}`);
        return {
          ...player,
          playerId: correctPlayerId
        };
      } else {
        console.log(`  ✓ ${player.playerName}: ${player.playerId} (bereits korrekt)`);
        return player;
      }
    });
    
    console.log('\n💾 Schreibe korrigierte Daten...');
    await passeRef.update({
      playerDetails: correctedPlayerDetails,
      // Füge ein Marker hinzu, dass diese Passe korrigiert wurde
      fixedPlayerIds: true,
      fixedAt: admin.firestore.FieldValue.serverTimestamp(),
      fixNote: 'Player-IDs korrigiert: Remo hatte fälschlicherweise Studi\'s ID'
    });
    
    console.log('\n🎉 ERFOLGREICH KORRIGIERT!');
    console.log('\n📊 KORRIGIERTE DATEN:');
    correctedPlayerDetails.forEach((player, index) => {
      console.log(`[${index}] ${player.playerName}: ${player.playerId} (Team: ${player.team})`);
    });
    
    console.log('\n🎯 AUSWIRKUNG:');
    console.log('- Remo bekommt jetzt korrekt 1 Strich in Passe 10');
    console.log('- Strich-Berechnungen werden jetzt korrekt funktionieren');
    console.log('- Die Rangliste wird sich entsprechend anpassen');
    
  } catch (error) {
    console.error('❌ Fehler beim Korrigieren:', error);
  }
  
  process.exit(0);
}

fixPasse10PlayerIds().catch(console.error); 