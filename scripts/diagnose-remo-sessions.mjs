#!/usr/bin/env node
/**
 * 🔍 REMO SESSION-DATEN DIAGNOSE
 * 
 * Lädt ALLE Sessions und analysiert Remo's Teilnahme
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Service Account initialisieren
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const PLAYER_ID = 'b16c1120111b7d9e7d733837'; // Remo's korrekte Player ID (= UID)

console.log('🔍 REMO SESSION-DATEN DIAGNOSE');
console.log('=' .repeat(80));
console.log(`📊 Gruppe: ${GROUP_ID}`);
console.log(`👤 Spieler: ${PLAYER_ID} (Remo)`);
console.log('=' .repeat(80));

/**
 * 🔧 Hilfsfunktion: Berechne Gesamtstriche
 */
function calculateTotalStriche(stricheRecord) {
  if (!stricheRecord) return 0;
  return (
    (stricheRecord.berg || 0) +
    (stricheRecord.sieg || 0) +
    (stricheRecord.matsch || 0) +
    (stricheRecord.schneider || 0) +
    (stricheRecord.kontermatsch || 0)
  );
}

/**
 * Analysiere alle Sessions
 */
async function analyzeSessions() {
  console.log('\n🎮 ANALYSIERE ALLE SESSIONS');
  console.log('-'.repeat(80));
  
  try {
    // Lade ALLE Sessions (ohne where-Filter, um Index-Problem zu vermeiden)
    const sessionsRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`);
    const sessionsSnap = await sessionsRef.get();
    
    console.log(`✅ Anzahl Sessions gesamt: ${sessionsSnap.size}\n`);
    
    if (sessionsSnap.size === 0) {
      console.log('❌ KEINE SESSIONS GEFUNDEN!');
      return;
    }
    
    // Filtere Sessions mit Remo
    let remoSessions = [];
    let allSessions = [];
    
    for (const sessionDoc of sessionsSnap.docs) {
      const session = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      allSessions.push({
        id: sessionId,
        status: session.status,
        gamesPlayed: session.gamesPlayed,
        startedAt: session.startedAt,
        participantPlayerIds: session.participantPlayerIds || []
      });
      
      // Prüfe ob Session completed ist
      if (session.status !== 'completed') {
        continue;
      }
      
      // Prüfe ob Remo teilgenommen hat (in participantPlayerIds)
      const participantIds = session.participantPlayerIds || [];
      if (!participantIds.includes(PLAYER_ID)) {
        continue;
      }
      
      // Remo ist in dieser Session!
      let sessionDate = 'UNKNOWN';
      let sessionTimestamp = 0;
      if (session.startedAt) {
        if (typeof session.startedAt.toMillis === 'function') {
          sessionTimestamp = session.startedAt.toMillis();
          sessionDate = new Date(sessionTimestamp).toISOString().split('T')[0];
        } else if (typeof session.startedAt === 'number') {
          sessionTimestamp = session.startedAt;
          sessionDate = new Date(sessionTimestamp).toISOString().split('T')[0];
        }
      }
      
      // Finde Remo's Team
      let remoTeam = null;
      if (session.teams?.top?.players?.some(p => p.playerId === PLAYER_ID)) {
        remoTeam = 'top';
      } else if (session.teams?.bottom?.players?.some(p => p.playerId === PLAYER_ID)) {
        remoTeam = 'bottom';
      }
      
      if (!remoTeam) {
        console.log(`   ⚠️ Session ${sessionId.slice(0,10)}...: Remo's Team nicht in teams-Struktur gefunden`);
        continue;
      }
      
      const opponentTeam = remoTeam === 'top' ? 'bottom' : 'top';
      
      // Berechne Striche-Differenz
      const ownStriche = calculateTotalStriche(session.finalStriche?.[remoTeam]);
      const opponentStriche = calculateTotalStriche(session.finalStriche?.[opponentTeam]);
      const stricheDiff = ownStriche - opponentStriche;
      
      // Berechne Wins/Losses
      let sessionWins = 0;
      let sessionLosses = 0;
      if (session.gameResults && Array.isArray(session.gameResults)) {
        session.gameResults.forEach(game => {
          if (game.winnerTeam === remoTeam) {
            sessionWins++;
          } else if (game.winnerTeam === opponentTeam) {
            sessionLosses++;
          }
        });
      }
      
      const ownPoints = session.finalScores?.[remoTeam] || 0;
      const opponentPoints = session.finalScores?.[opponentTeam] || 0;
      
      remoSessions.push({
        sessionId,
        date: sessionDate,
        timestamp: sessionTimestamp,
        gamesPlayed: session.gamesPlayed || 0,
        ownStriche,
        opponentStriche,
        stricheDiff,
        wins: sessionWins,
        losses: sessionLosses,
        ownPoints,
        opponentPoints,
        team: remoTeam,
        winnerTeamKey: session.winnerTeamKey
      });
    }
    
    // Sortiere nach Datum
    remoSessions.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log(`📊 STATISTIKEN:`);
    console.log(`   Gesamt Sessions in Gruppe: ${allSessions.length}`);
    console.log(`   Completed Sessions: ${allSessions.filter(s => s.status === 'completed').length}`);
    console.log(`   Sessions mit Remo: ${remoSessions.length}`);
    
    if (remoSessions.length === 0) {
      console.log('\n❌ REMO HAT AN KEINER SESSION TEILGENOMMEN!');
      console.log('   → Das erklärt warum playerRating fehlt!');
      
      // Zeige participantPlayerIds von ein paar Sessions
      console.log('\n📋 Beispiel-Sessions (participantPlayerIds):');
      allSessions.slice(0, 5).forEach((session, i) => {
        console.log(`   ${i + 1}. ${session.id.slice(0,10)}... | Status: ${session.status} | Games: ${session.gamesPlayed}`);
        console.log(`      ParticipantPlayerIds: [${session.participantPlayerIds.join(', ')}]`);
      });
      
      return;
    }
    
    // Berechne Gesamt-Statistiken
    const totalGames = remoSessions.reduce((sum, s) => sum + s.gamesPlayed, 0);
    const totalStricheDiff = remoSessions.reduce((sum, s) => sum + s.stricheDiff, 0);
    const totalWins = remoSessions.reduce((sum, s) => sum + s.wins, 0);
    const totalLosses = remoSessions.reduce((sum, s) => sum + s.losses, 0);
    const totalPoints = remoSessions.reduce((sum, s) => sum + s.ownPoints, 0);
    const totalOpponentPoints = remoSessions.reduce((sum, s) => sum + s.opponentPoints, 0);
    
    const sessionWins = remoSessions.filter(s => s.winnerTeamKey === s.team).length;
    const sessionLosses = remoSessions.filter(s => s.winnerTeamKey && s.winnerTeamKey !== s.team && s.winnerTeamKey !== 'draw').length;
    const sessionDraws = remoSessions.filter(s => s.winnerTeamKey === 'draw').length;
    
    console.log(`\n📈 REMO'S GESAMT-STATISTIKEN:`);
    console.log('-'.repeat(80));
    console.log(`   🎯 Gesamt-Spiele: ${totalGames}`);
    console.log(`   📊 Gesamt-Striche-Differenz: ${totalStricheDiff >= 0 ? '+' : ''}${totalStricheDiff}`);
    console.log(`   ✅ Gesamt-Wins (Spiele): ${totalWins}`);
    console.log(`   ❌ Gesamt-Losses (Spiele): ${totalLosses}`);
    console.log(`   🎲 Gesamt-Punkte: ${totalPoints} vs ${totalOpponentPoints}`);
    console.log(`   🏆 Session-Wins: ${sessionWins}`);
    console.log(`   💔 Session-Losses: ${sessionLosses}`);
    console.log(`   ⚖️ Session-Draws: ${sessionDraws}`);
    console.log(`   📅 Erste Session: ${remoSessions[0].date}`);
    console.log(`   📅 Letzte Session: ${remoSessions[remoSessions.length - 1].date}`);
    
    // Detail-Liste
    console.log('\n📜 ALLE SESSIONS IM DETAIL:');
    console.log('-'.repeat(80));
    
    remoSessions.forEach((session, i) => {
      const won = session.winnerTeamKey === session.team;
      const icon = won ? '✅' : (session.winnerTeamKey === 'draw' ? '⚖️' : '❌');
      console.log(`${icon} ${i + 1}. ${session.date} | ${session.gamesPlayed} Spiele | Striche: ${session.stricheDiff >= 0 ? '+' : ''}${session.stricheDiff} (${session.ownStriche}:${session.opponentStriche}) | W/L: ${session.wins}/${session.losses}`);
    });
    
    // Vergleich mit User-Erwartung
    console.log('\n' + '='.repeat(80));
    console.log('📋 VERGLEICH MIT USER-ERWARTUNG');
    console.log('='.repeat(80));
    
    console.log('\n┌──────────────────────┬──────────┬─────────────────┬──────────┐');
    console.log('│ Datenquelle          │ Spiele   │ Striche-Diff    │ Sessions │');
    console.log('├──────────────────────┼──────────┼─────────────────┼──────────┤');
    console.log(`│ User-Erwartung       │ 83       │ +45             │ ?        │`);
    console.log(`│ Echte Daten          │ ${String(totalGames).padEnd(8)} │ ${(totalStricheDiff >= 0 ? '+' : '') + String(totalStricheDiff).padEnd(15)} │ ${String(remoSessions.length).padEnd(8)} │`);
    console.log('└──────────────────────┴──────────┴─────────────────┴──────────┘');
    
    console.log('\n🚨 KRITISCHE ERKENNTNISSE:');
    console.log('-'.repeat(80));
    
    if (totalGames !== 83) {
      console.log(`❌ DISKREPANZ: User erwartet 83 Spiele, aber echte Daten zeigen ${totalGames} Spiele`);
      console.log(`   → Differenz: ${83 - totalGames} Spiele`);
    }
    
    if (totalStricheDiff !== 45) {
      console.log(`❌ DISKREPANZ: User erwartet +45 Striche, aber echte Daten zeigen ${totalStricheDiff >= 0 ? '+' : ''}${totalStricheDiff} Striche`);
      console.log(`   → Differenz: ${45 - totalStricheDiff} Striche`);
    }
    
    if (remoSessions.length > 0 && remoSessions[remoSessions.length - 1].date !== '2025-10-16') {
      console.log(`⚠️ ZEITDISKREPANZ: Letzte Session ist ${remoSessions[remoSessions.length - 1].date}, nicht 16.10.2025`);
    }
    
    console.log('\n💡 LÖSUNGSVORSCHLAG:');
    console.log('-'.repeat(80));
    console.log(`1. 🔧 Erstelle playerRating Dokument für Remo mit den echten Werten:`);
    console.log(`   - gamesPlayed: ${totalGames}`);
    console.log(`   - stricheDifferenz: ${totalStricheDiff}`);
    console.log(`   - wins: ${totalWins}`);
    console.log(`   - losses: ${totalLosses}`);
    console.log(`   - rating: (muss aus Elo-System berechnet werden)`);
    console.log(`2. 🔄 Baue Rating-History aus ${remoSessions.length} Sessions auf`);
    console.log(`3. ✅ Validiere dass finalizeSession für neue Sessions funktioniert`);
    
  } catch (error) {
    console.error('❌ KRITISCHER FEHLER:', error);
  }
}

/**
 * HAUPTFUNKTION
 */
async function main() {
  try {
    await analyzeSessions();
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ DIAGNOSE ABGESCHLOSSEN');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ KRITISCHER FEHLER:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();

