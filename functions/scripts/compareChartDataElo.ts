#!/usr/bin/env ts-node

/**
 * 🔍 CHART DATA ELO VERGLEICH
 * 
 * Vergleicht die aggregierten Chart-Daten in groups/{groupId}/aggregated/chartData_elo
 * mit den tatsächlichen Werten aus jassGameSummaries → playerFinalRatings
 * 
 * Findet Diskrepanzen und zeigt, welche Datenquelle das Problem verursacht.
 * 
 * Usage: ts-node --project tsconfig.json functions/scripts/compareChartDataElo.ts [--group GROUP_ID] [--player PLAYER_ID]
 */

import * as admin from 'firebase-admin';

const serviceAccount = require('../../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

interface ComparisonResult {
  groupId: string;
  groupName: string;
  playerId: string;
  playerName: string;
  sessionIndex: number;
  sessionId: string;
  sessionDate: string;
  chartDataRating: number | null;
  jassGameSummaryRating: number | null;
  difference: number;
  ratingDelta: number | null;
  previousRating: number | null;
  expectedRating: number | null;
}

async function compareChartDataElo(groupId?: string, playerId?: string) {
  console.log('🔍 CHART DATA ELO VERGLEICH\n');
  console.log('='.repeat(80));
  
  const discrepancies: ComparisonResult[] = [];
  
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
    
    // Lade chartData_elo
    const chartDataDoc = await db.doc(`groups/${group.id}/aggregated/chartData_elo`).get();
    
    if (!chartDataDoc.exists) {
      console.log('  ⚠️  Keine chartData_elo Datei gefunden');
      continue;
    }
    
    const chartData = chartDataDoc.data();
    const chartDatasets = chartData?.datasets || [];
    const chartLabels = chartData?.labels || [];
    
    console.log(`  📊 Chart-Daten: ${chartDatasets.length} Spieler, ${chartLabels.length} Sessions`);
    
    // Lade jassGameSummaries
    const summariesSnap = await db.collection(`groups/${group.id}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'asc')
      .get();
    
    if (summariesSnap.empty) {
      console.log('  ⚠️  Keine completed Sessions gefunden');
      continue;
    }
    
    console.log(`  📊 jassGameSummaries: ${summariesSnap.docs.length} Sessions\n`);
    
    // Erstelle Map: playerId -> chartData dataset
    const chartDataMap = new Map<string, any>();
    chartDatasets.forEach((dataset: any) => {
      if (dataset.playerId) {
        chartDataMap.set(dataset.playerId, dataset);
      }
    });
    
    // Erstelle Map: sessionId -> sessionData
    const sessionMap = new Map<string, { data: any; index: number; date: Date }>();
    summariesSnap.docs.forEach((doc, index) => {
      const data = doc.data();
      const completedAt = data.completedAt;
      let date: Date;
      if (completedAt?.toDate && typeof completedAt.toDate === 'function') {
        date = completedAt.toDate();
      } else if (completedAt?._seconds !== undefined) {
        date = new Date(completedAt._seconds * 1000);
      } else {
        return;
      }
      sessionMap.set(doc.id, { data, index, date });
    });
    
    // Für jeden Spieler im Chart vergleichen
    for (const [pid, chartDataset] of chartDataMap.entries()) {
      // Filter nach playerId falls angegeben
      if (playerId && pid !== playerId) continue;
      
      const playerName = chartDataset.displayName || chartDataset.label || pid;
      const chartRatings = chartDataset.data || [];
      
      console.log(`\n  👤 ${playerName} (${pid.slice(0, 8)}...):`);
      
      // Sammle Rating-Verlauf aus jassGameSummaries
      const jassGameSummaryRatings: Array<{
        sessionId: string;
        index: number;
        date: Date;
        rating: number;
        ratingDelta: number;
      }> = [];
      
      let previousRating: number | null = null;
      
      for (const [sessionId, sessionInfo] of sessionMap.entries()) {
        const playerFinalRatings = sessionInfo.data.playerFinalRatings || {};
        const ratingData = playerFinalRatings[pid];
        
        if (ratingData && typeof ratingData === 'object' && 'rating' in ratingData) {
          const rating = typeof ratingData.rating === 'number' ? ratingData.rating : null;
          const ratingDelta = typeof ratingData.ratingDelta === 'number' ? ratingData.ratingDelta : 0;
          
          if (rating !== null) {
            jassGameSummaryRatings.push({
              sessionId,
              index: sessionInfo.index,
              date: sessionInfo.date,
              rating,
              ratingDelta
            });
            
            // Prüfe Konsistenz
            if (previousRating !== null) {
              const expectedRating = previousRating + ratingDelta;
              const difference = Math.abs(rating - expectedRating);
              
              if (difference > 0.01) {
                console.log(`    ⚠️  Session ${sessionInfo.index + 1} (${sessionInfo.date.toLocaleDateString('de-DE')}):`);
                console.log(`       Vorheriges Rating: ${previousRating.toFixed(2)}`);
                console.log(`       Delta: ${ratingDelta > 0 ? '+' : ''}${ratingDelta.toFixed(2)}`);
                console.log(`       Erwartetes Rating: ${expectedRating.toFixed(2)}`);
                console.log(`       Tatsächliches Rating: ${rating.toFixed(2)}`);
                console.log(`       Differenz: ${difference.toFixed(2)}`);
            }
            }
            
            previousRating = rating;
          }
        }
      }
      
      // Vergleiche Chart-Daten mit jassGameSummaries
      if (chartRatings.length !== jassGameSummaryRatings.length) {
        console.log(`    ⚠️  Längen-Unterschied: Chart hat ${chartRatings.length} Datenpunkte, jassGameSummaries hat ${jassGameSummaryRatings.length}`);
      }
      
      const minLength = Math.min(chartRatings.length, jassGameSummaryRatings.length);
      
      for (let i = 0; i < minLength; i++) {
        const chartRating = chartRatings[i];
        const jassRating = jassGameSummaryRatings[i];
        
        if (chartRating === null || chartRating === undefined) continue;
        if (jassRating.rating === null || jassRating.rating === undefined) continue;
        
        const difference = Math.abs(chartRating - jassRating.rating);
        
        if (difference > 0.01) {
          discrepancies.push({
            groupId: group.id,
            groupName: group.name,
            playerId: pid,
            playerName,
            sessionIndex: i,
            sessionId: jassRating.sessionId,
            sessionDate: jassRating.date.toISOString(),
            chartDataRating: chartRating,
            jassGameSummaryRating: jassRating.rating,
            difference,
            ratingDelta: jassRating.ratingDelta,
            previousRating: i > 0 ? jassGameSummaryRatings[i - 1].rating : null,
            expectedRating: i > 0 ? jassGameSummaryRatings[i - 1].rating + jassRating.ratingDelta : null
          });
          
          console.log(`    ❌ Session ${i + 1} (${jassRating.date.toLocaleDateString('de-DE')}):`);
          console.log(`       Chart-Daten Rating: ${chartRating.toFixed(2)}`);
          console.log(`       jassGameSummaries Rating: ${jassRating.rating.toFixed(2)}`);
          console.log(`       Differenz: ${difference.toFixed(2)} ⚠️`);
          
          if (i > 0) {
            const prev = jassGameSummaryRatings[i - 1];
            const expected = prev.rating + jassRating.ratingDelta;
            console.log(`       Erwartetes Rating (vorheriges + Delta): ${expected.toFixed(2)}`);
          }
        }
      }
      
      // Zeige letzte Session für Übersicht
      if (jassGameSummaryRatings.length > 0) {
        const last = jassGameSummaryRatings[jassGameSummaryRatings.length - 1];
        const lastChartRating = chartRatings[chartRatings.length - 1];
        console.log(`    📊 Letzte Session (${last.date.toLocaleDateString('de-DE')}):`);
        console.log(`       Chart: ${lastChartRating?.toFixed(2) || 'N/A'}, jassGameSummaries: ${last.rating.toFixed(2)}, Delta: ${last.ratingDelta > 0 ? '+' : ''}${last.ratingDelta.toFixed(2)}`);
      }
    }
  }
  
  // 4. Zusammenfassung
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 ZUSAMMENFASSUNG\n');
  
  if (discrepancies.length === 0) {
    console.log('✅ Keine Diskrepanzen gefunden! Chart-Daten stimmen mit jassGameSummaries überein.');
  } else {
    console.log(`❌ ${discrepancies.length} Diskrepanz(en) gefunden:\n`);
    
    // Gruppiere nach Spieler
    const byPlayer = new Map<string, ComparisonResult[]>();
    for (const disc of discrepancies) {
      const key = `${disc.groupId}_${disc.playerId}`;
      if (!byPlayer.has(key)) {
        byPlayer.set(key, []);
      }
      byPlayer.get(key)!.push(disc);
    }
    
    for (const [, playerDiscs] of byPlayer.entries()) {
      const first = playerDiscs[0];
      console.log(`\n👤 ${first.playerName} (${first.groupName}):`);
      console.log(`   ${playerDiscs.length} Diskrepanz(en)`);
      
      for (const disc of playerDiscs) {
        console.log(`   - Session ${disc.sessionIndex + 1} (${disc.sessionDate.split('T')[0]}):`);
        console.log(`     Chart: ${disc.chartDataRating?.toFixed(2)}, jassGameSummaries: ${disc.jassGameSummaryRating?.toFixed(2)}, Diff: ${disc.difference.toFixed(2)}`);
        if (disc.expectedRating !== null) {
          console.log(`     Erwartet (vorheriges + Delta): ${disc.expectedRating.toFixed(2)}`);
        }
      }
    }
    
    // Export als JSON
    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(__dirname, `chart-data-comparison-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(discrepancies, null, 2));
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

compareChartDataElo(groupId, playerId)
  .then(() => {
    console.log('\n✅ Vergleich abgeschlossen');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  });

