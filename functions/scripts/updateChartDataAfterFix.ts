#!/usr/bin/env ts-node

/**
 * 🔧 FIX CHART DATA AFTER RATING HISTORY FIX
 * 
 * Aktualisiert die Chart-Daten nach der Reparatur der ratingHistory Einträge
 * für das jassGameSummaries Dokument vom 20. Oktober 2025
 */

import * as admin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';

// Firebase Admin SDK initialisieren
if (!admin.apps.length) {
  initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function updateChartDataForGroup() {
  console.log('🔧 Updating chart data for group...');
  
  const groupId = 'Rosen10player';
  
  try {
    // 1. Lade alle Gruppenmitglieder
    console.log(`👥 Loading members for group ${groupId}...`);
    const membersRef = db.collection(`groups/${groupId}/members`);
    const membersSnap = await membersRef.get();
    
    if (membersSnap.empty) {
      console.error(`❌ No members found for group ${groupId}`);
      return;
    }
    
    console.log(`✅ Found ${membersSnap.size} members`);
    
    // 2. Sammle alle Game-Entries aus ratingHistory
    const allGameEntries = new Map<string, Array<{
      sessionId: string;
      gameNumber: number;
      rating: number;
      timestamp: Date;
      playerId: string;
    }>>();
    
    for (const memberDoc of membersSnap.docs) {
      const playerId = memberDoc.id;
      
      // Lade Game-by-Game Rating History
      const historyRef = db.collection(`players/${playerId}/ratingHistory`);
      const historySnap = await historyRef.orderBy('createdAt', 'asc').get();
      
      if (historySnap.empty) continue;
      
      const playerEntries: Array<{
        sessionId: string;
        gameNumber: number;
        rating: number;
        timestamp: Date;
        playerId: string;
      }> = [];
      
      historySnap.forEach(doc => {
        const data = doc.data();
        
        // Robuste Datum-Konvertierung
        let timestamp: Date;
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
          timestamp = data.createdAt.toDate();
        } else if (data.createdAt && typeof data.createdAt === 'object' && '_seconds' in data.createdAt) {
          const seconds = data.createdAt._seconds || 0;
          const nanoseconds = data.createdAt._nanoseconds || 0;
          timestamp = new Date(seconds * 1000 + Math.floor(nanoseconds / 1000000));
        } else {
          console.warn(`⚠️ Invalid date for player ${playerId}:`, data.createdAt);
          timestamp = new Date(); // Fallback
        }
        
        playerEntries.push({
          sessionId: data.sessionId || 'unknown',
          gameNumber: data.gameNumber || 1,
          rating: data.rating || 100,
          timestamp: timestamp,
          playerId: playerId
        });
      });
      
      if (playerEntries.length > 0) {
        allGameEntries.set(playerId, playerEntries);
        console.log(`👤 Player ${playerId}: ${playerEntries.length} rating entries`);
      }
    }
    
    if (allGameEntries.size === 0) {
      console.warn(`⚠️ No game entries found for group ${groupId}`);
      return;
    }
    
    // 3. Hole alle Sessions der Gruppe für Validierung
    console.log(`📊 Loading sessions for group ${groupId}...`);
    const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('endedAt', 'asc');
    const sessionsSnap = await sessionsRef.get();
    
    console.log(`✅ Found ${sessionsSnap.size} completed sessions`);
    
    // 4. Erstelle Chart-Daten
    console.log('📈 Creating chart data...');
    
    // Sammle alle eindeutigen Zeitstempel
    const allTimestamps = new Set<string>();
    allGameEntries.forEach(entries => {
      entries.forEach(entry => {
        allTimestamps.add(entry.timestamp.toISOString());
      });
    });
    
    const sortedTimestamps = Array.from(allTimestamps).sort();
    console.log(`📅 Found ${sortedTimestamps.length} unique timestamps`);
    
    // Erstelle Datasets für jeden Spieler
    const datasets: any[] = [];
    const colors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', 
      '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'
    ];
    
    let colorIndex = 0;
    allGameEntries.forEach((entries, playerId) => {
      // Hole Spielername
      const memberDoc = membersSnap.docs.find(doc => doc.id === playerId);
      const playerName = memberDoc?.data()?.displayName || `Player ${playerId}`;
      
      // Erstelle Datenpunkte für alle Zeitstempel
      const dataPoints: number[] = [];
      const labels: string[] = [];
      
      sortedTimestamps.forEach(timestamp => {
        const timestampDate = new Date(timestamp);
        
        // Finde den letzten Rating-Eintrag vor oder zu diesem Zeitpunkt
        const relevantEntries = entries.filter(entry => 
          entry.timestamp <= timestampDate
        );
        
        if (relevantEntries.length > 0) {
          const lastEntry = relevantEntries[relevantEntries.length - 1];
          dataPoints.push(lastEntry.rating);
          labels.push(timestampDate.toLocaleDateString('de-CH'));
        } else {
          dataPoints.push(100); // Default rating
          labels.push(timestampDate.toLocaleDateString('de-CH'));
        }
      });
      
      datasets.push({
        label: playerName,
        data: dataPoints,
        borderColor: colors[colorIndex % colors.length],
        backgroundColor: colors[colorIndex % colors.length] + '20',
        tension: 0.1,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5
      });
      
      colorIndex++;
    });
    
    // 5. Speichere Chart-Daten
    console.log('💾 Saving chart data...');
    const chartData = {
      labels: sortedTimestamps.map(ts => new Date(ts).toLocaleDateString('de-CH')),
      datasets: datasets,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      sessionCount: sessionsSnap.size,
      playerCount: allGameEntries.size,
      dataPointCount: sortedTimestamps.length
    };
    
    const chartDataRef = db.collection(`groups/${groupId}/chartData`).doc('eloProgression');
    await chartDataRef.set(chartData);
    
    console.log('✅ Chart data saved successfully!');
    console.log('📊 Summary:');
    console.log(`   - Group: ${groupId}`);
    console.log(`   - Players: ${allGameEntries.size}`);
    console.log(`   - Sessions: ${sessionsSnap.size}`);
    console.log(`   - Data points: ${sortedTimestamps.length}`);
    console.log(`   - Datasets: ${datasets.length}`);
    
    // 6. Aktualisiere auch die anderen Chart-Services
    console.log('🔄 Triggering other chart updates...');
    
    // Hier könnten wir auch die anderen Chart-Services aufrufen:
    // - Strichdifferenz-Chart
    // - Punktedifferenz-Chart
    // - etc.
    
    console.log('🎉 Chart data update completed!');
    
  } catch (error) {
    console.error('❌ Error updating chart data:', error);
    throw error;
  }
}

// Script ausführen
if (require.main === module) {
  updateChartDataForGroup()
    .then(() => {
      console.log('🎉 Chart data update completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Chart data update failed:', error);
      process.exit(1);
    });
}

export { updateChartDataForGroup };
