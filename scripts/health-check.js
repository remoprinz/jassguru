#!/usr/bin/env node
import https from 'https';

const SITE_URL = 'https://jassguru.ch';
const TIMEOUT = 10000; // 10 Sekunden

console.log('🏥 Health Check für jassguru.ch\n');

let hasErrors = false;

// Funktion um HTTP Requests zu machen
function checkUrl(url, expectedContentType) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    https.get(url, { timeout: TIMEOUT }, (res) => {
      const duration = Date.now() - startTime;
      const contentType = res.headers['content-type'];
      
      if (res.statusCode === 200) {
        if (!expectedContentType || contentType.includes(expectedContentType)) {
          console.log(`✅ ${url} - ${res.statusCode} (${duration}ms)`);
          resolve(true);
        } else {
          console.error(`❌ ${url} - Falscher Content-Type: ${contentType} (erwartet: ${expectedContentType})`);
          hasErrors = true;
          resolve(false);
        }
      } else {
        console.error(`❌ ${url} - Status: ${res.statusCode}`);
        hasErrors = true;
        resolve(false);
      }
    }).on('error', (err) => {
      console.error(`❌ ${url} - Fehler: ${err.message}`);
      hasErrors = true;
      resolve(false);
    });
  });
}

async function runHealthCheck() {
  // Hauptseite überprüfen
  await checkUrl(SITE_URL, 'text/html');
  
  // Hole die Hauptseite um Asset-URLs zu extrahieren
  const htmlContent = await new Promise((resolve) => {
    https.get(SITE_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
  
  // Extrahiere CSS URLs
  const cssMatches = htmlContent.match(/\/_next\/static\/css\/[^"']+\.css/g);
  if (cssMatches && cssMatches.length > 0) {
    console.log(`\n📋 Überprüfe ${cssMatches.length} CSS Datei(n)...`);
    for (const cssPath of [...new Set(cssMatches)]) {
      await checkUrl(`${SITE_URL}${cssPath}`, 'text/css');
    }
  } else {
    console.error('❌ Keine CSS Dateien gefunden!');
    hasErrors = true;
  }
  
  // Extrahiere JS URLs
  const jsMatches = htmlContent.match(/\/_next\/static\/chunks\/[^"']+\.js/g);
  if (jsMatches && jsMatches.length > 0) {
    console.log(`\n📋 Überprüfe ${Math.min(5, jsMatches.length)} von ${jsMatches.length} JS Dateien...`);
    const uniqueJs = [...new Set(jsMatches)].slice(0, 5); // Nur erste 5 testen
    for (const jsPath of uniqueJs) {
      await checkUrl(`${SITE_URL}${jsPath}`, 'javascript');
    }
  }
  
  // Überprüfe wichtige Ressourcen
  console.log('\n📋 Überprüfe wichtige Ressourcen...');
  await checkUrl(`${SITE_URL}/manifest.json`, 'application/json');
  await checkUrl(`${SITE_URL}/sw.js`, 'javascript');
  await checkUrl(`${SITE_URL}/favicon.ico`, 'image/');
  
  // Zusammenfassung
  console.log('\n' + (hasErrors ? '❌ Health Check fehlgeschlagen!' : '✅ Health Check erfolgreich!'));
  console.log(`Zeitpunkt: ${new Date().toLocaleString('de-CH')}`);
  
  process.exit(hasErrors ? 1 : 0);
}

runHealthCheck(); 