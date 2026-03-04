// Cleanup group playerRatings subcollections
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId: 'jassguru',
  });
}

const db = admin.firestore();

async function cleanup(groupIdFilter = null) {
  console.log('🧹 Lösche groups/*/playerRatings Subcollections', groupIdFilter ? `(nur ${groupIdFilter})` : '');
  const groupsSnap = groupIdFilter
    ? { docs: [await db.collection('groups').doc(groupIdFilter).get()] }
    : await db.collection('groups').get();

  let totalDeleted = 0;
  for (const groupDoc of groupsSnap.docs) {
    if (!groupDoc.exists) continue;
    const gid = groupDoc.id;
    const subSnap = await db.collection(`groups/${gid}/playerRatings`).get();
    if (subSnap.empty) {
      continue;
    }
    const batch = db.batch();
    subSnap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += subSnap.size;
    console.log(`   ✅ Gruppe ${gid}: ${subSnap.size} Einträge gelöscht`);
  }
  console.log(`🧹 Fertig. Insgesamt gelöscht: ${totalDeleted}`);
}

const argGid = process.argv[2] || null;
cleanup(argGid).catch(err => {
  console.error('❌ Fehler beim Cleanup:', err);
  process.exit(1);
});


