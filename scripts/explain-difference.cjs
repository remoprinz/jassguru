const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';

console.log('\n📋 ERKLÄRUNG: Was schreibt finalizeTournament vs. finalizeSession?\n');
console.log('='.repeat(120));
console.log('\n1. BEIDE FUNKTIONEN RUFEN DIE GLEICHEN SERVICES AUF:\n');
console.log('   ✅ updatePlayerDataAfterSession()');
console.log('      → Schreibt: players/{playerId}/globalStats.current');
console.log('      → Wird aufgerufen von:');
console.log('         - finalizeSession.ts (Zeile 1042)');
console.log('         - finalizeTournament.ts (Zeile 1122)');
console.log('\n   ✅ updateChartsAfterSession()');
console.log('      → Schreibt: groups/{groupId}/aggregated/chartData_*');
console.log('      → Wird aufgerufen von:');
console.log('         - finalizeSession.ts (Zeile 1058)');
console.log('         - finalizeTournament.ts (Zeile 2169)');
console.log('\n2. UNTERSCHIED: Wann werden die Daten geschrieben?\n');
console.log('   finalizeSession:');
console.log('   - Wird aufgerufen NACH jeder Session');
console.log('   - Spieler haben bereits globalStats.current aus vorherigen Sessions');
console.log('   - updatePlayerDataAfterSession AKTUALISIERT die bestehenden Daten');
console.log('\n   finalizeTournament:');
console.log('   - Wird aufgerufen NACH dem Turnier');
console.log('   - NEUE Spieler haben KEINE globalStats.current');
console.log('   - updatePlayerDataAfterSession MUSS neue Daten ERSTELLEN');
console.log('\n3. DAS PROBLEM:\n');
console.log('   ❌ VORHER: unifiedPlayerDataService.ts schrieb in globalStats (ohne .current)');
console.log('   ✅ JETZT: unifiedPlayerDataService.ts schreibt in globalStats.current');
console.log('   ✅ BACKFILL: Hat globalStats.current für die 3 neuen Spieler erstellt');
console.log('\n4. WARUM HATTEN ALTE SPIELER DATEN UND NEUE NICHT?\n');
console.log('   Alte Spieler:');
console.log('   - Haben bereits globalStats.current aus vorherigen Sessions');
console.log('   - updatePlayerDataAfterSession hat die Daten AKTUALISIERT');
console.log('   - ✅ Statistiken funktionieren');
console.log('\n   Neue Spieler (Reto, Schällenursli, Davester):');
console.log('   - Haben KEINE globalStats.current (nur Turnier-Daten)');
console.log('   - updatePlayerDataAfterSession sollte neue Daten ERSTELLEN');
console.log('   - ❌ ABER: Vor dem Fix wurde in globalStats (ohne .current) geschrieben!');
console.log('   - ✅ JETZT: Backfill hat globalStats.current erstellt');
console.log('\n5. WO LIEGEN DIE DATEN?\n');
console.log('   Charts (Strichdifferenz, Punktdifferenz):');
console.log('   - Quelle: players/{playerId}/scoresHistory');
console.log('   - Geschrieben von: jassEloUpdater.ts (pro Spiel)');
console.log('   - ✅ Funktioniert für alle Spieler (auch neue)');
console.log('\n   Andere Statistiken (Siegquote, Matsch-Bilanz, etc.):');
console.log('   - Quelle: players/{playerId}/globalStats.current');
console.log('   - Geschrieben von: updatePlayerDataAfterSession');
console.log('   - ✅ JETZT: Funktioniert für alle Spieler (nach Backfill)');
console.log('\n' + '='.repeat(120) + '\n');

