const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function fixCorruptPlayerIds() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--confirm');

  console.log(`Starting Player ID Fix... Mode: ${isDryRun ? 'DRY RUN' : 'LIVE FIX'}`);

  const playersSnapshot = await db.collection('players').get();
  console.log(`Found ${playersSnapshot.size} players.`);

  let corruptCount = 0;
  const batch = db.batch();
  let batchCount = 0;

  for (const doc of playersSnapshot.docs) {
    const data = doc.data();
    // Check if id field exists and is different from document ID
    if (data.id && data.id !== doc.id) {
      corruptCount++;
      console.log(`⚠️ CORRUPT ID found for Player ${doc.id} (${data.displayName || 'Unknown'}):`);
      console.log(`   Current 'id' field in data: ${data.id}`);
      console.log(`   Correct 'id' (document ID): ${doc.id}`);

      if (!isDryRun) {
        batch.update(doc.ref, { id: doc.id });
        batchCount++;
        console.log(`   ✅ Queued for fix.`);
      } else {
        console.log(`   ℹ️ Would fix in live mode.`);
      }
    }
  }

  if (!isDryRun && batchCount > 0) {
    await batch.commit();
    console.log(`\n🎉 Successfully fixed ${batchCount} corrupt player IDs.`);
  } else if (corruptCount > 0 && isDryRun) {
    console.log(`\n⚠️ Found ${corruptCount} corrupt player IDs. Run with --confirm to fix.`);
  } else {
    console.log(`\n✅ No corrupt player IDs found (or nothing to fix).`);
  }
}

fixCorruptPlayerIds()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
