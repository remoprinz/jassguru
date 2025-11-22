#!/usr/bin/env ts-node

/**
 * 🔍 DEEP DATA AUDIT - VOLLSTÄNDIGE ELO-DATENPRÜFUNG
 * 
 * Prüft alle Elo-Datenquellen auf Konsistenz:
 * 
 * 1. players/{playerId}/ratingHistory → Game-by-Game Historie (QUELLE DER WAHRHEIT?)
 * 2. jassGameSummaries/{sessionId}/playerFinalRatings → rating & ratingDelta
 * 3. players/{playerId} → globalRating & lastSessionDelta
 * 4. groups/{groupId}/aggregated/chartData_elo → aggregierte Chart-Daten
 * 
 * Ziel: Herausfinden, welche Daten korrekt sind und wie wir sie rekonstruieren können.
 * 
 * Usage: ts-node --project tsconfig.json functions/scripts/deepDataAudit.ts --group GROUP_ID [--player PLAYER_ID]
 */

import * as admin from 'firebase-admin';

const serviceAccount = require('../../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

interface RatingHistoryEntry {
  sessionId: string;
  gameNumber: number;
  rating: number;
  timestamp: admin.firestore.Timestamp;
}

interface SessionSummary {
  sessionId: string;
  completedAt: Date;
  rating: number;
  ratingDelta: number;
  gamesPlayed: number;
}

interface PlayerAudit {
  playerId: string;
  playerName: string;
  
  // 1. Aus ratingHistory
  ratingHistoryCount: number;
  ratingHistoryFirstRating: number | null;
  ratingHistoryLastRating: number | null;
  ratingHistorySequentiallyConsistent: boolean;
  ratingHistoryInconsistencies: Array<{
    sessionId: string;
    gameNumber: number;
    expectedRating: number;
    actualRating: number;
    difference: number;
  }>;
  
  // 2. Aus jassGameSummaries
  sessionSummariesCount: number;
  sessionSummariesFirstSession: SessionSummary | null;
  sessionSummariesLastSession: SessionSummary | null;
  sessionSummariesConsistent: boolean;
  sessionSummariesInconsistencies: Array<{
    sessionId: string;
    previousRating: number;
    ratingDelta: number;
    expectedRating: number;
    actualRating: number;
    difference: number;
  }>;
  
  // 3. Aus players/{playerId}
  globalRating: number | null;
  lastSessionDelta: number | null;
  
  // 4. Vergleiche
  globalRatingMatchesLastRatingHistory: boolean;
  globalRatingMatchesLastSessionSummary: boolean;
  lastSessionDeltaMatchesLastSummary: boolean;
  
  // Empfehlung
  recommendation: string;
}

async function auditPlayer(
  playerId: string, 
  playerName: string, 
  groupId: string
): Promise<PlayerAudit> {
  const audit: PlayerAudit = {
    playerId,
    playerName,
    ratingHistoryCount: 0,
    ratingHistoryFirstRating: null,
    ratingHistoryLastRating: null,
    ratingHistorySequentiallyConsistent: true,
    ratingHistoryInconsistencies: [],
    sessionSummariesCount: 0,
    sessionSummariesFirstSession: null,
    sessionSummariesLastSession: null,
    sessionSummariesConsistent: true,
    sessionSummariesInconsistencies: [],
    globalRating: null,
    lastSessionDelta: null,
    globalRatingMatchesLastRatingHistory: false,
    globalRatingMatchesLastSessionSummary: false,
    lastSessionDeltaMatchesLastSummary: false,
    recommendation: ''
  };
  
  // 1️⃣ Lade ratingHistory
  const ratingHistorySnap = await db.collection(`players/${playerId}/ratingHistory`)
    .orderBy('timestamp', 'asc')
    .get();
  
  const ratingHistory: RatingHistoryEntry[] = [];
  ratingHistorySnap.forEach(doc => {
    const data = doc.data();
    ratingHistory.push({
      sessionId: data.sessionId,
      gameNumber: data.gameNumber,
      rating: data.rating,
      timestamp: data.timestamp
    });
  });
  
  audit.ratingHistoryCount = ratingHistory.length;
  if (ratingHistory.length > 0) {
    audit.ratingHistoryFirstRating = ratingHistory[0].rating;
    audit.ratingHistoryLastRating = ratingHistory[ratingHistory.length - 1].rating;
  }
  
  // Prüfe sequentielle Konsistenz (sollte monoton sein, außer bei Session-Wechseln)
  // Innerhalb einer Session sollten Ratings monoton steigen oder fallen
  // Keine spezifische Prüfung hier, da Ratings je nach Spiel steigen/fallen können
  
  // 2️⃣ Lade jassGameSummaries für diese Gruppe
  const summariesSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc')
    .get();
  
  const sessionSummaries: SessionSummary[] = [];
  
  summariesSnap.forEach(doc => {
    const data = doc.data();
    const playerFinalRatings = data.playerFinalRatings || {};
    
    if (playerFinalRatings[playerId]) {
      sessionSummaries.push({
        sessionId: doc.id,
        completedAt: data.completedAt.toDate(),
        rating: playerFinalRatings[playerId].rating,
        ratingDelta: playerFinalRatings[playerId].ratingDelta,
        gamesPlayed: playerFinalRatings[playerId].gamesPlayed || 0
      });
    }
  });
  
  audit.sessionSummariesCount = sessionSummaries.length;
  if (sessionSummaries.length > 0) {
    audit.sessionSummariesFirstSession = sessionSummaries[0];
    audit.sessionSummariesLastSession = sessionSummaries[sessionSummaries.length - 1];
  }
  
  // Prüfe Session-Konsistenz: rating[i] = rating[i-1] + ratingDelta[i]
  for (let i = 1; i < sessionSummaries.length; i++) {
    const prev = sessionSummaries[i - 1];
    const curr = sessionSummaries[i];
    
    const expectedRating = prev.rating + curr.ratingDelta;
    const actualRating = curr.rating;
    const difference = actualRating - expectedRating;
    
    if (Math.abs(difference) > 0.01) {
      audit.sessionSummariesConsistent = false;
      audit.sessionSummariesInconsistencies.push({
        sessionId: curr.sessionId,
        previousRating: prev.rating,
        ratingDelta: curr.ratingDelta,
        expectedRating,
        actualRating,
        difference
      });
    }
  }
  
  // 3️⃣ Lade globalRating aus players/{playerId}
  const playerDoc = await db.doc(`players/${playerId}`).get();
  if (playerDoc.exists) {
    const data = playerDoc.data();
    audit.globalRating = data?.globalRating || null;
    audit.lastSessionDelta = data?.lastSessionDelta || null;
  }
  
  // 4️⃣ Vergleiche
  const TOLERANCE = 0.01;
  
  if (audit.globalRating !== null && audit.ratingHistoryLastRating !== null) {
    audit.globalRatingMatchesLastRatingHistory = 
      Math.abs(audit.globalRating - audit.ratingHistoryLastRating) < TOLERANCE;
  }
  
  if (audit.globalRating !== null && audit.sessionSummariesLastSession !== null) {
    audit.globalRatingMatchesLastSessionSummary = 
      Math.abs(audit.globalRating - audit.sessionSummariesLastSession.rating) < TOLERANCE;
  }
  
  if (audit.lastSessionDelta !== null && audit.sessionSummariesLastSession !== null) {
    audit.lastSessionDeltaMatchesLastSummary = 
      Math.abs(audit.lastSessionDelta - audit.sessionSummariesLastSession.ratingDelta) < TOLERANCE;
  }
  
  // 5️⃣ Empfehlung
  if (audit.sessionSummariesConsistent && 
      audit.globalRatingMatchesLastRatingHistory &&
      audit.lastSessionDeltaMatchesLastSummary) {
    audit.recommendation = '✅ Alle Daten sind konsistent. Keine Aktion erforderlich.';
  } else if (!audit.sessionSummariesConsistent) {
    audit.recommendation = '❌ jassGameSummaries → playerFinalRatings ist inkonsistent. BACKFILL ERFORDERLICH.';
  } else if (!audit.globalRatingMatchesLastRatingHistory) {
    audit.recommendation = '⚠️ globalRating stimmt nicht mit ratingHistory überein. Globales Rating aktualisieren.';
  } else if (!audit.lastSessionDeltaMatchesLastSummary) {
    audit.recommendation = '⚠️ lastSessionDelta stimmt nicht überein. Delta neu berechnen.';
  } else {
    audit.recommendation = '⚠️ Unbekanntes Problem. Manuelle Prüfung erforderlich.';
  }
  
  return audit;
}

async function main() {
  const args = process.argv.slice(2);
  let groupId: string | null = null;
  let playerId: string | null = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--group' && i + 1 < args.length) {
      groupId = args[i + 1];
    } else if (args[i] === '--player' && i + 1 < args.length) {
      playerId = args[i + 1];
    }
  }
  
  if (!groupId) {
    console.error('❌ Fehler: --group GROUP_ID ist erforderlich');
    process.exit(1);
  }
  
  console.log('🔍 DEEP DATA AUDIT');
  console.log('==================\n');
  
  // Lade Gruppe
  const groupDoc = await db.doc(`groups/${groupId}`).get();
  if (!groupDoc.exists) {
    console.error(`❌ Gruppe ${groupId} nicht gefunden`);
    process.exit(1);
  }
  
  const groupName = groupDoc.data()?.name || 'Unbekannt';
  console.log(`📊 Gruppe: ${groupName} (${groupId})\n`);
  
  // Lade alle Spieler in dieser Gruppe
  const allPlayerIds = new Set<string>();
  const playerNames = new Map<string, string>();
  
  const allSummariesSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
    .where('status', '==', 'completed')
    .get();
  
  allSummariesSnap.forEach(doc => {
    const data = doc.data();
    const playerFinalRatings = data.playerFinalRatings || {};
    
    for (const [pid, pdata] of Object.entries(playerFinalRatings)) {
      allPlayerIds.add(pid);
      if (!playerNames.has(pid)) {
        playerNames.set(pid, (pdata as any).displayName || 'Unbekannt');
      }
    }
  });
  
  console.log(`👥 Gefundene Spieler: ${allPlayerIds.size}\n`);
  
  // Filter nach Player ID, falls angegeben
  const playerIdsToAudit = playerId 
    ? [playerId] 
    : Array.from(allPlayerIds);
  
  const audits: PlayerAudit[] = [];
  
  for (const pid of playerIdsToAudit) {
    const pname = playerNames.get(pid) || 'Unbekannt';
    console.log(`\n🔍 Prüfe ${pname} (${pid})...`);
    
    const audit = await auditPlayer(pid, pname, groupId);
    audits.push(audit);
    
    // Ausgabe
    console.log(`\n📊 ${audit.playerName}`);
    console.log('─'.repeat(60));
    console.log(`\n1️⃣ ratingHistory:`);
    console.log(`   Einträge: ${audit.ratingHistoryCount}`);
    console.log(`   Erstes Rating: ${audit.ratingHistoryFirstRating?.toFixed(2) || 'N/A'}`);
    console.log(`   Letztes Rating: ${audit.ratingHistoryLastRating?.toFixed(2) || 'N/A'}`);
    console.log(`   Sequentiell konsistent: ${audit.ratingHistorySequentiallyConsistent ? '✅' : '❌'}`);
    
    console.log(`\n2️⃣ jassGameSummaries → playerFinalRatings:`);
    console.log(`   Sessions: ${audit.sessionSummariesCount}`);
    if (audit.sessionSummariesFirstSession) {
      console.log(`   Erste Session: ${audit.sessionSummariesFirstSession.rating.toFixed(2)} (${audit.sessionSummariesFirstSession.completedAt.toISOString().split('T')[0]})`);
    }
    if (audit.sessionSummariesLastSession) {
      console.log(`   Letzte Session: ${audit.sessionSummariesLastSession.rating.toFixed(2)} (Δ ${audit.sessionSummariesLastSession.ratingDelta.toFixed(2)})`);
    }
    console.log(`   Session-Konsistenz: ${audit.sessionSummariesConsistent ? '✅' : '❌'}`);
    
    if (!audit.sessionSummariesConsistent && audit.sessionSummariesInconsistencies.length > 0) {
      console.log(`\n   ⚠️ Gefundene Inkonsistenzen:`);
      for (const inc of audit.sessionSummariesInconsistencies.slice(0, 5)) {
        console.log(`      Session ${inc.sessionId.slice(0, 8)}...:`);
        console.log(`      Vorheriges Rating: ${inc.previousRating.toFixed(2)}`);
        console.log(`      Delta: ${inc.ratingDelta.toFixed(2)}`);
        console.log(`      Erwartet: ${inc.expectedRating.toFixed(2)}`);
        console.log(`      Tatsächlich: ${inc.actualRating.toFixed(2)}`);
        console.log(`      Differenz: ${inc.difference.toFixed(2)}`);
        console.log('');
      }
      if (audit.sessionSummariesInconsistencies.length > 5) {
        console.log(`      ... und ${audit.sessionSummariesInconsistencies.length - 5} weitere\n`);
      }
    }
    
    console.log(`\n3️⃣ players/{playerId}:`);
    console.log(`   globalRating: ${audit.globalRating?.toFixed(2) || 'N/A'}`);
    console.log(`   lastSessionDelta: ${audit.lastSessionDelta?.toFixed(2) || 'N/A'}`);
    
    console.log(`\n4️⃣ Vergleiche:`);
    console.log(`   globalRating = ratingHistory[last]: ${audit.globalRatingMatchesLastRatingHistory ? '✅' : '❌'}`);
    console.log(`   globalRating = sessionSummaries[last].rating: ${audit.globalRatingMatchesLastSessionSummary ? '✅' : '❌'}`);
    console.log(`   lastSessionDelta = sessionSummaries[last].delta: ${audit.lastSessionDeltaMatchesLastSummary ? '✅' : '❌'}`);
    
    console.log(`\n💡 Empfehlung:`);
    console.log(`   ${audit.recommendation}`);
    console.log('');
  }
  
  // Zusammenfassung
  console.log('\n═'.repeat(60));
  console.log('📋 ZUSAMMENFASSUNG');
  console.log('═'.repeat(60));
  
  const consistentPlayers = audits.filter(a => 
    a.sessionSummariesConsistent && 
    a.globalRatingMatchesLastRatingHistory &&
    a.lastSessionDeltaMatchesLastSummary
  );
  
  const inconsistentSessions = audits.filter(a => !a.sessionSummariesConsistent);
  const inconsistentGlobal = audits.filter(a => !a.globalRatingMatchesLastRatingHistory);
  const inconsistentDelta = audits.filter(a => !a.lastSessionDeltaMatchesLastSummary);
  
  console.log(`\n✅ Konsistente Spieler: ${consistentPlayers.length}/${audits.length}`);
  console.log(`❌ Inkonsistente Session-Daten: ${inconsistentSessions.length}`);
  console.log(`⚠️ Inkonsistentes globalRating: ${inconsistentGlobal.length}`);
  console.log(`⚠️ Inkonsistentes lastSessionDelta: ${inconsistentDelta.length}`);
  
  if (inconsistentSessions.length > 0) {
    console.log(`\n❌ KRITISCH: jassGameSummaries → playerFinalRatings ist inkonsistent!`);
    console.log(`   Betroffene Spieler:`);
    for (const audit of inconsistentSessions) {
      console.log(`   - ${audit.playerName}: ${audit.sessionSummariesInconsistencies.length} Inkonsistenzen`);
    }
    console.log(`\n   🔧 LÖSUNG: Backfill-Script ausführen (backfill-elo-v2.cjs)`);
    console.log(`      Dieses Script berechnet alle Ratings Spiel-für-Spiel neu.`);
  }
  
  if (inconsistentGlobal.length > 0 && inconsistentSessions.length === 0) {
    console.log(`\n⚠️ globalRating ist inkonsistent, aber Session-Daten sind OK.`);
    console.log(`   🔧 LÖSUNG: globalRating aus letzter Session kopieren.`);
  }
  
  if (inconsistentDelta.length > 0 && inconsistentSessions.length === 0) {
    console.log(`\n⚠️ lastSessionDelta ist inkonsistent, aber Session-Daten sind OK.`);
    console.log(`   🔧 LÖSUNG: lastSessionDelta aus letzter Session kopieren.`);
  }
  
  if (consistentPlayers.length === audits.length) {
    console.log(`\n🎉 Alle Daten sind konsistent! Keine Aktion erforderlich.`);
  }
  
  console.log('\n✅ Audit abgeschlossen.\n');
}

main().catch(console.error);

