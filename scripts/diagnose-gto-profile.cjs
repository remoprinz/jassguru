/**
 * Diagnose-Script: Warum wird das Profilbild für den Spieler GTO nicht angezeigt?
 * 
 * Analyse der Datenstruktur für:
 * - Player ID: q79AtQHIxvXnUmgdh4kyF
 * - User ID: 21qyCBYQFYXcB0lJ2zUxmlrpShC3
 * - Group ID: 1op99awMEoKJjp8wZpxj
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'jassguru.firebasestorage.app'
  });
}

const db = admin.firestore();

const PLAYER_ID = 'q79AtQHIxvXnUmgdh4kyF';
const USER_ID = '21qyCBYQFYXcB0lJ2zUxmlrpShC3';
const GROUP_ID = '1op99awMEoKJjp8wZpxj';

async function diagnose() {
  console.log('=' .repeat(80));
  console.log('DIAGNOSE: Profilbild für GTO');
  console.log('=' .repeat(80));
  console.log();

  // 1. Player-Dokument prüfen
  console.log('1️⃣ PLAYER-DOKUMENT (players/' + PLAYER_ID + ')');
  console.log('-'.repeat(60));
  
  const playerDoc = await db.collection('players').doc(PLAYER_ID).get();
  if (playerDoc.exists) {
    const playerData = playerDoc.data();
    console.log('✅ Player-Dokument gefunden');
    console.log('   displayName:', playerData.displayName);
    console.log('   photoURL:', playerData.photoURL || '❌ NICHT GESETZT');
    console.log('   userId:', playerData.userId);
    console.log('   profileTheme:', playerData.profileTheme);
    console.log('   statusMessage:', playerData.statusMessage);
    console.log('   groupIds:', playerData.groupIds);
    console.log('   metadata:', JSON.stringify(playerData.metadata, null, 2));
    console.log('   isGuest:', playerData.isGuest);
  } else {
    console.log('❌ Player-Dokument NICHT gefunden!');
  }
  console.log();

  // 2. User-Dokument prüfen
  console.log('2️⃣ USER-DOKUMENT (users/' + USER_ID + ')');
  console.log('-'.repeat(60));
  
  const userDoc = await db.collection('users').doc(USER_ID).get();
  if (userDoc.exists) {
    const userData = userDoc.data();
    console.log('✅ User-Dokument gefunden');
    console.log('   displayName:', userData.displayName);
    console.log('   email:', userData.email);
    console.log('   playerId:', userData.playerId);
    console.log('   photoURL:', userData.photoURL || '❌ NICHT GESETZT');
    console.log('   profileTheme:', userData.profileTheme);
    console.log('   statusMessage:', userData.statusMessage);
    console.log('   lastActiveGroupId:', userData.lastActiveGroupId);
  } else {
    console.log('❌ User-Dokument NICHT gefunden!');
  }
  console.log();

  // 3. Metadata-Dokument prüfen
  console.log('3️⃣ METADATA-DOKUMENT (players/' + PLAYER_ID + '/metadata/profile)');
  console.log('-'.repeat(60));
  
  const metadataDoc = await db.collection('players').doc(PLAYER_ID).collection('metadata').doc('profile').get();
  if (metadataDoc.exists) {
    const metadata = metadataDoc.data();
    console.log('✅ Metadata-Dokument gefunden');
    console.log('   photoURL:', metadata.photoURL || '❌ NICHT GESETZT');
    console.log('   Alle Felder:', JSON.stringify(metadata, null, 2));
  } else {
    console.log('❌ Metadata-Dokument NICHT gefunden');
  }
  console.log();

  // 4. Gruppen-Dokument prüfen
  console.log('4️⃣ GRUPPEN-DOKUMENT (groups/' + GROUP_ID + ')');
  console.log('-'.repeat(60));
  
  const groupDoc = await db.collection('groups').doc(GROUP_ID).get();
  if (groupDoc.exists) {
    const groupData = groupDoc.data();
    console.log('✅ Gruppen-Dokument gefunden');
    console.log('   name:', groupData.name);
    console.log('   playerIds:', groupData.playerIds);
    console.log('   players Map:');
    
    if (groupData.players) {
      for (const [playerId, playerInfo] of Object.entries(groupData.players)) {
        console.log(`      ${playerId}:`, JSON.stringify(playerInfo, null, 2));
      }
    }
  } else {
    console.log('❌ Gruppen-Dokument NICHT gefunden!');
  }
  console.log();

  // 5. Member-Subkollektion prüfen
  console.log('5️⃣ MEMBERS-SUBKOLLEKTION (groups/' + GROUP_ID + '/members/' + PLAYER_ID + ')');
  console.log('-'.repeat(60));
  
  const memberDoc = await db.collection('groups').doc(GROUP_ID).collection('members').doc(PLAYER_ID).get();
  if (memberDoc.exists) {
    const memberData = memberDoc.data();
    console.log('✅ Member-Dokument gefunden');
    console.log('   photoURL:', memberData.photoURL || '❌ NICHT GESETZT');
    console.log('   Alle Felder:', JSON.stringify(memberData, null, 2));
  } else {
    console.log('❌ Member-Dokument NICHT gefunden');
  }
  console.log();

  // 6. Vergleich mit funktionierendem Spieler (Remo)
  console.log('6️⃣ VERGLEICH MIT REMO (funktionierender Spieler)');
  console.log('-'.repeat(60));
  
  const remoPlayerId = 'b16c1120111b7d9e7d733837';
  const remoPlayerDoc = await db.collection('players').doc(remoPlayerId).get();
  if (remoPlayerDoc.exists) {
    const remoData = remoPlayerDoc.data();
    console.log('   Remo displayName:', remoData.displayName);
    console.log('   Remo photoURL:', remoData.photoURL || '❌ NICHT GESETZT');
    console.log('   Remo userId:', remoData.userId);
    
    // Remo's User-Dokument
    if (remoData.userId) {
      const remoUserDoc = await db.collection('users').doc(remoData.userId).get();
      if (remoUserDoc.exists) {
        const remoUserData = remoUserDoc.data();
        console.log('   Remo User photoURL:', remoUserData.photoURL || '❌ NICHT GESETZT');
      }
    }
  }
  console.log();

  // 7. Fazit
  console.log('=' .repeat(80));
  console.log('📋 FAZIT');
  console.log('=' .repeat(80));
  
  const playerData = playerDoc.exists ? playerDoc.data() : null;
  const userData = userDoc.exists ? userDoc.data() : null;
  
  if (playerData && !playerData.photoURL && userData) {
    console.log();
    console.log('🔍 PROBLEM IDENTIFIZIERT:');
    console.log('   Das Player-Dokument hat KEINE photoURL!');
    console.log('   Der User hat jedoch ein Profilbild im metadata gesetzt.');
    console.log();
    console.log('💡 MÖGLICHE URSACHE:');
    console.log('   Die photoURL wird nicht vom User-Dokument ins Player-Dokument synchronisiert.');
    console.log('   Die GroupMemberList liest player.photoURL, aber der Wert fehlt.');
    console.log();
    console.log('🔧 LÖSUNG:');
    console.log('   Die photoURL muss ins Player-Dokument kopiert werden,');
    console.log('   oder die Komponente muss den Wert aus dem metadata-Dokument holen.');
  }
}

diagnose()
  .then(() => {
    console.log();
    console.log('Diagnose abgeschlossen.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fehler bei der Diagnose:', error);
    process.exit(1);
  });
