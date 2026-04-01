/**
 * Seed-Script: Gründungsmitglieder des JVS anlegen
 *
 * Ausführen: cd functions && node ../scripts/seed-founding-members.js
 * (braucht functions/node_modules mit firebase-admin)
 */

const admin = require('firebase-admin');

// Initialisierung mit Service Account Key
const serviceAccount = require('/tmp/jassguru-sa.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();

const FOUNDING_MEMBERS = [
  { number: 1, firstName: 'Remo', lastName: 'Prinz', email: 'r.prinz@gmx.net', jassname: 'Remo' },
  { number: 2, firstName: 'Erich', lastName: 'Studerus', email: 'erich.studerus@gmail.com', jassname: 'Studi' },
  { number: 3, firstName: 'Fabian', lastName: 'Cadonau', email: 'info@trumpf-as.ch', jassname: 'Fabinski' },
  { number: 4, firstName: 'Claudia', lastName: 'Studer', email: 'claudia.studer77@gmail.com', jassname: 'Claudia' },
  { number: 5, firstName: 'Karim', lastName: 'Bschirr', email: 'z8qk8p6hg@mozmail.com', jassname: 'Karim' },
];

async function seedMembers() {
  const now = admin.firestore.Timestamp.now();
  const validUntil = admin.firestore.Timestamp.fromDate(new Date('2027-03-24'));

  for (const m of FOUNDING_MEMBERS) {
    // Find Firebase Auth user by email
    let uid;
    try {
      const userRecord = await auth.getUserByEmail(m.email);
      uid = userRecord.uid;
      console.log(`Found user ${m.firstName}: ${uid}`);
    } catch {
      console.log(`No Firebase Auth user for ${m.email} — creating...`);
      const newUser = await auth.createUser({
        email: m.email,
        emailVerified: true,
        displayName: m.jassname,
      });
      uid = newUser.uid;
      console.log(`Created user ${m.firstName}: ${uid}`);
    }

    // Check if jvs_member already exists
    const existing = await db.collection('jvs_members').where('uid', '==', uid).limit(1).get();

    if (!existing.empty) {
      // Update existing member with number + season
      const docId = existing.docs[0].id;
      await db.collection('jvs_members').doc(docId).update({
        memberNumber: m.number,
        season: 1,
        firstName: m.firstName,
        lastName: m.lastName,
        status: 'active',
        validUntil,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Updated existing member ${m.firstName} → #${m.number}`);
    } else {
      // Create new member
      const memberId = db.collection('jvs_members').doc().id;
      await db.collection('jvs_members').doc(memberId).set({
        id: memberId,
        uid,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        jassname: m.jassname,
        membershipType: 'single',
        memberNumber: m.number,
        season: 1,
        memberSince: now,
        validUntil,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      console.log(`Created member ${m.firstName} → #${m.number}`);
    }

    // Link to player if exists
    const playerQuery = await db.collection('players').where('userId', '==', uid).limit(1).get();
    if (!playerQuery.empty) {
      const playerId = playerQuery.docs[0].id;
      const memberDoc = (await db.collection('jvs_members').where('uid', '==', uid).limit(1).get()).docs[0];
      await memberDoc.ref.update({ playerId });
      console.log(`Linked ${m.firstName} to player ${playerId}`);
    }
  }

  // Set counter to 6 (next new member gets #006)
  await db.collection('jvs_counters').doc('members').set({ nextNumber: 6 });
  console.log('Counter set to 6');

  console.log('\nDone! 5 founding members created.');
  process.exit(0);
}

seedMembers().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
