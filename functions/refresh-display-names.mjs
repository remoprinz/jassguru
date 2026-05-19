import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DRY_RUN = process.argv.includes('--apply') ? false : true;

const sa = JSON.parse(readFileSync('/Users/remoprinz/Documents/Jassguru/jasstafel/serviceAccountKey.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

console.log(DRY_RUN ? '🟡 DRY RUN — nichts wird geschrieben. Mit --apply ausführen.' : '🔴 APPLY MODE — Schreibvorgänge aktiv.');

// 1. Aktuelle Namen pro playerId laden
const playersSnap = await db.collection('players').get();
const nameById = new Map();
playersSnap.forEach(d => {
  const n = d.data().displayName;
  if (n) nameById.set(d.id, n);
});
console.log(`Geladen: ${nameById.size} aktuelle Player-Namen.\n`);

let totalChanges = 0;
const writes = [];
function queueWrite(ref, data, label) {
  writes.push({ ref, data, label });
  totalChanges++;
}

// Helper: vergleicht einen Snapshot-Namen gegen current und liefert true wenn stale
function isStale(id, snapshotName) {
  if (!id || !nameById.has(id)) return false;
  const cur = nameById.get(id);
  return snapshotName !== cur;
}

// 2. playerComputedStats: partner/opponentAggregates
console.log('--- playerComputedStats ---');
const pcsSnap = await db.collection('playerComputedStats').get();
for (const doc of pcsSnap.docs) {
  const data = doc.data();
  let changed = false;
  const newPartner = (data.partnerAggregates || []).map(p => {
    if (isStale(p.partnerId, p.partnerDisplayName)) {
      changed = true;
      return { ...p, partnerDisplayName: nameById.get(p.partnerId) };
    }
    return p;
  });
  const newOpponent = (data.opponentAggregates || []).map(o => {
    if (isStale(o.opponentId, o.opponentDisplayName)) {
      changed = true;
      return { ...o, opponentDisplayName: nameById.get(o.opponentId) };
    }
    return o;
  });
  if (changed) {
    queueWrite(doc.ref, { partnerAggregates: newPartner, opponentAggregates: newOpponent }, `pcs/${doc.id}`);
  }
}
console.log(`  → ${writes.length} stats-docs zu aktualisieren.`);

// 3. groups/{gid} → players-Map UND Subcollections
console.log('\n--- groups (top-level players map, members, jassGameSummaries, aggregated, stats) ---');
const groupsSnap = await db.collection('groups').get();
for (const g of groupsSnap.docs) {
  const gdata = g.data();
  // groups/{gid}.players[playerId].displayName
  if (gdata.players && typeof gdata.players === 'object') {
    const newPlayers = { ...gdata.players };
    let anyChange = false;
    for (const pid of Object.keys(newPlayers)) {
      const entry = newPlayers[pid];
      if (entry && entry.displayName && isStale(pid, entry.displayName)) {
        newPlayers[pid] = { ...entry, displayName: nameById.get(pid) };
        anyChange = true;
      }
    }
    if (anyChange) queueWrite(g.ref, { players: newPlayers }, `groups/${g.id}.players`);
  }
  
  // groups/{gid}/members/{pid}.displayName
  const membersSnap = await db.collection('groups').doc(g.id).collection('members').get();
  for (const m of membersSnap.docs) {
    if (isStale(m.id, m.data().displayName)) {
      queueWrite(m.ref, { displayName: nameById.get(m.id) }, `groups/${g.id}/members/${m.id}`);
    }
  }
  
  // groups/{gid}/jassGameSummaries/{sid}
  const summariesSnap = await db.collection('groups').doc(g.id).collection('jassGameSummaries').get();
  for (const s of summariesSnap.docs) {
    const sdata = s.data();
    let changed = false;
    const patch = {};
    
    // playerNames map: Keys können playerIds ODER numerische Positionen sein.
    // Für Positions-Keys mappen wir über die Teilnehmer-IDs (aus participantPlayerIds
    // oder teams.players) und ersetzen den Snapshot-Namen mit dem aktuellen.
    if (sdata.playerNames && typeof sdata.playerNames === 'object') {
      const newNames = { ...sdata.playerNames };
      let pnChanged = false;
      // Erst: direkte playerId-Keys
      for (const key of Object.keys(newNames)) {
        if (typeof newNames[key] === 'string' && isStale(key, newNames[key])) {
          newNames[key] = nameById.get(key);
          pnChanged = true;
        }
      }
      // Dann: Positions-Keys. Sammle alle Participant-IDs aus diversen Quellen.
      const participantIds = new Set();
      (sdata.participantPlayerIds || []).forEach(id => id && participantIds.add(id));
      ['top','bottom'].forEach(side => {
        (sdata.teams?.[side]?.players || []).forEach(p => {
          const pid = p?.playerId || p?.userId;
          if (pid) participantIds.add(pid);
        });
      });
      // currentNames der Teilnehmer
      const currentNames = new Set();
      const idsByName = new Map(); // currentName → pid
      for (const pid of participantIds) {
        const cur = nameById.get(pid);
        if (cur) { currentNames.add(cur); idsByName.set(cur, pid); }
      }
      // Identifiziere stale Einträge (Wert matched keinen current name)
      for (const key of Object.keys(newNames)) {
        const val = newNames[key];
        if (typeof val !== 'string') continue;
        if (currentNames.has(val)) continue; // schon ok
        // val ist veralteter Name → finde den orphan-Participant
        // (current name nicht in map values)
        const usedValues = new Set(Object.values(newNames));
        const orphan = [...currentNames].find(n => !usedValues.has(n));
        if (orphan) {
          newNames[key] = orphan;
          pnChanged = true;
        }
      }
      if (pnChanged) { patch.playerNames = newNames; changed = true; }
    }
    
    // teams.{top,bottom}.players[].displayName
    if (sdata.teams) {
      const newTeams = JSON.parse(JSON.stringify(sdata.teams));
      let teamsChanged = false;
      for (const side of ['top', 'bottom']) {
        for (const p of newTeams[side]?.players || []) {
          const pid = p.playerId || p.userId;
          if (pid && p.displayName && isStale(pid, p.displayName)) {
            p.displayName = nameById.get(pid);
            teamsChanged = true;
          }
        }
      }
      if (teamsChanged) { patch.teams = newTeams; changed = true; }
    }
    
    // gameResults[].teams.*.players[].displayName
    if (Array.isArray(sdata.gameResults)) {
      const newGameResults = JSON.parse(JSON.stringify(sdata.gameResults));
      let grChanged = false;
      for (const gr of newGameResults) {
        for (const side of ['top', 'bottom']) {
          for (const p of gr.teams?.[side]?.players || []) {
            const pid = p.playerId || p.userId;
            if (pid && p.displayName && isStale(pid, p.displayName)) {
              p.displayName = nameById.get(pid);
              grChanged = true;
            }
          }
        }
        // gameResults[].playerNames (falls vorhanden)
        if (gr.playerNames) {
          for (const key of Object.keys(gr.playerNames)) {
            if (typeof gr.playerNames[key] === 'string' && isStale(key, gr.playerNames[key])) {
              gr.playerNames[key] = nameById.get(key);
              grChanged = true;
            }
          }
        }
      }
      if (grChanged) { patch.gameResults = newGameResults; changed = true; }
    }
    
    // Spielerspezifische Aggregate (falls vorhanden)
    if (sdata.players && typeof sdata.players === 'object') {
      const newP = { ...sdata.players };
      let pChanged = false;
      for (const pid of Object.keys(newP)) {
        const e = newP[pid];
        if (e && typeof e === 'object' && e.displayName && isStale(pid, e.displayName)) {
          newP[pid] = { ...e, displayName: nameById.get(pid) };
          pChanged = true;
        }
      }
      if (pChanged) { patch.players = newP; changed = true; }
    }
    
    if (changed) queueWrite(s.ref, patch, `groups/${g.id}/jassGameSummaries/${s.id}`);
  }
  
  // groups/{gid}/aggregated/*  — chart-Datasets mit .label und .displayName
  const aggSnap = await db.collection('groups').doc(g.id).collection('aggregated').get();
  for (const a of aggSnap.docs) {
    const adata = a.data();
    let changed = false;

    if (Array.isArray(adata.datasets)) {
      let dsChanged = false;
      const newDs = adata.datasets.map((ds, idx) => {
        const pid = ds?.playerId || ds?.userId;
        if (!pid || !nameById.has(pid)) return ds;
        const cur = nameById.get(pid);
        let mutated = ds;
        if (ds.label && ds.label !== cur) {
          mutated = { ...mutated, label: cur };
          dsChanged = true;
        }
        if (ds.displayName && ds.displayName !== cur) {
          mutated = { ...mutated, displayName: cur };
          dsChanged = true;
        }
        return mutated;
      });
      if (dsChanged) {
        queueWrite(a.ref, { datasets: newDs }, `groups/${g.id}/aggregated/${a.id}`);
        changed = true;
      }
    }
  }
  
  // groups/{gid}/stats/* — playerName-Felder & names-Array
  const statsColSnap = await db.collection('groups').doc(g.id).collection('stats').get();
  for (const st of statsColSnap.docs) {
    const sdata = st.data();
    const newData = JSON.parse(JSON.stringify(sdata));
    let changed = false;
    
    function walk(obj) {
      if (obj === null || obj === undefined) return;
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      if (typeof obj !== 'object') return;
      // Pattern: { playerId, playerName } und { playerIds:[a,b], names:[x,y] }
      if (obj.playerId && typeof obj.playerName === 'string') {
        if (isStale(obj.playerId, obj.playerName)) {
          obj.playerName = nameById.get(obj.playerId);
          changed = true;
        }
      }
      if (Array.isArray(obj.playerIds) && Array.isArray(obj.names)) {
        for (let i = 0; i < obj.playerIds.length; i++) {
          const pid = obj.playerIds[i];
          if (pid && obj.names[i] && isStale(pid, obj.names[i])) {
            obj.names[i] = nameById.get(pid);
            changed = true;
          }
        }
      }
      for (const k of Object.keys(obj)) walk(obj[k]);
    }
    walk(newData);
    if (changed) queueWrite(st.ref, newData, `groups/${g.id}/stats/${st.id}`);
  }
}

// 4. sessions/{sid}  (top-level)
console.log('\n--- sessions (top-level) ---');
const sessionsSnap = await db.collection('sessions').get();
for (const s of sessionsSnap.docs) {
  const sdata = s.data();
  const patch = {};
  let changed = false;
  
  if (sdata.playerNames && typeof sdata.playerNames === 'object') {
    const newNames = { ...sdata.playerNames };
    let pnChanged = false;
    for (const key of Object.keys(newNames)) {
      if (typeof newNames[key] === 'string' && isStale(key, newNames[key])) {
        newNames[key] = nameById.get(key);
        pnChanged = true;
      }
    }
    const participantIds = new Set();
    (sdata.participantPlayerIds || []).forEach(id => id && participantIds.add(id));
    ['top','bottom'].forEach(side => {
      (sdata.teams?.[side]?.players || []).forEach(p => {
        const pid = p?.playerId || p?.userId;
        if (pid) participantIds.add(pid);
      });
    });
    const currentNames = new Set();
    for (const pid of participantIds) {
      const cur = nameById.get(pid);
      if (cur) currentNames.add(cur);
    }
    for (const key of Object.keys(newNames)) {
      const val = newNames[key];
      if (typeof val !== 'string') continue;
      if (currentNames.has(val)) continue;
      const usedValues = new Set(Object.values(newNames));
      const orphan = [...currentNames].find(n => !usedValues.has(n));
      if (orphan) { newNames[key] = orphan; pnChanged = true; }
    }
    if (pnChanged) { patch.playerNames = newNames; changed = true; }
  }

  if (sdata.teams) {
    const newTeams = JSON.parse(JSON.stringify(sdata.teams));
    let teamsChanged = false;
    for (const side of ['top', 'bottom']) {
      for (const p of newTeams[side]?.players || []) {
        const pid = p.playerId || p.userId;
        if (pid && p.displayName && isStale(pid, p.displayName)) {
          p.displayName = nameById.get(pid);
          teamsChanged = true;
        }
      }
    }
    if (teamsChanged) { patch.teams = newTeams; changed = true; }
  }
  
  if (changed) queueWrite(s.ref, patch, `sessions/${s.id}`);
}

// 5. groupComputedStats — falls dort auch Snapshots vorkommen
console.log('\n--- groupComputedStats ---');
const gcsSnap = await db.collection('groupComputedStats').get();
for (const doc of gcsSnap.docs) {
  const data = doc.data();
  const newData = JSON.parse(JSON.stringify(data));
  let changed = false;
  function walk(obj) {
    if (obj === null || obj === undefined) return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    if (typeof obj !== 'object') return;
    if (obj.playerId && typeof obj.playerName === 'string') {
      if (isStale(obj.playerId, obj.playerName)) {
        obj.playerName = nameById.get(obj.playerId);
        changed = true;
      }
    }
    if (obj.partnerId && typeof obj.partnerDisplayName === 'string') {
      if (isStale(obj.partnerId, obj.partnerDisplayName)) {
        obj.partnerDisplayName = nameById.get(obj.partnerId);
        changed = true;
      }
    }
    if (obj.opponentId && typeof obj.opponentDisplayName === 'string') {
      if (isStale(obj.opponentId, obj.opponentDisplayName)) {
        obj.opponentDisplayName = nameById.get(obj.opponentId);
        changed = true;
      }
    }
    if (Array.isArray(obj.playerIds) && Array.isArray(obj.names)) {
      for (let i = 0; i < obj.playerIds.length; i++) {
        const pid = obj.playerIds[i];
        if (pid && obj.names[i] && isStale(pid, obj.names[i])) {
          obj.names[i] = nameById.get(pid);
          changed = true;
        }
      }
    }
    for (const k of Object.keys(obj)) walk(obj[k]);
  }
  walk(newData);
  if (changed) queueWrite(doc.ref, newData, `groupComputedStats/${doc.id}`);
}

// 6. players/{pid}/{partnerStats,opponentStats,groupStats,tournamentStats}
//    Diese Subcollection-Docs sind PRO-PLAYER-PRO-PARTNER/OPPONENT und enthalten denormalisierte Namen.
//    ProfileView liest diese direkt für die Partner-/Gegner-Listen.
console.log('\n--- players/{pid}/{partner,opponent,group,tournament}Stats ---');
for (const p of playersSnap.docs) {
  const pid = p.id;
  // partnerStats / opponentStats: Doc-ID = der ANDERE playerId, mit *.DisplayName
  for (const subname of ['partnerStats', 'opponentStats']) {
    const subSnap = await db.collection('players').doc(pid).collection(subname).get();
    for (const sub of subSnap.docs) {
      const otherPid = sub.id;
      const data = sub.data();
      const field = subname === 'partnerStats' ? 'partnerDisplayName' : 'opponentDisplayName';
      if (typeof data[field] === 'string' && isStale(otherPid, data[field])) {
        queueWrite(sub.ref, { [field]: nameById.get(otherPid) }, `players/${pid}/${subname}/${otherPid}`);
      }
    }
  }
  // groupStats / tournamentStats: enthalten ggf. playerName-Feld für den Owner-Player selbst
  for (const subname of ['groupStats', 'tournamentStats']) {
    const subSnap = await db.collection('players').doc(pid).collection(subname).get();
    for (const sub of subSnap.docs) {
      const data = sub.data();
      const patch = {};
      let changed = false;
      // Owner-Player playerName
      if (typeof data.playerName === 'string' && isStale(pid, data.playerName)) {
        patch.playerName = nameById.get(pid);
        changed = true;
      }
      // displayName (manchmal benannt)
      if (typeof data.displayName === 'string' && isStale(pid, data.displayName)) {
        patch.displayName = nameById.get(pid);
        changed = true;
      }
      if (changed) queueWrite(sub.ref, patch, `players/${pid}/${subname}/${sub.id}`);
    }
  }
}

// 7. activeGames/{aid}  + Subcollection rounds/{rid}
console.log('\n--- activeGames + rounds ---');
const agSnap = await db.collection('activeGames').get();
for (const ag of agSnap.docs) {
  const data = ag.data();
  const patch = {};
  let changed = false;

  // teams.{top,bottom}.players[].displayName
  if (data.teams) {
    const newTeams = JSON.parse(JSON.stringify(data.teams));
    let teamsChanged = false;
    for (const side of ['top','bottom']) {
      for (const p of newTeams[side]?.players || []) {
        const pid = p?.playerId || p?.userId;
        if (pid && p.displayName && isStale(pid, p.displayName)) {
          p.displayName = nameById.get(pid);
          teamsChanged = true;
        }
      }
    }
    if (teamsChanged) { patch.teams = newTeams; changed = true; }
  }

  // playerNames map (Positions-Keys)
  if (data.playerNames && typeof data.playerNames === 'object') {
    const newNames = { ...data.playerNames };
    let pnChanged = false;
    for (const key of Object.keys(newNames)) {
      if (typeof newNames[key] === 'string' && isStale(key, newNames[key])) {
        newNames[key] = nameById.get(key);
        pnChanged = true;
      }
    }
    const participantIds = new Set();
    (data.participantPlayerIds || []).forEach(id => id && participantIds.add(id));
    ['top','bottom'].forEach(side => {
      (data.teams?.[side]?.players || []).forEach(p => {
        const pid = p?.playerId || p?.userId;
        if (pid) participantIds.add(pid);
      });
    });
    const currentNames = new Set();
    for (const pid of participantIds) {
      const cur = nameById.get(pid);
      if (cur) currentNames.add(cur);
    }
    for (const key of Object.keys(newNames)) {
      const val = newNames[key];
      if (typeof val !== 'string') continue;
      if (currentNames.has(val)) continue;
      const used = new Set(Object.values(newNames));
      const orphan = [...currentNames].find(n => !used.has(n));
      if (orphan) { newNames[key] = orphan; pnChanged = true; }
    }
    if (pnChanged) { patch.playerNames = newNames; changed = true; }
  }

  if (changed) queueWrite(ag.ref, patch, `activeGames/${ag.id}`);

  // rounds-Subcollection: startingPlayerName etc. — Position → Name aus Parent-Map
  // Bauen Position→aktuellerName aus dem (ggf. gepatchten) parent activeGame.
  const positionToCurrentName = {};
  const parentPlayerNames = (changed && patch.playerNames) ? patch.playerNames : (data.playerNames || {});
  for (const pos of Object.keys(parentPlayerNames)) {
    if (typeof parentPlayerNames[pos] === 'string') {
      positionToCurrentName[pos] = parentPlayerNames[pos];
    }
  }

  const roundsSnap = await db.collection('activeGames').doc(ag.id).collection('rounds').get();
  for (const r of roundsSnap.docs) {
    const rd = r.data();
    const rpatch = {};
    // startingPlayer (number) → startingPlayerName
    if (typeof rd.startingPlayer === 'number' || typeof rd.startingPlayer === 'string') {
      const pos = String(rd.startingPlayer);
      const cur = positionToCurrentName[pos];
      if (cur && typeof rd.startingPlayerName === 'string' && rd.startingPlayerName !== cur) {
        rpatch.startingPlayerName = cur;
      }
    }
    // currentPlayer → currentPlayerName (falls vorhanden)
    if ((typeof rd.currentPlayer === 'number' || typeof rd.currentPlayer === 'string') && typeof rd.currentPlayerName === 'string') {
      const pos = String(rd.currentPlayer);
      const cur = positionToCurrentName[pos];
      if (cur && rd.currentPlayerName !== cur) {
        rpatch.currentPlayerName = cur;
      }
    }
    if (Object.keys(rpatch).length > 0) {
      queueWrite(r.ref, rpatch, `activeGames/${ag.id}/rounds/${r.id}`);
    }
  }
}

// Zusammenfassung
console.log(`\n=== Total zu aktualisierende Dokumente: ${writes.length} ===`);
writes.slice(0, 30).forEach(w => console.log(`  → ${w.label}`));
if (writes.length > 30) console.log(`  ... +${writes.length - 30} weitere`);

// Schreiben
if (!DRY_RUN && writes.length > 0) {
  console.log('\n⏳ Schreibe in Batches à 400...');
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) {
      batch.set(w.ref, w.data, { merge: true });
    }
    await batch.commit();
    console.log(`  ✓ Batch ${Math.floor(i/400)+1} (${Math.min(i+400, writes.length)}/${writes.length})`);
  }
  console.log('✅ Alle Updates committed.');
}

process.exit(0);
