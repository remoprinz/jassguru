#!/usr/bin/env node
/**
 * ⚠️ KRITISCH: Spreadsheet → JSON Import Script
 * 
 * ⚠️ WICHTIG: DIESES SCRIPT NIEMALS LÖSCHEN!
 * Dieses System ist essentiell für den Content-Management-Workflow!
 * 
 * Funktionalität:
 * 1. Liest Google Spreadsheet (Artikel + FAQs)
 * 2. Generiert jass-content-v2.json
 * 3. Generiert jasswiki-articles.jsonl
 * 4. Generiert jasswiki-faqs.jsonl
 * 
 * Features:
 * - Change Detection (nur geänderte/neue Artikel)
 * - Automatische Backups
 * - Validierung
 * - Dry-Run Modus
 */

import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Firebase Admin initialisieren
if (!admin.apps.length) {
  const serviceAccountPath = join(__dirname, '../../serviceAccountKey.json');
  try {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'jassguru'
    });
  } catch (error) {
    console.error('Fehler beim Initialisieren von Firebase Admin:', error);
    process.exit(1);
  }
}

// Konfiguration
const SPREADSHEET_ID = "1F6z6e0c0vTTiUsr93tTlZ3JfqpH0CSCpQeFU3q0ynos";
const DRY_RUN = process.argv.includes('--dry-run');

// Pfade
const JASS_CONTENT_PATH = join(__dirname, '../../../jasswiki/src/data/jass-content-v2.json');
const ARTICLES_JSONL_PATH = join(__dirname, '../../../jasswiki/chatgpt-gpt/jasswiki-articles.jsonl');
const FAQS_JSONL_PATH = join(__dirname, '../../../jasswiki/chatgpt-gpt/jasswiki-faqs.jsonl');

/**
 * Konvertiert Topic (Titel) zu einer konsistenten ID
 */
function topicToId(topic: string): string {
  if (!topic) return '';
  return topic
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/(^_|_$)+/g, '')
    .replace(/_+/g, '_');
}

/**
 * Erstellt Backup einer Datei
 */
function createBackup(filePath: string): string {
  if (!existsSync(filePath)) return '';
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = filePath.replace(/\.(json|jsonl)$/, `-backup-${timestamp}.$1`);
  
  try {
    const content = readFileSync(filePath, 'utf8');
    writeFileSync(backupPath, content, 'utf8');
    return backupPath;
  } catch (error) {
    console.error(`Fehler beim Erstellen des Backups von ${filePath}:`, error);
    return '';
  }
}

/**
 * Erkennt Variant aus Keywords/Text
 */
function detectVariant(keywords: string[], text: string): string | null {
  const variantKeywords = ['schieber', 'differenzler', 'handjass', 'pandur', 'misère', 'coiffeur'];
  const lowerText = text.toLowerCase();
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  
  for (const variant of variantKeywords) {
    if (lowerKeywords.includes(variant) || lowerText.includes(variant)) {
      // Normalisiere Variant-Namen
      if (variant === 'misère') return 'Misère';
      if (variant === 'coiffeur') return 'Coiffeur';
      return variant.charAt(0).toUpperCase() + variant.slice(1);
    }
  }
  
  return null;
}

/**
 * Formatiert Body für articles.jsonl
 */
function formatBodyForArticle(text: string, title: string): string {
  // Entferne "Definition:", "Regeln:" etc. am Anfang, falls vorhanden
  let body = text.trim();
  
  // Füge Titel hinzu
  const firstLine = body.split('\n')[0];
  if (!firstLine.toLowerCase().includes('titel:')) {
    body = `Titel: ${title}\nKurzdefinition: ${firstLine}\n${body}`;
  }
  
  return body;
}

interface SpreadsheetArticle {
  id: string;
  text: string;
  categoryMain: string;
  categorySub: string;
  categoryTopic: string;
  keywords: string[];
  situations: string[];
  importance: number;
  difficulty: number;
  seeAlso: string[];
  variant: string | null;
}

interface SpreadsheetFAQ {
  faqId: string;
  articleId: string;
  question: string;
  answer: string;
}

