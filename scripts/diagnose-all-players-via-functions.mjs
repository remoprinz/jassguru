import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Cloud Functions Script verwenden, um alle Spieler zu analysieren
async function diagnoseAllPlayersViaFunctions() {
  console.log('🔍 DIAGNOSE ALLER SPIELER ÜBER CLOUD FUNCTIONS');
  console.log('===============================================');
  
  try {
    // Erstmal schauen, welche Spieler in der Gruppe sind
    console.log('📋 Verfügbare Diagnose-Scripts:');
    
    // Script ausführen, das alle Spieler analysiert
    const result = execSync('cd /Users/remoprinz/Documents/Jassguru/jasstafel/functions && npm run diagnose-history', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log(result);
    
    // Jetzt schauen wir, ob es ein Script gibt, das alle Spieler analysiert
    console.log('\n🔍 Suche nach weiteren Diagnose-Scripts...');
    
    const packageJson = JSON.parse(readFileSync('/Users/remoprinz/Documents/Jassguru/jasstafel/functions/package.json', 'utf8'));
    console.log('Verfügbare Scripts:', Object.keys(packageJson.scripts));
    
  } catch (error) {
    console.error('❌ Fehler:', error.message);
  }
}

diagnoseAllPlayersViaFunctions();
