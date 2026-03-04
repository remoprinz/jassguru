/**
 * Manuelles Hinzufügen von Spielern zu Jasstafel
 * 
 * Dieses Script kann:
 * 1. Prüfen ob User bereits existieren
 * 2. Einen neuen Passwort-Reset-Link generieren
 * 3. Komplett neue User + Player anlegen
 * 
 * Verwendung: node scripts/manual-add-player.cjs
 */
const admin = require('firebase-admin');
const path = require('path');
const crypto = require('crypto');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ==========================================
// 🔧 KONFIGURATION - HIER ANPASSEN!
// ==========================================

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

// User die bereits in Firebase Auth existieren (mit UID)
const EXISTING_USERS = [
  {
    uid: 'Ch0taugjFsPcm3LwW3FilnGiMp02',
    email: 'ursudin@bluewin.ch'
  },
  {
    uid: 'zDntgLnirGboVYbGCqQtMXXg8Kh1',
    email: 'info@trumpf-as.ch'
  }
];

// ==========================================
// Hilfsfunktionen
// ==========================================

function generateSecureId(length = 20) {
  return crypto.randomBytes(length).toString('hex').substring(0, length);
}

const profileThemes = ['theme-schieber', 'theme-trump', 'theme-bells', 'theme-acorns', 'theme-roses', 'theme-shields'];
function getRandomProfileTheme() {
  return profileThemes[Math.floor(Math.random() * profileThemes.length)];
}

async function checkUserExists(email) {
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    return { exists: true, uid: userRecord.uid, userRecord };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return { exists: false };
    }
    throw error;
  }
}

async function getPlayerForUser(userId) {
  // Erst in users Collection schauen
  const userDoc = await db.collection('users').doc(userId).get();
  if (userDoc.exists && userDoc.data()?.playerId) {
    const playerId = userDoc.data().playerId;
    const playerDoc = await db.collection('players').doc(playerId).get();
    if (playerDoc.exists) {
      return { playerId, playerData: playerDoc.data() };
    }
  }
  
  // Falls nicht gefunden, in players Collection suchen
  const playersQuery = await db.collection('players').where('userId', '==', userId).limit(1).get();
  if (!playersQuery.empty) {
    return { playerId: playersQuery.docs[0].id, playerData: playersQuery.docs[0].data() };
  }
  
  return null;
}

async function createUserAndPlayer(email, displayName) {
  console.log(`\n📝 Erstelle neuen User und Player für ${displayName} (${email})...`);
  
  // 1. Firebase Auth User erstellen
  const tempPassword = crypto.randomBytes(16).toString('hex') + 'Aa1!';
  const userRecord = await admin.auth().createUser({
    email: email,
    password: tempPassword,
    displayName: displayName,
    emailVerified: false,
    disabled: false
  });
  const userId = userRecord.uid;
  console.log(`   ✅ Firebase Auth User erstellt: ${userId}`);
  
  // 2. Player Document erstellen
  const playerId = generateSecureId(20);
  const lowercaseDisplayName = displayName.toLowerCase().trim();
  
  // Check ob Jassname schon vergeben
  const existingPlayerQuery = await db
    .collection('players')
    .where('lowercaseDisplayName', '==', lowercaseDisplayName)
    .limit(1)
    .get();
  
  if (!existingPlayerQuery.empty) {
    console.log(`   ⚠️  Warnung: Jassname "${displayName}" ist bereits vergeben!`);
    console.log(`   Existierender Player ID: ${existingPlayerQuery.docs[0].id}`);
    // Trotzdem weitermachen, aber mit Suffix
  }
  
  const playerData = {
    displayName: displayName.trim(),
    lowercaseDisplayName: lowercaseDisplayName,
    userId: userId,
    isGuest: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    groupIds: [],
    profileTheme: getRandomProfileTheme(),
    stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
    metadata: { isOG: false }
  };
  
  const userData = {
    email: email,
    displayName: displayName,
    playerId: playerId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    playerCreatedBy: 'manual-script'
  };
  
  // Batch write
  const batch = db.batch();
  batch.set(db.collection('players').doc(playerId), playerData);
  batch.set(db.collection('users').doc(userId), userData, { merge: true });
  await batch.commit();
  
  console.log(`   ✅ Player erstellt: ${playerId}`);
  
  return { userId, playerId };
}

