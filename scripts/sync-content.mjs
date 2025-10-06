import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const main = async () => {
  console.log('🚀 Starting content migration (V2)...');

  try {
    // Führe das neue Migrations-Skript aus
    execSync('node scripts/migrate-content-v2.mjs', { 
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });

    // Prüfe, ob die Migration erfolgreich war
    const v2File = path.resolve(__dirname, '../src/data/jass-content-v2.json');
    if (!fs.existsSync(v2File)) {
      throw new Error('Migration failed: jass-content-v2.json was not created!');
    }

    const v2Content = JSON.parse(fs.readFileSync(v2File, 'utf-8'));
    const articleCount = Object.keys(v2Content).length;

    console.log(`✅ Successfully migrated ${articleCount} content items.`);
    console.log(`📝 Content written to: ${v2File}`);
    
    // WICHTIG: Kopiere v2 nach jass-lexikon.json für Backward Compatibility
    const lexikonFile = path.resolve(__dirname, '../src/data/jass-lexikon.json');
    fs.copyFileSync(v2File, lexikonFile);
    console.log(`📝 Copied to: ${lexikonFile} (for backward compatibility)`);
    
  } catch (error) {
    console.error('🔥 Error during content migration:', error);
    process.exit(1);
  }

  console.log('🎉 Content migration finished.');
};

main(); 