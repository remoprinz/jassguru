const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function debugPasse10() {
  console.log('🔍 [DEBUG PASSE 10] Analysiere nur Passe 10 im Detail...');
  
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
  const passe10Id = '8aQ1d5Q0cXSv1ci5WFAP';
  
  try {
    // Lade Passe 10 direkt
    const passeDoc = await db.collection('tournaments')
      .doc(tournamentId)
      .collection('games')
      .doc(passe10Id)
      .get();
    
    if (!passeDoc.exists) {
      console.log('❌ Passe 10 nicht gefunden!');
      return;
    }
    
    const passeData = passeDoc.data();
    
    console.log('\n📊 ROHE FIREBASE-DATEN für Passe 10:');
    console.log('=' * 60);
    console.log(JSON.stringify(passeData, null, 2));
    
    console.log('\n👥 PLAYER DETAILS:');
    if (passeData.playerDetails && Array.isArray(passeData.playerDetails)) {
      passeData.playerDetails.forEach((player, index) => {
        console.log(`Spieler ${index + 1}:`);
        console.log(`  Name: ${player.playerName}`);
        console.log(`  ID: ${player.playerId}`);
        console.log(`  Team: ${player.team}`);
        console.log(`  Seat: ${player.seat}`);
        console.log('');
      });
    }
    
    console.log('\n🏆 TEAM ZUSAMMENSETZUNG:');
    const topTeam = passeData.playerDetails?.filter(p => p.team === 'top') || [];
    const bottomTeam = passeData.playerDetails?.filter(p => p.team === 'bottom') || [];
    
    console.log(`Top Team: ${topTeam.map(p => p.playerName).join(' & ')}`);
    console.log(`Bottom Team: ${bottomTeam.map(p => p.playerName).join(' & ')}`);
    
    console.log('\n🎯 TEAM STRICHE:');
    if (passeData.teamStrichePasse) {
      console.log('Top Team Striche:', passeData.teamStrichePasse.top);
      console.log('Bottom Team Striche:', passeData.teamStrichePasse.bottom);
    }
    
    console.log('\n📝 ZUSÄTZLICHE FELDER:');
    console.log(`Passe Nummer: ${passeData.passeNumber}`);
    console.log(`Passe ID: ${passeDoc.id}`);
    console.log(`Turnier ID: ${passeData.tournamentInstanceId}`);
    
    if (passeData.participantUidsForPasse) {
      console.log('Participant UIDs:', passeData.participantUidsForPasse);
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Laden von Passe 10:', error);
  }
  
  process.exit(0);
}

debugPasse10().catch(console.error); 