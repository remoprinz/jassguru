#!/usr/bin/env node

/**
 * Export-Script: Alle Jasswiki-Texte übersichtlich nach Kategorien geordnet
 * 
 * Erstellt zwei Dateien:
 * 1. all-texts.json - Strukturiertes JSON mit allen Texten
 * 2. all-texts-readable.txt - Lesbares Textdokument
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lade jass-content-v2.json
const contentPath = path.join(__dirname, '../src/data/jass-content-v2.json');
const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));

// Kategorien-Reihenfolge definieren (Geschichte, Grundlagen & Kultur, Referenzen)
const CATEGORY_ORDER = {
  'Geschichte': 1,
  'Grundlagen & Kultur': 2,
  'Referenzen': 3,
  'Regeln': 4,
  'Weis-Regeln': 5,
  'Schieber': 6,
  'Varianten': 7,
  'Begriffe': 8,
  'Jassapps': 9,
};

// Struktur: main -> sub -> articles[]
const structure = {};

// Iteriere über alle Artikel
Object.values(content).forEach(item => {
  if (!item.metadata || !item.metadata.category) return;
  
  const main = item.metadata.category.main || 'Unbekannt';
  const sub = item.metadata.category.sub || 'Unbekannt';
  const topic = item.metadata.category.topic || item.id;
  
  // Initialisiere Struktur falls nötig
  if (!structure[main]) {
    structure[main] = {};
  }
  if (!structure[main][sub]) {
    structure[main][sub] = [];
  }
  
  // Füge Artikel hinzu
  structure[main][sub].push({
    id: item.id,
    title: topic,
    text: item.text,
    keywords: item.metadata.keywords || [],
    importance: item.metadata.importance || 1,
    difficulty: item.metadata.difficulty || 2,
  });
});

// Sortiere innerhalb jeder Sub-Kategorie nach Wichtigkeit
Object.keys(structure).forEach(main => {
  Object.keys(structure[main]).forEach(sub => {
    structure[main][sub].sort((a, b) => {
      // Zuerst nach Wichtigkeit (höher = wichtiger), dann alphabetisch
      if (b.importance !== a.importance) {
        return b.importance - a.importance;
      }
      return a.title.localeCompare(b.title, 'de-CH');
    });
  });
});

// Erstelle strukturiertes JSON-Export
const jsonExport = {
  metadata: {
    exportDate: new Date().toISOString(),
    totalArticles: Object.values(content).length,
    totalCategories: Object.keys(structure).length,
  },
  categories: Object.keys(structure)
    .sort((a, b) => {
      const orderA = CATEGORY_ORDER[a] || 999;
      const orderB = CATEGORY_ORDER[b] || 999;
      return orderA - orderB;
    })
    .map(main => ({
      category: main,
      subcategories: Object.keys(structure[main])
        .sort()
        .map(sub => ({
          subcategory: sub,
          articles: structure[main][sub],
        })),
    })),
};

// Speichere JSON
const jsonOutputPath = path.join(__dirname, '../exports/all-texts.json');
fs.mkdirSync(path.dirname(jsonOutputPath), { recursive: true });
fs.writeFileSync(jsonOutputPath, JSON.stringify(jsonExport, null, 2), 'utf-8');

// Erstelle lesbares Textdokument
const textLines = [];
textLines.push('='.repeat(80));
textLines.push('JASSWIKI - ALLE TEXTE');
textLines.push('='.repeat(80));
textLines.push('');
textLines.push(`Export-Datum: ${new Date().toLocaleString('de-CH')}`);
textLines.push(`Gesamt-Artikel: ${Object.values(content).length}`);
textLines.push(`Kategorien: ${Object.keys(structure).length}`);
textLines.push('');
textLines.push('='.repeat(80));
textLines.push('');

// Iteriere über alle Kategorien in geordneter Reihenfolge
jsonExport.categories.forEach((categoryData, mainIdx) => {
  const main = categoryData.category;
  
  textLines.push('#'.repeat(80));
  textLines.push(`# ${mainIdx + 1}. ${main.toUpperCase()}`);
  textLines.push('#'.repeat(80));
  textLines.push('');
  
  categoryData.subcategories.forEach((subData, subIdx) => {
    const sub = subData.subcategory;
    
    textLines.push('-'.repeat(80));
    textLines.push(`${mainIdx + 1}.${subIdx + 1} ${sub}`);
    textLines.push('-'.repeat(80));
    textLines.push('');
    
    subData.articles.forEach((article, articleIdx) => {
      textLines.push(`## ${mainIdx + 1}.${subIdx + 1}.${articleIdx + 1} ${article.title}`);
      textLines.push(`ID: ${article.id}`);
      if (article.keywords.length > 0) {
        textLines.push(`Keywords: ${article.keywords.join(', ')}`);
      }
      textLines.push(`Wichtigkeit: ${article.importance} | Schwierigkeit: ${article.difficulty}`);
      textLines.push('');
      textLines.push(article.text);
      textLines.push('');
      textLines.push('='.repeat(80));
      textLines.push('');
    });
  });
  
  textLines.push('');
});

// Speichere Text-Dokument
const textOutputPath = path.join(__dirname, '../exports/all-texts-readable.txt');
fs.writeFileSync(textOutputPath, textLines.join('\n'), 'utf-8');

console.log('✅ Export erfolgreich!');
console.log('');
console.log(`📄 JSON:  ${jsonOutputPath}`);
console.log(`📄 Text:  ${textOutputPath}`);
console.log('');
console.log(`📊 Statistiken:`);
console.log(`   - Artikel gesamt: ${Object.values(content).length}`);
console.log(`   - Hauptkategorien: ${Object.keys(structure).length}`);
Object.keys(structure).forEach(main => {
  const subCount = Object.keys(structure[main]).length;
  const articleCount = Object.values(structure[main]).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`   - ${main}: ${subCount} Unterkategorien, ${articleCount} Artikel`);
});

