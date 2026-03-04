/**
 * Quick-Sync für neue Mitglieder in einer Gruppe
 * Verwendung: node scripts/sync-new-member.cjs <groupId>
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const groupId = process.argv[2] || '1op99awMEoKJjp8wZpxj';

async function syncMembers() {
  console.log(`🔄 Synchronisiere Mitglieder für Gruppe: ${groupId}`);
  
  const membersSnap = await db.collection('groups').doc(groupId).collection('members').get();
  console.log(`📦 ${membersSnap.size} Mitglieder gefunden`);
  
  for (const memberDoc of membersSnap.docs) {
    const memberId = memberDoc.id;
    const memberData = memberDoc.data();
    
    const playerDoc = await db.collection('players').doc(memberId).get();
    if (!playerDoc.exists) {
      console.log(`⚠️  Player ${memberId} nicht gefunden`);
      continue;
    }
    
    const playerData = playerDoc.data();
    const correctPhotoURL = playerData?.photoURL || null;
    
    if (memberData.photoURL !== correctPhotoURL) {
      await db.collection('groups').doc(groupId).collection('members').doc(memberId).update({
        photoURL: correctPhotoURL
      });
      console.log(`✅ ${memberData.displayName}: photoURL aktualisiert`);
    } else {
      console.log(`✓  ${memberData.displayName}: bereits korrekt`);
    }
  }
  
  console.log('🎉 Fertig!');
}

syncMembers().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
