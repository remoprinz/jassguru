#!/usr/bin/env node

/**
 * Content Migration Script V2
 * 
 * Robuster Parser für jassguruchat TypeScript-Dateien
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pfade
const JASSGURUCHAT_PATH = path.join(__dirname, '../../jassguruchat/src/data/jassContent');
const OUTPUT_PATH = path.join(__dirname, '../src/data/jass-content-v2.json');

// Sub-Category Mapping - Alle technischen Namen auf Deutsch
const SUB_CATEGORY_MAPPING = {
  // Begriffe - WICHTIG: Nicht EXPRESSIONS_CATEGORIES mappen, sonst verlieren wir die Differenzierung!
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
  'introduction': 'Einführung',
  'history': 'Geschichte',
  'variants': 'Spielvarianten',
  'General': 'Allgemeines',
  'general': 'Allgemeines',
  
  // Weis-Regeln
  'WEIS_CATEGORIES': 'Weis-Arten',
  'weis_categories': 'Weis-Arten',
  'NOTATION': 'Schreibweise',
  'SCORING': 'Punktezählung',
  'GRUNDREGELN': 'Grundregeln',
  'REIHENFOLGE': 'Reihenfolge',
  'BEDANKEN': 'Bedanken',
  'SCHNEIDER': 'Schneider',
  'KORREKTUREN': 'Korrekturen',
  'ZAHLENDARSTELLUNG': 'Zahlendarstellung',
  'FRUEHZEITIGES_BEDANKEN': 'Frühzeitiges Bedanken',
  
  // Schieber
  'SCHIEBER_CATEGORIES': 'Schieber-Taktiken',
  'schieber_categories': 'Schieber-Taktiken',
  'CONVENTIONS': 'Konventionen',
  'TACTICS': 'Taktiken',
  
  // Varianten - WICHTIG: Nicht VARIANTS_CATEGORIES mappen, sonst verlieren wir die Differenzierung!
  'LEARNING': 'Lernspiele',
  'FAMILY': 'Familien- & Gesellschaftsspiele',
  'STRATEGIC': 'Strategische Varianten',
  'TWO_PLAYER': 'Zweier-Spiele',
  'THREE_PLAYER': 'Dreier-Spiele',
  'MULTI_PLAYER': 'Mehrpersonen-Spiele',
  'SPECIALTY': 'Spezialvarianten',
  
  // Geschichte
  'KULTURELLE_BEDEUTUNG': 'Kulturelle Bedeutung',
  'HERKUNFT': 'Herkunft',
  'MITTELALTER': 'Mittelalter',
  'WORTHERKUNFT': 'Wortherkunft',
  'INDUSTRIALISIERUNG': 'Industrialisierung',
  
  // Regeln
  'RULES_CATEGORIES': 'Spielregeln',
  'rules_categories': 'Spielregeln',
  
  // Referenzen
  'REFERENCES': 'Quellen',
  'references': 'Quellen',
};

/**
 * Extrahiert Artikel-Titel aus dem Text
 */
function extractTitleFromText(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return null;
  
  const firstLine = lines[0].trim();
  
  // Format 1: "Titel:" (mit Doppelpunkt)
  const match1 = firstLine.match(/^([^:]+):/);
  if (match1) {
    return match1[1].trim();
  }
  
  // Format 2: "Titel - Beschreibung"
  const match2 = firstLine.match(/^([^\-•]+)\s*-/);
  if (match2) {
    return match2[1].trim();
  }
  
  // Format 3: Einfach die erste Zeile (wenn sie nicht zu lang ist)
  if (firstLine.length > 0 && firstLine.length < 80) {
    return firstLine;
  }
  
  return null;
}

/**
 * Parst eine TypeScript Content-Datei
 * Nutzt einen robusten Ansatz: Findet alle Artikel-Objekte durch Muster-Matching
 */
function parseContentFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const articles = [];
  
  // NEUER ANSATZ: Finde alle Artikel-Keys direkt (z.B. "ablupf: {" oder "'abheben': {")
  // Suche nach: "  key: {\n    id: '...'" (mit oder ohne Quotes um den Key)
  const articlePattern = /^\s\s['"]?(\w+)['"]?:\s*\{[\s\S]*?id:\s*['"]([^'"]+)['"]/gm;
  const articleMatches = [...content.matchAll(articlePattern)];
  
  for (const articleMatch of articleMatches) {
    const key = articleMatch[1];
    const articleId = articleMatch[2];
    const matchStartPos = articleMatch.index;
    
    // Überspringe metadata IDs (enden mit _meta)
    if (articleId.endsWith('_meta')) continue;
    
    try {
      const startPos = matchStartPos;
      
      // Finde das ENDE des Artikel-Blocks
      // Suche nach "  }," (2 Spaces + geschlossene Klammer + Komma) am Zeilenanfang
      // Das ist das Ende des Artikel-Objekts (nicht das category Objekt!)
      const endPattern = /\n  \},/;
      const remainingContent = content.slice(startPos);
      const endMatch = remainingContent.match(endPattern);
      const endPos = endMatch ? startPos + endMatch.index + endMatch[0].length : startPos + 10000;
      
      // Extrahiere den kompletten Artikel-Block
      const articleSection = content.slice(startPos, endPos);
      
      // Finde den Text innerhalb DIESES Blocks
      const textPattern = /text:\s*`([^`]*)`/;
      const textMatch = articleSection.match(textPattern);
      if (!textMatch) continue;
      
      const text = textMatch[1].trim();
      
      // Finde die Metadata
      const mainPattern = /main:\s*(?:MAIN_CATEGORY|['"]([^'"]+)['"])/;
      // Verbesserte Sub-Pattern-Erkennung - erfasst auch verschachtelte Objekt-Properties
      const subPattern = /sub:\s*(?:['"]?([A-Z_]+)['"]?|VARIANTS_CATEGORIES\.([A-Z_]+)|EXPRESSIONS_CATEGORIES\.([A-Z_]+)|WEIS_CATEGORIES\.([A-Z_]+)|SCHIEBER_CATEGORIES\.([A-Z_]+)|RULES_CATEGORIES\.([A-Z_]+))/;
      const topicPattern = /topic:\s*['"]([^'"]+)['"]/;
      const keywordsPattern = /keywords:\s*\[([\s\S]*?)\]/;
      const importancePattern = /importance:\s*([\d.]+)/;
      const difficultyPattern = /difficulty:\s*(\d+)/;
      const sourcePattern = /source:\s*['"]([^'"]+)['"]/;
      
      const mainMatch = articleSection.match(mainPattern);
      const subMatch = articleSection.match(subPattern);
      const topicMatch = articleSection.match(topicPattern);
      const keywordsMatch = articleSection.match(keywordsPattern);
      const importanceMatch = articleSection.match(importancePattern);
      const difficultyMatch = articleSection.match(difficultyPattern);
      const sourceMatch = articleSection.match(sourcePattern);
      
      if (!mainMatch) continue;
      
      let main = mainMatch[1];
      // Wenn main nicht direkt als String da ist, leite es vom Dateinamen ab
      if (!main) {
        const filename = path.basename(filePath);
        if (filename.includes('general')) main = 'Grundlagen & Kultur';
        else if (filename.includes('weis')) main = 'Weis-Regeln';
        else if (filename.includes('schieber')) main = 'Schieber';
        else if (filename.includes('variants')) main = 'Varianten';
        else if (filename.includes('expressions')) main = 'Begriffe';
        else if (filename.includes('history')) main = 'Geschichte';
        else if (filename.includes('generalRules')) main = 'Regeln';
        else if (filename.includes('references')) main = 'Referenzen';
      }
      
      // Sub-Kategorie extrahieren (alle möglichen Match-Gruppen prüfen)
      let sub = 'Allgemeines'; // Fallback
      if (subMatch) {
        // subMatch[1] = direkte String-Konstante wie 'BASIC_TERMS'
        // subMatch[2] = VARIANTS_CATEGORIES.XXX
        // subMatch[3] = EXPRESSIONS_CATEGORIES.XXX
        // subMatch[4] = WEIS_CATEGORIES.XXX
        // subMatch[5] = SCHIEBER_CATEGORIES.XXX
        // subMatch[6] = RULES_CATEGORIES.XXX
        sub = subMatch[1] || subMatch[2] || subMatch[3] || subMatch[4] || subMatch[5] || subMatch[6];
      }
      
      // WICHTIG: Der Key ist eigentlich der Artikel-Name!
      // topic in den Metadaten ist oft eine Gruppierung, nicht der individuelle Titel
      // Aber: Der Text enthält den formatierten Titel (z.B. "Stock:" statt "stock")
      let articleTitle = extractTitleFromText(text);
      if (!articleTitle || articleTitle.toLowerCase() === 'ablupf') {
        // Fallback auf Key (kapitalisiert)
        articleTitle = key.charAt(0).toUpperCase() + key.slice(1);
      }
      
      // Parse keywords
      let keywords = [];
      if (keywordsMatch) {
        keywords = keywordsMatch[1]
          .split(',')
          .map(k => k.trim().replace(/['"]/g, ''))
          .filter(k => k.length > 0 && !k.includes('//'));
      }
      
      const importance = importanceMatch ? parseFloat(importanceMatch[1]) : 0.5;
      const difficulty = difficultyMatch ? parseInt(difficultyMatch[1]) : 2;
      const source = sourceMatch ? sourceMatch[1] : 'Unbekannt';
      
      // Map sub category to German
      if (SUB_CATEGORY_MAPPING[sub]) {
        sub = SUB_CATEGORY_MAPPING[sub];
      } else {
        // Wenn kein Mapping existiert, versuche topic aus den Metadaten
        if (topicMatch && topicMatch[1]) {
          sub = topicMatch[1];
        }
      }
      
      // Debug-Log für Begriffe
      if (main === 'Begriffe') {
        console.log(`  → Artikel: "${articleTitle}" | Sub: "${sub}" | Key: "${key}"`);
      }
      
      articles.push({
        key,
        id: articleId,
        text,
        metadata: {
          id: `${articleId}_meta`,
          category: {
            main,
            sub,
            topic: articleTitle
          },
          keywords,
          importance,
          difficulty,
          source
        }
      });
      
    } catch (error) {
      console.warn(`⚠️  Fehler beim Parsen von Artikel ${articleId}:`, error.message);
    }
  }
  
  return articles;
}

/**
 * Normalisiert Difficulty-Wert von 1-7 Skala auf 1-5 Skala
 */
function normalizeDifficulty(difficulty) {
  if (difficulty <= 2) return 1; // Einfach
  if (difficulty <= 4) return 2; // Mittel
  if (difficulty <= 5) return 3; // Fortgeschritten
  if (difficulty <= 6) return 4; // Experte
  return 5; // Meister
}

/**
 * Prüft, ob Difficulty für diese Kategorie sinnvoll ist
 */
function shouldHaveDifficulty(categoryMain) {
  const categoriesWithDifficulty = [
    'Varianten',
    'Schieber',
    'Weis-Regeln',
    'Spielaktionen' // Manche Spielaktionen sind komplexer als andere
  ];
  return categoriesWithDifficulty.includes(categoryMain);
}

/**
 * Transformiert Artikel für das neue 3-Ebenen-Routing
 */
function transformArticle(article) {
  const { id, text, metadata } = article;
  const { category, keywords, importance, difficulty, source } = metadata;
  
  // Mappe Sub-Kategorie zu menschenlesbar (falls noch nicht gemappt)
  let newSub = SUB_CATEGORY_MAPPING[category.sub] || category.sub;
  
  // Topic sollte bereits korrekt sein, aber als Fallback nochmal aus Text extrahieren
  let newTopic = category.topic || extractTitleFromText(text) || 'Unbekannt';
  
  // Fixes: Stock → Stöck
  newTopic = newTopic.replace(/\bStock\b/g, 'Stöck')
                     .replace(/\bstock\b/g, 'stöck')
                     .replace(/\bStoeck\b/g, 'Stöck');
  
  // Difficulty: Nur für relevante Kategorien, normalisiert auf 1-5
  const finalDifficulty = shouldHaveDifficulty(category.main) 
    ? normalizeDifficulty(difficulty) 
    : 2; // Default für alle anderen
  
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
      situations: ['LEARNING'],
      importance,
      difficulty: finalDifficulty,
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
  };
}

/**
 * Hauptfunktion
 */
async function migrate() {
  console.log('🚀 Content-Migration V2 gestartet...\n');
  
  const files = [
    // Hauptdateien
    '2_general.ts',
    '3_weisRules.ts',
    '4_schieber.ts',
    '5_variants.ts',
    '8_expressions.ts',
    '9_history.ts',
    '10_generalRules.ts',
    '15_references.ts',
    // Unterordner
    '2_general/cardValues.ts',
    '2_general/dealing.ts',
    '2_general/gameplay.ts',
    '2_general/geography.ts',
    '2_general/orientation.ts',
    '3_weisRules/notation.ts',
    '3_weisRules/scoring.ts',
    '3_weisRules/stock.ts',
    '3_weisRules/weis.ts',
    '5_variants/kreuzJass.ts',
    '5_variants/tschauSepp.ts',
    '6_prizeJass/differenzler.ts',
    '6_prizeJass/fourPlayer.ts',
    '6_prizeJass/general.ts',
    '7_tips/strategies.ts',
    '7_tips/tactics.ts'
  ];
  
  let allArticles = [];
  let stats = {
    byCategory: {},
    warnings: [],
    errors: []
  };
  
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
      
      const transformed = articles.map(transformArticle);
      allArticles = allArticles.concat(transformed);
      
      transformed.forEach(article => {
        const cat = article.metadata.category.main;
        stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
      });
      
    } catch (error) {
      console.error(`❌ Fehler beim Verarbeiten von ${file}:`, error.message);
      stats.errors.push(`${file}: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Insgesamt ${allArticles.length} Artikel migriert\n`);
  
  // Als JSON-Objekt speichern
  const contentObject = {};
  allArticles.forEach(article => {
    contentObject[article.id] = article;
  });
  
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(contentObject, null, 2), 'utf-8');
  console.log(`💾 Content gespeichert: ${OUTPUT_PATH}\n`);
  
  // Statistiken
  console.log('📊 STATISTIKEN:');
  console.log(`   Artikel gesamt: ${allArticles.length}`);
  Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`   - ${cat}: ${count} Artikel`);
  });
  
  if (stats.errors.length > 0) {
    console.log(`\n❌ ${stats.errors.length} Fehler:`);
    stats.errors.forEach(e => console.log(`   - ${e}`));
  }
  
  console.log('\n🎉 Migration abgeschlossen!');
}

migrate().catch(error => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
});

