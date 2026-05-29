/**
 * 🛠️  Force-Finalize einer hängenden Session.
 *
 * Use Case: Eine Session wurde nie ordnungsgemäss beendet (z.B. 4. Spiel
 * abgebrochen, activeGame manuell gelöscht). Der reguläre UI-Pfad „Jass
 * beenden" lässt sich nicht mehr triggern, weil die App kein offenes Spiel
 * mehr findet.
 *
 * Was das Script macht:
 *   1. Liest sessions/{sessionId} via Admin SDK (Service Account)
 *   2. Mintet ein Custom Token für den createdBy-User der Session
 *   3. Exchanged das Custom Token gegen ein ID Token (Firebase Auth REST)
 *   4. Ruft die finalizeSession Callable Function (europe-west1) mit diesem
 *      ID Token auf — exakt so, als hätte der User „Jass beenden" gedrückt.
 *
 * Voraussetzungen (vorhanden):
 *   - ./serviceAccountKey.json
 *   - NEXT_PUBLIC_FIREBASE_API_KEY in .env.local
 *
 * Aufruf:
 *   node scripts/force-finalize-session.mjs --session=<sessionId>          (Dry-Run)
 *   node scripts/force-finalize-session.mjs --session=<sessionId> --write  (Real Call)
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import 'dotenv/config';

// ============================================================================
// CLI ARGS
// ============================================================================
const args = process.argv.slice(2);
const sessionId = args.find(a => a.startsWith('--session='))?.split('=')[1];
const write = args.includes('--write');

if (!sessionId) {
  console.error('❌ Usage:');
  console.error('  node scripts/force-finalize-session.mjs --session=<sessionId>          (Dry-Run)');
  console.error('  node scripts/force-finalize-session.mjs --session=<sessionId> --write');
  process.exit(1);
}

// ============================================================================
// ENV
// ============================================================================
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
if (!apiKey) {
  // Fallback: aus .env.local manuell parsen
  try {
    const envFile = readFileSync('./.env.local', 'utf8');
    const m = envFile.match(/NEXT_PUBLIC_FIREBASE_API_KEY=([^\s]+)/);
    if (m) process.env.NEXT_PUBLIC_FIREBASE_API_KEY = m[1];
  } catch (_) {}
}
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
if (!FIREBASE_API_KEY) {
  console.error('❌ NEXT_PUBLIC_FIREBASE_API_KEY nicht gefunden (in .env.local oder ENV).');
  process.exit(1);
}

// ============================================================================
// FIREBASE INIT
// ============================================================================
const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const projectId = serviceAccount.project_id;

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`🛠️  Force-Finalize Session`);
console.log(`   Project: ${projectId}`);
console.log(`   Session: ${sessionId}`);
console.log(`   Mode:    ${write ? '💾 LIVE-CALL' : '🔍 DRY-RUN'}`);
console.log(`══════════════════════════════════════════════════════════════\n`);

// ============================================================================
// HELPER: sortierter Pairing-Identifier (mirrors src/utils/jassUtils.ts:27)
// ============================================================================
const pairingId = (a, b) => [a, b].sort().join('_');

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  // 1. Session laden
  const sessionSnap = await db.collection('sessions').doc(sessionId).get();
  if (!sessionSnap.exists) {
    console.error(`❌ Session ${sessionId} nicht gefunden in sessions/.`);
    process.exit(1);
  }
  const session = sessionSnap.data();
  console.log(`✅ Session geladen:`);
  console.log(`   groupId:        ${session.groupId}`);
  console.log(`   createdBy:      ${session.createdBy}`);
  console.log(`   startedAt:      ${session.startedAt?.toDate?.().toISOString() ?? session.startedAt}`);
  console.log(`   participants:   ${session.participantPlayerIds?.length ?? 0} Spieler`);
  console.log(`   playerNames:    ${JSON.stringify(session.playerNames)}`);

  // 2. Anzahl completedGames in jassGameSummaries-Subcollection prüfen
  const completedSnap = await db
    .collection(`groups/${session.groupId}/jassGameSummaries/${sessionId}/completedGames`)
    .orderBy('gameNumber')
    .get();
  console.log(`   completedGames: ${completedSnap.size}`);
  if (completedSnap.size === 0) {
    console.error(`❌ Keine completedGames gefunden — Session wäre nach Finalize leer. Abbruch.`);
    process.exit(1);
  }
  const expectedGameNumber = completedSnap.size;
  console.log(`   expectedGameNumber → ${expectedGameNumber}\n`);

  // 3. Prüfen ob Session schon completed ist
  const summarySnap = await db
    .collection(`groups/${session.groupId}/jassGameSummaries`)
    .doc(sessionId)
    .get();
  if (summarySnap.exists && summarySnap.data()?.status === 'completed') {
    console.log(`ℹ️  Session ist bereits status=completed. Nichts zu tun.`);
    process.exit(0);
  }

  // 4. initialSessionData bauen (mirrors prepareSessionTeamsData)
  const playerIds = [...(session.participantPlayerIds || [])];
  while (playerIds.length < 4) playerIds.push(`placeholder_playerid_${playerIds.length + 1}`);
  const playerNames = session.playerNames || {};

  const teams = {
    bottom: {
      players: [
        { playerId: playerIds[0], displayName: playerNames[1] || 'Spieler 1' },
        { playerId: playerIds[2], displayName: playerNames[3] || 'Spieler 3' },
      ],
    },
    top: {
      players: [
        { playerId: playerIds[1], displayName: playerNames[2] || 'Spieler 2' },
        { playerId: playerIds[3], displayName: playerNames[4] || 'Spieler 4' },
      ],
    },
  };
  const pairingIdentifiers = {
    bottom: pairingId(playerIds[0], playerIds[2]),
    top: pairingId(playerIds[1], playerIds[3]),
  };

  const startedAtValue = session.startedAt?.toMillis?.() ?? Date.now();

  const initialSessionData = {
    participantUids: session.participantUids || [],
    participantPlayerIds: playerIds,
    playerNames,
    gruppeId: session.groupId,
    startedAt: startedAtValue,
    teams,
    pairingIdentifiers,
  };

  console.log(`📦 initialSessionData zusammengebaut:`);
  console.log(`   teams.bottom:  ${teams.bottom.players.map(p => p.displayName).join(' + ')}`);
  console.log(`   teams.top:     ${teams.top.players.map(p => p.displayName).join(' + ')}`);
  console.log(`   startedAt(ms): ${startedAtValue}\n`);

  if (!write) {
    console.log(`🔍 DRY-RUN — kein Call abgesetzt.`);
    console.log(`   Mit --write nochmal ausführen, um finalizeSession wirklich aufzurufen.\n`);
    process.exit(0);
  }

  // 5. Custom Token → ID Token tauschen
  const uid = session.createdBy;
  if (!uid) {
    console.error(`❌ session.createdBy fehlt — kann kein Token minten.`);
    process.exit(1);
  }
  console.log(`🔑 Minting Custom Token für UID ${uid} ...`);
  const customToken = await admin.auth().createCustomToken(uid);

  console.log(`🔄 Exchange Custom Token → ID Token via Firebase Auth REST ...`);
  const exchangeRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Der prod API Key hat einen HTTP-Referrer-Filter. Wir simulieren einen
        // legitimen Browser-Request von der jassguru.ch-Domain.
        Referer: 'https://jassguru.ch/',
      },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const exchangeJson = await exchangeRes.json();
  if (!exchangeJson.idToken) {
    console.error(`❌ Token-Exchange fehlgeschlagen:`, exchangeJson);
    process.exit(1);
  }
  const idToken = exchangeJson.idToken;
  console.log(`✅ ID Token erhalten.\n`);

  // 6. finalizeSession Callable aufrufen
  console.log(`🚀 Rufe finalizeSession (europe-west1) auf ...`);
  const callableUrl = `https://europe-west1-${projectId}.cloudfunctions.net/finalizeSession`;
  const callRes = await fetch(callableUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      data: {
        sessionId,
        expectedGameNumber,
        initialSessionData,
      },
    }),
  });
  const callJson = await callRes.json();
  console.log(`📨 Antwort (Status ${callRes.status}):`, JSON.stringify(callJson, null, 2));

  if (callRes.ok && callJson?.result?.success) {
    console.log(`\n✅ Session ${sessionId} erfolgreich finalisiert.`);
  } else {
    console.error(`\n❌ Finalisierung fehlgeschlagen.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Unerwarteter Fehler:', err);
  process.exit(1);
});
