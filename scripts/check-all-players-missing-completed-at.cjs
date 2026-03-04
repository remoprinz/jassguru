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

async function checkAllPlayersMissingCompletedAt() {
  console.log('\n🔍 PRÜFE ALLE SPIELER AUF FEHLENDE completedAt IN ratingHistory\n');
  console.log('='.repeat(120));

  try {
    // Hole alle Spieler
    const playersSnap = await db.collection('players').get();
    
    console.log(`\n📊 Gefunden: ${playersSnap.docs.length} Spieler\n`);
    
    const problemPlayers = [];
    let totalMissingEntries = 0;
    
    for (const playerDoc of playersSnap.docs) {
      const playerId = playerDoc.id;
      const playerData = playerDoc.data();
      const displayName = playerData.displayName || playerId.substring(0, 10);
      
      // Prüfe ratingHistory
      const ratingHistorySnap = await db.collection(`players/${playerId}/ratingHistory`).get();
      
      if (ratingHistorySnap.empty) continue;
      
      const missingCompletedAt = [];
      
      ratingHistorySnap.docs.forEach(doc => {
        const data = doc.data();
        
        if (!data.completedAt) {
          missingCompletedAt.push({
            docId: doc.id,
            rating: data.rating,
            delta: data.delta,
            createdAt: data.createdAt,
            sessionId: data.sessionId,
            tournamentId: data.tournamentId,
            eventType: data.eventType
          });
        }
      });
      
      if (missingCompletedAt.length > 0) {
        problemPlayers.push({
          playerId,
          displayName,
          totalEntries: ratingHistorySnap.docs.length,
          missingEntries: missingCompletedAt
        });
        totalMissingEntries += missingCompletedAt.length;
      }
    }
    
    console.log('='.repeat(120));
    console.log(`🚨 ERGEBNIS: ${problemPlayers.length} Spieler mit fehlenden completedAt\n`);
    console.log('='.repeat(120));
    
    if (problemPlayers.length === 0) {
      console.log('\n✅ ALLE SPIELER: completedAt ist in allen ratingHistory-Einträgen vorhanden!');
    } else {
      console.log('\n❌ FOLGENDE SPIELER HABEN EINTRÄGE OHNE completedAt:\n');
      console.log('Spieler                  | Total | Fehlend | Details');
      console.log('-'.repeat(120));
      
      problemPlayers.forEach(player => {
        const name = player.displayName.padEnd(24);
        const total = player.totalEntries.toString().padStart(5);
        const missing = player.missingEntries.length.toString().padStart(7);
        
        console.log(`${name} | ${total} | ${missing} |`);
        
        player.missingEntries.forEach((entry, index) => {
          const createdDate = entry.createdAt?.toDate ? entry.createdAt.toDate().toLocaleString('de-CH') : 'N/A';
          const rating = entry.rating?.toFixed(2) || 'N/A';
          const sessionId = entry.sessionId || entry.tournamentId || 'N/A';
          
          console.log(`${' '.repeat(24)} |       |         | → ${index + 1}. Rating: ${rating}, Session: ${sessionId.substring(0, 20)}, createdAt: ${createdDate}`);
        });
      });
      
      console.log('\n' + '='.repeat(120));
      console.log('📊 ZUSAMMENFASSUNG:');
      console.log('='.repeat(120));
      console.log(`\nBetroffene Spieler:        ${problemPlayers.length}`);
      console.log(`Total fehlende Einträge:   ${totalMissingEntries}`);
      console.log(`\n💡 Diese Einträge müssen mit completedAt aus den Sessions ergänzt werden!`);
    }
    
    // Prüfe speziell für Turnier-Teilnehmer
    console.log('\n' + '='.repeat(120));
    console.log('🎯 TURNIER-TEILNEHMER (6RdW4o4PRv0UzsZWysex):');
    console.log('='.repeat(120));
    
    const tournamentRef = db.doc('tournaments/6RdW4o4PRv0UzsZWysex');
    const tournamentSnap = await tournamentRef.get();
    const participantPlayerIds = tournamentSnap.data()?.participantPlayerIds || [];
    
    console.log(`\n📋 ${participantPlayerIds.length} Turnier-Teilnehmer:\n`);
    
    const tournamentProblems = problemPlayers.filter(p => participantPlayerIds.includes(p.playerId));
    
    if (tournamentProblems.length > 0) {
      console.log(`❌ ${tournamentProblems.length} Turnier-Teilnehmer haben fehlerhafte ratingHistory!\n`);
      tournamentProblems.forEach(p => {
        console.log(`  - ${p.displayName}: ${p.missingEntries.length} Einträge ohne completedAt`);
      });
    } else {
      console.log('✅ Alle Turnier-Teilnehmer haben vollständige ratingHistory!');
    }

  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

checkAllPlayersMissingCompletedAt().catch(console.error);

