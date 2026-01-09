#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

/**
 * Generiert Build-Informationen für konsistente Service Worker Versionierung
 */
function generateBuildInfo() {
  const buildTimestamp = Date.now();
  const buildHash = Math.random().toString(36).substring(2, 9);
  const buildId = `${buildTimestamp}-${buildHash}`;
  
  // Lese package.json für Version
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const appVersion = packageJson.version;
  
  const buildInfo = {
    version: appVersion,
    buildId: buildId,
    timestamp: buildTimestamp,
    date: new Date(buildTimestamp).toISOString()
  };
  
  // Schreibe Build-Info
  const buildInfoPath = path.join(rootDir, 'src', 'build-info.json');
  fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
  
  // Erstelle .env.production.local mit Build-Timestamp
  const envContent = `# Auto-generated build information
NEXT_PUBLIC_APP_VERSION=${appVersion}
NEXT_PUBLIC_BUILD_ID=${buildId}
NEXT_PUBLIC_BUILD_TIMESTAMP=${buildTimestamp}
NEXT_PUBLIC_BUILD_DATE=${buildInfo.date}
`;
  
  fs.writeFileSync(path.join(rootDir, '.env.production.local'), envContent);
  
  console.log('✅ Build-Informationen generiert:');
  console.log(`   Version: ${appVersion}`);
  console.log(`   Build ID: ${buildId}`);
  console.log(`   Timestamp: ${buildTimestamp}`);
  console.log(`   Datum: ${buildInfo.date}`);
}

generateBuildInfo();
