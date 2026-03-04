/**
 * Füge Spieler zu einem Turnier hinzu
 * 
 * Verwendung: node scripts/add-players-to-tournament.cjs
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ==========================================
// 🔧 KONFIGURATION
// ==========================================

const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

const PLAYERS_TO_ADD = [
  {
    uid: 'Ch0taugjFsPcm3LwW3FilnGiMp02',  // Mazi
    email: 'ursudin@bluewin.ch'
  },
  {
    uid: 'zDntgLnirGboVYbGCqQtMXXg8Kh1',  // Fabinski
    email: 'info@trumpf-as.ch'
  }
];

// ==========================================
// Hauptlogik
// ==========================================

async function addPlayersToTournament() {
  console.log('🏆 Füge Spieler zum Turnier hinzu\n');
  console.log('='.repeat(50));
  
  // 1. Lade Turnier
  const tournamentRef = db.collection('tournaments').doc(TOURNAMENT_ID);
  const tournamentDoc = await tournamentRef.get();
  
  if (!tournamentDoc.exists) {
    console.error(`❌ Turnier ${TOURNAMENT_ID} existiert nicht!`);
    return;
  }
  
  const tournament = tournamentDoc.data();
  console.log(`📦 Turnier: ${tournament.name || 'N/A'}`);
  console.log(`   Gruppe: ${tournament.groupId || 'N/A'}`);
  console.log(`   Aktuelle Teilnehmer: ${tournament.participantUids?.length || 0} UIDs`);
  console.log(`   Aktuelle Teilnehmer Player IDs: ${tournament.participantPlayerIds?.length || 0}\n`);
  
  const participantUids = tournament.participantUids || [];
  const participantPlayerIds = tournament.participantPlayerIds || [];
  
  // 2. Für jeden Spieler: Player-ID finden und hinzufügen
  const updates = {
    participantUids: [...participantUids],
    participantPlayerIds: [...participantPlayerIds]
  };
  
  let addedCount = 0;
  
  for (const player of PLAYERS_TO_ADD) {
    console.log(`\n👤 Verarbeite: ${player.email} (UID: ${player.uid})`);
    console.log('-'.repeat(50));
    
    // Prüfe ob bereits Teilnehmer
    if (participantUids.includes(player.uid)) {
      console.log('   ℹ️  Bereits Teilnehmer des Turniers!');
      continue;
    }
    
    // Finde Player-ID
    let playerId = null;
    
    // Versuche aus users Collection
    const userDoc = await db.collection('users').doc(player.uid).get();
    if (userDoc.exists && userDoc.data()?.playerId) {
      playerId = userDoc.data().playerId;
      console.log(`   ✅ Player ID gefunden (users): ${playerId}`);
    } else {
      // Suche in players Collection
      const playersQuery = await db.collection('players').where('userId', '==', player.uid).limit(1).get();
      if (!playersQuery.empty) {
        playerId = playersQuery.docs[0].id;
        console.log(`   ✅ Player ID gefunden (players): ${playerId}`);
      } else {
        console.log(`   ❌ Kein Player-Dokument gefunden für UID ${player.uid}!`);
        console.log(`   ⚠️  Spieler muss erst ein Player-Dokument haben.`);
        continue;
      }
    }
    
    // Prüfe ob Player-ID bereits vorhanden
    if (participantPlayerIds.includes(playerId)) {
      console.log(`   ⚠️  Player ID ${playerId} ist bereits in participantPlayerIds, aber UID fehlt!`);
      console.log(`   🔧 Füge UID hinzu...`);
    }
    
    // Füge hinzu
    if (!updates.participantUids.includes(player.uid)) {
      updates.participantUids.push(player.uid);
      console.log(`   ✅ UID hinzugefügt`);
    }
    
    if (!updates.participantPlayerIds.includes(playerId)) {
      updates.participantPlayerIds.push(playerId);
      console.log(`   ✅ Player ID hinzugefügt`);
    }
    
    addedCount++;
  }
  
  // 3. Update Turnier
  if (addedCount > 0) {
    console.log(`\n💾 Speichere Änderungen...`);
    console.log(`   Neue Anzahl UIDs: ${updates.participantUids.length}`);
    console.log(`   Neue Anzahl Player IDs: ${updates.participantPlayerIds.length}`);
    
    await tournamentRef.update({
      participantUids: updates.participantUids,
      participantPlayerIds: updates.participantPlayerIds,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`\n✅ ${addedCount} Spieler erfolgreich zum Turnier hinzugefügt!`);
  } else {
    console.log(`\nℹ️  Keine Änderungen notwendig - alle Spieler sind bereits Teilnehmer.`);
  }
  
  // 4. Finale Überprüfung
  console.log('\n' + '='.repeat(50));
  console.log('📊 FINALE ÜBERPRÜFUNG\n');
  
  const finalDoc = await tournamentRef.get();
  const finalData = finalDoc.data();
  
  console.log(`Turnier: ${finalData.name}`);
  console.log(`Teilnehmer UIDs: ${finalData.participantUids?.length || 0}`);
  console.log(`Teilnehmer Player IDs: ${finalData.participantPlayerIds?.length || 0}`);
  
  // Zeige alle Teilnehmer
  if (finalData.participantUids && finalData.participantUids.length > 0) {
    console.log('\n📋 Teilnehmer-Liste:');
    for (const uid of finalData.participantUids) {
      try {
        const userRecord = await admin.auth().getUser(uid);
        const userDoc = await db.collection('users').doc(uid).get();
        const playerId = userDoc.data()?.playerId;
        const playerDoc = playerId ? await db.collection('players').doc(playerId).get() : null;
        const displayName = playerDoc?.data()?.displayName || userRecord.displayName || uid.substring(0, 8);
        
        console.log(`   - ${displayName} (${userRecord.email || 'keine Email'})`);
      } catch (e) {
        console.log(`   - ${uid.substring(0, 8)}... (Fehler beim Laden)`);
      }
    }
  }
  
  console.log('\n✅ Fertig!');
}

addPlayersToTournament()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  });
