#!/usr/bin/env ts-node

import * as admin from 'firebase-admin';
import * as path from 'path';

/**
 * Script um detaillierte Spiel-Analyse mit Spielernamen und einzelnen Spielen
 */
async function analyzePlayerDetailedGames(groupId: string, playerId: string) {
  try {
    console.log(`🔍 Detaillierte Spiel-Analyse für Spieler ${playerId} in Gruppe ${groupId}...`);
    
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
    
    // 1. Hole Spieler-Informationen
    console.log('👤 Hole Spieler-Informationen...');
    const playerDoc = await db.doc(`groups/${groupId}/playerRatings/${playerId}`).get();
    const playerData = playerDoc.data();
    const playerName = playerData?.displayName || `Spieler_${playerId.slice(0, 6)}`;
    
    console.log(`👤 Spieler: ${playerName} (${playerId})`);
    console.log(`🏆 Aktueller Tier: ${playerData?.tier || 'Unbekannt'} ${playerData?.tierEmoji || ''}`);
    console.log(`📊 Aktuelles Rating: ${playerData?.rating?.toFixed(2) || '100.00'}`);
    console.log('');
    
    // 2. Hole alle History-Einträge
    const historyRef = db.collection(`groups/${groupId}/playerRatings/${playerId}/history`);
    const historySnap = await historyRef.orderBy('createdAt', 'asc').get();
    
    if (historySnap.empty) {
      console.log(`❌ Keine Rating-Historie für Spieler ${playerId} gefunden!`);
      return;
    }
    
    console.log(`📊 Gefunden: ${historySnap.docs.length} History-Einträge`);
    console.log('');
    
    // 3. Hole alle Sessions für detaillierte Spiel-Analyse
    const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`);
    const sessionsSnap = await sessionsRef.orderBy('startedAt', 'asc').get();
    
    const sessionsMap = new Map();
    sessionsSnap.docs.forEach(doc => {
      sessionsMap.set(doc.id, doc.data());
    });
    
    console.log('🎮 DETAILLIERTE SPIEL-ANALYSE:');
    console.log('='.repeat(100));
    
    let gameNumber = 1;
    let previousRating = 100;
    
    for (const doc of historySnap.docs) {
      const data = doc.data();
      const eventId = data.eventId || 'Unbekannt';
      const sessionData = sessionsMap.get(eventId);
      
      if (!sessionData) {
        console.log(`❌ Session ${eventId} nicht gefunden, überspringe...`);
        continue;
      }
      
      const createdAt = sessionData.startedAt?.toDate?.()?.toLocaleDateString() || 
                       sessionData.endedAt?.toDate?.()?.toLocaleDateString() || 'Unbekannt';
      
      const currentRating = data.rating || 100;
      const ratingDelta = data.delta?.rating || 0;
      const stricheDelta = data.delta?.striche || 0;
      const wins = data.delta?.wins || 0;
      const losses = data.delta?.losses || 0;
      const games = data.delta?.games || 0;
      const points = data.delta?.points || 0;
      
      const ratingChange = currentRating - previousRating;
      const changeSymbol = ratingChange >= 0 ? '+' : '';
      
      console.log(`🎮 SESSION ${gameNumber.toString().padStart(2, '0')} | ${createdAt}`);
      console.log(`   📅 Session-ID: ${eventId}`);
      console.log(`   🏆 Rating: ${previousRating.toFixed(2)} → ${currentRating.toFixed(2)} (${changeSymbol}${ratingChange.toFixed(2)})`);
      console.log(`   📊 Delta: ${changeSymbol}${ratingDelta.toFixed(2)} | Striche: ${changeSymbol}${stricheDelta} | Games: ${games}`);
      console.log(`   🎯 Siege: ${wins} | Niederlagen: ${losses} | Punkte: ${points}`);
      console.log(`   🏅 Tier: ${data.tier || 'Unbekannt'} ${data.tierEmoji || ''}`);
      
      // Hole Team-Informationen
      const isTopTeam = sessionData.teams?.top?.players?.some((p: any) => p.playerId === playerId);
      const playerTeam = isTopTeam ? 'top' : 'bottom';
      const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
      
      console.log(`   👥 Team: ${playerTeam.toUpperCase()} (${isTopTeam ? 'Oben' : 'Unten'})`);
      
      // Hole Teamkollegen
      const teammates = sessionData.teams?.[playerTeam]?.players?.map((p: any) => p.displayName || `Spieler_${p.playerId.slice(0, 6)}`).join(', ') || 'Unbekannt';
      const opponents = sessionData.teams?.[opponentTeam]?.players?.map((p: any) => p.displayName || `Spieler_${p.playerId.slice(0, 6)}`).join(', ') || 'Unbekannt';
      
      console.log(`   🤝 Teamkollegen: ${teammates}`);
      console.log(`   ⚔️  Gegner: ${opponents}`);
      
      // Hole einzelne Spiele der Session
      console.log(`   🎲 EINZELNE SPIELE:`);
      
      try {
        const gamesSnap = await db.collection(`groups/${groupId}/jassGameSummaries/${eventId}/completedGames`)
          .orderBy('gameNumber', 'asc').get();
        
        if (!gamesSnap.empty) {
          gamesSnap.docs.forEach((gameDoc, index) => {
            const gameData = gameDoc.data();
            const gameNumber = gameData.gameNumber || (index + 1);
            
            // Berechne Striche für dieses Spiel
            const ownStriche = calculateTotalStriche(gameData.finalStriche?.[playerTeam] || {});
            const opponentStriche = calculateTotalStriche(gameData.finalStriche?.[opponentTeam] || {});
            const stricheDiff = ownStriche - opponentStriche;
            
            const winner = gameData.winnerTeam === playerTeam ? '✅ GEWONNEN' : '❌ VERLOREN';
            const stricheSymbol = stricheDiff >= 0 ? '+' : '';
            
            console.log(`      🎯 Spiel ${gameNumber}: ${winner} | Striche: ${ownStriche} vs ${opponentStriche} (${stricheSymbol}${stricheDiff})`);
            
            // Zeige Striche-Details
            const ownStricheDetails = gameData.finalStriche?.[playerTeam] || {};
            const opponentStricheDetails = gameData.finalStriche?.[opponentTeam] || {};
            
            if (ownStricheDetails.sieg || ownStricheDetails.berg || ownStricheDetails.schneider || ownStricheDetails.matsch || ownStricheDetails.kontermatsch ||
                opponentStricheDetails.sieg || opponentStricheDetails.berg || opponentStricheDetails.schneider || opponentStricheDetails.matsch || opponentStricheDetails.kontermatsch) {
              console.log(`         📊 Eigene Striche: Sieg:${ownStricheDetails.sieg || 0} Berg:${ownStricheDetails.berg || 0} Schneider:${ownStricheDetails.schneider || 0} Matsch:${ownStricheDetails.matsch || 0} Kontermatsch:${ownStricheDetails.kontermatsch || 0}`);
              console.log(`         📊 Gegner Striche: Sieg:${opponentStricheDetails.sieg || 0} Berg:${opponentStricheDetails.berg || 0} Schneider:${opponentStricheDetails.schneider || 0} Matsch:${opponentStricheDetails.matsch || 0} Kontermatsch:${opponentStricheDetails.kontermatsch || 0}`);
            }
          });
        } else {
          // Fallback auf Session-Ebene
          const ownStriche = calculateTotalStriche(sessionData.finalStriche?.[playerTeam] || {});
          const opponentStriche = calculateTotalStriche(sessionData.finalStriche?.[opponentTeam] || {});
          const stricheDiff = ownStriche - opponentStriche;
          const winner = sessionData.winnerTeam === playerTeam ? '✅ GEWONNEN' : '❌ VERLOREN';
          const stricheSymbol = stricheDiff >= 0 ? '+' : '';
          
          console.log(`      🎯 Session-Gesamt: ${winner} | Striche: ${ownStriche} vs ${opponentStriche} (${stricheSymbol}${stricheDiff})`);
        }
      } catch (error) {
        console.log(`      ❌ Fehler beim Laden der Spiele: ${error}`);
      }
      
      console.log('-'.repeat(100));
      
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
    console.log('='.repeat(100));
    console.log(`👤 Spieler: ${playerName}`);
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

/**
 * Berechne Total Striche aus Striche-Objekt
 */
function calculateTotalStriche(stricheObj: any): number {
  if (!stricheObj || typeof stricheObj !== 'object') return 0;
  
  const sieg = stricheObj.sieg || 0;
  const berg = stricheObj.berg || 0;
  const schneider = stricheObj.schneider || 0;
  const matsch = stricheObj.matsch || 0;
  const kontermatsch = stricheObj.kontermatsch || 0;
  
  return sieg + berg + schneider + matsch + kontermatsch;
}

// Script ausführen
const args = process.argv.slice(2);
const groupId = args.find(arg => arg.startsWith('--groupId='))?.split('=')[1];
const playerId = args.find(arg => arg.startsWith('--playerId='))?.split('=')[1];

if (!groupId || !playerId) {
  console.error('❌ Fehler: Gruppen-ID und Spieler-ID erforderlich!');
  console.log('💡 Verwendung: npx ts-node -r tsconfig-paths/register src/scripts/analyzePlayerDetailedGames.ts --groupId=DEINE_GRUPPEN_ID --playerId=DEINE_SPIELER_ID');
  console.log('💡 Beispiel: npx ts-node -r tsconfig-paths/register src/scripts/analyzePlayerDetailedGames.ts --groupId=BhEdUmwb7tb4ka8BLUfM --playerId=4ixOg5n0DcQmg028WPtvF');
  process.exit(1);
}

analyzePlayerDetailedGames(groupId, playerId);
