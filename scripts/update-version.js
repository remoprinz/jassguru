#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function updateVersion(newVersion) {
  console.log(`🚀 Aktualisiere Version auf ${newVersion}...`);
  
  // 1. src/config/version.ts
  const versionTsPath = path.join(__dirname, '..', 'src', 'config', 'version.ts');
  let versionTsContent = fs.readFileSync(versionTsPath, 'utf8');
  versionTsContent = versionTsContent.replace(
    /export const APP_VERSION = '[^']+';/,
    `export const APP_VERSION = '${newVersion}';`
  );
  fs.writeFileSync(versionTsPath, versionTsContent);
  console.log('✅ src/config/version.ts aktualisiert');
  
  // 2. package.json
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('✅ package.json aktualisiert');
  
  // 3. public/manifest.json
  const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = newVersion;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✅ public/manifest.json aktualisiert');
  
  // 4. src/pages/_app.tsx (Meta-Tag Version)
  const appTsxPath = path.join(__dirname, '..', 'src', 'pages', '_app.tsx');
  let appTsxContent = fs.readFileSync(appTsxPath, 'utf8');
  appTsxContent = appTsxContent.replace(
    /<meta name="version" content="[^"]*" \/>/,
    `<meta name="version" content="${newVersion}" />`
  );
  fs.writeFileSync(appTsxPath, appTsxContent);
  console.log('✅ src/pages/_app.tsx Meta-Tag aktualisiert');
  
  console.log(`🎉 Version ${newVersion} erfolgreich in allen Dateien aktualisiert!`);
  console.log('📦 Nächste Schritte:');
  console.log('   npm run build');
  console.log('   npm run deploy');
}

// Aktuelle Version lesen
const currentPackageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const currentVersion = currentPackageJson.version;

rl.question(`Aktuelle Version: ${currentVersion}\nNeue Version eingeben (z.B. 2.4.6): `, (answer) => {
  if (!answer.trim()) {
    console.log('❌ Keine Version eingegeben. Abbruch.');
    rl.close();
    return;
  }
  
  const newVersion = answer.trim();
  
  // Einfache Validierung
  if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.log('❌ Ungültiges Versionsformat. Verwende x.y.z (z.B. 2.4.6)');
    rl.close();
    return;
  }
  
  updateVersion(newVersion);
  rl.close();
}); 