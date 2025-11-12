/**
 * 🔍 MIGRATION TEST: Critical Player ID Security Check
 * 
 * Dieses Script testet NUR die kritischen Player-IDs und zeigt eine Vorschau 
 * der Migration, ohne echte Änderungen an der Datenbank zu machen.
 * 
 * Alle anderen Player-IDs (auch alte, zufällige) bleiben UNVERÄNDERT!
 */

import * as admin from 'firebase-admin';
import * as serviceAccount from '../serviceAccountKey.json';

// Firebase Admin SDK initialisieren
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://jasstafel-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.firestore();

interface PlayerAnalysis {
  playerId: string;
  userId: string;
  displayName: string;
  isCritical: boolean;
  pattern: string;
  groups: number;
  sessions: number;
  tournaments: number;
  createdAt: string;
}

async function analyzeAllPlayerIds(): Promise<PlayerAnalysis[]> {
  console.log('🔍 Analysiere alle Player-IDs (Fokus auf KRITISCHE)...');
  
  const playersSnapshot = await db.collection('players').get();
  const analyses: PlayerAnalysis[] = [];
  
  for (const doc of playersSnapshot.docs) {
    const playerId = doc.id;
    const data = doc.data();
    
    // NUR das kritische Pattern identifizieren
    const criticalPattern = /^player_[a-zA-Z0-9]{20,}$/;
    const isCritical = criticalPattern.test(playerId);
    
    let pattern = 'secure_existing';
    if (isCritical) {
      pattern = 'CRITICAL_predictable_user_id';
    } else if (playerId.startsWith('player_')) {
      pattern = 'safe_player_prefix';
    } else if (playerId.length < 10) {
      pattern = 'safe_short_id';
    } else {
      pattern = 'safe_random_id';
    }
    
    // Auswirkungen analysieren (nur für kritische IDs)
    let groupsCount = 0;
    let sessionsCount = 0;
    let tournamentsCount = 0;
    
    if (isCritical) {
      const groupsSnapshot = await db.collection('groups')
        .where('playerIds', 'array-contains', playerId)
        .get();
      
      const sessionsSnapshot = await db.collection('sessions')
        .where('participantPlayerIds', 'array-contains', playerId)
        .get();
      
      const tournamentsSnapshot = await db.collection('tournaments')
        .where('participantPlayerIds', 'array-contains', playerId)
        .get();
        
      groupsCount = groupsSnapshot.size;
      sessionsCount = sessionsSnapshot.size;
      tournamentsCount = tournamentsSnapshot.size;
    }
    
    analyses.push({
      playerId,
      userId: data.userId || 'unknown',
      displayName: data.displayName || 'Unbekannt',
      isCritical,
      pattern,
      groups: groupsCount,
      sessions: sessionsCount,
      tournaments: tournamentsCount,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || 'unknown'
    });
  }
  
  return analyses;
}

