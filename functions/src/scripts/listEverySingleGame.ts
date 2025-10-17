#!/usr/bin/env ts-node

import * as admin from 'firebase-admin';
import * as path from 'path';

/**
 * Script um JEDES EINZELNE SPIEL eines Spielers aufzulisten
 */
async function listEverySingleGame(groupId: string, playerId: string) {
  try {
    console.log(`🔍 Liste JEDES EINZELNE SPIEL für Spieler ${playerId} in Gruppe ${groupId}...`);
    
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
    const playerDoc = await db.doc(`groups/${groupId}/playerRatings/${playerId}`).get();
    const playerData = playerDoc.data();
    const playerName = playerData?.displayName || `Spieler_${playerId.slice(0, 6)}`;
    
    console.log(`👤 Spieler: ${playerName} (${playerId})`);
    console.log(`🏆 Aktueller Tier: ${playerData?.tier || 'Unbekannt'} ${playerData?.tierEmoji || ''}`);
    console.log(`📊 Aktuelles Rating: ${playerData?.rating?.toFixed(2) || '100.00'}`);
    console.log('');
    
    // 2. Hole alle Sessions chronologisch
    const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`);
    const sessionsSnap = await sessionsRef.orderBy('startedAt', 'asc').get();
    
    console.log(`📊 Gefunden: ${sessionsSnap.docs.length} Sessions`);
    console.log('');
    console.log('🎮 JEDES EINZELNE SPIEL:');
    console.log('='.repeat(120));
    
    let totalGameNumber = 1;
    let totalWins = 0;
    let totalLosses = 0;
    let totalStriche = 0;
    let totalOpponentStriche = 0;
    
    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      // Prüfe ob Spieler in dieser Session teilgenommen hat
      const isTopTeam = sessionData.teams?.top?.players?.some((p: any) => p.playerId === playerId);
      const isBottomTeam = sessionData.teams?.bottom?.players?.some((p: any) => p.playerId === playerId);
      
      if (!isTopTeam && !isBottomTeam) {
        continue; // Spieler war nicht in dieser Session
      }
      
      const playerTeam = isTopTeam ? 'top' : 'bottom';
      const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
      
      const createdAt = sessionData.startedAt?.toDate?.()?.toLocaleDateString() || 'Unbekannt';
      const sessionTime = sessionData.startedAt?.toDate?.()?.toLocaleTimeString() || 'Unbekannt';
      
      console.log(`📅 SESSION: ${createdAt} ${sessionTime} | ID: ${sessionId}`);
      console.log(`👥 Team: ${playerTeam.toUpperCase()} (${isTopTeam ? 'Oben' : 'Unten'})`);
      
      // Hole Teamkollegen und Gegner
      const teammates = sessionData.teams?.[playerTeam]?.players?.map((p: any) => p.displayName || `Spieler_${p.playerId.slice(0, 6)}`).join(', ') || 'Unbekannt';
      const opponents = sessionData.teams?.[opponentTeam]?.players?.map((p: any) => p.displayName || `Spieler_${p.playerId.slice(0, 6)}`).join(', ') || 'Unbekannt';
      
      console.log(`🤝 Teamkollegen: ${teammates}`);
      console.log(`⚔️  Gegner: ${opponents}`);
      console.log('');
      
      // Hole einzelne Spiele der Session
      try {
        const gamesSnap = await db.collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
          .orderBy('gameNumber', 'asc').get();
        
        if (!gamesSnap.empty) {
          console.log(`🎲 ${gamesSnap.docs.length} EINZELNE SPIELE:`);
          
          for (const gameDoc of gamesSnap.docs) {
            const gameData = gameDoc.data();
            const gameNumber = gameData.gameNumber || 'Unbekannt';
            
            // Berechne Striche für dieses Spiel
            const ownStriche = calculateTotalStriche(gameData.finalStriche?.[playerTeam] || {});
            const opponentStriche = calculateTotalStriche(gameData.finalStriche?.[opponentTeam] || {});
            const stricheDiff = ownStriche - opponentStriche;
            
            const winner = gameData.winnerTeam === playerTeam ? '✅ GEWONNEN' : '❌ VERLOREN';
            const stricheSymbol = stricheDiff >= 0 ? '+' : '';
            
            console.log(`   🎯 SPIEL ${totalGameNumber.toString().padStart(3, '0')} | Spiel ${gameNumber} | ${winner}`);
            console.log(`      📊 Striche: ${ownStriche} vs ${opponentStriche} (${stricheSymbol}${stricheDiff})`);
            
            // Zeige detaillierte Striche-Aufschlüsselung
            const ownStricheDetails = gameData.finalStriche?.[playerTeam] || {};
            const opponentStricheDetails = gameData.finalStriche?.[opponentTeam] || {};
            
            console.log(`      🎯 EIGENE STRICHE:`);
            console.log(`         Sieg: ${ownStricheDetails.sieg || 0} | Berg: ${ownStricheDetails.berg || 0} | Schneider: ${ownStricheDetails.schneider || 0} | Matsch: ${ownStricheDetails.matsch || 0} | Kontermatsch: ${ownStricheDetails.kontermatsch || 0}`);
            
            console.log(`      🎯 GEGNER STRICHE:`);
            console.log(`         Sieg: ${opponentStricheDetails.sieg || 0} | Berg: ${opponentStricheDetails.berg || 0} | Schneider: ${opponentStricheDetails.schneider || 0} | Matsch: ${opponentStricheDetails.matsch || 0} | Kontermatsch: ${opponentStricheDetails.kontermatsch || 0}`);
            
            // Zeige Spieler-spezifische Details (falls verfügbar)
            if (gameData.playerDetails) {
              const playerDetail = gameData.playerDetails.find((p: any) => p.playerId === playerId);
              if (playerDetail) {
                console.log(`      👤 SPIELER-DETAILS:`);
                console.log(`         Team: ${playerDetail.team} | Punkte: ${playerDetail.points || 0} | Striche: ${playerDetail.striche || 0}`);
              }
            }
            
            console.log(`      📈 STATISTIK:`);
            console.log(`         Gesamtspiele: ${totalGameNumber} | Siege: ${winner === '✅ GEWONNEN' ? totalWins + 1 : totalWins} | Niederlagen: ${winner === '❌ VERLOREN' ? totalLosses + 1 : totalLosses}`);
            
            console.log('-'.repeat(80));
            
            // Update Statistiken
            if (winner === '✅ GEWONNEN') {
              totalWins++;
            } else {
              totalLosses++;
            }
            totalStriche += ownStriche;
            totalOpponentStriche += opponentStriche;
            totalGameNumber++;
          }
        } else {
          // Fallback auf Session-Ebene
          const ownStriche = calculateTotalStriche(sessionData.finalStriche?.[playerTeam] || {});
          const opponentStriche = calculateTotalStriche(sessionData.finalStriche?.[opponentTeam] || {});
          const stricheDiff = ownStriche - opponentStriche;
          const winner = sessionData.winnerTeam === playerTeam ? '✅ GEWONNEN' : '❌ VERLOREN';
          const stricheSymbol = stricheDiff >= 0 ? '+' : '';
          
          console.log(`🎯 SPIEL ${totalGameNumber.toString().padStart(3, '0')} | Session-Gesamt | ${winner}`);
          console.log(`   📊 Striche: ${ownStriche} vs ${opponentStriche} (${stricheSymbol}${stricheDiff})`);
          
          // Zeige Session-Striche-Details
          const ownStricheDetails = sessionData.finalStriche?.[playerTeam] || {};
          const opponentStricheDetails = sessionData.finalStriche?.[opponentTeam] || {};
          
          console.log(`   🎯 EIGENE STRICHE:`);
          console.log(`      Sieg: ${ownStricheDetails.sieg || 0} | Berg: ${ownStricheDetails.berg || 0} | Schneider: ${ownStricheDetails.schneider || 0} | Matsch: ${ownStricheDetails.matsch || 0} | Kontermatsch: ${ownStricheDetails.kontermatsch || 0}`);
          
          console.log(`   🎯 GEGNER STRICHE:`);
          console.log(`      Sieg: ${opponentStricheDetails.sieg || 0} | Berg: ${opponentStricheDetails.berg || 0} | Schneider: ${opponentStricheDetails.schneider || 0} | Matsch: ${opponentStricheDetails.matsch || 0} | Kontermatsch: ${opponentStricheDetails.kontermatsch || 0}`);
          
          console.log('-'.repeat(80));
          
          // Update Statistiken
          if (winner === '✅ GEWONNEN') {
            totalWins++;
          } else {
            totalLosses++;
          }
          totalStriche += ownStriche;
          totalOpponentStriche += opponentStriche;
          totalGameNumber++;
        }
      } catch (error) {
        console.log(`❌ Fehler beim Laden der Spiele für Session ${sessionId}: ${error}`);
      }
      
      console.log('');
    }
    
    // Finale Zusammenfassung
    const totalGames = totalGameNumber - 1;
    const winRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';
    const stricheDiff = totalStriche - totalOpponentStriche;
    const stricheSymbol = stricheDiff >= 0 ? '+' : '';
    
    console.log('');
    console.log('📊 FINALE ZUSAMMENFASSUNG ALLER SPIELE:');
    console.log('='.repeat(120));
    console.log(`👤 Spieler: ${playerName}`);
    console.log(`🎮 Gesamtspiele: ${totalGames}`);
    console.log(`✅ Siege: ${totalWins} | ❌ Niederlagen: ${totalLosses}`);
    console.log(`📊 Siegrate: ${winRate}%`);
    console.log(`🎯 Gesamtstriche: ${totalStriche} vs ${totalOpponentStriche} (${stricheSymbol}${stricheDiff})`);
    console.log(`📈 Durchschnittliche Striche pro Spiel: ${totalGames > 0 ? (totalStriche / totalGames).toFixed(2) : '0.00'}`);
    console.log(`🏆 Aktueller Tier: ${playerData?.tier || 'Unbekannt'} ${playerData?.tierEmoji || ''}`);
    
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
  console.log('💡 Verwendung: npx ts-node -r tsconfig-paths/register src/scripts/listEverySingleGame.ts --groupId=DEINE_GRUPPEN_ID --playerId=DEINE_SPIELER_ID');
  console.log('💡 Beispiel: npx ts-node -r tsconfig-paths/register src/scripts/listEverySingleGame.ts --groupId=BhEdUmwb7tb4ka8BLUfM --playerId=4ixOg5n0DcQmg028WPtvF');
  process.exit(1);
}

listEverySingleGame(groupId, playerId);
