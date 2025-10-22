import * as admin from 'firebase-admin';

/**
 * Admin Migration (Dry-Run möglich)
 * - Scannt tournaments/*/games/*
 * - Ersetzt playerDetails[].playerId (UID -> players/{id})
 * - Ergänzt participantPlayerIds mit Player-Doc-IDs
 * - DRY_RUN=1 führt nur Analyse durch
 */

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function buildUidToPlayerIdMap(): Promise<Map<string, string>> {
  const snap = await db.collection('players').get();
  const map = new Map<string, string>();
  snap.forEach(d => {
    const data = d.data() as any;
    const uid = data?.uid || data?.authUid;
    if (uid && typeof uid === 'string') map.set(uid, d.id);
  });
  return map;
}

async function run() {
  const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const uidMap = await buildUidToPlayerIdMap();
  console.log(`[migrate-admin] uid->playerId loaded: ${uidMap.size}`);

  const gamesSnap = await db.collectionGroup('games').get();
  let checked = 0;
  let needsUpdate = 0;
  let updated = 0;
  const examples: any[] = [];

  let batch = db.batch();
  let batchCount = 0;

  for (const gameDoc of gamesSnap.docs) {
    checked++;
    const data = gameDoc.data() as any;
    const playerDetails = Array.isArray(data?.playerDetails) ? data.playerDetails : [];
    const participantPlayerIds = Array.isArray(data?.participantPlayerIds) ? data.participantPlayerIds : [];
    if (playerDetails.length === 0) continue;

    let changed = false;
    const newPlayerDetails = playerDetails.map((pd: any) => {
      const current = pd?.playerId;
      if (!current || typeof current !== 'string') return pd;
      if (uidMap.has(current)) {
        const newId = uidMap.get(current)!;
        if (newId !== current) {
          changed = true;
          return { ...pd, playerId: newId };
        }
      }
      return pd;
    });

    let newParticipant = participantPlayerIds.slice();
    newPlayerDetails.forEach((pd: any) => {
      const pid = pd?.playerId;
      if (pid && typeof pid === 'string' && !newParticipant.includes(pid)) {
        changed = true;
        newParticipant.push(pid);
      }
    });

    if (!changed) continue;
    needsUpdate++;
    if (examples.length < 5) {
      examples.push({ path: gameDoc.ref.path, before: { playerDetails, participantPlayerIds }, after: { playerDetails: newPlayerDetails, participantPlayerIds: newParticipant } });
    }

    if (!DRY_RUN) {
      batch.update(gameDoc.ref, {
        playerDetails: newPlayerDetails,
        participantPlayerIds: Array.from(new Set(newParticipant))
      });
      batchCount++;
      if (batchCount >= 400) {
        await batch.commit();
        updated += batchCount;
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
    updated += batchCount;
  }

  console.log(`[migrate-admin] Checked: ${checked}, NeedsUpdate: ${needsUpdate}, ${DRY_RUN ? 'Dry-Run' : 'Updated: ' + updated}`);
  if (examples.length > 0) {
    console.log(`[migrate-admin] Examples:`);
    examples.forEach((ex, i) => console.log(`#${i+1}`, JSON.stringify(ex, null, 2)));
  }
}

run().catch(err => {
  console.error('[migrate-admin] Error:', err);
  process.exit(1);
});


