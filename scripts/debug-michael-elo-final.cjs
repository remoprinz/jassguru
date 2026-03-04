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

const MICHAEL_ID = '9K2d1OQ1mCXddko7ft6y';
const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';

async function debugMichaelEloFinal() {
  console.log('\n🔍 FINALE ANALYSE: MICHAEL\'S ELO-PROBLEM\n');
  console.log('='.repeat(120));

  try {
    // Hole Michael's komplette ratingHistory
    const ratingHistorySnap = await db.collection(`players/${MICHAEL_ID}/ratingHistory`).get();
    
    console.log(`\n📊 Michael hat ${ratingHistorySnap.docs.length} Einträge in ratingHistory\n`);
    
    // Prüfe auf fehlende completedAt
    const missingCompletedAt = [];
    ratingHistorySnap.docs.forEach(doc => {
      const data = doc.data();
      if (!data.completedAt) {
        missingCompletedAt.push({
          id: doc.id,
          rating: data.rating,
          createdAt: data.createdAt,
          sessionId: data.sessionId
        });
      }
    });
    
    if (missingCompletedAt.length > 0) {
      console.log(`❌ ${missingCompletedAt.length} Einträge OHNE completedAt:\n`);
      missingCompletedAt.forEach(entry => {
        console.log(`  - ${entry.id}: Rating ${entry.rating?.toFixed(2)}, Session ${entry.sessionId}`);
      });
    } else {
      console.log('✅ ALLE Einträge haben completedAt!\n');
    }
    
    // Sortiere alle Einträge chronologisch
    const allEntries = ratingHistorySnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        rating: data.rating,
        delta: data.delta,
        completedAt: data.completedAt,
        createdAt: data.createdAt,
        sessionId: data.sessionId,
        tournamentId: data.tournamentId,
        eventType: data.eventType,
        passeNumber: data.passeNumber,
        milliseconds: data.completedAt?.toMillis ? data.completedAt.toMillis() : 0
      };
    }).filter(e => e.milliseconds > 0);
    
    allEntries.sort((a, b) => a.milliseconds - b.milliseconds);
    
    // Finde Turnier-Einträge
    const tournamentEntries = allEntries.filter(e => e.tournamentId === TOURNAMENT_ID);
    const firstTournamentEntry = tournamentEntries[0];
    const tournamentStartMillis = firstTournamentEntry?.milliseconds;
    
    console.log('='.repeat(120));
    console.log('📊 TURNIER-INFO:');
    console.log('='.repeat(120));
    console.log(`\nTurnier-Start:    ${firstTournamentEntry?.completedAt?.toDate().toLocaleString('de-CH')}`);
    console.log(`Timestamp (ms):   ${tournamentStartMillis}`);
    console.log(`Turnier-Passen:   ${tournamentEntries.length}`);
    
    // Finde letzten Eintrag VOR Turnier
    const entriesBeforeTournament = allEntries.filter(e => e.milliseconds < tournamentStartMillis);
    const lastBeforeTournament = entriesBeforeTournament[entriesBeforeTournament.length - 1];
    
    console.log('\n' + '='.repeat(120));
    console.log('📊 LETZTER EINTRAG VOR TURNIER:');
    console.log('='.repeat(120));
    console.log(`\nDatum:           ${lastBeforeTournament?.completedAt?.toDate().toLocaleString('de-CH')}`);
    console.log(`Rating:          ${lastBeforeTournament?.rating?.toFixed(2)}`);
    console.log(`Delta:           ${lastBeforeTournament?.delta ? (lastBeforeTournament.delta >= 0 ? '+' : '') + lastBeforeTournament.delta.toFixed(2) : 'N/A'}`);
    console.log(`Event Type:      ${lastBeforeTournament?.eventType}`);
    console.log(`Session ID:      ${lastBeforeTournament?.sessionId || 'N/A'}`);
    console.log(`completedAt?:    ${lastBeforeTournament?.completedAt ? '✅ JA' : '❌ NEIN'}`);
    
    // Berechne erwartetes Start-Elo
    console.log('\n' + '='.repeat(120));
    console.log('🎯 ELO-BERECHNUNG:');
    console.log('='.repeat(120));
    
    const expectedStartElo = lastBeforeTournament?.rating || 100;
    const actualFirstTournamentElo = firstTournamentEntry?.rating || 0;
    const firstDelta = firstTournamentEntry?.delta || 0;
    const calculatedStartElo = actualFirstTournamentElo - firstDelta;
    
    console.log(`\n1. Erwartetes Start-Elo (aus letztem Eintrag VOR Turnier):`);
    console.log(`   ${expectedStartElo.toFixed(2)}`);
    
    console.log(`\n2. Tatsächliches erstes Turnier-Elo:`);
    console.log(`   ${actualFirstTournamentElo.toFixed(2)}`);
    
    console.log(`\n3. Delta der ersten Passe:`);
    console.log(`   ${firstDelta >= 0 ? '+' : ''}${firstDelta.toFixed(2)}`);
    
    console.log(`\n4. Berechnetes Start-Elo (Turnier-Elo - Delta):`);
    console.log(`   ${calculatedStartElo.toFixed(2)} = ${actualFirstTournamentElo.toFixed(2)} - ${firstDelta.toFixed(2)}`);
    
    const difference = expectedStartElo - calculatedStartElo;
    
    console.log(`\n5. DIFFERENZ:`);
    console.log(`   ${difference >= 0 ? '+' : ''}${difference.toFixed(2)}`);
    
    if (Math.abs(difference) < 0.01) {
      console.log(`\n✅ PERFEKT! Das Turnier wurde mit dem korrekten Start-Elo berechnet!`);
    } else {
      console.log(`\n❌ FEHLER! Das Turnier wurde mit FALSCHEM Start-Elo berechnet!`);
      console.log(`\n   Erwartet:     ${expectedStartElo.toFixed(2)}`);
      console.log(`   Verwendet:    ${calculatedStartElo.toFixed(2)}`);
      console.log(`   Differenz:    ${difference >= 0 ? '+' : ''}${difference.toFixed(2)}`);
    }
    
    // Zeige Turnier-Progression
    console.log('\n' + '='.repeat(120));
    console.log('📊 TURNIER-ELO-PROGRESSION:');
    console.log('='.repeat(120));
    console.log('');
    console.log('Passe | Datum                | Rating  | Delta   | Status');
    console.log('-'.repeat(120));
    
    tournamentEntries.forEach((entry, index) => {
      const passeNum = (index + 1).toString().padStart(5);
      const date = entry.completedAt?.toDate().toLocaleString('de-CH', { 
        day: '2-digit', 
        month: '2-digit',
        hour: '2-digit', 
        minute: '2-digit' 
      }) || 'N/A';
      const rating = entry.rating?.toFixed(2).padStart(7) || 'N/A';
      const delta = entry.delta ? (entry.delta >= 0 ? `+${entry.delta.toFixed(2)}` : entry.delta.toFixed(2)).padStart(7) : '    N/A';
      const status = entry.delta ? '✅' : '⚠️';
      
      console.log(`${passeNum} | ${date.padEnd(20)} | ${rating} | ${delta} | ${status}`);
    });

  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

debugMichaelEloFinal().catch(console.error);

