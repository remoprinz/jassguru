#!/usr/bin/env ts-node

import * as admin from 'firebase-admin';
import * as path from 'path';

/**
 * Script um die Elo-Entwicklung eines Spielers zu analysieren
 */
async function analyzePlayerEloEvolution(groupId: string, playerId: string) {
  try {
    console.log(`🔍 Analysiere Elo-Entwicklung für Spieler ${playerId} in Gruppe ${groupId}...`);
    
    // Firebase Admin SDK initialisieren
    const serviceAccountPath = path.resolve(__dirname, '../../../serviceAccountKey.json');
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        projectId: 'jassguru'
      });
      console.log('✅ Firebase Admin SDK initialisiert');
    }

    const db = admin.firestore();
    
    // Hole alle History-Einträge für den Spieler
    const historyRef = db.collection(`groups/${groupId}/playerRatings/${playerId}/history`);
    const historySnap = await historyRef.orderBy('createdAt', 'asc').get();
    
    if (historySnap.empty) {
      console.log(`❌ Keine Rating-Historie für Spieler ${playerId} gefunden!`);
      return;
    }
    
    console.log(`📊 Gefunden: ${historySnap.docs.length} History-Einträge`);
    console.log('');
    console.log('📈 ELO-ENTWICKLUNG:');
    console.log('='.repeat(80));
    
    let gameNumber = 1;
    let previousRating = 100; // Start-Rating
    
    for (const doc of historySnap.docs) {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.()?.toLocaleDateString() || 'Unbekannt';
      const eventId = data.eventId || 'Unbekannt';
      const eventType = data.eventType || 'Unbekannt';
      
      const currentRating = data.rating || 100;
      const ratingDelta = data.delta?.rating || 0;
      const stricheDelta = data.delta?.striche || 0;
      const wins = data.delta?.wins || 0;
      const losses = data.delta?.losses || 0;
      const games = data.delta?.games || 0;
      const points = data.delta?.points || 0;
      
      const ratingChange = currentRating - previousRating;
      const changeSymbol = ratingChange >= 0 ? '+' : '';
      
      console.log(`🎮 Spiel ${gameNumber.toString().padStart(2, '0')} | ${createdAt}`);
      console.log(`   Event: ${eventId} (${eventType})`);
      console.log(`   Rating: ${previousRating.toFixed(2)} → ${currentRating.toFixed(2)} (${changeSymbol}${ratingChange.toFixed(2)})`);
      console.log(`   Delta: ${changeSymbol}${ratingDelta.toFixed(2)} | Striche: ${changeSymbol}${stricheDelta} | Games: ${games} | Wins: ${wins} | Losses: ${losses}`);
      console.log(`   Punkte: ${points} | Tier: ${data.tier || 'Unbekannt'} ${data.tierEmoji || ''}`);
      console.log(`   Kumulativ: Striche ${data.cumulative?.striche || 0} | Wins ${data.cumulative?.wins || 0} | Losses ${data.cumulative?.losses || 0}`);
      console.log('-'.repeat(80));
      
      previousRating = currentRating;
      gameNumber++;
    }
    
    // Zusammenfassung
    const firstEntry = historySnap.docs[0].data();
    const lastEntry = historySnap.docs[historySnap.docs.length - 1].data();
    const totalChange = (lastEntry.rating || 100) - (firstEntry.rating || 100);
    const totalGames = lastEntry.gamesPlayed || 0;
    const totalWins = lastEntry.cumulative?.wins || 0;
    const totalLosses = lastEntry.cumulative?.losses || 0;
    const winRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';
    
    console.log('');
    console.log('📊 ZUSAMMENFASSUNG:');
    console.log('='.repeat(80));
    console.log(`🎯 Start-Rating: ${firstEntry.rating?.toFixed(2) || '100.00'}`);
    console.log(`🏆 End-Rating: ${lastEntry.rating?.toFixed(2) || '100.00'}`);
    console.log(`📈 Gesamtänderung: ${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(2)}`);
    console.log(`🎮 Gesamtspiele: ${totalGames}`);
    console.log(`✅ Siege: ${totalWins} | ❌ Niederlagen: ${totalLosses}`);
    console.log(`📊 Siegrate: ${winRate}%`);
    console.log(`🏅 Aktueller Tier: ${lastEntry.tier || 'Unbekannt'} ${lastEntry.tierEmoji || ''}`);
    
  } catch (error) {
    console.error('💥 Fehler:', error);
  }
}

// Script ausführen
const args = process.argv.slice(2);
const groupId = args.find(arg => arg.startsWith('--groupId='))?.split('=')[1];
const playerId = args.find(arg => arg.startsWith('--playerId='))?.split('=')[1];

if (!groupId || !playerId) {
  console.error('❌ Fehler: Gruppen-ID und Spieler-ID erforderlich!');
  console.log('💡 Verwendung: npx ts-node -r tsconfig-paths/register src/scripts/analyzePlayerElo.ts --groupId=DEINE_GRUPPEN_ID --playerId=DEINE_SPIELER_ID');
  console.log('💡 Beispiel: npx ts-node -r tsconfig-paths/register src/scripts/analyzePlayerElo.ts --groupId=BhEdUmwb7tb4ka8BLUfM --playerId=4ixOg5n0DcQmg028WPtvF');
  process.exit(1);
}

analyzePlayerEloEvolution(groupId, playerId);
