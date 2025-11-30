#!/usr/bin/env node

/**
 * 🎯 SPEZIFISCHES BACKFILL: Korrigiert totalGames für Turnier-Sessions
 * 
 * PROBLEM: Bei Turnieren wurde gamesPlayed (Gesamtanzahl) für ALLE Teilnehmer gezählt,
 *          obwohl jeder Spieler nur in einer Teilmenge der Spiele war.
 * 
 * LÖSUNG: Zähle für jeden Spieler die tatsächliche Anzahl Spiele aus gameResults.
 * 
 * SICHERHEIT: Ändert NUR globalStats.current.totalGames, nichts anderes!
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');
const { program } = require('commander');

program
  .option('--dry-run', 'Nur simulieren, keine Änderungen')
  .option('--confirm', 'Bestätigung für echte Ausführung')
  .option('--groupId <groupId>', 'Nur diese Gruppe korrigieren')
  .option('--playerId <playerId>', 'Nur diesen Spieler korrigieren')
  .parse(process.argv);

const options = program.opts();
const isDryRun = options.dryRun || !options.confirm;
const targetGroupId = options.groupId;
const targetPlayerId = options.playerId;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Zählt die tatsächliche Anzahl Spiele eines Spielers in einem Turnier
 */
function countPlayerGamesInTournament(sessionData, playerId) {
  if (!sessionData.gameResults || !Array.isArray(sessionData.gameResults)) {
    return 0;
  }
  
  let count = 0;
  sessionData.gameResults.forEach((game) => {
    const topPlayers = game.teams?.top?.players || [];
    const bottomPlayers = game.teams?.bottom?.players || [];
    
    const playerInTop = topPlayers.some((p) => p.playerId === playerId);
    const playerInBottom = bottomPlayers.some((p) => p.playerId === playerId);
    
    if (playerInTop || playerInBottom) {
      count++;
    }
  });
  
  return count;
}

/**
 * Berechnet die Korrektur für einen Spieler
 */
async function calculateCorrectionForPlayer(playerId) {
  const corrections = [];
  
  try {
    // Lade Spieler-Daten
    const playerDoc = await db.collection('players').doc(playerId).get();
    if (!playerDoc.exists) {
      console.log(`  ⚠️ Spieler ${playerId} nicht gefunden`);
      return corrections;
    }
    
    const playerData = playerDoc.data();
    const currentTotalGames = playerData?.globalStats?.current?.totalGames || 0;
    const groupIds = playerData?.groupIds || [];
    
    if (groupIds.length === 0) {
      console.log(`  ℹ️ Spieler ${playerId} hat keine Gruppen`);
      return corrections;
    }
    
    // Durchsuche alle Gruppen des Spielers
    for (const groupId of groupIds) {
      if (targetGroupId && groupId !== targetGroupId) {
        continue;
      }
      
      try {
        // Lade alle Turnier-Sessions dieser Gruppe
        const summariesRef = db.collection(`groups/${groupId}/jassGameSummaries`);
        const summariesSnap = await summariesRef.get();
        
        let actualGamesCount = 0;
        let incorrectGamesCount = 0;
        
        summariesSnap.forEach((doc) => {
          const summary = doc.data();
          
          // Nur Turnier-Sessions
          const isTournament = summary.isTournamentSession || summary.tournamentId;
          if (!isTournament) {
            return;
          }
          
          // Prüfe ob Spieler Teilnehmer war
          const participantIds = summary.participantPlayerIds || [];
          if (!participantIds.includes(playerId)) {
            return;
          }
          
          // Zähle tatsächliche Spiele
          const actualGames = countPlayerGamesInTournament(summary, playerId);
          actualGamesCount += actualGames;
          
          // Zähle falsch gezählte Spiele (gamesPlayed wurde für alle gezählt)
          const totalGamesInTournament = summary.gamesPlayed || 0;
          incorrectGamesCount += totalGamesInTournament;
        });
        
        // Berechne Differenz
        const difference = incorrectGamesCount - actualGamesCount;
        
        if (difference !== 0) {
          corrections.push({
            playerId,
            groupId,
            currentTotalGames,
            actualGamesInGroup: actualGamesCount,
            incorrectGamesInGroup: incorrectGamesCount,
            difference,
            newTotalGames: currentTotalGames - difference
          });
        }
        
      } catch (groupError) {
        console.error(`  ❌ Fehler bei Gruppe ${groupId}:`, groupError.message);
      }
    }
    
  } catch (error) {
    console.error(`  ❌ Fehler bei Spieler ${playerId}:`, error.message);
  }
  
  return corrections;
}

/**
 * Hauptfunktion
 */
