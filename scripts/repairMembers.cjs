#!/usr/bin/env node
/**
 * Repair members subcollection for a group (safe, idempotent):
 * - Backfill displayName, photoURL from players/users
 * - Remove deprecated fields: email, lastActivity, role
 * - Create missing member docs
 *
 * Usage:
 *   node scripts/repairMembers.cjs <GROUP_ID>
 */

const admin = require('firebase-admin');

async function init() {
  try {
    admin.initializeApp();
  } catch (e) {}
  return admin.firestore();
}

async function getPlayerMap(db) {
  const map = new Map();
  const snap = await db.collection('players').get();
  snap.forEach(doc => map.set(doc.id, doc.data()));
  return map;
}

async function repairGroupMembers(db, groupId) {
  const groupRef = db.collection('groups').doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    throw new Error(`Group ${groupId} not found`);
  }

  const groupData = groupSnap.data() || {};
  const playerIds = groupData.players ? Object.keys(groupData.players) : (groupData.playerIds || []);
  if (!playerIds || playerIds.length === 0) {
    console.log(`[repair] No players in group ${groupId}`);
    return;
  }

  const playerMap = await getPlayerMap(db);

  const membersRef = groupRef.collection('members');
  const existingMembersSnap = await membersRef.get();
  const existingIds = new Set(existingMembersSnap.docs.map(d => d.id));

  const batch = db.batch();
  let ops = 0;

  for (const pid of playerIds) {
    const memberDocRef = membersRef.doc(pid);
    const player = playerMap.get(pid) || {};

    const displayName = (groupData.players && groupData.players[pid] && groupData.players[pid].displayName) || player.displayName || null;
    const photoURL = player.photoURL || null;

    const upsertData = {};
    if (displayName !== null) upsertData.displayName = displayName;
    if (photoURL !== null) upsertData.photoURL = photoURL;

    // always merge + delete deprecated fields via field transforms
    batch.set(memberDocRef, upsertData, { merge: true });
    // delete deprecated fields safely
    batch.update(memberDocRef, {
      email: admin.firestore.FieldValue.delete(),
      lastActivity: admin.firestore.FieldValue.delete(),
      role: admin.firestore.FieldValue.delete(),
    });
    ops += 2;

    // Firestore batch limit safety
    if (ops >= 400) {
      await batch.commit();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  console.log(`[repair] Completed repair for group ${groupId} (players: ${playerIds.length}).`);
}

(async () => {
  const groupId = process.argv[2];
  if (!groupId) {
    console.error('Usage: node scripts/repairMembers.cjs <GROUP_ID>');
    process.exit(1);
  }
  const db = await init();
  try {
    await repairGroupMembers(db, groupId);
    process.exit(0);
  } catch (e) {
    console.error('[repair] Error:', e);
    process.exit(1);
  }
})();


