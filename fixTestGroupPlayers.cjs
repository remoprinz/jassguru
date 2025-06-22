const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('./functions/serviceAccountKey.json')),
  });
}

const db = admin.firestore();

const TARGET_GROUP_ID = 'UYYJnqdIOhZlygFG2lMo'; // Testgruppe

/**
 * Lädt Spielerdaten aus der players Collection
 */
async function getPlayerData(playerId) {
  try {
    const playerDoc = await db.collection('players').doc(playerId).get();
    if (playerDoc.exists) {
      return playerDoc.data();
    }
    return null;
  } catch (error) {
    console.error(`Fehler beim Laden von Spieler ${playerId}:`, error);
    return null;
  }
}

/**
 * Lädt Benutzerdaten aus der users Collection basierend auf userId
 */
async function getUserData(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      return userDoc.data();
    }
    return null;
  } catch (error) {
    console.error(`Fehler beim Laden von User ${userId}:`, error);
    return null;
  }
}

/**
 * Findet userId für eine playerId
 */
async function findUserIdForPlayerId(playerId) {
  try {
    const playerData = await getPlayerData(playerId);
    if (playerData && playerData.userId) {
      return playerData.userId;
    }
    return null;
  } catch (error) {
    console.error(`Fehler beim Finden der userId für playerId ${playerId}:`, error);
    return null;
  }
}

/**
 * Repariert die Testgruppe
 */
async function fixTestGroup() {
  console.log('🔧 Starte Reparatur der Testgruppe...\n');
  
  try {
    // Lade Gruppendaten
    const groupDoc = await db.collection('groups').doc(TARGET_GROUP_ID).get();
    if (!groupDoc.exists) {
      console.error(`❌ Gruppe ${TARGET_GROUP_ID} nicht gefunden!`);
      return;
    }
    
    const groupData = groupDoc.data();
    const playerIds = groupData.playerIds || [];
    const existingPlayers = groupData.players || {};
    
    console.log(`📊 Gruppenstatus: ${groupData.name}`);
    console.log(`   playerIds Array: ${playerIds.length} Einträge`);
    console.log(`   players Objekt: ${Object.keys(existingPlayers).length} Einträge\n`);
    
    const missingPlayerIds = playerIds.filter(id => !existingPlayers[id]);
    
    console.log('🔍 Phase 1: Fehlende Spieler-Einträge hinzufügen');
    
    const playersToAdd = {};
    
    // Für jeden fehlenden Spieler die Daten sammeln
    for (const playerId of missingPlayerIds) {
      console.log(`📋 Verarbeite fehlenden Spieler: ${playerId}`);
      
      const playerData = await getPlayerData(playerId);
      
      if (playerData) {
        // Spieler-Dokument existiert
        const userId = playerData.userId;
        let userData = null;
        
        if (userId) {
          userData = await getUserData(userId);
        }
        
        const playerEntry = {
          displayName: playerData.displayName || `Spieler ${playerId.slice(0, 4)}...`,
          email: userData?.email || playerData.email || null,
          photoURL: userData?.photoURL || playerData.photoURL || null,
          joinedAt: admin.firestore.Timestamp.now() // Default, da wir das echte Datum nicht haben
        };
        
        playersToAdd[playerId] = playerEntry;
        console.log(`   ✅ Daten gesammelt: ${playerEntry.displayName} (Email: ${playerEntry.email || 'keine'}, Photo: ${playerEntry.photoURL ? 'ja' : 'nein'})`);
        
      } else {
        // Spieler-Dokument existiert nicht - erstelle Platzhalter
        console.log(`   ⚠️  Spieler-Dokument nicht gefunden - erstelle Platzhalter`);
        
        const placeholderEntry = {
          displayName: `Unbekannter Spieler ${playerId.slice(0, 4)}...`,
          email: null,
          photoURL: null,
          joinedAt: admin.firestore.Timestamp.now()
        };
        
        playersToAdd[playerId] = placeholderEntry;
        console.log(`   📝 Platzhalter erstellt: ${placeholderEntry.displayName}`);
      }
    }
    
    console.log('\n🔍 Phase 2: Bestehende Spieler-Einträge ergänzen (photoURL, email)');
    
    const playersToUpdate = {};
    
    // Für jeden bestehenden Spieler prüfen, ob photoURL oder email fehlen
    for (const [playerId, playerEntry] of Object.entries(existingPlayers)) {
      console.log(`📋 Prüfe bestehenden Spieler: ${playerId} (${playerEntry.displayName})`);
      
      const needsPhoto = !playerEntry.photoURL;
      const needsEmail = !playerEntry.email;
      
      if (needsPhoto || needsEmail) {
        console.log(`   🔍 Fehlende Daten: ${needsPhoto ? 'photoURL ' : ''}${needsEmail ? 'email' : ''}`);
        
        const playerData = await getPlayerData(playerId);
        if (playerData && playerData.userId) {
          const userData = await getUserData(playerData.userId);
          
          if (userData) {
            const updates = { ...playerEntry };
            let hasUpdates = false;
            
            if (needsPhoto && userData.photoURL) {
              updates.photoURL = userData.photoURL;
              console.log(`   ✅ PhotoURL gefunden: ${userData.photoURL.substring(0, 50)}...`);
              hasUpdates = true;
            }
            
            if (needsEmail && userData.email) {
              updates.email = userData.email;
              console.log(`   ✅ Email gefunden: ${userData.email}`);
              hasUpdates = true;
            }
            
            if (hasUpdates) {
              playersToUpdate[playerId] = updates;
            } else {
              console.log(`   ⚠️  Keine zusätzlichen Daten im users-Dokument gefunden`);
            }
          } else {
            console.log(`   ⚠️  Users-Dokument nicht gefunden für userId: ${playerData.userId}`);
          }
        } else {
          console.log(`   ⚠️  Keine userId im players-Dokument gefunden`);
        }
      } else {
        console.log(`   ✅ Bereits vollständig (Email: ${!!playerEntry.email}, Photo: ${!!playerEntry.photoURL})`);
      }
    }
    
    // Änderungen anwenden
    const hasNewPlayers = Object.keys(playersToAdd).length > 0;
    const hasUpdates = Object.keys(playersToUpdate).length > 0;
    
    if (hasNewPlayers || hasUpdates) {
      console.log(`\n🚀 Wende Änderungen an...`);
      
      const updates = {};
      
      // Neue Spieler hinzufügen
      for (const [playerId, playerEntry] of Object.entries(playersToAdd)) {
        updates[`players.${playerId}`] = playerEntry;
        console.log(`   ➕ Füge hinzu: players.${playerId} = ${playerEntry.displayName}`);
      }
      
      // Bestehende Spieler aktualisieren
      for (const [playerId, playerEntry] of Object.entries(playersToUpdate)) {
        updates[`players.${playerId}`] = playerEntry;
        console.log(`   🔄 Aktualisiere: players.${playerId} = ${playerEntry.displayName}`);
      }
      
      updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      
      await db.collection('groups').doc(TARGET_GROUP_ID).update(updates);
      
      console.log(`\n✅ Erfolgreich ${Object.keys(playersToAdd).length} neue Spieler hinzugefügt und ${Object.keys(playersToUpdate).length} bestehende aktualisiert!`);
      
    } else {
      console.log('\n✅ Keine Änderungen erforderlich - alle Daten sind bereits vollständig!');
    }
    
  } catch (error) {
    console.error('❌ Fehler bei der Reparatur:', error);
    throw error;
  }
}

