import { initializeApp } from 'firebase/app';
import { getFirestore, collectionGroup, getDocs, writeBatch, doc, query, where } from 'firebase/firestore';
import { firebaseConfig } from '@/services/firebaseInit';

/**
 * Migration: Turnier-Passen-Dokumente auf moderne Spieler-IDs bringen.
 * - playerDetails[].playerId: UID -> players/{playerId}.id
 * - participantPlayerIds: sicherstellen, dass Player-Doc-IDs enthalten sind
 * - Dry-Run: nur zählen und Beispiele loggen
 *
 * Aufruf (ts-node / vite-node o.ä.):
 *   DRY_RUN=1 ts-node scripts/migrateTournamentGamesPlayerIds.ts
 *   ts-node scripts/migrateTournamentGamesPlayerIds.ts
 */

type PlayerDoc = { id: string; uid?: string; authUid?: string; displayName?: string };

async function buildUidToPlayerIdMap(db: ReturnType<typeof getFirestore>) {
  const snap = await getDocs(collectionGroup(db, 'players'));
  const map = new Map<string, string>();
  snap.forEach(d => {
    const data = d.data() as any;
    const uid = data?.uid || data?.authUid;
    if (uid && typeof uid === 'string') map.set(uid, d.id);
  });
  return map;
}

async function run() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

  const uidToPlayerId = await buildUidToPlayerIdMap(db);
  console.log(`[migrate] Mapping loaded: ${uidToPlayerId.size} uid->playerId entries`);

  // Alle Turnier-Passen: tournaments/*/games/*
  const gamesSnap = await getDocs(collectionGroup(db, 'games'));

  let checked = 0;
  let needsUpdate = 0;
  let updated = 0;
  const examples: any[] = [];

  let batch = writeBatch(db);
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
      if (uidToPlayerId.has(current)) {
        const newId = uidToPlayerId.get(current)!;
        if (newId !== current) {
          changed = true;
          return { ...pd, playerId: newId };
        }
      }
      return pd;
    });

    let newParticipantIds = participantPlayerIds.slice();
    // Ergänze fehlende Player-Doc-IDs
    playerDetails.forEach((pd: any) => {
      const current = pd?.playerId;
      if (current && uidToPlayerId.has(current)) {
        const pid = uidToPlayerId.get(current)!;
        if (!newParticipantIds.includes(pid)) {
          changed = true;
          newParticipantIds.push(pid);
        }
      }
    });

    if (!changed) continue;
    needsUpdate++;

    if (examples.length < 5) {
      examples.push({ path: gameDoc.ref.path, before: { playerDetails, participantPlayerIds }, after: { playerDetails: newPlayerDetails, participantPlayerIds: newParticipantIds } });
    }

    if (!DRY_RUN) {
      batch.update(gameDoc.ref, {
        playerDetails: newPlayerDetails,
        participantPlayerIds: Array.from(new Set(newParticipantIds))
      });
      batchCount++;
      if (batchCount >= 400) {
        await batch.commit();
        updated += batchCount;
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
    updated += batchCount;
  }

  console.log(`[migrate] Checked: ${checked}, NeedsUpdate: ${needsUpdate}, ${DRY_RUN ? 'Dry-Run' : 'Updated: ' + updated}`);
  if (examples.length > 0) {
    console.log(`[migrate] Examples:`);
    examples.forEach((ex, i) => {
      console.log(`#${i+1}`, JSON.stringify(ex, null, 2));
    });
  }
}

run().catch(e => {
  console.error('[migrate] Error:', e);
  process.exit(1);
});


