#!/usr/bin/env ts-node

/**
 * 🔧 FIX MISSING RATING HISTORY
 * 
 * Repariert fehlende ratingHistory Einträge für das jassGameSummaries Dokument
 * vom 20. Oktober 2025 (kFI60_GTBnYADP7BQZSg9)
 * 
 * Problem: Das Dokument wurde erstellt, aber die Elo-Berechnung schlug fehl,
 * wodurch keine ratingHistory Einträge erstellt wurden.
 */

import * as admin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';

// Firebase Admin SDK initialisieren
if (!admin.apps.length) {
  initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

// Konfiguration
const JASS_ELO_CONFIG = {
  DEFAULT_RATING: 100,
  K_TARGET: 32,
};

// Hilfsfunktionen aus jassEloUpdater.ts
function sumStriche(stricheObj: any): number {
  if (!stricheObj || typeof stricheObj !== 'object') return 0;
  
  const stricheValues = Object.values(stricheObj).filter(val => typeof val === 'number') as number[];
  return stricheValues.reduce((sum, val) => sum + val, 0);
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function stricheScore(stricheTop: number, stricheBottom: number): number {
  if (stricheTop === stricheBottom) return 0.5;
  return stricheTop > stricheBottom ? 1 : 0;
}

async function fixMissingRatingHistory() {
  console.log('🔧 Starting fix for missing rating history...');
  
  const sessionId = 'kFI60_GTBnYADP7BQZSg9';
  const groupId = 'Rosen10player'; // Aus dem Dokument
  
  try {
    // 1. Lade das jassGameSummaries Dokument
    console.log(`📄 Loading jassGameSummaries document: ${sessionId}`);
    const summaryRef = db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`);
    const summarySnap = await summaryRef.get();
    
    if (!summarySnap.exists) {
      console.error(`❌ Document ${sessionId} not found in group ${groupId}`);
      return;
    }
    
    const summary = summarySnap.data();
    console.log('✅ Document loaded successfully');
    console.log('📊 Document data:', {
      status: summary?.status,
      participantPlayerIds: summary?.participantPlayerIds,
      teams: summary?.teams,
      gameResults: summary?.gameResults?.length,
      finalStriche: summary?.finalStriche,
      createdAt: summary?.createdAt?.toDate?.()?.toISOString(),
      endedAt: summary?.endedAt?.toDate?.()?.toISOString()
    });
    
    // 2. Validiere Team-Struktur
    const topPlayers: string[] = summary?.teams?.top?.players?.map((p: any) => p.playerId).filter(Boolean) || [];
    const bottomPlayers: string[] = summary?.teams?.bottom?.players?.map((p: any) => p.playerId).filter(Boolean) || [];
    
    console.log('👥 Team structure:', {
      topPlayers,
      bottomPlayers,
      isValid: topPlayers.length === 2 && bottomPlayers.length === 2
    });
    
    if (topPlayers.length !== 2 || bottomPlayers.length !== 2) {
      console.error('❌ Invalid team structure');
      return;
    }
    
    // 3. Lade aktuelle Spieler-Ratings
    console.log('📈 Loading current player ratings...');
    const ratingMap = new Map<string, { rating: number; gamesPlayed: number }>();
    
    for (const playerId of [...topPlayers, ...bottomPlayers]) {
      const playerRef = db.collection('players').doc(playerId);
      const playerSnap = await playerRef.get();
      
      if (playerSnap.exists) {
        const playerData = playerSnap.data();
        ratingMap.set(playerId, {
          rating: playerData?.rating || JASS_ELO_CONFIG.DEFAULT_RATING,
          gamesPlayed: playerData?.gamesPlayed || 0
        });
        console.log(`👤 Player ${playerId}: Rating ${playerData?.rating || 100}, Games ${playerData?.gamesPlayed || 0}`);
      } else {
        console.warn(`⚠️ Player ${playerId} not found`);
      }
    }
    
    // 4. Verarbeite Spiele (Fallback-Logik)
    console.log('🎮 Processing games...');
    const games: Array<{ stricheTop: number; stricheBottom: number; }> = [];
    
    // Versuche completedGames Subcollection
    const cgSnap = await summaryRef.collection('completedGames').orderBy('gameNumber', 'asc').get();
    if (!cgSnap.empty) {
      console.log(`✅ Found ${cgSnap.size} completed games`);
      cgSnap.forEach(doc => {
        const g = doc.data();
        const stricheTop = sumStriche(g.finalStriche?.top);
        const stricheBottom = sumStriche(g.finalStriche?.bottom);
        games.push({ stricheTop, stricheBottom });
        console.log(`🎯 Game ${doc.id}: Top ${stricheTop}, Bottom ${stricheBottom}`);
      });
    } else if (Array.isArray(summary?.gameResults) && summary?.finalStriche) {
      console.log('🔄 Using fallback: Session-level gameResults');
      
      // Fallback: Session-Level gameResults + finale Striche
      const stricheTop = sumStriche(summary.finalStriche?.top);
      const stricheBottom = sumStriche(summary.finalStriche?.bottom);
      games.push({ stricheTop, stricheBottom });
      console.log(`🎯 Session-level: Top ${stricheTop}, Bottom ${stricheBottom}`);
    }
    
    if (games.length === 0) {
      console.error('❌ No games found to process');
      return;
    }
    
    // 5. Erstelle Rating-History Einträge
    console.log('📝 Creating rating history entries...');
    const batch = db.batch();
    
    // Aktualisiere Spieler-Ratings
    const newRatingMap = new Map<string, number>();
    for (const [playerId, playerData] of ratingMap) {
      newRatingMap.set(playerId, playerData.rating);
    }
    
    // Verarbeite jedes Spiel
    for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
      const game = games[gameIndex];
      const gameNumber = gameIndex + 1;
      
      // Timestamp für dieses Spiel interpolieren
      const sessionStart = summary?.startedAt?.toDate?.() || new Date();
      const sessionEnd = summary?.endedAt?.toDate?.() || new Date();
      const sessionDuration = sessionEnd.getTime() - sessionStart.getTime();
      const gameTimestamp = new Date(sessionStart.getTime() + (sessionDuration * gameIndex / games.length));
      
      console.log(`🎮 Processing game ${gameNumber} at ${gameTimestamp.toISOString()}`);
      
      // Rating-History für Top-Team
      for (const pid of topPlayers) {
        const playerRating = ratingMap.get(pid);
        if (playerRating) {
          // Berechne Rating nach diesem Spiel
          const teamTopRating = topPlayers.reduce((sum, p) => sum + (ratingMap.get(p)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / topPlayers.length;
          const teamBottomRating = bottomPlayers.reduce((sum, p) => sum + (ratingMap.get(p)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / bottomPlayers.length;
          const expectedTop = expectedScore(teamTopRating, teamBottomRating);
          const actualTop = stricheScore(game.stricheTop, game.stricheBottom);
          const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
          const deltaPerPlayer = delta / topPlayers.length;
          
          const newRating = playerRating.rating + deltaPerPlayer;
          newRatingMap.set(pid, newRating);
          
          const historyData = {
            rating: newRating,
            delta: deltaPerPlayer,
            eventType: 'game',
            gameNumber: gameNumber,
            createdAt: admin.firestore.Timestamp.fromDate(gameTimestamp),
            sessionId: sessionId,
            groupId: groupId,
          };
          
          batch.set(db.collection(`players/${pid}/ratingHistory`).doc(), historyData);
          console.log(`👤 Top player ${pid}: ${playerRating.rating} → ${newRating} (Δ${deltaPerPlayer >= 0 ? '+' : ''}${deltaPerPlayer.toFixed(2)})`);
        }
      }
      
      // Rating-History für Bottom-Team
      for (const pid of bottomPlayers) {
        const playerRating = ratingMap.get(pid);
        if (playerRating) {
          // Berechne Rating nach diesem Spiel
          const teamTopRating = topPlayers.reduce((sum, p) => sum + (ratingMap.get(p)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / topPlayers.length;
          const teamBottomRating = bottomPlayers.reduce((sum, p) => sum + (ratingMap.get(p)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / bottomPlayers.length;
          const expectedTop = expectedScore(teamTopRating, teamBottomRating);
          const actualTop = stricheScore(game.stricheTop, game.stricheBottom);
          const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
          const deltaPerPlayer = -delta / bottomPlayers.length;
          
          const newRating = playerRating.rating + deltaPerPlayer;
          newRatingMap.set(pid, newRating);
          
          const historyData = {
            rating: newRating,
            delta: deltaPerPlayer,
            eventType: 'game',
            gameNumber: gameNumber,
            createdAt: admin.firestore.Timestamp.fromDate(gameTimestamp),
            sessionId: sessionId,
            groupId: groupId,
          };
          
          batch.set(db.collection(`players/${pid}/ratingHistory`).doc(), historyData);
          console.log(`👤 Bottom player ${pid}: ${playerRating.rating} → ${newRating} (Δ${deltaPerPlayer >= 0 ? '+' : ''}${deltaPerPlayer.toFixed(2)})`);
        }
      }
    }
    
    // 6. Aktualisiere finale Spieler-Ratings
    console.log('🔄 Updating final player ratings...');
    for (const [playerId, newRating] of newRatingMap) {
      const playerRef = db.collection('players').doc(playerId);
      const oldRating = ratingMap.get(playerId)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING;
      const ratingDelta = newRating - oldRating;
      
      batch.update(playerRef, {
        rating: newRating,
        gamesPlayed: admin.firestore.FieldValue.increment(1),
        lastSessionDelta: ratingDelta,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`👤 Updated player ${playerId}: ${oldRating} → ${newRating} (Δ${ratingDelta >= 0 ? '+' : ''}${ratingDelta.toFixed(2)})`);
    }
    
    // 7. Markiere Session als Elo-updated
    batch.set(summaryRef, { 
      eloUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      eloFixed: true // Marker für manuellen Fix
    }, { merge: true });
    
    // 8. Committe alle Änderungen
    console.log('💾 Committing all changes...');
    await batch.commit();
    
    console.log('✅ Successfully fixed missing rating history!');
    console.log('📊 Summary:');
    console.log(`   - Session: ${sessionId}`);
    console.log(`   - Group: ${groupId}`);
    console.log(`   - Games processed: ${games.length}`);
    console.log(`   - Players updated: ${newRatingMap.size}`);
    
  } catch (error) {
    console.error('❌ Error fixing rating history:', error);
    throw error;
  }
}

// Script ausführen
if (require.main === module) {
  fixMissingRatingHistory()
    .then(() => {
      console.log('🎉 Fix completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Fix failed:', error);
      process.exit(1);
    });
}

export { fixMissingRatingHistory };