async function importFromSpreadsheet() {
  console.log('🚀 Starte Import von Google Spreadsheet...\n');
  
  if (DRY_RUN) {
    console.log('⚠️  DRY-RUN MODUS: Keine Dateien werden geschrieben!\n');
  }

  try {
    // 1. Google Sheets API initialisieren
    console.log('🔐 Initialisiere Google Sheets API...');
    const serviceAccountPath = join(__dirname, '../../serviceAccountKey.json');
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    console.log('✅ Google Sheets API initialisiert\n');

    // 2. Spreadsheet einlesen
    console.log('📖 Lade Daten aus Spreadsheet...');
    
    // Artikel einlesen
    // NEUE SPALTEN-REIHENFOLGE: Topic (A), Text (B), Main (C), Sub (D), ID (E), ...
    const articlesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Artikel!A2:K', // Ab Zeile 2 (ohne Header)
    });
    
    const articleRows = articlesResponse.data.values || [];
    console.log(`✅ ${articleRows.length} Artikel-Zeilen geladen`);
    
    // FAQs einlesen
    const faqsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'FAQs!A2:D', // Ab Zeile 2 (ohne Header)
    });
    
    const faqRows = faqsResponse.data.values || [];
    console.log(`✅ ${faqRows.length} FAQ-Zeilen geladen\n`);

    // 3. Daten parsen und validieren
    console.log('🔍 Validiere und parse Daten...');
    
    const articles: SpreadsheetArticle[] = [];
    const faqs: SpreadsheetFAQ[] = [];
    const errors: string[] = [];
    
    // Artikel parsen
    // NEUE SPALTEN-REIHENFOLGE: Topic (A), Text (B), Main (C), Sub (D), ID (E), Keywords (F), Situations (G), Importance (H), Difficulty (I), See Also (J), FAQ-Anzahl (K)
    for (let i = 0; i < articleRows.length; i++) {
      const row = articleRows[i];
      if (!row || row.length < 5) {
        errors.push(`Zeile ${i + 2}: Unvollständige Daten`);
        continue;
      }
      
      // NEUE REIHENFOLGE: Topic zuerst!
      const categoryTopic = (row[0] || '').trim();  // Spalte A: Topic (wichtigstes Feld!)
      const text = (row[1] || '').trim();           // Spalte B: Text
      const categoryMain = (row[2] || '').trim();   // Spalte C: Main
      const categorySub = (row[3] || '').trim();    // Spalte D: Sub
      const id = (row[4] || '').trim();             // Spalte E: ID (automatisch generiert)
      
      // Validierung
      if (!categoryTopic) {
        errors.push(`Zeile ${i + 2}: Topic fehlt (Pflichtfeld!)`);
        continue;
      }
      
      if (!text) {
        errors.push(`Zeile ${i + 2}: Text fehlt (Pflichtfeld!)`);
        continue;
      }
      
      // Wenn ID leer, aus Topic generieren
      const finalId = id || topicToId(categoryTopic);
      
      // Keywords parsen (komma-getrennt)
      const keywordsStr = (row[5] || '').trim();     // Spalte F: Keywords
      const keywords = keywordsStr ? keywordsStr.split(',').map((k: string) => k.trim()).filter(Boolean) : [];
      
      // Situations parsen
      const situationsStr = (row[6] || '').trim();  // Spalte G: Situations
      const situations = situationsStr ? situationsStr.split(',').map((s: string) => s.trim()).filter(Boolean) : ['LEARNING'];
      
      // Zahlen parsen
      const importance = parseInt(row[7] || '1', 10) || 1;  // Spalte H: Importance
      const difficulty = parseInt(row[8] || '2', 10) || 2;   // Spalte I: Difficulty
      
      // See Also parsen
      const seeAlsoStr = (row[9] || '').trim();     // Spalte J: See Also
      const seeAlso = seeAlsoStr ? seeAlsoStr.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      
      // Variant aus Spalte 11 (falls vorhanden) oder automatisch erkennen
      let variant: string | null = null;
      if (row[10] && row[10].trim()) {
        variant = row[10].trim() || null;
      } else {
        variant = detectVariant(keywords, text);
      }
      
      articles.push({
        id: finalId,
        text,
        categoryMain,
        categorySub,
        categoryTopic,
        keywords,
        situations,
        importance,
        difficulty,
        seeAlso,
        variant
      });
    }
    
    // FAQs parsen
    for (let i = 0; i < faqRows.length; i++) {
      const row = faqRows[i];
      if (!row || row.length < 4) {
        errors.push(`FAQ Zeile ${i + 2}: Unvollständige Daten`);
        continue;
      }
      
      const faqId = (row[0] || '').trim();
      const articleId = (row[1] || '').trim();
      const question = (row[2] || '').trim();
      const answer = (row[3] || '').trim();
      
      if (!articleId) {
        errors.push(`FAQ Zeile ${i + 2}: Artikel-ID fehlt`);
        continue;
      }
      
      if (!question || !answer) {
        errors.push(`FAQ Zeile ${i + 2}: Frage oder Antwort fehlt`);
        continue;
      }
      
      faqs.push({
        faqId: faqId || `${articleId}_faq_${i + 1}`,
        articleId,
        question,
        answer
      });
    }
    
    if (errors.length > 0) {
      console.error('❌ Validierungsfehler gefunden:');
      errors.forEach(err => console.error(`  - ${err}`));
      console.error('\n⚠️  Bitte Fehler beheben und erneut versuchen.');
      process.exit(1);
    }
    
    // Prüfe auf doppelte IDs
    const articleIds = articles.map(a => a.id);
    const duplicateIds = articleIds.filter((id, index) => articleIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      console.error('❌ Doppelte Artikel-IDs gefunden:', [...new Set(duplicateIds)]);
      process.exit(1);
    }
    
    // Prüfe FAQ-Verweise
    const validArticleIds = new Set(articleIds);
    const invalidFaqRefs = faqs.filter(f => !validArticleIds.has(f.articleId));
    if (invalidFaqRefs.length > 0) {
      console.error('❌ FAQs mit ungültigen Artikel-IDs gefunden:');
      invalidFaqRefs.forEach(f => console.error(`  - FAQ ${f.faqId} → Artikel ${f.articleId} existiert nicht`));
      process.exit(1);
    }
    
    console.log(`✅ ${articles.length} Artikel validiert`);
    console.log(`✅ ${faqs.length} FAQs validiert\n`);

    // 4. Change Detection (lade alte Dateien)
    console.log('🔍 Prüfe Änderungen...');
    let oldContent: any = {};
    let changedArticles: string[] = [];
    let newArticles: string[] = [];
    
    if (existsSync(JASS_CONTENT_PATH)) {
      try {
        oldContent = JSON.parse(readFileSync(JASS_CONTENT_PATH, 'utf8'));
      } catch (error) {
        console.log('⚠️  Alte jass-content-v2.json konnte nicht geladen werden (wird neu erstellt)');
      }
    }
    
    // Vergleiche Artikel
    for (const article of articles) {
      const oldArticle = oldContent[article.id];
      
      if (!oldArticle) {
        newArticles.push(article.id);
        changedArticles.push(article.id);
      } else {
        // Prüfe ob sich etwas geändert hat
        const oldText = oldArticle.text || '';
        const oldMain = oldArticle.metadata?.category?.main || '';
        const oldSub = oldArticle.metadata?.category?.sub || '';
        const oldTopic = oldArticle.metadata?.category?.topic || '';
        
        if (
          oldText !== article.text ||
          oldMain !== article.categoryMain ||
          oldSub !== article.categorySub ||
          oldTopic !== article.categoryTopic
        ) {
          changedArticles.push(article.id);
        }
      }
    }
    
    console.log(`✅ ${newArticles.length} neue Artikel`);
    console.log(`✅ ${changedArticles.length} geänderte Artikel`);
    console.log(`✅ ${articles.length - changedArticles.length} unveränderte Artikel\n`);

    if (DRY_RUN) {
      console.log('📊 DRY-RUN Zusammenfassung:');
      console.log(`   - ${articles.length} Artikel würden geschrieben`);
      console.log(`   - ${faqs.length} FAQs würden geschrieben`);
      console.log(`   - ${newArticles.length} neue Artikel`);
      console.log(`   - ${changedArticles.length} geänderte Artikel`);
      console.log('\n✅ DRY-RUN abgeschlossen - keine Dateien wurden geändert');
      return;
    }

    // 5. Backups erstellen
    console.log('💾 Erstelle Backups...');
    const backup1 = createBackup(JASS_CONTENT_PATH);
    const backup2 = createBackup(ARTICLES_JSONL_PATH);
    const backup3 = createBackup(FAQS_JSONL_PATH);
    
    if (backup1) console.log(`✅ Backup: ${backup1}`);
    if (backup2) console.log(`✅ Backup: ${backup2}`);
    if (backup3) console.log(`✅ Backup: ${backup3}`);
    console.log('');

    // 6. jass-content-v2.json generieren
    console.log('📝 Generiere jass-content-v2.json...');
    const contentData: any = {};
    
    // FAQs nach Artikel-ID gruppieren
    const faqsByArticle = new Map<string, SpreadsheetFAQ[]>();
    for (const faq of faqs) {
      if (!faqsByArticle.has(faq.articleId)) {
        faqsByArticle.set(faq.articleId, []);
      }
      faqsByArticle.get(faq.articleId)!.push(faq);
    }
    
    for (const article of articles) {
      const articleFaqs = faqsByArticle.get(article.id) || [];
      
      contentData[article.id] = {
        id: article.id,
        text: article.text,
        metadata: {
          id: `${article.id}_meta`,
          category: {
            main: article.categoryMain,
            sub: article.categorySub,
            topic: article.categoryTopic
          },
          keywords: article.keywords,
          situations: article.situations,
          importance: article.importance,
          difficulty: article.difficulty
        },
        faqs: articleFaqs.map(faq => ({
          question: faq.question,
          answer: faq.answer
        })),
        see_also: article.seeAlso
      };
    }
    
    writeFileSync(JASS_CONTENT_PATH, JSON.stringify(contentData, null, 2), 'utf8');
    console.log(`✅ ${Object.keys(contentData).length} Artikel geschrieben\n`);

    // 7. jasswiki-articles.jsonl generieren
    console.log('📝 Generiere jasswiki-articles.jsonl...');
    const articlesJsonl: string[] = [];
    
    for (const article of articles) {
      // Tags kombinieren: [main, sub, topic, keywords, situations]
      const tags = [
        article.categoryMain,
        article.categorySub,
        article.categoryTopic,
        ...article.keywords,
        ...article.situations
      ].filter(Boolean);
      
      const articleJsonl = {
        id: article.id,
        title: article.categoryTopic,
        variant: article.variant,
        tags: tags,
        synonyms: [],
        see_also: article.seeAlso,
        language: "de-CH",
        body: formatBodyForArticle(article.text, article.categoryTopic)
      };
      
      articlesJsonl.push(JSON.stringify(articleJsonl));
    }
    
    writeFileSync(ARTICLES_JSONL_PATH, articlesJsonl.join('\n') + '\n', 'utf8');
    console.log(`✅ ${articlesJsonl.length} Artikel geschrieben\n`);

    // 8. jasswiki-faqs.jsonl generieren
    console.log('📝 Generiere jasswiki-faqs.jsonl...');
    const faqsJsonl: string[] = [];
    
    // Artikel-Map für schnellen Zugriff
    const articleMap = new Map(articles.map(a => [a.id, a]));
    
    for (const faq of faqs) {
      const article = articleMap.get(faq.articleId);
      if (!article) continue;
      
      // Tags vom Artikel übernehmen
      const tags = [
        article.categoryMain,
        article.categorySub,
        article.categoryTopic,
        ...article.keywords,
        ...article.situations
      ].filter(Boolean);
      
      const faqJsonl = {
        id: faq.faqId,
        article_id: faq.articleId,
        article_title: article.categoryTopic,
        variant: article.variant,
        tags: tags,
        synonyms: [],
        language: "de-CH",
        question: faq.question,
        answer: faq.answer,
        body: ""
      };
      
      faqsJsonl.push(JSON.stringify(faqJsonl));
    }
    
    writeFileSync(FAQS_JSONL_PATH, faqsJsonl.join('\n') + '\n', 'utf8');
    console.log(`✅ ${faqsJsonl.length} FAQs geschrieben\n`);

    console.log('🎉 Import erfolgreich abgeschlossen!');
    console.log(`📊 Zusammenfassung:`);
    console.log(`   - ${articles.length} Artikel`);
    console.log(`   - ${faqs.length} FAQs`);
    console.log(`   - ${newArticles.length} neue Artikel`);
    console.log(`   - ${changedArticles.length} geänderte Artikel`);
    console.log(`\n📁 Dateien:`);
    console.log(`   - ${JASS_CONTENT_PATH}`);
    console.log(`   - ${ARTICLES_JSONL_PATH}`);
    console.log(`   - ${FAQS_JSONL_PATH}`);

  } catch (error) {
    console.error('❌ Fehler beim Import:', error);
    if (error instanceof Error) {
      console.error('Fehlermeldung:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Script ausführen
importFromSpreadsheet()
  .then(() => {
    console.log('\n✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script fehlgeschlagen:', error);
    process.exit(1);
  });

