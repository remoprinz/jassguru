#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

console.log('🔍 Validiere Deployment...\n');

let hasErrors = false;

// Überprüfe ob out Verzeichnis existiert
const outDir = path.join(rootDir, 'out');
if (!fs.existsSync(outDir)) {
  console.error('❌ Fehler: out Verzeichnis existiert nicht. Führe zuerst "npm run build" aus.');
  hasErrors = true;
} else {
  console.log('✅ out Verzeichnis gefunden');
}

// Überprüfe kritische Dateien
const criticalFiles = [
  'index.html',
  'manifest.json',
  'sw.js',
  '_next/static/chunks'
];

for (const file of criticalFiles) {
  const filePath = path.join(outDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Fehler: Kritische Datei/Verzeichnis fehlt: ${file}`);
    hasErrors = true;
  } else {
    console.log(`✅ ${file} gefunden`);
  }
}

// Überprüfe CSS Dateien
const cssDir = path.join(outDir, '_next/static/css');
if (fs.existsSync(cssDir)) {
  const cssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
  if (cssFiles.length === 0) {
    console.error('❌ Fehler: Keine CSS Dateien im Build gefunden');
    hasErrors = true;
  } else {
    console.log(`✅ ${cssFiles.length} CSS Datei(n) gefunden`);
  }
}

// Überprüfe JavaScript Chunks
const chunksDir = path.join(outDir, '_next/static/chunks');
if (fs.existsSync(chunksDir)) {
  const jsFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js'));
  if (jsFiles.length === 0) {
    console.error('❌ Fehler: Keine JavaScript-Chunks im Build gefunden');
    hasErrors = true;
  } else {
    console.log(`✅ ${jsFiles.length} JavaScript-Chunk(s) gefunden`);
  }
}

// Überprüfe Build Manifest (für Static Export)
const buildManifestFiles = fs.readdirSync(path.join(outDir, '_next/static'))
  .filter(dir => fs.statSync(path.join(outDir, '_next/static', dir)).isDirectory())
  .map(dir => path.join(outDir, '_next/static', dir, '_buildManifest.js'))
  .filter(file => fs.existsSync(file));

if (buildManifestFiles.length > 0) {
  console.log(`✅ Build Manifest gefunden: ${buildManifestFiles.length} Datei(en)`);
} else {
  console.error('❌ Fehler: Build Manifest nicht gefunden');
  hasErrors = true;
}

// Überprüfe index.html Integrität
const indexPath = path.join(outDir, 'index.html');
if (fs.existsSync(indexPath)) {
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  
  // Überprüfe ob CSS und JS richtig verlinkt sind (Next.js 16+ mit Turbopack)
  // CSS kann inline sein oder in chunks — beides ist OK
  if (!indexContent.includes('/_next/static/css/') && !indexContent.includes('<style') && !indexContent.includes('.css')) {
    console.warn('⚠️  Hinweis: Kein separates CSS-Verzeichnis — CSS ist inline oder in Chunks (Next.js 16+)');
  }

  if (!indexContent.includes('/_next/static/chunks/')) {
    console.error('❌ Fehler: Keine JS-Verlinkung in index.html gefunden');
    hasErrors = true;
  }
  
  console.log('✅ index.html Struktur validiert');
}

// Überprüfe Service Worker Konsistenz
console.log('\n🔍 Prüfe Service Worker Konsistenz...');
const swPath = path.join(outDir, 'sw.js');
if (fs.existsSync(swPath)) {
  const swContent = fs.readFileSync(swPath, 'utf8');
  const fallbackMatch = swContent.match(/fallback-([^"']+)\.js/);
  if (fallbackMatch) {
    const swBuildId = fallbackMatch[1];
    console.log(`  Service Worker Build ID: ${swBuildId}`);
    
    // Extrahiere Build ID aus index.html
    const indexPath = path.join(outDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      const indexContent = fs.readFileSync(indexPath, 'utf8');
      const buildIdMatch = indexContent.match(/"buildId":\s*"([^"]+)"/);
      if (buildIdMatch) {
        const indexBuildId = buildIdMatch[1];
        if (swBuildId !== indexBuildId) {
          console.error('❌ KRITISCHER FEHLER: Build ID Mismatch!');
          console.error(`   index.html Build ID: ${indexBuildId}`);
          console.error(`   Service Worker Build ID: ${swBuildId}`);
          hasErrors = true;
        } else {
          console.log('✅ Build IDs sind konsistent');
        }
      }
    }
    
    // Prüfe ob Fallback-Datei existiert
    const fallbackFile = `fallback-${swBuildId}.js`;
    if (!fs.existsSync(path.join(outDir, fallbackFile))) {
      console.error(`❌ Fehler: Fallback-Datei fehlt: ${fallbackFile}`);
      hasErrors = true;
    }
  }
}

// Warnung vor Service Worker im Root
if (fs.existsSync(path.join(rootDir, 'sw.js'))) {
  console.warn('\n⚠️  WARNUNG: Service Worker im Root-Verzeichnis gefunden!');
  console.warn('   Dies kann zu Deployment-Problemen führen.');
  hasErrors = true;
}

console.log('\n' + (hasErrors ? '❌ Validierung fehlgeschlagen!' : '✅ Validierung erfolgreich!'));

if (hasErrors) {
  process.exit(1);
} 