async function generateCriticalSecurityReport(): Promise<void> {
  console.log('🔒 Generiere KRITISCHEN Sicherheitsbericht...\n');
  
  const analyses = await analyzeAllPlayerIds();
  
  // Statistiken
  const total = analyses.length;
  const critical = analyses.filter(a => a.isCritical).length;
  const safe = total - critical;
  
  // Patterns
  const patterns = analyses.reduce((acc, a) => {
    acc[a.pattern] = (acc[a.pattern] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Auswirkungen (nur kritische)
  const criticalAnalyses = analyses.filter(a => a.isCritical);
  const totalGroups = criticalAnalyses.reduce((sum, a) => sum + a.groups, 0);
  const totalSessions = criticalAnalyses.reduce((sum, a) => sum + a.sessions, 0);
  const totalTournaments = criticalAnalyses.reduce((sum, a) => sum + a.tournaments, 0);
  
  console.log('📊 KRITISCHER SICHERHEITSBERICHT');
  console.log('================================');
  console.log(`Total Player-IDs in DB: ${total}`);
  console.log(`🚨 KRITISCHE Player-IDs: ${critical} (${critical > 0 ? ((critical/total)*100).toFixed(1) : '0.0'}%)`);
  console.log(`✅ SICHERE Player-IDs: ${safe} (${((safe/total)*100).toFixed(1)}%)`);
  console.log('');
  
  console.log('🔍 PATTERN-ANALYSE');
  console.log('==================');
  Object.entries(patterns).forEach(([pattern, count]) => {
    const percentage = ((count/total)*100).toFixed(1);
    const icon = pattern.includes('CRITICAL') ? '🚨' : '✅';
    const status = pattern.includes('CRITICAL') ? 'MUSS MIGRIERT WERDEN' : 'BLEIBT UNVERÄNDERT';
    console.log(`${icon} ${pattern}: ${count} (${percentage}%) - ${status}`);
  });
  console.log('');
  
  if (critical > 0) {
    console.log('🎯 AUSWIRKUNGEN DER KRITISCHEN IDs');
    console.log('=================================');
    console.log(`Betroffene Gruppen: ${totalGroups}`);
    console.log(`Betroffene Sessions: ${totalSessions}`);
    console.log(`Betroffene Turniere: ${totalTournaments}`);
    console.log('');
    
    // Detaillierte Analyse kritischer Player
    console.log('🚨 KRITISCHE PLAYER-IDS (werden migriert)');
    console.log('==========================================');
    
    criticalAnalyses.forEach((player, index) => {
      console.log(`${index + 1}. ${player.playerId}`);
      console.log(`   User: ${player.userId}`);
      console.log(`   Name: ${player.displayName}`);
      console.log(`   Erstellt: ${player.createdAt}`);
      console.log(`   Auswirkungen: ${player.groups} Gruppen, ${player.sessions} Sessions, ${player.tournaments} Turniere`);
      console.log('');
    });
    
    console.log('⚠️  SICHERHEITSRISIKO:');
    console.log('   Diese Player-IDs können erraten werden!');
    console.log('   Format: player_[vorhersagbare_user_id]');
    console.log('   🚨 SOFORTIGE MIGRATION ERFORDERLICH!');
    console.log('');
    
    // Migrationsdryrun
    console.log('📋 MIGRATIONS-VORSCHAU (NUR KRITISCHE IDs)');
    console.log('==========================================');
    console.log('Wenn die Migration ausgeführt wird:');
    console.log(`- 🚨 ${critical} KRITISCHE Player-IDs werden geändert`);
    console.log(`- ✅ ${safe} sichere Player-IDs bleiben UNVERÄNDERT`);
    console.log(`- 📊 ${totalGroups} Gruppen werden aktualisiert`);
    console.log(`- 📊 ${totalSessions} Sessions werden aktualisiert`);
    console.log(`- 📊 ${totalTournaments} Turniere werden aktualisiert`);
    console.log(`- 📊 ${critical} User-Dokumente werden aktualisiert`);
    console.log('');
    
    console.log('🔒 NACH MIGRATION:');
    console.log('- Kritische Player-IDs → kryptographisch sichere, zufällige IDs');
    console.log('- Sichere Player-IDs → KEINE ÄNDERUNG');
    console.log('- Alle Referenzen werden korrekt aktualisiert');
    console.log('- Referenzielle Integrität bleibt erhalten');
    console.log('- Funktionalität bleibt vollständig erhalten');
    console.log('');
  }
  
  // Sichere Player-IDs (werden NICHT verändert)
  if (safe > 0) {
    console.log('✅ SICHERE PLAYER-IDS (bleiben unverändert)');
    console.log('============================================');
    
    const safeAnalyses = analyses.filter(a => !a.isCritical);
    const safePatterns = safeAnalyses.reduce((acc, a) => {
      acc[a.pattern] = (acc[a.pattern] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(safePatterns).forEach(([pattern, count]) => {
      console.log(`✅ ${pattern}: ${count} Player-IDs (bleiben unverändert)`);
    });
    console.log('');
  }
  
  // Empfehlungen
  console.log('💡 EMPFEHLUNGEN');
  console.log('===============');
  
  if (critical === 0) {
    console.log('🎉 KEINE AKTION ERFORDERLICH!');
    console.log('✅ Alle Player-IDs sind bereits sicher!');
    console.log('✅ Keine Migration notwendig!');
  } else {
    console.log('🚨 SOFORTIGE AKTION ERFORDERLICH:');
    console.log('1. 💾 Backup der Datenbank erstellen');
    console.log('2. 🧪 Migration in Testumgebung durchführen');
    console.log('3. 🚀 Migration in Produktionsumgebung ausführen');
    console.log('4. 📦 Sicherheitsfix in Code deployen');
    console.log('');
    console.log('⚡ Befehl zur Migration:');
    console.log('cd functions && npx ts-node scripts/migration-fix-player-ids.ts');
    console.log('');
    console.log('🛡️  WICHTIG: Nur kritische Player-IDs werden geändert!');
    console.log('     Alle anderen Player-IDs bleiben unverändert!');
  }
}

// Ausführung nur wenn direkt aufgerufen
if (require.main === module) {
  generateCriticalSecurityReport()
    .then(() => {
      console.log('\n🎉 Kritischer Sicherheitsbericht abgeschlossen!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Fehler beim Generieren des Sicherheitsberichts:', error);
      process.exit(1);
    });
} 