async function fixTournamentTotalGames() {
  console.log('🎯 BACKFILL: Korrigiere totalGames für Turnier-Sessions\n');
  console.log(`📋 Modus: ${isDryRun ? '🔍 DRY-RUN (keine Änderungen)' : '✅ LIVE (Änderungen werden durchgeführt)'}\n`);
  
  if (targetGroupId) {
    console.log(`🎯 Gruppe: ${targetGroupId}\n`);
  }
  if (targetPlayerId) {
    console.log(`🎯 Spieler: ${targetPlayerId}\n`);
  }
  
  try {
    let playerIds = [];
    
    if (targetPlayerId) {
      // Nur spezifischer Spieler
      playerIds = [targetPlayerId];
    } else if (targetGroupId) {
      // Alle Spieler dieser Gruppe
      const groupDoc = await db.collection('groups').doc(targetGroupId).get();
      if (!groupDoc.exists) {
        console.log(`❌ Gruppe ${targetGroupId} nicht gefunden`);
        return;
      }
      
      // Lade alle Sessions dieser Gruppe, um Teilnehmer zu finden
      const summariesRef = db.collection(`groups/${targetGroupId}/jassGameSummaries`);
      const summariesSnap = await summariesRef.get();
      
      const playerIdSet = new Set();
      summariesSnap.forEach((doc) => {
        const summary = doc.data();
        const participantIds = summary.participantPlayerIds || [];
        participantIds.forEach((id) => playerIdSet.add(id));
      });
      
      playerIds = Array.from(playerIdSet);
      console.log(`📊 ${playerIds.length} Spieler in Gruppe gefunden\n`);
    } else {
      // Alle Spieler mit Turnier-Sessions
      console.log('📊 Lade alle Spieler...\n');
      const playersSnap = await db.collection('players').get();
      playerIds = playersSnap.docs.map(doc => doc.id);
      console.log(`📊 ${playerIds.length} Spieler gefunden\n`);
    }
    
    const allCorrections = [];
    
    // Berechne Korrekturen für jeden Spieler
    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const playerDoc = await db.collection('players').doc(playerId).get();
      const playerName = playerDoc.exists ? playerDoc.data().displayName : 'Unbekannt';
      
      process.stdout.write(`\r⏳ Verarbeite ${i + 1}/${playerIds.length}: ${playerName}...`);
      
      const corrections = await calculateCorrectionForPlayer(playerId);
      allCorrections.push(...corrections);
    }
    
    console.log('\n\n📊 ZUSAMMENFASSUNG:\n');
    
    if (allCorrections.length === 0) {
      console.log('✅ Keine Korrekturen nötig!\n');
      return;
    }
    
    // Gruppiere nach Spieler
    const correctionsByPlayer = new Map();
    allCorrections.forEach(corr => {
      if (!correctionsByPlayer.has(corr.playerId)) {
        correctionsByPlayer.set(corr.playerId, []);
      }
      correctionsByPlayer.get(corr.playerId).push(corr);
    });
    
    // Zeige Details
    let totalDifference = 0;
    
    for (const [playerId, corrections] of correctionsByPlayer.entries()) {
      const playerDoc = await db.collection('players').doc(playerId).get();
      const playerName = playerDoc.exists ? playerDoc.data().displayName : 'Unbekannt';
      const currentTotalGames = corrections[0].currentTotalGames;
      
      // Summiere alle Differenzen
      const playerDifference = corrections.reduce((sum, c) => sum + c.difference, 0);
      const newTotalGames = currentTotalGames - playerDifference;
      totalDifference += playerDifference;
      
      console.log(`👤 ${playerName} (${playerId}):`);
      console.log(`   Aktuell: ${currentTotalGames} Spiele`);
      console.log(`   Korrektur: -${playerDifference} Spiele`);
      console.log(`   Neu: ${newTotalGames} Spiele`);
      
      // ✅ ASYNC: Lade Gruppen-Namen parallel
      const groupNames = await Promise.all(
        corrections.map(async (corr) => {
          const groupDoc = await db.collection('groups').doc(corr.groupId).get();
          return groupDoc.exists ? groupDoc.data().name : corr.groupId;
        })
      );
      
      corrections.forEach((corr, index) => {
        console.log(`     - ${groupNames[index]}: ${corr.incorrectGamesInGroup} → ${corr.actualGamesInGroup} (Diff: -${corr.difference})`);
      });
      console.log('');
    }
    
    console.log(`\n📊 GESAMT: ${allCorrections.length} Korrekturen, ${totalDifference} Spiele werden abgezogen\n`);
    
    // Ausführung
    if (isDryRun) {
      console.log('🔍 DRY-RUN: Keine Änderungen durchgeführt');
      console.log('💡 Führe mit --confirm aus, um Änderungen durchzuführen\n');
      return;
    }
    
    console.log('✅ Starte Korrekturen...\n');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const [playerId, corrections] of correctionsByPlayer.entries()) {
      const playerDoc = await db.collection('players').doc(playerId).get();
      const playerName = playerDoc.exists ? playerDoc.data().displayName : 'Unbekannt';
      
      try {
        const playerDifference = corrections.reduce((sum, c) => sum + c.difference, 0);
        const currentTotalGames = corrections[0].currentTotalGames;
        const newTotalGames = currentTotalGames - playerDifference;
        
        // ✅ NUR totalGames ändern, nichts anderes!
        await db.collection('players').doc(playerId).update({
          'globalStats.current.totalGames': newTotalGames
        });
        
        console.log(`✅ ${playerName}: ${currentTotalGames} → ${newTotalGames} Spiele`);
        successCount++;
        
      } catch (error) {
        console.error(`❌ ${playerName}: Fehler - ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n✅ FERTIG: ${successCount} erfolgreich, ${errorCount} Fehler\n`);
    
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    process.exit(1);
  }
}

fixTournamentTotalGames()
  .then(() => {
    console.log('✅ Script abgeschlossen');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });

