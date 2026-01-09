import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

/**
 * Validiert Service Worker Build Konsistenz
 * Stellt sicher, dass keine Build ID Mismatches auftreten können
 */
function validateServiceWorker() {
  console.log('🔍 Validiere Service Worker Konsistenz...\n');
  
  let hasErrors = false;
  const buildIds = new Set();
  const serviceWorkerFiles = [];
  
  // 1. Finde alle Service Worker Dateien
  const directories = [
    { path: rootDir, name: 'Root' },
    { path: path.join(rootDir, 'public'), name: 'Public' },
    { path: path.join(rootDir, 'out'), name: 'Out' }
  ];
  
  directories.forEach(dir => {
    if (fs.existsSync(dir.path)) {
      const files = fs.readdirSync(dir.path);
      files.forEach(file => {
        if (file === 'sw.js' || file.includes('workbox-') || file.includes('fallback-')) {
          const filePath = path.join(dir.path, file);
          serviceWorkerFiles.push({
            path: filePath,
            directory: dir.name,
            filename: file
          });
          
          // Extrahiere Build ID aus Dateinamen
          const buildIdMatch = file.match(/fallback-([^.]+)\.js/);
          if (buildIdMatch) {
            buildIds.add(buildIdMatch[1]);
          }
        }
      });
    }
  });
  
  // 2. Prüfe auf mehrere Build IDs
  if (buildIds.size > 1) {
    console.error('❌ FEHLER: Mehrere Build IDs gefunden:');
    buildIds.forEach(id => console.error(`   - ${id}`));
    hasErrors = true;
  }
  
  // 3. Analysiere sw.js Dateien für Build ID Referenzen
  console.log('\n📋 Service Worker Dateien:');
  const swBuildIds = new Set();
  
  serviceWorkerFiles.forEach(file => {
    console.log(`\n   ${file.directory}/${file.filename}`);
    
    if (file.filename === 'sw.js') {
      try {
        const content = fs.readFileSync(file.path, 'utf8');
        const fallbackMatch = content.match(/fallback-([^"']+)\.js/);
        if (fallbackMatch) {
          swBuildIds.add(fallbackMatch[1]);
          console.log(`     → Build ID: ${fallbackMatch[1]}`);
        }
      } catch (err) {
        console.error(`     → Fehler beim Lesen: ${err.message}`);
      }
    }
  });
  
  // 4. Prüfe index.html Build ID
  const indexPath = path.join(rootDir, 'out', 'index.html');
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const scriptMatch = indexContent.match(/\/_buildManifest\.js.*buildId['"]:['"]([^'"]+)/);
    const nextDataMatch = indexContent.match(/"buildId":\s*"([^"]+)"/);
    const buildId = scriptMatch?.[1] || nextDataMatch?.[1];
    
    if (buildId) {
      console.log(`\n📄 index.html Build ID: ${buildId}`);
      
      // Prüfe ob diese Build ID in den SW Dateien referenziert wird
      if (swBuildIds.size > 0 && !swBuildIds.has(buildId)) {
        console.error('\n❌ KRITISCHER FEHLER: Build ID Mismatch!');
        console.error(`   index.html: ${buildId}`);
        console.error(`   Service Worker: ${[...swBuildIds].join(', ')}`);
        hasErrors = true;
      }
    }
  }
  
  // 5. Warnung vor Service Worker im Root
  const rootSW = serviceWorkerFiles.find(f => f.directory === 'Root' && f.filename === 'sw.js');
  if (rootSW) {
    console.warn('\n⚠️  WARNUNG: Service Worker im Root-Verzeichnis gefunden!');
    console.warn('   Dies kann zu Deployment-Problemen führen.');
    console.warn('   Führen Sie "npm run clean" aus.');
  }
  
  // 6. Zusammenfassung
  console.log('\n' + '='.repeat(50));
  if (hasErrors) {
    console.error('❌ Validierung FEHLGESCHLAGEN!');
    console.error('\nLösungsvorschlag:');
    console.error('1. npm run clean');
    console.error('2. npm run build');
    console.error('3. npm run validate\n');
    process.exit(1);
  } else {
    console.log('✅ Service Worker Validierung erfolgreich!');
    console.log(`   Build IDs sind konsistent: ${[...buildIds].join(', ') || 'keine gefunden'}`);
  }
}

// Führe Validierung aus
validateServiceWorker();