/**
 * Zeigt den finalen Status an
 */
async function showFinalStatus() {
  try {
    const groupDoc = await db.collection('groups').doc(TARGET_GROUP_ID).get();
    const groupData = groupDoc.data();
    const playerIds = groupData.playerIds || [];
    const players = groupData.players || {};
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 FINALER STATUS');
    console.log('='.repeat(50));
    console.log(`Gruppe: ${groupData.name}`);
    console.log(`playerIds Array: ${playerIds.length} Einträge`);
    console.log(`players Objekt: ${Object.keys(players).length} Einträge`);
    
    const allMatched = playerIds.every(id => players[id]);
    console.log(`Status: ${allMatched ? '✅ VOLLSTÄNDIG' : '❌ NOCH UNVOLLSTÄNDIG'}`);
    
    if (!allMatched) {
      const stillMissing = playerIds.filter(id => !players[id]);
      console.log(`Noch fehlend: ${stillMissing.join(', ')}`);
    }
    
  } catch (error) {
    console.error('Fehler beim Anzeigen des finalen Status:', error);
  }
}

// Hauptausführung
console.log('🔧 TESTGRUPPEN-REPARATUR');
console.log('=======================');
console.log(`Ziel: ${TARGET_GROUP_ID} (Testgruppe)`);
console.log('');

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Testgruppe reparieren? (ja/nein): ', (answer) => {
  if (answer.toLowerCase() === 'ja' || answer.toLowerCase() === 'j') {
    fixTestGroup()
      .then(() => showFinalStatus())
      .then(() => {
        console.log('\n🎉 Reparatur abgeschlossen!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('\n💥 Reparatur fehlgeschlagen:', error);
        process.exit(1);
      });
  } else {
    console.log('❌ Abgebrochen.');
    process.exit(0);
  }
  rl.close();
}); 