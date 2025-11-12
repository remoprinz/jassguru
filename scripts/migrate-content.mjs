#!/usr/bin/env node

/**
 * Content Migration Script
 * 
 * Migriert Content von jassguruchat nach jasstafel
 * Korrigiert dabei die Datenstruktur für das neue 3-Ebenen-Routing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pfade
const JASSGURUCHAT_PATH = path.join(__dirname, '../../jassguruchat/src/data/jassContent');
const OUTPUT_PATH = path.join(__dirname, '../src/data/jass-content-v2.json');
const REPORT_PATH = path.join(__dirname, '../migration-report.txt');

// Mapping von technischen Sub-Kategorien zu menschenlesbaren Namen
const SUB_CATEGORY_MAPPING = {
  // Begriffe
  'BASIC_TERMS': 'Grundbegriffe',
  'GAME_ACTIONS': 'Spielaktionen',
  'CARD_TERMS': 'Kartenbezeichnungen',
  'SCORING_TERMS': 'Punktebegriffe',
  'SPECIAL_TERMS': 'Spezialvarianten',
  
  // Grundlagen & Kultur
  'CARD_VALUES': 'Kartenwerte',
  'DEALING': 'Kartenverteilung',
  'GAMEPLAY': 'Spielablauf',
  'GEOGRAPHY': 'Regionale Unterschiede',
  'ORIENTATION': 'Grundbegriffe',
  
  // Geschichte
  'KULTURELLE_BEDEUTUNG': 'Kulturelle Bedeutung',
  'HERKUNFT': 'Herkunft',
  'MITTELALTER': 'Mittelalter',
  'WORTHERKUNFT': 'Wortherkunft',
  'INDUSTRIALISIERUNG': 'Industrialisierung',
  
  // Varianten
  'LEARNING': 'Lernspiele',
  'FAMILY': 'Familien- & Gesellschaftsspiele',
  'STRATEGIC': 'Strategische Varianten',
  'TWO_PLAYER': 'Zweier-Spiele',
  'THREE_PLAYER': 'Dreier-Spiele',
  'MULTI_PLAYER': 'Mehrpersonen-Spiele',
  'SPECIALTY': 'Spezialvarianten',
};

// Inkonsistenzen fixen
const TITLE_FIXES = {
  'Stock': 'Stöck',
  'stock': 'Stöck',
  'Stoeck': 'Stöck',
  'stoeck': 'Stöck',
};

// Statistiken
const stats = {
  totalArticles: 0,
  byCategory: {},
  bySubCategory: {},
  warnings: [],
  errors: [],
  duplicates: [],
};

/**
 * Liest eine TypeScript Content-Datei und extrahiert die Artikel
 */
function parseContentFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const articles = [];
  
  // Regex um Artikel-Objekte zu finden
  // Sucht nach Patterns wie: ablupf: { id: '...', text: '...', metadata: {...} }
  const articlePattern = /(\w+):\s*\{[\s\S]*?id:\s*['"]([^'"]+)['"][\s\S]*?text:\s*`([^`]*)`[\s\S]*?metadata:\s*\{[\s\S]*?category:\s*\{[\s\S]*?main:\s*['"]([^'"]+)['"][\s\S]*?sub:\s*['"]?([^'",\s}]+)['"]?[\s\S]*?topic:\s*['"]([^'"]+)['"][\s\S]*?\}[\s\S]*?keywords:\s*\[([^\]]*)\][\s\S]*?importance:\s*([\d.]+)[\s\S]*?difficulty:\s*(\d+)[\s\S]*?source:\s*['"]([^'"]+)['"][\s\S]*?\}/g;
  
  let match;
  while ((match = articlePattern.exec(content)) !== null) {
    const [, key, id, text, main, sub, topic, keywordsStr, importance, difficulty, source] = match;
    
    // Parse keywords
    const keywords = keywordsStr
      .split(',')
      .map(k => k.trim().replace(/['"]/g, ''))
      .filter(k => k.length > 0);
    
    articles.push({
      key,
      id,
      text: text.trim(),
      metadata: {
        id: `${id}_meta`,
        category: {
          main,
          sub,
          topic
        },
        keywords,
        importance: parseFloat(importance),
        difficulty: parseInt(difficulty),
        source,
        chunkInfo: {
          isPartOfSequence: false,
          sequenceId: null,
          index: null,
          total: null,
          previousChunkId: null,
          nextChunkId: null
        }
      }
    });
  }
  
  return articles;
}

/**
 * Transformiert die Datenstruktur für das neue 3-Ebenen-Routing
 */
function transformArticle(article) {
  const { id, text, metadata } = article;
  const { category, keywords, importance, difficulty, source } = metadata;
  
  // Bestimme die neue Sub-Kategorie (menschenlesbar)
  let newSub = SUB_CATEGORY_MAPPING[category.sub] || category.sub;
  
  // Bestimme das neue Topic (sollte der Artikel-Titel sein)
  // Bei "Grundbegriffen" ist das aktuelle Topic die Gruppierung, nicht der Titel
  let newTopic = category.topic;
  
  // Spezialbehandlung für Begriffe: Topic aus dem ersten Wort des Texts extrahieren
  if (category.main === 'Begriffe' && category.topic === 'Grundbegriffe') {
    const firstLine = text.split('\n')[0];
    const match = firstLine.match(/^([^:•]+):/);
    if (match) {
      newTopic = match[1].trim();
    }
  }
  
  // Titel-Korrekturen anwenden
  Object.keys(TITLE_FIXES).forEach(wrong => {
    if (newTopic.includes(wrong)) {
      newTopic = newTopic.replace(new RegExp(wrong, 'g'), TITLE_FIXES[wrong]);
    }
  });
  
  return {
    id,
    text,
    metadata: {
      id: metadata.id,
      category: {
        main: category.main,
        sub: newSub,
        topic: newTopic
      },
      keywords,
      situations: metadata.situations || ['LEARNING'],
      importance,
      difficulty,
      source,
      chunkInfo: metadata.chunkInfo || {
        isPartOfSequence: false,
        sequenceId: null,
        index: null,
        total: null,
        previousChunkId: null,
        nextChunkId: null
      }
    }
  };
}

/**
 * Validiert einen Artikel
 */
function validateArticle(article, allArticles) {
  const warnings = [];
  const errors = [];
  
  // Pflichtfelder prüfen
  if (!article.id) errors.push(`Artikel ohne ID`);
  if (!article.text || article.text.length < 10) errors.push(`Artikel ${article.id}: Text zu kurz oder fehlt`);
  if (!article.metadata.category.main) errors.push(`Artikel ${article.id}: Hauptkategorie fehlt`);
  if (!article.metadata.category.sub) errors.push(`Artikel ${article.id}: Unterkategorie fehlt`);
  if (!article.metadata.category.topic) errors.push(`Artikel ${article.id}: Topic fehlt`);
  
  // Duplikate prüfen
  const sameTopicArticles = allArticles.filter(a => 
    a.metadata.category.main === article.metadata.category.main &&
    a.metadata.category.sub === article.metadata.category.sub &&
    a.metadata.category.topic === article.metadata.category.topic &&
    a.id !== article.id
  );
  
  if (sameTopicArticles.length > 0) {
    warnings.push(`Duplikat gefunden: "${article.metadata.category.topic}" in ${article.metadata.category.main}/${article.metadata.category.sub} (IDs: ${article.id}, ${sameTopicArticles.map(a => a.id).join(', ')})`);
  }
  
  // Keywords prüfen
  if (!article.metadata.keywords || article.metadata.keywords.length === 0) {
    warnings.push(`Artikel ${article.id}: Keine Keywords`);
  }
  
  return { warnings, errors };
}

/**
 * Hauptfunktion
 */
async function migrate() {
  console.log('🚀 Content-Migration gestartet...\n');
  
  // Alle TypeScript-Dateien finden
  const files = [
    '2_general.ts',
    '3_weisRules.ts',
    '4_schieber.ts',
    '5_variants.ts',
    '8_expressions.ts',
    '9_history.ts',
    '10_generalRules.ts',
    '15_references.ts'
  ];
  
  let allArticles = [];
  
  // Jede Datei verarbeiten
  for (const file of files) {
    const filePath = path.join(JASSGURUCHAT_PATH, file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Datei nicht gefunden: ${file}`);
      continue;
    }
    
    console.log(`📖 Verarbeite ${file}...`);
    
    try {
      const articles = parseContentFile(filePath);
      console.log(`   → ${articles.length} Artikel gefunden`);
      
      // Transformieren
      const transformed = articles.map(transformArticle);
      allArticles = allArticles.concat(transformed);
      
      // Statistiken aktualisieren
      transformed.forEach(article => {
        const cat = article.metadata.category.main;
        const sub = article.metadata.category.sub;
        
        stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
        stats.bySubCategory[`${cat}/${sub}`] = (stats.bySubCategory[`${cat}/${sub}`] || 0) + 1;
      });
      
    } catch (error) {
      console.error(`❌ Fehler beim Verarbeiten von ${file}:`, error.message);
      stats.errors.push(`Fehler in ${file}: ${error.message}`);
    }
  }
  
  stats.totalArticles = allArticles.length;
  console.log(`\n✅ Insgesamt ${allArticles.length} Artikel migriert\n`);
  
  // Validierung
  console.log('🔍 Validiere Artikel...\n');
  allArticles.forEach(article => {
    const { warnings, errors } = validateArticle(article, allArticles);
    stats.warnings.push(...warnings);
    stats.errors.push(...errors);
  });
  
  // Als JSON-Objekt speichern (key = id)
  const contentObject = {};
  allArticles.forEach(article => {
    contentObject[article.id] = article;
  });
  
  // Speichern
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(contentObject, null, 2), 'utf-8');
  console.log(`💾 Content gespeichert: ${OUTPUT_PATH}\n`);
  
  // Report generieren
  const report = generateReport();
  fs.writeFileSync(REPORT_PATH, report, 'utf-8');
  console.log(`📊 Report gespeichert: ${REPORT_PATH}\n`);
  
  // Zusammenfassung
  console.log('=' .repeat(60));
  console.log('MIGRATION ABGESCHLOSSEN');
  console.log('='.repeat(60));
  console.log(`✅ Artikel gesamt: ${stats.totalArticles}`);
  console.log(`⚠️  Warnungen: ${stats.warnings.length}`);
  console.log(`❌ Fehler: ${stats.errors.length}`);
  console.log('='.repeat(60));
  
  if (stats.errors.length > 0) {
    console.log('\n❌ FEHLER gefunden:');
    stats.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    if (stats.errors.length > 10) {
      console.log(`  ... und ${stats.errors.length - 10} weitere (siehe Report)`);
    }
  }
  
  if (stats.warnings.length > 0) {
    console.log('\n⚠️  WARNUNGEN:');
    stats.warnings.slice(0, 10).forEach(w => console.log(`  - ${w}`));
    if (stats.warnings.length > 10) {
      console.log(`  ... und ${stats.warnings.length - 10} weitere (siehe Report)`);
    }
  }
}

/**
 * Generiert einen detaillierten Report
 */
function generateReport() {
  let report = '# CONTENT MIGRATION REPORT\n\n';
  report += `Datum: ${new Date().toISOString()}\n\n`;
  
  report += '## STATISTIKEN\n\n';
  report += `Artikel gesamt: ${stats.totalArticles}\n\n`;
  
  report += '### Nach Kategorie\n\n';
  Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      report += `- ${cat}: ${count} Artikel\n`;
    });
  
  report += '\n### Nach Unterkategorie\n\n';
  Object.entries(stats.bySubCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([subCat, count]) => {
      report += `- ${subCat}: ${count} Artikel\n`;
    });
  
  if (stats.errors.length > 0) {
    report += '\n## FEHLER\n\n';
    stats.errors.forEach(e => report += `- ${e}\n`);
  }
  
  if (stats.warnings.length > 0) {
    report += '\n## WARNUNGEN\n\n';
    stats.warnings.forEach(w => report += `- ${w}\n`);
  }
  
  return report;
}

// Script ausführen
migrate().catch(error => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
});