async function addPlayerToGroup(playerId, displayName, groupId) {
  console.log(`   📍 Füge Spieler zu Gruppe ${groupId} hinzu...`);
  
  const groupRef = db.collection('groups').doc(groupId);
  const groupDoc = await groupRef.get();
  
  if (!groupDoc.exists) {
    console.log(`   ❌ Gruppe ${groupId} existiert nicht!`);
    return false;
  }
  
  const groupData = groupDoc.data();
  console.log(`   📦 Gruppe gefunden: ${groupData.name || 'N/A'}`);
  
  // Player zu groupIds hinzufügen
  await db.collection('players').doc(playerId).update({
    groupIds: admin.firestore.FieldValue.arrayUnion(groupId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Member Subcollection Eintrag
  await groupRef.collection('members').doc(playerId).set({
    displayName: displayName,
    joinedAt: admin.firestore.Timestamp.now(),
    photoURL: null
  }, { merge: true });
  
  console.log(`   ✅ Zur Gruppe hinzugefügt!`);
  return true;
}

async function generatePasswordResetLink(email) {
  try {
    const link = await admin.auth().generatePasswordResetLink(email, {
      url: 'https://jassguru.ch/auth/reset-password',
      handleCodeInApp: false
    });
    return link;
  } catch (error) {
    console.log(`   ⚠️  Konnte keinen Reset-Link generieren: ${error.message}`);
    return null;
  }
}

// ==========================================
// Hauptlogik
// ==========================================

async function processExistingUsers() {
  console.log('🔧 Verarbeite existierende User\n');
  console.log('='.repeat(50));
  
  // Erst Gruppe laden
  const groupRef = db.collection('groups').doc(GROUP_ID);
  const groupDoc = await groupRef.get();
  
  if (!groupDoc.exists) {
    console.log(`❌ Gruppe ${GROUP_ID} existiert nicht!`);
    return;
  }
  
  console.log(`📦 Gruppe: ${groupDoc.data().name || GROUP_ID}`);
  
  const results = [];
  
  for (const user of EXISTING_USERS) {
    console.log(`\n👤 Verarbeite: ${user.email} (UID: ${user.uid})`);
    console.log('-'.repeat(50));
    
    const result = {
      email: user.email,
      uid: user.uid,
      status: 'unknown',
      passwordResetLink: null
    };
    
    try {
      // 1. Hole User-Daten aus Firebase Auth
      const userRecord = await admin.auth().getUser(user.uid);
      console.log(`   ✅ Firebase Auth User gefunden`);
      console.log(`   📧 Email: ${userRecord.email}`);
      console.log(`   👤 Display Name: ${userRecord.displayName || '(nicht gesetzt)'}`);
      result.displayName = userRecord.displayName;
      
      // 2. Prüfe ob Player existiert
      const playerInfo = await getPlayerForUser(user.uid);
      
      if (playerInfo) {
        console.log(`   ✅ Player existiert: ${playerInfo.playerId}`);
        console.log(`   📊 DisplayName: ${playerInfo.playerData.displayName}`);
        console.log(`   📊 Stats: ${playerInfo.playerData.stats?.gamesPlayed || 0} Spiele`);
        result.playerId = playerInfo.playerId;
        result.displayName = playerInfo.playerData.displayName;
        
        // Prüfe ob bereits in Gruppe
        const groupIds = playerInfo.playerData.groupIds || [];
        if (groupIds.includes(GROUP_ID)) {
          console.log(`   ℹ️  Bereits in der Gruppe!`);
          result.status = 'already_in_group';
        } else {
          // Zur Gruppe hinzufügen
          await addPlayerToGroup(playerInfo.playerId, playerInfo.playerData.displayName, GROUP_ID);
          result.status = 'added_to_group';
        }
      } else {
        console.log(`   ⚠️  Kein Player-Dokument gefunden!`);
        
        // Player erstellen
        const displayName = userRecord.displayName || user.email.split('@')[0];
        const playerId = generateSecureId(20);
        const lowercaseDisplayName = displayName.toLowerCase().trim();
        
        const playerData = {
          displayName: displayName.trim(),
          lowercaseDisplayName: lowercaseDisplayName,
          userId: user.uid,
          isGuest: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          groupIds: [GROUP_ID],
          profileTheme: getRandomProfileTheme(),
          stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
          metadata: { isOG: false }
        };
        
        const userData = {
          email: user.email,
          displayName: displayName,
          playerId: playerId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          playerCreatedBy: 'manual-script'
        };
        
        // Batch write
        const batch = db.batch();
        batch.set(db.collection('players').doc(playerId), playerData);
        batch.set(db.collection('users').doc(user.uid), userData, { merge: true });
        
        // Member Subcollection
        batch.set(groupRef.collection('members').doc(playerId), {
          displayName: displayName,
          joinedAt: admin.firestore.Timestamp.now(),
          photoURL: null
        });
        
        await batch.commit();
        
        console.log(`   ✅ Player erstellt: ${playerId}`);
        result.playerId = playerId;
        result.displayName = displayName;
        result.status = 'player_created';
      }
      
      // 3. Passwort-Reset-Link generieren
      console.log(`   🔑 Generiere Passwort-Reset-Link...`);
      result.passwordResetLink = await generatePasswordResetLink(user.email);
      
    } catch (error) {
      console.log(`   ❌ Fehler: ${error.message}`);
      result.status = 'error';
      result.error = error.message;
    }
    
    results.push(result);
  }
  
  // Zusammenfassung
  console.log('\n' + '='.repeat(50));
  console.log('📋 ZUSAMMENFASSUNG\n');
  
  for (const result of results) {
    console.log(`👤 ${result.displayName || 'N/A'} (${result.email})`);
    console.log(`   UID: ${result.uid}`);
    console.log(`   Status: ${result.status}`);
    if (result.playerId) console.log(`   Player ID: ${result.playerId}`);
    if (result.passwordResetLink) {
      console.log(`\n   🔗 Passwort-Reset-Link:`);
      console.log(`   ${result.passwordResetLink}`);
    }
    if (result.error) console.log(`   ❌ Error: ${result.error}`);
    console.log('');
  }
  
  console.log('\n✅ Fertig!');
  console.log('\n📌 WICHTIG: Sende die Passwort-Reset-Links an die Spieler!');
}

// Legacy Funktion falls noch benötigt
async function processPlayers() {
  return processExistingUsers();
}

processExistingUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  });
