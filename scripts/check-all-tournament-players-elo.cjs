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

async function checkAllTournamentPlayersElo() {
  console.log('\n🔍 PRÜFE ALLE 12 TURNIER-TEILNEHMER: ELO-FEHLER\n');
  console.log('='.repeat(140));

  try {
    // Hole Turnier-Teilnehmer
    const tournamentRef = db.doc(`tournaments/${TOURNAMENT_ID}`);
    const tournamentSnap = await tournamentRef.get();
    const participantPlayerIds = tournamentSnap.data()?.participantPlayerIds || [];
    
    console.log(`\n📋 ${participantPlayerIds.length} Turnier-Teilnehmer gefunden\n`);
    
    const tournamentStartMillis = 1763063392544; // Bekannt aus vorherigen Analysen
    
    const results = [];
    
    for (const playerId of participantPlayerIds) {
      // Hole Player-Daten
      const playerDoc = await db.collection('players').doc(playerId).get();
      const displayName = playerDoc.data()?.displayName || playerId.substring(0, 10);
      
      // Hole ratingHistory
      const ratingHistorySnap = await db.collection(`players/${playerId}/ratingHistory`).get();
      
      const allEntries = ratingHistorySnap.docs.map(doc => {
        const data = doc.data();
        return {
          rating: data.rating,
          delta: data.delta,
          completedAt: data.completedAt,
          tournamentId: data.tournamentId,
          milliseconds: data.completedAt?.toMillis ? data.completedAt.toMillis() : 0
        };
      }).filter(e => e.milliseconds > 0);
      
      allEntries.sort((a, b) => a.milliseconds - b.milliseconds);
      
      // Finde Turnier-Einträge
      const tournamentEntries = allEntries.filter(e => e.tournamentId === TOURNAMENT_ID);
      const firstTournamentEntry = tournamentEntries[0];
      
      // Finde letzten Eintrag VOR Turnier
      const entriesBeforeTournament = allEntries.filter(e => e.milliseconds < tournamentStartMillis);
      const lastBeforeTournament = entriesBeforeTournament[entriesBeforeTournament.length - 1];
      
      if (!lastBeforeTournament || !firstTournamentEntry) {
        results.push({
          displayName,
          expectedStartElo: 100,
          calculatedStartElo: 100,
          firstTournamentElo: firstTournamentEntry?.rating || 0,
          difference: 0,
          error: 'Keine Daten'
        });
        continue;
      }
      
      const expectedStartElo = lastBeforeTournament.rating;
      const firstTournamentElo = firstTournamentEntry.rating;
      const firstDelta = firstTournamentEntry.delta || 0;
      const calculatedStartElo = firstTournamentElo - firstDelta;
      const difference = expectedStartElo - calculatedStartElo;
      
      results.push({
        displayName,
        expectedStartElo,
        calculatedStartElo,
        firstTournamentElo,
        firstDelta,
        difference,
        hasError: Math.abs(difference) > 0.01
      });
    }
    
    // Sortiere nach Differenz (größte Fehler zuerst)
    results.sort((a, b) => Math.abs(b.difference || 0) - Math.abs(a.difference || 0));
    
    console.log('='.repeat(140));
    console.log('📊 ERGEBNIS: ELO-FEHLER PRO SPIELER');
    console.log('='.repeat(140));
    console.log('');
    console.log('Spieler                  | Erwartet | Verwendet | 1. Pass | Delta   | Differenz | Status');
    console.log('-'.repeat(140));
    
    let errorCount = 0;
    let totalError = 0;
    
    results.forEach(r => {
      const name = r.displayName.padEnd(24);
      const expected = r.expectedStartElo.toFixed(2).padStart(8);
      const calculated = r.calculatedStartElo.toFixed(2).padStart(9);
      const first = r.firstTournamentElo.toFixed(2).padStart(7);
      const delta = r.firstDelta ? (r.firstDelta >= 0 ? `+${r.firstDelta.toFixed(2)}` : r.firstDelta.toFixed(2)).padStart(7) : '    N/A';
      const diff = r.difference ? (r.difference >= 0 ? `+${r.difference.toFixed(2)}` : r.difference.toFixed(2)).padStart(9) : '      N/A';
      const status = r.hasError ? '❌' : '✅';
      
      console.log(`${name} | ${expected} | ${calculated} | ${first} | ${delta} | ${diff} | ${status}`);
      
      if (r.hasError) {
        errorCount++;
        totalError += Math.abs(r.difference || 0);
      }
    });
    
    console.log('\n' + '='.repeat(140));
    console.log('📊 ZUSAMMENFASSUNG:');
    console.log('='.repeat(140));
    console.log(`\nSpieler mit Elo-Fehler:     ${errorCount} von ${results.length}`);
    console.log(`Durchschnittlicher Fehler:  ${errorCount > 0 ? (totalError / errorCount).toFixed(2) : '0.00'}`);
    console.log(`Maximaler Fehler:           ${results[0]?.difference ? Math.abs(results[0].difference).toFixed(2) : '0.00'} (${results[0]?.displayName})`);
    
    if (errorCount === 0) {
      console.log(`\n✅ ALLE SPIELER: Elo-Berechnungen sind korrekt!`);
    } else if (errorCount === results.length) {
      console.log(`\n🚨 ALLE ${errorCount} SPIELER: Elo-Berechnungen sind FALSCH!`);
      console.log(`\n💡 URSACHE: Das Turnier wurde mit dem ALTEN Code berechnet!`);
      console.log(`   Der alte Code lud Start-Elo aus globalRating statt ratingHistory.`);
    } else {
      console.log(`\n⚠️ ${errorCount} SPIELER: Elo-Berechnungen sind FALSCH!`);
    }
    
    console.log(`\n✅ LÖSUNG: Der neue Code (in jassEloUpdater.ts) ist bereits implementiert!`);
    console.log(`   Für NEUE Turniere/Sessions wird ab jetzt das korrekte Elo verwendet.`);
    console.log(`\n⚠️ BACKFILL: Das existierende Turnier muss neu berechnet werden:`);
    console.log(`   1. Lösche fehlerhafte Turnier-Elo-Einträge in ratingHistory`);
    console.log(`   2. Führe updateEloForTournament() erneut aus (mit neuem Code)`);
    console.log(`   3. Aktualisiere chartData_elo`);

  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

checkAllTournamentPlayersElo().catch(console.error);

