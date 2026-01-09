#!/usr/bin/env node

/**
 * 🔗 Link-Validierungs-Script für jasswiki.ch
 * 
 * Prüft alle internen Links in jass-content-v2.json und validiert sie
 * gegen die knowledgebase.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: Slug-Generierung (wie in toSlug() Funktion)
function toSlug(text) {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Helper: Extrahiere alle Links aus Text
function extractLinks(text) {
  const linkPattern = /\[([^\]]+)\]\((\/wissen\/[^\)]+)\)/g;
  const links = [];
  let match;
  
  while ((match = linkPattern.exec(text)) !== null) {
    links.push({
      text: match[1],
      url: match[2]
    });
  }
  
  return links;
}

// Helper: Validiere URL gegen Knowledgebase
function validateLink(linkUrl, knowledgebase) {
  // Entferne führenden /wissen/
  const pathWithoutPrefix = linkUrl.replace(/^\/wissen\//, '');
  
  // Suche in Knowledgebase
  const kbEntry = knowledgebase.find(entry => {
    const kbPath = entry.slug || '';
    return kbPath === pathWithoutPrefix;
  });
  
  if (kbEntry) {
    return {
      valid: true,
      entry: kbEntry,
      issue: null
    };
  }
  
  // Prüfe auf häufige Probleme
  const issues = [];
  
  if (pathWithoutPrefix.includes('_')) {
    issues.push({
      type: 'slug_contains_underscore',
      suggestion: pathWithoutPrefix.replace(/_/g, '-')
    });
  }
  
  // Suche nach ähnlichen Einträgen
  const similarEntries = knowledgebase.filter(entry => {
    const kbPath = entry.slug || '';
    // Einfache Ähnlichkeitsprüfung
    return kbPath.toLowerCase().includes(pathWithoutPrefix.toLowerCase().slice(0, 10)) ||
           pathWithoutPrefix.toLowerCase().includes(kbPath.toLowerCase().slice(0, 10));
  });
  
  if (similarEntries.length > 0) {
    issues.push({
      type: 'similar_entries_found',
      suggestions: similarEntries.map(e => `/wissen/${e.slug}`)
    });
  }
  
  return {
    valid: false,
    entry: null,
    issues: issues,
    similarEntries: similarEntries
  };
}

// Hauptfunktion
async function main() {
  console.log('🔍 Link-Validierung gestartet...\n');
  
  // Dateien einlesen
  const jassContentPath = path.join(__dirname, '../src/data/jass-content-v2.json');
  const knowledgebasePath = path.join(__dirname, '../src/data/knowledgebase.json');
  
  console.log('📂 Lade Dateien...');
  const jassContent = JSON.parse(fs.readFileSync(jassContentPath, 'utf8'));
  const knowledgebase = JSON.parse(fs.readFileSync(knowledgebasePath, 'utf8'));
  
  console.log(`✅ ${Object.keys(jassContent).length} Artikel geladen`);
  console.log(`✅ ${knowledgebase.length} Knowledgebase-Einträge geladen\n`);
  
  // Alle Links sammeln
  const allLinks = [];
  const report = {
    summary: {
      total_articles: Object.keys(jassContent).length,
      articles_with_links: 0,
      total_links_found: 0,
      valid_links: 0,
      invalid_links: 0
    },
    invalid_links: [],
    missing_targets: []
  };
  
  console.log('🔗 Extrahiere Links aus Artikeln...\n');
  
  // Durch alle Artikel iterieren
  for (const [articleId, article] of Object.entries(jassContent)) {
    const links = extractLinks(article.text || '');
    
    if (links.length > 0) {
      report.summary.articles_with_links++;
      report.summary.total_links_found += links.length;
      
      // Jeden Link validieren
      for (const link of links) {
        const validation = validateLink(link.url, knowledgebase);
        
        if (validation.valid) {
          report.summary.valid_links++;
        } else {
          report.summary.invalid_links++;
          
          report.invalid_links.push({
            article_id: articleId,
            article_title: article.metadata?.category?.topic || articleId,
            link_text: link.text,
            link_url: link.url,
            issues: validation.issues || [{ type: 'target_not_found' }],
            similar_entries: validation.similarEntries?.map(e => ({
              id: e.id,
              title: e.title,
              slug: e.slug,
              url: e.url
            })) || []
          });
        }
        
        allLinks.push({
          article_id: articleId,
          link: link,
          validation: validation
        });
      }
    }
  }
  
  // Report anzeigen
  console.log('📊 VALIDIERUNGS-REPORT');
  console.log('='.repeat(50));
  console.log(`Gesamt Artikel:           ${report.summary.total_articles}`);
  console.log(`Artikel mit Links:        ${report.summary.articles_with_links}`);
  console.log(`Links gefunden:           ${report.summary.total_links_found}`);
  console.log(`✅ Gültige Links:         ${report.summary.valid_links}`);
  console.log(`❌ Ungültige Links:       ${report.summary.invalid_links}`);
  console.log('='.repeat(50));
  
  if (report.invalid_links.length > 0) {
    console.log('\n❌ UNGÜLTIGE LINKS:');
    console.log('-'.repeat(50));
    
    report.invalid_links.forEach((item, index) => {
      console.log(`\n${index + 1}. Artikel: ${item.article_id}`);
      console.log(`   Titel: ${item.article_title}`);
      console.log(`   Link: [${item.link_text}](${item.link_url})`);
      console.log(`   Probleme:`);
      item.issues.forEach(issue => {
        console.log(`     - ${issue.type}`);
        if (issue.suggestion) {
          console.log(`       → Vorschlag: ${issue.suggestion}`);
        }
      });
      if (item.similar_entries.length > 0) {
        console.log(`   Ähnliche Einträge gefunden:`);
        item.similar_entries.slice(0, 3).forEach(entry => {
          console.log(`     - ${entry.title}: ${entry.url}`);
        });
      }
    });
  } else {
    console.log('\n✅ Alle Links sind gültig!');
  }
  
  // Report speichern
  const reportPath = path.join(__dirname, '../link-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n💾 Report gespeichert: ${reportPath}`);
}

main().catch(console.error);

