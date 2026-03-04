const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialisiere Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addPlayersToGroup() {
  console.log('🔧 Füge Spieler zur Gruppe hinzu...\n');

  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  const playersToAdd = [
    { id: 'mgn9a1L5tM8iAJk5S2hkE', name: 'Schällenursli', userId: '2rzQadBriZQfeoMaV89ZLP6DjMw2' },
    { id: '4nhOwuVONajPArNERzyEj', name: 'Davester', userId: 'HImvSPUeayTBVSCZlyzmH8Dln2j2' },
    { id: 'PH15EO1vuTXq7FXal5Q_b', name: 'Reto', userId: 'eSHoUSSEiraQTFuU033Y4RDxcAL2' }
  ];

  // 1. Lade aktuelle Gruppendaten
  const groupRef = db.collection('groups').doc(groupId);
  const groupDoc = await groupRef.get();
  
  if (!groupDoc.exists) {
    console.error('❌ Gruppe existiert nicht!');
    return;
  }
  
  const groupData = groupDoc.data();
  console.log(`✅ Gruppe gefunden: ${groupData.groupName || 'N/A'}`);
  
  // 2. Sammle aktuelle Mitglieder
  let currentMemberPlayerIds = groupData.memberPlayerIds || [];
  let currentMemberUids = groupData.memberUids || [];
  
  console.log(`📊 Aktuelle Mitglieder: ${currentMemberPlayerIds.length} Player IDs, ${currentMemberUids.length} User IDs\n`);

  // 3. Füge neue Spieler hinzu (wenn noch nicht vorhanden)
  let addedCount = 0;
  
  for (const player of playersToAdd) {
    console.log(`👤 Verarbeite: ${player.name} (${player.id})`);
    
    // Prüfe ob bereits vorhanden
    const alreadyInPlayerIds = currentMemberPlayerIds.includes(player.id);
    const alreadyInUids = currentMemberUids.includes(player.userId);
    
    if (alreadyInPlayerIds && alreadyInUids) {
      console.log('   ℹ️  Bereits in der Gruppe vorhanden (beide Arrays)');
      continue;
    }
    
    // Füge zu Arrays hinzu (falls noch nicht vorhanden)
    if (!alreadyInPlayerIds) {
      currentMemberPlayerIds.push(player.id);
      console.log('   ✅ Zu memberPlayerIds hinzugefügt');
    }
    
    if (!alreadyInUids) {
      currentMemberUids.push(player.userId);
      console.log('   ✅ Zu memberUids hinzugefügt');
    }
    
    addedCount++;
  }

  // 4. Speichere aktualisierte Gruppe
  if (addedCount > 0) {
    console.log(`\n💾 Speichere ${addedCount} neue Mitglieder in der Gruppe...`);
    
    await groupRef.update({
      memberPlayerIds: currentMemberPlayerIds,
      memberUids: currentMemberUids,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Gruppe erfolgreich aktualisiert!');
    console.log(`📊 Neue Anzahl Mitglieder: ${currentMemberPlayerIds.length} Player IDs, ${currentMemberUids.length} User IDs`);
  } else {
    console.log('\n ℹ️  Keine Änderungen notwendig - alle Spieler sind bereits in der Gruppe.');
  }

  console.log('\n✅ Fertig!');
}

addPlayersToGroup()
  .then(() => {
    console.log('\n🎉 Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  });

