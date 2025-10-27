#!/usr/bin/env node

/**
 * CHART DATA CLEANUP SCRIPT
 * 
 * Bereinigt alle chartData_* Dokumente:
 * 1. Korrigiert Datumsformat zu DD.MM.YY
 * 2. Entfernt Frontend-Metadaten (borderColor, backgroundColor)
 * 3. Behält nur Backend-relevante Daten
 */

import * as admin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

// Firebase Admin SDK initialisieren
const serviceAccountPath = join(__dirname, '../../../serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

const app = initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore(app);

// ===== INTERFACES =====
interface CleanChartDataset {
  label: string;
  data: (number | null)[];
}

interface CleanChartData {
  labels: string[];
  datasets: CleanChartDataset[];
  lastUpdated: admin.firestore.Timestamp;
  totalSessions: number;
  totalPlayers: number;
}

// ===== HILFSFUNKTIONEN =====
function extractDateFromSessionId(sessionId: string): string | null {
  // Versuche verschiedene Datumsformate zu extrahieren
  
  // Format 1: YYYY-MM-DD in Session-ID
  const dateMatch1 = sessionId.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch1) {
    const [, year, month, day] = dateMatch1;
    const yearShort = year.slice(-2);
    return `${day}.${month}.${yearShort}`;
  }
  
  // Format 2: DD.MM.YY bereits vorhanden
  const dateMatch2 = sessionId.match(/(\d{2})\.(\d{2})\.(\d{2})/);
  if (dateMatch2) {
    return sessionId; // Bereits korrekt formatiert
  }
  
  // Format 3: DD.MM. ohne Jahr
  const dateMatch3 = sessionId.match(/(\d{2})\.(\d{2})\./);
  if (dateMatch3) {
    const [, day, month] = dateMatch3;
    // Verwende aktuelles Jahr als Fallback
    const currentYear = new Date().getFullYear().toString().slice(-2);
    return `${day}.${month}.${currentYear}`;
  }
  
  return null;
}

async function getSessionDateFromFirestore(sessionId: string, groupId: string): Promise<string | null> {
  try {
    // Versuche Session-Dokument zu finden
    const sessionDoc = await db.collection(`groups/${groupId}/jassGameSummaries`).doc(sessionId).get();
    if (sessionDoc.exists) {
      const data = sessionDoc.data();
      if (data?.completedAt && data.completedAt.toDate) {
        const date = data.completedAt.toDate();
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear().toString().slice(-2);
        return `${day}.${month}.${year}`;
      }
    }
  } catch (error) {
    console.log(`[chartDataCleanup] Could not fetch date for session ${sessionId}: ${error}`);
  }
  
  return null;
}

// ===== HAUPTFUNKTIONEN =====
async function cleanupChartData(groupId: string, chartType: 'elo' | 'striche' | 'points'): Promise<void> {
  console.log(`[chartDataCleanup] Cleaning ${chartType} chart data for group: ${groupId}`);
  
  const chartDocRef = db.collection(`groups/${groupId}/aggregated`).doc(`chartData_${chartType}`);
  const chartDoc = await chartDocRef.get();
  
  if (!chartDoc.exists) {
    console.log(`[chartDataCleanup] No ${chartType} chart data found for group: ${groupId}`);
    return;
  }
  
  const data = chartDoc.data();
  if (!data) {
    console.log(`[chartDataCleanup] No data in ${chartType} chart document for group: ${groupId}`);
    return;
  }
  
  // Bereinige Labels (Datum-Format korrigieren)
  const cleanedLabels: string[] = [];
  for (let i = 0; i < data.labels.length; i++) {
    const originalLabel = data.labels[i];
    
    // Versuche Datum aus Label zu extrahieren
    let cleanedLabel = extractDateFromSessionId(originalLabel);
    
    if (!cleanedLabel) {
      // Fallback: Versuche Session-ID aus Labels zu verwenden
      const sessionId = originalLabel;
      cleanedLabel = await getSessionDateFromFirestore(sessionId, groupId);
    }
    
    if (!cleanedLabel) {
      // Letzter Fallback: Verwende Index
      cleanedLabel = `Session ${i + 1}`;
    }
    
    cleanedLabels.push(cleanedLabel);
  }
  
  // Bereinige Datasets (entferne Frontend-Metadaten)
  const cleanedDatasets: CleanChartDataset[] = data.datasets.map((dataset: any) => ({
    label: dataset.label,
    data: dataset.data
  }));
  
  // Erstelle bereinigte Chart-Daten
  const cleanedChartData: CleanChartData = {
    labels: cleanedLabels,
    datasets: cleanedDatasets,
    lastUpdated: admin.firestore.Timestamp.now(),
    totalSessions: data.totalSessions || cleanedLabels.length,
    totalPlayers: data.totalPlayers || cleanedDatasets.length
  };
  
  // Speichere bereinigte Daten
  await chartDocRef.set(cleanedChartData);
  
  console.log(`[chartDataCleanup] ✅ Cleaned ${chartType} chart data for group: ${groupId}`);
  console.log(`[chartDataCleanup]   - Labels: ${cleanedLabels.length} (${cleanedLabels.slice(0, 3).join(', ')}...)`);
  console.log(`[chartDataCleanup]   - Datasets: ${cleanedDatasets.length}`);
}

async function cleanupGroupChartData(groupId: string): Promise<void> {
  console.log(`[chartDataCleanup] Cleaning all chart data for group: ${groupId}`);
  
  const chartTypes: ('elo' | 'striche' | 'points')[] = ['elo', 'striche', 'points'];
  
  for (const chartType of chartTypes) {
    await cleanupChartData(groupId, chartType);
  }
  
  console.log(`[chartDataCleanup] ✅ Completed cleanup for group: ${groupId}`);
}

async function cleanupAllGroupsChartData(): Promise<void> {
  console.log(`[chartDataCleanup] Starting cleanup for all groups`);
  
  const groupsSnapshot = await db.collection('groups').get();
  const groups = groupsSnapshot.docs.map(doc => doc.id);
  
  console.log(`[chartDataCleanup] Found ${groups.length} groups to process`);
  
  let successCount = 0;
  let skipCount = 0;
  
  for (const groupId of groups) {
    try {
      await cleanupGroupChartData(groupId);
      successCount++;
    } catch (error) {
      console.error(`[chartDataCleanup] Error cleaning group ${groupId}: ${error}`);
      skipCount++;
    }
  }
  
  console.log(`[chartDataCleanup] 🎉 Cleanup completed! Success: ${successCount}, Skipped: ${skipCount}`);
}

// ===== CLI INTERFACE =====
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`[chartDataCleanup] Starting CLI execution for all groups`);
    await cleanupAllGroupsChartData();
  } else if (args.length === 1) {
    const groupId = args[0];
    console.log(`[chartDataCleanup] Starting CLI execution for group: ${groupId}`);
    await cleanupGroupChartData(groupId);
  } else {
    console.error(`[chartDataCleanup] Usage: node chartDataCleanup.js [groupId]`);
    process.exit(1);
  }
  
  console.log(`[chartDataCleanup] ✅ CLI execution completed successfully`);
  process.exit(0);
}

// Script ausführen
if (require.main === module) {
  main().catch(error => {
    console.error(`[chartDataCleanup] Fatal error: ${error}`);
    process.exit(1);
  });
}

export { cleanupChartData, cleanupGroupChartData, cleanupAllGroupsChartData };
