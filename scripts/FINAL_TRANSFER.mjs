import fs from 'fs/promises';
import path from 'path';

const JSON_FILE_PATH = path.resolve('src/data/jass-content-v2.json');
const ENRICHED_MD_PATH = path.resolve('batches/FAQ_LINKS_KOMPLETT.md');
const BACKUP_DIR = path.resolve('backups');

async function main() {
  try {
    console.log('🚀 [FINAL] Starte Transfer von angereichertem Content (FAQ & Links)...');

    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `jass-content-v2-backup-${timestamp}.json`);
    await fs.copyFile(JSON_FILE_PATH, backupPath);
    console.log(`✅ [FINAL] Backup erstellt unter: ${backupPath}`);

    const jassContent = JSON.parse(await fs.readFile(JSON_FILE_PATH, 'utf-8'));
    const enrichedMdContent = await fs.readFile(ENRICHED_MD_PATH, 'utf-8');
    console.log('✅ [FINAL] jass-content-v2.json und FAQ_LINKS_KOMPLETT.md eingelesen.');

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
    console.log(`✅ [FINAL] ${enrichedArticles.size} angereicherte Artikel aus Markdown geparst.`);

    if (enrichedArticles.size < 240) {
        console.error(`🚨 [FINAL] Kritischer Fehler: Nur ${enrichedArticles.size} Artikel geparst. Erwartet wurden ~242. Abbruch.`);
        return;
    }

    let updatedCount = 0;
    
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
      if(mainCategory.articles) {
          mainCategory.articles.forEach(article => {
               if (enrichedArticles.has(article.id)) {
                  article.text = enrichedArticles.get(article.id);
                  updatedCount++;
              }
          })
      }
    });

    console.log(`🔄 [FINAL] ${updatedCount} Artikel in der JSON-Struktur aktualisiert.`);

    await fs.writeFile(JSON_FILE_PATH, JSON.stringify(jassContent, null, 2), 'utf-8');
    console.log('✅ [FINAL] jass-content-v2.json wurde erfolgreich mit FAQs & Links aktualisiert.');
    console.log('🎉 [FINAL] Transfer abgeschlossen!');

  } catch (error) {
    console.error('❌ [FINAL] Ein Fehler ist aufgetreten:', error);
    process.exit(1);
  }
}

main();
