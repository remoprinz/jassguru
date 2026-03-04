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

const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

async function checkStricheDiff() {
  console.log('\n🔍 PRÜFE STRICHDIFFERENZ-BERECHNUNG\n');
  console.log('='.repeat(120));
  
  try {
    // === 1. LADE JASSGAMESUMMARY ===
    console.log('\n📊 SCHRITT 1: Lade jassGameSummary vom Turnier\n');
    
    const summaryRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
    const summaryDoc = await summaryRef.get();
    
    if (!summaryDoc.exists) {
      console.log('❌ jassGameSummary nicht gefunden!');
      return;
    }
    
    const summaryData = summaryDoc.data();
    console.log(`✅ jassGameSummary geladen: ${summaryDoc.id}`);
    console.log(`   Games: ${summaryData.gamesPlayed || 0}`);
    console.log(`   Teilnehmer: ${summaryData.participantPlayerIds?.length || 0}\n`);
    
    // === 2. LADE PLAYERRANKINGS ===
    console.log('═'.repeat(120));
    console.log('📊 SCHRITT 2: Lade playerRankings\n');
    
    const rankingsRef = db.collection(`tournaments/${TOURNAMENT_ID}/playerRankings`);
    const rankingsSnap = await rankingsRef.get();
    
    console.log(`✅ Gefunden: ${rankingsSnap.size} playerRankings\n`);
    
    // === 3. BERECHNE STRICHDIFFERENZ AUS JASSGAMESUMMARY ===
    console.log('═'.repeat(120));
    console.log('📊 SCHRITT 3: Berechne Strichdifferenz aus jassGameSummary\n');
    
    const playerStricheDiff = new Map();
    
    // Berechne für jeden Spieler aus gameResults
    if (summaryData.gameResults && Array.isArray(summaryData.gameResults)) {
      summaryData.gameResults.forEach((game) => {
        if (!game.teams || !game.finalStriche) return;
        
        const topPlayerIds = game.teams.top?.players?.map(p => p.playerId) || [];
        const bottomPlayerIds = game.teams.bottom?.players?.map(p => p.playerId) || [];
        
        const topStriche = game.finalStriche.top || {};
        const bottomStriche = game.finalStriche.bottom || {};
        
        const topTotal = (topStriche.berg || 0) + (topStriche.sieg || 0) + 
                        (topStriche.matsch || 0) + (topStriche.schneider || 0) + 
                        (topStriche.kontermatsch || 0);
        
        const bottomTotal = (bottomStriche.berg || 0) + (bottomStriche.sieg || 0) + 
                           (bottomStriche.matsch || 0) + (bottomStriche.schneider || 0) + 
                           (bottomStriche.kontermatsch || 0);
        
        // Top Team Spieler
        topPlayerIds.forEach(pid => {
          if (!playerStricheDiff.has(pid)) {
            playerStricheDiff.set(pid, { made: 0, received: 0 });
          }
          const stats = playerStricheDiff.get(pid);
          stats.made += topTotal;
          stats.received += bottomTotal;
        });
        
        // Bottom Team Spieler
        bottomPlayerIds.forEach(pid => {
          if (!playerStricheDiff.has(pid)) {
            playerStricheDiff.set(pid, { made: 0, received: 0 });
          }
          const stats = playerStricheDiff.get(pid);
          stats.made += bottomTotal;
          stats.received += topTotal;
        });
      });
    }
    
    // === 4. VERGLEICHE MIT PLAYERRANKINGS ===
    console.log('═'.repeat(120));
    console.log('📊 SCHRITT 4: Vergleich mit playerRankings\n');
    console.log('Spieler                  | Summary (berechnet) | Rankings (gespeichert) | Differenz');
    console.log('-'.repeat(120));
    
    const playerNames = new Map();
    
    for (const doc of rankingsSnap.docs) {
      const ranking = doc.data();
      const playerId = ranking.playerId;
      
      // Lade Spielername
      if (!playerNames.has(playerId)) {
        try {
          const playerDoc = await db.collection('players').doc(playerId).get();
          playerNames.set(playerId, playerDoc.exists ? (playerDoc.data().displayName || playerId) : playerId);
        } catch {
          playerNames.set(playerId, playerId);
        }
      }
      
      const name = playerNames.get(playerId);
      const calculated = playerStricheDiff.get(playerId);
      const stored = ranking.stricheDifference || 0;
      
      if (calculated) {
        const diff = calculated.made - calculated.received;
        const error = Math.abs(diff - stored);
        
        const status = error > 0.1 ? '❌' : '✅';
        console.log(
          `${status} ${name.padEnd(24)} | ` +
          `${diff.toString().padStart(6)} (${calculated.made}/${calculated.received}) | ` +
          `${stored.toString().padStart(6)} | ` +
          `${error > 0.1 ? `FEHLER: ${error}` : 'OK'}`
        );
      } else {
        console.log(`⚠️  ${name.padEnd(24)} | NICHT GEFUNDEN | ${stored.toString().padStart(6)} | -`);
      }
    }
    
    // === 5. PRÜFE TOTALSTRICHEBYPLAYER ===
    console.log('\n═'.repeat(120));
    console.log('📊 SCHRITT 5: Prüfe totalStricheByPlayer\n');
    
    if (summaryData.totalStricheByPlayer) {
      console.log('Spieler                  | totalStricheByPlayer (made) | Berechnet (made) | Differenz');
      console.log('-'.repeat(120));
      
      Object.entries(summaryData.totalStricheByPlayer).forEach(([playerId, striche]) => {
        const name = playerNames.get(playerId) || playerId;
        const stored = (striche.berg || 0) + (striche.sieg || 0) + 
                      (striche.matsch || 0) + (striche.schneider || 0) + 
                      (striche.kontermatsch || 0);
        const calculated = playerStricheDiff.get(playerId)?.made || 0;
        const error = Math.abs(stored - calculated);
        
        const status = error > 0.1 ? '❌' : '✅';
        console.log(
          `${status} ${name.padEnd(24)} | ` +
          `${stored.toString().padStart(6)} | ` +
          `${calculated.toString().padStart(6)} | ` +
          `${error > 0.1 ? `FEHLER: ${error}` : 'OK'}`
        );
      });
    }
    
    console.log('\n' + '='.repeat(120));
    
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

checkStricheDiff().catch(console.error);

