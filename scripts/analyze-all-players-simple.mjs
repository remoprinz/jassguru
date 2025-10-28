import { execSync } from 'child_process';

async function analyzeAllPlayers() {
  console.log('🔍 ANALYSE ALLER SPIELER IN DER GRUPPE');
  console.log('========================================\n');
  
  try {
    // Erstmal schauen, welche Spieler in der Gruppe sind
    console.log('📋 Suche nach Spielern in der Gruppe...\n');
    
    // Verwende das funktionierende diagnose-history Script
    const result = execSync('cd /Users/remoprinz/Documents/Jassguru/jasstafel/functions && npm run diagnose-history', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log(result);
    
    console.log('\n🔍 ZUSÄTZLICHE ANALYSE:');
    console.log('======================');
    
    // Analysiere die verfügbaren Scripts
    const packageJsonResult = execSync('cd /Users/remoprinz/Documents/Jassguru/jasstafel/functions && cat package.json | grep -A 50 "scripts"', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log('Verfügbare Scripts:');
    console.log(packageJsonResult);
    
  } catch (error) {
    console.error('❌ Fehler:', error.message);
  }
}

analyzeAllPlayers();
