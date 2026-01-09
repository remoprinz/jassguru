#!/usr/bin/env node

/**
 * Merge-Script für parallele Agent-Outputs
 * 
 * Führt die 5 knowledgebase_agentX.json Files zusammen in ein finales knowledgebase.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'src/data');

console.log('🔄 Merging knowledgebase files...\n');

// Lese bestehende knowledgebase.json (falls vorhanden)
const kbPath = path.join(DATA_DIR, 'knowledgebase.json');
let existingKb = [];
if (fs.existsSync(kbPath)) {
  existingKb = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  console.log(`✅ Bestehende knowledgebase.json: ${existingKb.length} Einträge`);
}

// Sammle alle Agent-Files
const agentFiles = [
  'knowledgebase_agent1.json',
  'knowledgebase_agent2.json',
  'knowledgebase_agent3.json',
  'knowledgebase_agent4.json',
  'knowledgebase_agent5.json'
];

const allEntries = [...existingKb];
const seenIds = new Set(existingKb.map(e => e.id));

agentFiles.forEach((filename, idx) => {
  const filePath = path.join(DATA_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Agent ${idx + 1}: ${filename} nicht gefunden (übersprungen)`);
    return;
  }
  
  try {
    const agentData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!Array.isArray(agentData)) {
      console.log(`❌ Agent ${idx + 1}: ${filename} ist kein Array!`);
      return;
    }
    
    let added = 0;
    let skipped = 0;
    
    agentData.forEach(entry => {
      if (seenIds.has(entry.id)) {
        console.log(`   ⚠️  Duplikat übersprungen: ${entry.id}`);
        skipped++;
      } else {
        allEntries.push(entry);
        seenIds.add(entry.id);
        added++;
      }
    });
    
    console.log(`✅ Agent ${idx + 1}: ${added} neu, ${skipped} Duplikate`);
    
  } catch (err) {
    console.log(`❌ Agent ${idx + 1}: Fehler beim Lesen - ${err.message}`);
  }
});

// Sortiere nach slug (für bessere Übersicht)
allEntries.sort((a, b) => a.slug.localeCompare(b.slug));

// Schreibe finale knowledgebase.json
fs.writeFileSync(kbPath, JSON.stringify(allEntries, null, 2) + '\n', 'utf8');

console.log(`\n✅ Finale knowledgebase.json: ${allEntries.length} Einträge`);
console.log(`📍 ${kbPath}`);

// Statistik
const byType = {};
allEntries.forEach(e => {
  byType[e.type] = (byType[e.type] || 0) + 1;
});

console.log('\n📊 Statistik:');
Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
  console.log(`   ${type}: ${count}`);
});

console.log('\n✅ Merge abgeschlossen!');

