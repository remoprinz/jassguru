const admin = require('firebase-admin');
const path = require('path');

// Service Account Key laden
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

async function auditGroupViewIntegration() {
  console.log('\n🔍 GROUPVIEW-INTEGRATION AUDIT GESTARTET\n');
  console.log('='.repeat(80));
  
  const issues = [];
  const warnings = [];
  
  try {
    // 1. JassGameSummary Location Check
    console.log('\n📍 1. JASSGAMESUMMARY LOCATION CHECK...\n');
    
    const summaryPath = `groups/${GROUP_ID}/jassGameSummaries/${TOURNAMENT_ID}`;
    const summaryDoc = await db.doc(summaryPath).get();
    
    if (!summaryDoc.exists) {
      console.log('   ❌ JassGameSummary NICHT gefunden in:', summaryPath);
      issues.push('JassGameSummary nicht am erwarteten Pfad');
    } else {
      console.log('   ✅ JassGameSummary gefunden in:', summaryPath);
      const summary = summaryDoc.data();
      console.log('   Turnier-Name:', summary.tournamentName);
      console.log('   Status:', summary.status);
      console.log('   Spiele:', summary.gamesPlayed);
      console.log('   Teilnehmer:', summary.participantPlayerIds?.length || 0);
    }
    
    // 2. Tournament Document Status Check
    console.log('\n📊 2. TOURNAMENT-DOKUMENT STATUS CHECK...\n');
    
    const tournamentDoc = await db.collection('tournaments').doc(TOURNAMENT_ID).get();
    const tournament = tournamentDoc.data();
    
    console.log('   Status:', tournament.status);
    console.log('   Finalisiert:', tournament.finalizedAt ? '✅ JA' : '❌ NEIN');
    console.log('   Pausiert:', tournament.pausedAt ? '⚠️  JA' : '✅ NEIN');
    console.log('   Abgeschlossene Passen:', tournament.completedPasseCount);
    console.log('   PlayerRankings erstellt:', tournament.rankedPlayerUids?.length || 0);
    
    if (tournament.status !== 'completed') {
      issues.push(`Tournament Status ist '${tournament.status}' statt 'completed'`);
    }
    
    if (!tournament.finalizedAt) {
      issues.push('Tournament hat kein finalizedAt Timestamp');
    }
    
    if (tournament.pausedAt) {
      warnings.push('Tournament ist pausiert (pausedAt vorhanden)');
    }
    
    // 3. Player Rankings Check
    console.log('\n🏆 3. PLAYER RANKINGS CHECK...\n');
    
    const playerRankingsSnap = await db
      .collection(`tournaments/${TOURNAMENT_ID}/playerRankings`)
      .get();
    
    console.log(`   Anzahl Player Rankings: ${playerRankingsSnap.size}`);
    console.log(`   Erwartete Anzahl: ${tournament.participantPlayerIds?.length || 0}`);
    
    if (playerRankingsSnap.size === 0) {
      issues.push('Keine Player Rankings gefunden');
    } else if (playerRankingsSnap.size !== (tournament.participantPlayerIds?.length || 0)) {
      warnings.push(`Player Rankings Anzahl (${playerRankingsSnap.size}) stimmt nicht mit Teilnehmern überein (${tournament.participantPlayerIds?.length || 0})`);
    } else {
      console.log('   ✅ Player Rankings Anzahl korrekt');
    }
    
    // Sample ein paar Rankings
    const sampleRankings = playerRankingsSnap.docs.slice(0, 3);
    console.log('\n   Sample Rankings:');
    for (const rankDoc of sampleRankings) {
      const ranking = rankDoc.data();
      console.log(`      ${ranking.rank}. ${rankDoc.id}: ${ranking.score} (${ranking.gamesPlayed} Spiele)`);
    }
    
    // 4. Player Stats Update Check (neue Struktur)
    console.log('\n📈 4. PLAYER STATS UPDATE CHECK (NEUE STRUKTUR)...\n');
    
    const participantPlayerIds = tournament.participantPlayerIds || [];
    const samplePlayerIds = participantPlayerIds.slice(0, 3);
    
    for (const playerId of samplePlayerIds) {
      console.log(`\n   Spieler: ${playerId}`);
      
      // 4a. Check players/{playerId}/groupStats/{groupId} (korrekte Struktur)
      const aggregateDoc = await db
        .doc(`players/${playerId}/groupStats/${GROUP_ID}`)
        .get();
      
      if (!aggregateDoc.exists) {
        warnings.push(`Spieler ${playerId}: Kein groupStats Dokument für ${GROUP_ID}`);
        console.log('      ⚠️  GroupStats Dokument fehlt');
      } else {
        const aggregate = aggregateDoc.data();
        console.log('      ✅ GroupStats Dokument vorhanden');
        console.log(`         Total Games: ${aggregate.totalGames || 0}`);
        console.log(`         Total Wins: ${aggregate.totalWins || 0}`);
        console.log(`         Total Points: ${aggregate.totalPoints || 0}`);
        console.log(`         Global Rating: ${aggregate.globalRating || 'N/A'}`);
        console.log(`         Last Updated: ${aggregate.lastUpdated?.toDate?.()?.toLocaleString('de-CH') || 'N/A'}`);
      }
      
      // 4b. Check players/{playerId}/tournamentStats/{tournamentId} (korrekte Struktur)
      const tournamentStatsDoc = await db
        .doc(`players/${playerId}/tournamentStats/${TOURNAMENT_ID}`)
        .get();
      
      if (!tournamentStatsDoc.exists) {
        warnings.push(`Spieler ${playerId}: Keine tournament stats für Tournament ${TOURNAMENT_ID}`);
        console.log('      ⚠️  Tournament Stats Dokument fehlt');
      } else {
        const tStats = tournamentStatsDoc.data();
        console.log('      ✅ Tournament Stats Dokument vorhanden');
        console.log(`         Games Played: ${tStats.gamesPlayed || 0}`);
        console.log(`         Wins: ${tStats.wins || 0}`);
        console.log(`         Points Scored: ${tStats.pointsScored || 0}`);
        console.log(`         Rank: ${tStats.rank || 'N/A'}`);
      }
    }
    
    // 5. Chart Data Check
    console.log('\n📊 5. CHART DATA UPDATE CHECK...\n');
    
    const chartDataDocs = await db
      .collection(`groups/${GROUP_ID}/aggregated`)
      .where('type', '==', 'chartData')
      .get();
    
    console.log(`   Anzahl Chart Data Dokumente: ${chartDataDocs.size}`);
    
    if (chartDataDocs.size === 0) {
      warnings.push('Keine Chart Data Dokumente gefunden');
      console.log('   ⚠️  Keine Chart Data Dokumente gefunden');
    } else {
      console.log('   ✅ Chart Data Dokumente vorhanden');
      
      // Check ob sie nach dem Tournament aktualisiert wurden
      const tournamentCompletedAt = tournament.finalizedAt?.toMillis() || 0;
      let chartDataUpdatedCount = 0;
      
      chartDataDocs.forEach(doc => {
        const data = doc.data();
        const lastUpdated = data.lastUpdated?.toMillis() || 0;
        
        if (lastUpdated >= tournamentCompletedAt) {
          chartDataUpdatedCount++;
        }
      });
      
      console.log(`   Chart Data Dokumente aktualisiert nach Turnier-Ende: ${chartDataUpdatedCount}/${chartDataDocs.size}`);
      
      if (chartDataUpdatedCount < chartDataDocs.size / 2) {
        warnings.push('Weniger als die Hälfte der Chart Data Dokumente wurden nach Turnier-Ende aktualisiert');
      }
    }
    
    // 6. Group Computed Stats Check
    console.log('\n📊 6. GROUP COMPUTED STATS CHECK...\n');
    
    const groupDoc = await db.collection('groups').doc(GROUP_ID).get();
    const groupData = groupDoc.data();
    
    if (!groupData) {
      issues.push('Gruppen-Dokument nicht gefunden');
    } else {
      console.log('   Gruppen-Name:', groupData.name);
      console.log('   Last Stats Update:', groupData.lastStatsUpdate?.toDate?.()?.toLocaleString('de-CH') || 'N/A');
      console.log('   Needs Stats Recalculation:', groupData.needsStatsRecalculation ? '⚠️  JA' : '✅ NEIN');
      
      // Check ob lastStatsUpdate nach Turnier-Ende ist
      const tournamentCompletedAt = tournament.finalizedAt?.toMillis() || 0;
      const lastStatsUpdate = groupData.lastStatsUpdate?.toMillis() || 0;
      
      if (lastStatsUpdate < tournamentCompletedAt) {
        warnings.push('Group lastStatsUpdate ist VOR dem Turnier-Ende (Statistiken könnten veraltet sein)');
        console.log('   ⚠️  Group Stats wurden NICHT nach Turnier-Ende aktualisiert');
      } else {
        console.log('   ✅ Group Stats wurden nach Turnier-Ende aktualisiert');
      }
      
      // Check computedStats für ein paar Spieler
      const computedStats = groupData.computedStats || {};
      console.log(`\n   Computed Stats für ${Object.keys(computedStats).length} Spieler vorhanden`);
      
      const sampleComputedPlayerIds = participantPlayerIds.slice(0, 3);
      for (const playerId of sampleComputedPlayerIds) {
        const stats = computedStats[playerId];
        if (!stats) {
          warnings.push(`Spieler ${playerId}: Keine computedStats in Group`);
          console.log(`      ${playerId}: ❌ Keine Stats`);
        } else {
          console.log(`      ${playerId}: ✅ Total Games: ${stats.totalGames || 0}, Wins: ${stats.wins || 0}`);
        }
      }
    }
    
    // 7. Group Archiv Check (jassGameSummaries Collection)
    console.log('\n📚 7. GROUP ARCHIV CHECK...\n');
    
    const jassGameSummariesSnap = await db
      .collection(`groups/${GROUP_ID}/jassGameSummaries`)
      .get();
    
    console.log(`   Anzahl jassGameSummaries in Gruppe: ${jassGameSummariesSnap.size}`);
    
    // Check ob unser Turnier dabei ist
    const tournamentSummaryExists = jassGameSummariesSnap.docs.some(doc => doc.id === TOURNAMENT_ID);
    
    if (!tournamentSummaryExists) {
      issues.push('Tournament Summary nicht in jassGameSummaries gefunden');
      console.log(`   ❌ Turnier ${TOURNAMENT_ID} NICHT in jassGameSummaries`);
    } else {
      console.log(`   ✅ Turnier ${TOURNAMENT_ID} in jassGameSummaries vorhanden`);
    }
    
    // Liste alle jassGameSummaries
    console.log('\n   Alle jassGameSummaries:');
    jassGameSummariesSnap.docs.forEach(doc => {
      const data = doc.data();
      const isTournament = !!data.tournamentId;
      const icon = isTournament ? '🏆' : '🎮';
      const completedAt = data.completedAt?.toDate?.()?.toLocaleDateString('de-CH') || 'N/A';
      console.log(`      ${icon} ${doc.id} - ${data.tournamentName || 'Session'} (${completedAt})`);
    });
    
    // 8. GroupView Daten-Laden Simulation
    console.log('\n🖥️  8. GROUPVIEW DATEN-LADEN SIMULATION...\n');
    
    // Simuliere das Laden der Daten wie GroupView es tut
    console.log('   Simuliere fetchCompletedSessions...');
    
    // GroupView lädt completed sessions über jassGameSummaries
    const completedSessionsQuery = db
      .collection(`groups/${GROUP_ID}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'desc')
      .limit(50);
    
    const completedSessionsSnap = await completedSessionsQuery.get();
    console.log(`   ✅ ${completedSessionsSnap.size} completed sessions geladen`);
    
    // Check ob unser Turnier dabei ist
    const tournamentInSessions = completedSessionsSnap.docs.find(doc => doc.id === TOURNAMENT_ID);
    
    if (!tournamentInSessions) {
      issues.push('Turnier erscheint NICHT in completed sessions Query (status oder completedAt fehlt?)');
      console.log('   ❌ Turnier NICHT in completed sessions Query gefunden!');
    } else {
      console.log('   ✅ Turnier in completed sessions Query gefunden');
      const tData = tournamentInSessions.data();
      console.log(`      Name: ${tData.tournamentName}`);
      console.log(`      Status: ${tData.status}`);
      console.log(`      CompletedAt: ${tData.completedAt?.toDate?.()?.toLocaleString('de-CH')}`);
      console.log(`      Spiele: ${tData.gamesPlayed}`);
    }
    
    // 9. Tournaments Collection Check
    console.log('\n🏆 9. GROUP TOURNAMENTS COLLECTION CHECK...\n');
    
    const groupTournamentsQuery = db
      .collection(`groups/${GROUP_ID}/tournaments`)
      .orderBy('completedAt', 'desc')
      .limit(20);
    
    try {
      const groupTournamentsSnap = await groupTournamentsQuery.get();
      console.log(`   ✅ ${groupTournamentsSnap.size} Turniere in groups/${GROUP_ID}/tournaments`);
      
      // Check ob unser Turnier dabei ist
      const tournamentInGroupTournaments = groupTournamentsSnap.docs.find(doc => doc.id === TOURNAMENT_ID);
      
      if (!tournamentInGroupTournaments) {
        warnings.push('Turnier nicht in groups/{groupId}/tournaments gefunden (möglicherweise nicht nötig)');
        console.log('   ⚠️  Turnier nicht in groups/{groupId}/tournaments');
      } else {
        console.log('   ✅ Turnier in groups/{groupId}/tournaments gefunden');
      }
    } catch (error) {
      console.log('   ⚠️  groups/{groupId}/tournaments Collection existiert nicht oder Fehler:', error.message);
    }
    
    // 10. Finalize-Prozess Completion Check
    console.log('\n✅ 10. FINALIZE-PROZESS COMPLETION CHECK...\n');
    
    console.log('   Prüfe ob alle finalizeTournament Schritte ausgeführt wurden:');
    
    // a) EventCounts in Games
    const gamesSnap = await db.collection(`tournaments/${TOURNAMENT_ID}/games`).limit(5).get();
    let gamesWithEventCounts = 0;
    gamesSnap.forEach(doc => {
      if (doc.data().eventCounts) {
        gamesWithEventCounts++;
      }
    });
    console.log(`      EventCounts in Games: ${gamesWithEventCounts}/${gamesSnap.size} ` + 
                (gamesWithEventCounts === gamesSnap.size ? '✅' : '⚠️'));
    
    // b) jassGameSummary created
    console.log(`      jassGameSummary erstellt: ${summaryDoc.exists ? '✅' : '❌'}`);
    
    // c) Player Rankings created
    console.log(`      Player Rankings erstellt: ${playerRankingsSnap.size > 0 ? '✅' : '❌'}`);
    
    // d) Elo Updated (check ratingHistory)
    const firstPlayerId = participantPlayerIds[0];
    if (firstPlayerId) {
      const ratingHistorySnap = await db
        .collection(`players/${firstPlayerId}/ratingHistory`)
        .where('tournamentId', '==', TOURNAMENT_ID)
        .limit(1)
        .get();
      
      console.log(`      Elo Updated: ${!ratingHistorySnap.empty ? '✅' : '⚠️'}`);
      
      if (ratingHistorySnap.empty) {
        warnings.push('Keine Elo-Updates in ratingHistory gefunden (Fallback möglicherweise fehlgeschlagen)');
      }
    }
    
    // e) playerFinalRatings in jassGameSummary
    if (summaryDoc.exists) {
      const summaryData = summaryDoc.data();
      const hasPlayerFinalRatings = summaryData.playerFinalRatings && 
                                     Object.keys(summaryData.playerFinalRatings).length > 0;
      console.log(`      playerFinalRatings in Summary: ${hasPlayerFinalRatings ? '✅' : '⚠️'}`);
      
      if (!hasPlayerFinalRatings) {
        warnings.push('playerFinalRatings fehlt in jassGameSummary');
      }
    }
    
    // f) Tournament Status updated
    console.log(`      Tournament Status 'completed': ${tournament.status === 'completed' ? '✅' : '❌'}`);
    console.log(`      Tournament finalizedAt gesetzt: ${tournament.finalizedAt ? '✅' : '❌'}`);
    
    // FINAL SUMMARY
    console.log('\n' + '='.repeat(80));
    console.log('📊 AUDIT-ZUSAMMENFASSUNG\n');
    
    if (issues.length === 0 && warnings.length === 0) {
      console.log('✅ ALLE CHECKS BESTANDEN!');
      console.log('✅ Das Turnier sollte korrekt in GroupView dargestellt werden.');
      console.log('');
      console.log('💡 Falls GroupView das Turnier nicht anzeigt, könnte es ein FRONTEND-Problem sein:');
      console.log('   - Cache-Problem im Browser');
      console.log('   - Fehler beim Laden der Daten im Frontend');
      console.log('   - Filter-Logik im Frontend schließt Turnier aus');
    } else {
      if (issues.length > 0) {
        console.log('❌ KRITISCHE PROBLEME GEFUNDEN:');
        issues.forEach(issue => console.log(`   - ${issue}`));
      }
      
      if (warnings.length > 0) {
        console.log('\n⚠️  WARNUNGEN:');
        warnings.forEach(warning => console.log(`   - ${warning}`));
      }
      
      console.log('\n💡 EMPFOHLENE MASSNAHMEN:');
      
      if (issues.includes('Tournament Summary nicht in jassGameSummaries gefunden')) {
        console.log('   1. finalizeTournament erneut ausführen, um jassGameSummary zu erstellen');
      }
      
      if (issues.find(i => i.includes('Player Rankings'))) {
        console.log('   2. finalizeTournament erneut ausführen, um Player Rankings zu erstellen');
      }
      
      if (warnings.find(w => w.includes('playerFinalRatings'))) {
        console.log('   3. Elo-Ratings manuell in jassGameSummary eintragen');
      }
      
      if (warnings.find(w => w.includes('Chart Data'))) {
        console.log('   4. updateChartsAfterSession manuell ausführen');
      }
      
      if (warnings.find(w => w.includes('Group Stats'))) {
        console.log('   5. updateGroupComputedStatsAfterSession manuell ausführen');
      }
    }
    
    console.log('\n🎉 AUDIT ABGESCHLOSSEN\n');
    
  } catch (error) {
    console.error('\n❌ FEHLER BEIM AUDIT:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

// Audit starten
auditGroupViewIntegration();

