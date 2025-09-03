#!/usr/bin/env node
/**
 * JavaScript Wrapper für TypeScript Migration Script
 * Führt das eigentliche Migration Script mit ts-node aus
 */

const { execSync } = require('child_process');
const path = require('path');

// Hole groupId Argument
const groupId = process.argv[2];

if (!groupId) {
  console.error('❌ FEHLER: Bitte GroupId als Argument angeben!');
  console.error('Usage: node scripts/migrateData.js <groupId>');
  process.exit(1);
}

console.log('🚀 Starte Migration mit TypeScript...\n');

try {
  // Führe TypeScript Version aus
  const scriptPath = path.join(__dirname, 'migrateData.ts');
  execSync(`npx ts-node ${scriptPath} ${groupId}`, { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
} catch (error) {
  console.error('❌ Migration fehlgeschlagen!');
  process.exit(1);
}
