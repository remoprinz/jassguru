const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

// Schriftliche Werte aus der Tabelle (kumuliert nach jeder Passe)
const schriftlicheWerte = {
  'Schmuddi': [3, 6, 10, 18, 21, 21, 21, 21, 22, 23, 29, 31, 35, 37, 42],
  'Frank': [2, 5, 5, 5, 8, 11, 14, 14, 17, 21, 22, 24, 30, 34, 34],
  'Studi': [2, 2, 6, 6, 8, 8, 11, 16, 17, 21, 22, 24, 25, 26, 31],
  'Remo': [3, 3, 3, 11, 13, 16, 16, 21, 24, 25, 26, 28, 30, 31, 31]
};

function calculatePasseStriche(kumulativeWerte) {
  const passeStriche = [];
  for (let i = 0; i < kumulativeWerte.length; i++) {
    if (i === 0) {
      passeStriche.push(kumulativeWerte[i]);
    } else {
      passeStriche.push(kumulativeWerte[i] - kumulativeWerte[i - 1]);
    }
  }
  return passeStriche;
}

function analyzeFromTournamentPasses(passeDocs) {
  console.log('🎮 [SCHRIFTLICH vs. FIREBASE] Vergleiche schriftliche Werte mit Firebase-Daten...');
  
  // Korrekte Namen-Zuordnung
  const playerNames = {
    'AaTUBO0SbWVfStdHmD7zi3qAMww2': 'Remo',
    'fJ6UUEcdzXXwY4G8Oh49dQw3yXE2': 'Studi',
    'i4ij3QCqKSbjPbx2hetwWlaQhlw2': 'Schmuddi',
    'WQSNHuoqtBen2D3E1bu4OLgx4aI3': 'Frank'
  };
  
  // Berechne Striche pro Passe aus schriftlichen Werten
  const schriftlichePasseStriche = {};
  Object.keys(schriftlicheWerte).forEach(spieler => {
    schriftlichePasseStriche[spieler] = calculatePasseStriche(schriftlicheWerte[spieler]);
  });
  
  console.log('\\n📝 SCHRIFTLICHE WERTE (pro Passe):');
  console.log('=' * 60);
  for (let i = 0; i < 15; i++) {
    console.log(`Passe ${i + 1}: Schmuddi=${schriftlichePasseStriche.Schmuddi[i]}, Frank=${schriftlichePasseStriche.Frank[i]}, Studi=${schriftlichePasseStriche.Studi[i]}, Remo=${schriftlichePasseStriche.Remo[i]}`);
  }
  
  // Initialisiere Firebase-Tracking
  const firebaseStats = {};
  Object.keys(playerNames).forEach(uid => {
    firebaseStats[uid] = {
      name: playerNames[uid],
      passeStriche: [],
      totalStriche: 0
    };
  });
  
  // Sortiere Passen nach Nummer
  const sortedPasses = passeDocs.sort((a, b) => {
    const aNum = a.data().passeNumber || 0;
    const bNum = b.data().passeNumber || 0;
    return aNum - bNum;
  });
  
  console.log('\\n🔥 FIREBASE-DATEN (pro Passe):');
  console.log('=' * 60);
  
  sortedPasses.forEach((passeDoc, index) => {
    const passeData = passeDoc.data();
    const passeNumber = passeData.passeNumber || (index + 1);
    
    // Zeige die Teams in dieser Passe
    const playerDetails = passeData.playerDetails || [];
    const topTeam = playerDetails.filter(p => p.team === 'top');
    const bottomTeam = playerDetails.filter(p => p.team === 'bottom');
    
    // Hole die Team-Striche
    const teamStriche = passeData.teamStrichePasse || { top: {}, bottom: {} };
    const topStriche = teamStriche.top || {};
    const bottomStriche = teamStriche.bottom || {};
    
    // Berechne Gesamtstriche pro Team
    const topStricheTotal = (topStriche.sieg || 0) + (topStriche.berg || 0) + 
                           (topStriche.matsch || 0) + (topStriche.schneider || 0) + 
                           (topStriche.kontermatsch || 0);
    const bottomStricheTotal = (bottomStriche.sieg || 0) + (bottomStriche.berg || 0) + 
                              (bottomStriche.matsch || 0) + (bottomStriche.schneider || 0) + 
                              (bottomStriche.kontermatsch || 0);
    
    // Sammle Firebase-Striche für jeden Spieler
    const firebasePasseStriche = { 'Schmuddi': 0, 'Frank': 0, 'Studi': 0, 'Remo': 0 };
    
    playerDetails.forEach(player => {
      const playerId = player.playerId;
      const playerName = playerNames[playerId] || player.playerName;
      const team = player.team;
      const teamStricheForPlayer = team === 'top' ? topStricheTotal : bottomStricheTotal;
      
      if (firebaseStats[playerId]) {
        firebaseStats[playerId].passeStriche.push(teamStricheForPlayer);
        firebaseStats[playerId].totalStriche += teamStricheForPlayer;
        firebasePasseStriche[playerName] = teamStricheForPlayer;
      }
    });
    
    // Vergleiche mit schriftlichen Werten
    const schriftlichWerte = {
      'Schmuddi': schriftlichePasseStriche.Schmuddi[passeNumber - 1],
      'Frank': schriftlichePasseStriche.Frank[passeNumber - 1],
      'Studi': schriftlichePasseStriche.Studi[passeNumber - 1],
      'Remo': schriftlichePasseStriche.Remo[passeNumber - 1]
    };
    
    console.log(`\\nPasse ${passeNumber}:`);
    console.log(`  Teams: ${topTeam.map(p => playerNames[p.playerId]).join(' & ')} vs ${bottomTeam.map(p => playerNames[p.playerId]).join(' & ')}`);
    console.log(`  Schriftlich: Schmuddi=${schriftlichWerte.Schmuddi}, Frank=${schriftlichWerte.Frank}, Studi=${schriftlichWerte.Studi}, Remo=${schriftlichWerte.Remo}`);
    console.log(`  Firebase:    Schmuddi=${firebasePasseStriche.Schmuddi}, Frank=${firebasePasseStriche.Frank}, Studi=${firebasePasseStriche.Studi}, Remo=${firebasePasseStriche.Remo}`);
    
         // Prüfe auf Abweichungen
     const abweichungen = [];
     Object.keys(schriftlichWerte).forEach(spieler => {
       const schriftlich = schriftlichWerte[spieler];
       const firebase = firebasePasseStriche[spieler];
       if (schriftlich !== firebase) {
         abweichungen.push(`${spieler}: ${firebase} → ${schriftlich} (Diff: ${schriftlich - firebase})`);
       }
     });
     
     if (abweichungen.length > 0) {
       console.log(`  🚨 ABWEICHUNGEN: ${abweichungen.join(', ')}`);
       console.log(`  📊 DETAILLIERTE FIREBASE-STRICHWERTE:`);
       console.log(`    Top Team (${topStricheTotal}): Sieg=${topStriche.sieg || 0}, Berg=${topStriche.berg || 0}, Matsch=${topStriche.matsch || 0}, Schneider=${topStriche.schneider || 0}, Konter=${topStriche.kontermatsch || 0}`);
       console.log(`    Bottom Team (${bottomStricheTotal}): Sieg=${bottomStriche.sieg || 0}, Berg=${bottomStriche.berg || 0}, Matsch=${bottomStriche.matsch || 0}, Schneider=${bottomStriche.schneider || 0}, Konter=${bottomStriche.kontermatsch || 0}`);
     } else {
       console.log(`  ✅ ÜBEREINSTIMMUNG`);
     }
  });
  
  // Finale Zusammenfassung
  console.log('\\n🏆 FINALE ZUSAMMENFASSUNG:');
  console.log('=' * 60);
  
  console.log('\\n📝 SCHRIFTLICHE ENDWERTE:');
  Object.keys(schriftlicheWerte).forEach(spieler => {
    const endWert = schriftlicheWerte[spieler][14]; // Passe 15
    console.log(`${spieler}: ${endWert} Striche`);
  });
  
  console.log('\\n🔥 FIREBASE ENDWERTE:');
  const firebaseRanking = Object.values(firebaseStats).sort((a, b) => b.totalStriche - a.totalStriche);
  firebaseRanking.forEach((player, index) => {
    console.log(`${player.name}: ${player.totalStriche} Striche`);
  });
  
     console.log('\\n📊 DIFFERENZEN:');
   Object.keys(schriftlicheWerte).forEach(spieler => {
     const schriftlichEndwert = schriftlicheWerte[spieler][14];
     const firebasePlayer = firebaseRanking.find(p => p.name === spieler);
     const firebaseEndwert = firebasePlayer ? firebasePlayer.totalStriche : 0;
     const diff = schriftlichEndwert - firebaseEndwert;
     console.log(`${spieler}: ${diff > 0 ? '+' : ''}${diff} (${firebaseEndwert} → ${schriftlichEndwert})`);
   });
   
   console.log('\\n🚨 PROBLEMATISCHE PASSEN (Zusammenfassung):');
   console.log('=' * 60);
   const problemPassen = [10, 11, 13, 14];
   problemPassen.forEach(passeNr => {
     console.log(`\\nPasse ${passeNr}: Siehe detaillierte Analyse oben`);
   });
   
   process.exit(0);
}

async function analyzeCompleteSession() {
  console.log('🏆 [TURNIER ANALYSE] Analysiere Turnier "Krakau 2025"...');
  
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
  
  // Lade direkt aus dem Turnier die Passen
  console.log('🔍 Lade Passen direkt aus dem Turnier...');
  const gamesSnap = await db.collection('tournaments')
    .doc(tournamentId)
    .collection('games')
    .get();
  
  console.log(`📊 Gefundene Turnier-Passen: ${gamesSnap.docs.length}`);
  
  if (gamesSnap.docs.length === 0) {
    console.log('❌ Keine Passen im Turnier gefunden!');
    return;
  }
  
  // Analysiere die Turnier-Passen
  analyzeFromTournamentPasses(gamesSnap.docs);
}

analyzeCompleteSession().catch(console.error); 