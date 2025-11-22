#!/usr/bin/env ts-node

/**
 * 🔍 ELO KONSISTENZ-PRÜFUNG
 * 
 * Prüft Inkonsistenzen zwischen:
 * 1. Chart-Daten (rating Werte aus jassGameSummaries)
 * 2. Delta-Werten (ratingDelta aus jassGameSummaries)
 * 3. Rating-Verlauf (sollte konsistent sein: letztes_rating = vorletztes_rating + ratingDelta)
 * 
 * Usage: ts-node --project tsconfig.json functions/scripts/checkEloConsistency.ts [--group GROUP_ID] [--player PLAYER_ID]
 */

import * as admin from 'firebase-admin';

const serviceAccount = require('../../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

interface Inconsistency {
  groupId: string;
  groupName: string;
  playerId: string;
  playerName: string;
  sessionId: string;
  sessionDate: string;
  issue: string;
  details: {
    previousRating?: number;
    currentRating?: number;
    ratingDelta?: number;
    expectedRating?: number;
    difference?: number;
  };
}

async function checkEloConsistency(groupId?: string, playerId?: string) {
  console.log('🔍 ELO KONSISTENZ-PRÜFUNG\n');
  console.log('=' .repeat(80));
  
  const inconsistencies: Inconsistency[] = [];
  
  // 1. Lade Gruppen
  let groups: { id: string; name: string }[] = [];
  
  if (groupId) {
    const groupDoc = await db.doc(`groups/${groupId}`).get();
    if (groupDoc.exists) {
      groups.push({
        id: groupDoc.id,
        name: groupDoc.data()?.name || 'Unbekannt'
      });
    }
  } else {
    const groupsSnap = await db.collection('groups').get();
    groups = groupsSnap.docs.map(doc => ({
      id: doc.id,
      name: doc.data()?.name || 'Unbekannt'
    }));
  }
  
  console.log(`📋 ${groups.length} Gruppe(n) gefunden\n`);
  
  // 2. Für jede Gruppe prüfen
  for (const group of groups) {
    console.log(`\n🔍 Prüfe Gruppe: ${group.name} (${group.id})`);
    console.log('-'.repeat(80));
    
    // Lade alle completed Sessions, sortiert nach Datum
    const summariesSnap = await db.collection(`groups/${group.id}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'asc')
      .get();
    
    if (summariesSnap.empty) {
      console.log('  ⚠️  Keine completed Sessions gefunden');
      continue;
    }
    
    console.log(`  📊 ${summariesSnap.docs.length} Sessions gefunden`);
    
    // Sammle Rating-Verlauf pro Spieler
    const playerHistory = new Map<string, Array<{
      sessionId: string;
      sessionDate: Date;
      rating: number;
      ratingDelta: number;
      displayName: string;
    }>>();
    
    // Durchlaufe alle Sessions chronologisch
    for (const summaryDoc of summariesSnap.docs) {
      const data = summaryDoc.data();
      const playerFinalRatings = data.playerFinalRatings || {};
      const completedAt = data.completedAt;
      
      if (!completedAt) continue;
      
      const sessionDate = completedAt.toDate ? completedAt.toDate() : new Date(completedAt._seconds * 1000);
      
      // Für jeden Spieler in dieser Session
      for (const [pid, ratingData] of Object.entries(playerFinalRatings)) {
        const rd = ratingData as any;
        
        // Filter nach playerId falls angegeben
        if (playerId && pid !== playerId) continue;
        
        if (!playerHistory.has(pid)) {
          playerHistory.set(pid, []);
        }
        
        const history = playerHistory.get(pid)!;
        history.push({
          sessionId: summaryDoc.id,
          sessionDate,
          rating: rd.rating || 0,
          ratingDelta: rd.ratingDelta || 0,
          displayName: rd.displayName || pid
        });
      }
    }
    
    // 3. Prüfe Konsistenz für jeden Spieler
    for (const [playerId, history] of playerHistory.entries()) {
      if (history.length < 2) {
        // Braucht mindestens 2 Sessions für Vergleich
        continue;
      }
      
      const playerName = history[0].displayName;
      console.log(`\n  👤 ${playerName} (${playerId.slice(0, 8)}...):`);
      
      // Sortiere nach Datum (sollte bereits sortiert sein, aber sicherheitshalber)
      history.sort((a, b) => a.sessionDate.getTime() - b.sessionDate.getTime());
      
      // Prüfe jede Session gegen die vorherige
      for (let i = 1; i < history.length; i++) {
        const previous = history[i - 1];
        const current = history[i];
        
        // Berechne erwartetes Rating
        const expectedRating = previous.rating + current.ratingDelta;
        const difference = Math.abs(current.rating - expectedRating);
        
        // Toleranz: 0.01 (wegen Rundungsfehlern)
        if (difference > 0.01) {
          const issue = `Rating-Inkonsistenz: Rating passt nicht zu Delta`;
          
          inconsistencies.push({
            groupId: group.id,
            groupName: group.name,
            playerId,
            playerName,
            sessionId: current.sessionId,
            sessionDate: current.sessionDate.toISOString(),
            issue,
            details: {
              previousRating: previous.rating,
              currentRating: current.rating,
              ratingDelta: current.ratingDelta,
              expectedRating,
              difference
            }
          });
          
          console.log(`    ❌ Session ${i + 1} (${current.sessionDate.toLocaleDateString('de-DE')}):`);
          console.log(`       Vorheriges Rating: ${previous.rating.toFixed(2)}`);
          console.log(`       Delta: ${current.ratingDelta > 0 ? '+' : ''}${current.ratingDelta.toFixed(2)}`);
          console.log(`       Erwartetes Rating: ${expectedRating.toFixed(2)}`);
          console.log(`       Tatsächliches Rating: ${current.rating.toFixed(2)}`);
          console.log(`       Differenz: ${difference.toFixed(2)} ⚠️`);
        } else {
          // Konsistent
          if (i === history.length - 1) {
            // Zeige nur die letzte Session für Übersicht
            console.log(`    ✅ Letzte Session (${current.sessionDate.toLocaleDateString('de-DE')}): Rating ${current.rating.toFixed(2)}, Delta ${current.ratingDelta > 0 ? '+' : ''}${current.ratingDelta.toFixed(2)}`);
          }
        }
      }
      
      // Prüfe auch auf ungewöhnliche Deltas (sehr groß oder sehr klein)
      const lastDelta = history[history.length - 1].ratingDelta;
      if (Math.abs(lastDelta) > 50) {
        console.log(`    ⚠️  Warnung: Sehr großes Delta in letzter Session: ${lastDelta > 0 ? '+' : ''}${lastDelta.toFixed(2)}`);
      }
    }
  }
  
  // 4. Zusammenfassung
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 ZUSAMMENFASSUNG\n');
  
  if (inconsistencies.length === 0) {
    console.log('✅ Keine Inkonsistenzen gefunden! Alle Rating-Werte sind konsistent mit ihren Deltas.');
  } else {
    console.log(`❌ ${inconsistencies.length} Inkonsistenz(en) gefunden:\n`);
    
    // Gruppiere nach Spieler
    const byPlayer = new Map<string, Inconsistency[]>();
    for (const inc of inconsistencies) {
      const key = `${inc.groupId}_${inc.playerId}`;
      if (!byPlayer.has(key)) {
        byPlayer.set(key, []);
      }
      byPlayer.get(key)!.push(inc);
    }
    
    for (const [, playerIncs] of byPlayer.entries()) {
      const first = playerIncs[0];
      console.log(`\n👤 ${first.playerName} (${first.groupName}):`);
      console.log(`   ${playerIncs.length} Inkonsistenz(en)`);
      
      for (const inc of playerIncs) {
        console.log(`   - ${inc.sessionDate.split('T')[0]}: ${inc.details.difference?.toFixed(2)} Punkte Differenz`);
      }
    }
    
    // Export als JSON
    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(__dirname, `elo-consistency-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(inconsistencies, null, 2));
    console.log(`\n📄 Detaillierter Report gespeichert: ${reportPath}`);
  }
  
  console.log('\n' + '='.repeat(80));
}

// CLI Argumente parsen
const args = process.argv.slice(2);
let groupId: string | undefined;
let playerId: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--group' && args[i + 1]) {
    groupId = args[i + 1];
    i++;
  } else if (args[i] === '--player' && args[i + 1]) {
    playerId = args[i + 1];
    i++;
  }
}

checkEloConsistency(groupId, playerId)
  .then(() => {
    console.log('\n✅ Prüfung abgeschlossen');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  });

