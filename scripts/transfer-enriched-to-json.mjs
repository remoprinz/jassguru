
import fs from 'fs/promises';
import path from 'path';

const JSON_FILE_PATH = path.resolve('src/data/jass-content-v2.json');
const ENRICHED_MD_PATH = path.resolve('batches/FAQ_LINKS_KOMPLETT.md');
const BACKUP_DIR = path.resolve('backups');

async function main() {
  try {
    console.log('🚀 Starte Transfer von angereichertem Content (FAQ & Links)...');

    // 1. Backup erstellen
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `jass-content-v2-backup-${timestamp}.json`);
    await fs.copyFile(JSON_FILE_PATH, backupPath);
    console.log(`✅ Backup erstellt unter: ${backupPath}`);

    // 2. Erforderliche Dateien einlesen
    const jassContent = JSON.parse(await fs.readFile(JSON_FILE_PATH, 'utf-8'));
    const enrichedMdContent = await fs.readFile(ENRICHED_MD_PATH, 'utf-8');
    console.log('✅ jass-content-v2.json und FAQ_LINKS_KOMPLETT.md eingelesen.');

    // 3. Angereicherte Artikel aus Markdown parsen
    const enrichedArticles = new Map();
    const articlePattern = /## `([^`]+)`\s*### ✅ OPTIMIERT & ANGEREICHERT:\s*```markdown\s*([\s\S]*?)\n```/gm;
    let match;
    while ((match = articlePattern.exec(enrichedMdContent)) !== null) {
      const id = match[1].trim();
      const newText = match[2].trim();
      if (id && newText) {
        enrichedArticles.set(id, newText);
      }
    }
    console.log(`✅ ${enrichedArticles.size} angereicherte Artikel aus Markdown geparst.`);

    if (enrichedArticles.size < 240) {
        console.error(`🚨 Kritischer Fehler: Nur ${enrichedArticles.size} Artikel geparst. Erwartet wurden ~242. Abbruch.`);
        return;
    }

    // 4. JSON-Daten aktualisieren
    let updatedCount = 0;
    let notFoundCount = 0;
    const notFoundIds = [];

    jassContent.forEach(mainCategory => {
      if (mainCategory.subcategories) {
        mainCategory.subcategories.forEach(subCategory => {
          if (subCategory.articles) {
            subCategory.articles.forEach(article => {
              if (enrichedArticles.has(article.id)) {
                article.text = enrichedArticles.get(article.id);
                updatedCount++;
              }
            });
          }
        });
      }
      // Artikel direkt unter der Hauptkategorie (falls vorhanden)
      if(mainCategory.articles) {
          mainCategory.articles.forEach(article => {
               if (enrichedArticles.has(article.id)) {
                  article.text = enrichedArticles.get(article.id);
                  updatedCount++;
              }
          })
      }
    });

    console.log(`🔄 ${updatedCount} Artikel in der JSON-Struktur aktualisiert.`);

    // Überprüfen, ob alle geparsten Artikel auch im JSON gefunden wurden
    for (const id of enrichedArticles.keys()) {
        const found = jassContent.some(mc => 
            (mc.subcategories && mc.subcategories.some(sc => sc.articles && sc.articles.some(a => a.id === id))) ||
            (mc.articles && mc.articles.some(a => a.id === id))
        );
        if (!found) {
            notFoundCount++;
            notFoundIds.push(id);
        }
    }

    if (notFoundCount > 0) {
        console.warn(`⚠️ ${notFoundCount} Artikel aus der Markdown-Datei wurden nicht in jass-content-v2.json gefunden:`);
        console.warn(notFoundIds.join(', '));
    }

    // 5. Sortierung beibehalten (wurde bereits im vorherigen Schritt gemacht)
    // Keine neue Sortierung hier, um die bestehende Ordnung nicht zu zerstören.

    // 6. Aktualisierte JSON-Datei schreiben
    await fs.writeFile(JSON_FILE_PATH, JSON.stringify(jassContent, null, 2), 'utf-8');
    console.log('✅ jass-content-v2.json wurde erfolgreich aktualisiert.');
    console.log('🎉 Transfer abgeschlossen!');

  } catch (error) {
    console.error('❌ Ein Fehler ist aufgetreten:', error);
    process.exit(1);
  }
}

main();
