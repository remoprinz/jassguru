#!/usr/bin/env node

/**
 * QUICK CHECK SCRIPT - PUNKTEDIFFERENZ VERGLEICH
 * 
 * Vergleicht die Debug-Berechnung mit der tatsächlich gespeicherten Chart-Daten
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

async function compareRemoData(groupId: string): Promise<void> {
  console.log(`[quickCheck] Comparing Remo data for group: ${groupId}`);
  
  // Lade chartData_points
  const chartDoc = await db.collection(`groups/${groupId}/aggregated`).doc('chartData_points').get();
  if (!chartDoc.exists) {
    console.log(`[quickCheck] No chartData_points found`);
    return;
  }
  
  const chartData = chartDoc.data();
  if (!chartData) {
    console.log(`[quickCheck] No data in chartData_points`);
    return;
  }
  
  // Finde Remo's Dataset
  const remoDataset = chartData.datasets.find((dataset: any) => 
    dataset.label === 'Remo'
  );
  
  if (!remoDataset) {
    console.log(`[quickCheck] Remo dataset not found`);
    return;
  }
  
  console.log(`[quickCheck] === REMO CHART DATA ===`);
  console.log(`[quickCheck] Labels: ${chartData.labels.length}`);
  console.log(`[quickCheck] Data points: ${remoDataset.data.length}`);
  
  // Zeige die ersten 10 Datenpunkte
  console.log(`[quickCheck] === ERSTE 10 DATENPUNKTE ===`);
  for (let i = 0; i < Math.min(10, remoDataset.data.length); i++) {
    const label = chartData.labels[i] || `Index ${i}`;
    const value = remoDataset.data[i];
    console.log(`[quickCheck] ${label}: ${value}`);
  }
  
  // Zeige die letzten 5 Datenpunkte
  console.log(`[quickCheck] === LETZTE 5 DATENPUNKTE ===`);
  const startIndex = Math.max(0, remoDataset.data.length - 5);
  for (let i = startIndex; i < remoDataset.data.length; i++) {
    const label = chartData.labels[i] || `Index ${i}`;
    const value = remoDataset.data[i];
    console.log(`[quickCheck] ${label}: ${value}`);
  }
  
  // Zeige Final Value
  const finalValue = remoDataset.data[remoDataset.data.length - 1];
  console.log(`[quickCheck] === FINAL VALUE ===`);
  console.log(`[quickCheck] Final cumulative delta: ${finalValue}`);
}

// ===== CLI INTERFACE =====
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length !== 1) {
    console.error(`[quickCheck] Usage: node quickCheck.js <groupId>`);
    process.exit(1);
  }
  
  const groupId = args[0];
  console.log(`[quickCheck] Starting CLI execution for group: ${groupId}`);
  
  try {
    await compareRemoData(groupId);
    console.log(`[quickCheck] ✅ CLI execution completed successfully`);
  } catch (error) {
    console.error(`[quickCheck] Fatal error: ${error}`);
    process.exit(1);
  }
  
  process.exit(0);
}

// Script ausführen
if (require.main === module) {
  main();
}
