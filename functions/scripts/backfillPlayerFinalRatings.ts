/**
 * Backfill Script: playerFinalRatings in jassGameSummaries
 * 
 * Dieses Skript aktualisiert alle jassGameSummaries mit den korrekten
 * playerFinalRatings basierend auf der chronologischen Elo-Berechnung.
 * 
 * Ziel: GroupView Elo-Chart kann direkt aus jassGameSummaries lesen
 * und zeigt auch Tournament-Datenpunkte korrekt an.
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Elo-Konfiguration (identisch zu recalculateEloRatingHistory.ts)
const JASS_ELO_CONFIG = {
  K_TARGET: 15,
  DEFAULT_RATING: 100,
  ELO_SCALE: 1000,
} as const;

// Command-line Arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');

// Hilfsfunktionen für Elo-Berechnung
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

function stricheScore(stricheA: number, stricheB: number): number {
  const total = stricheA + stricheB;
  if (total === 0) return 0.5;
  return stricheA / total;
}

function sumStriche(team: { striche: number; weisScore: number }[]): number {
  return team.reduce((sum, player) => sum + player.striche + player.weisScore, 0);
}

interface GameEvent {
  type: 'session' | 'tournament';
  id: string;
  groupId: string;
  completedAt: admin.firestore.Timestamp;
  players: {
    playerId: string;
    displayName: string;
    team: 'top' | 'bottom';
    striche: number;
    weisScore: number;
  }[];
}

interface PlayerRatingState {
  rating: number;
  gamesPlayed: number;
}

interface BackfillUpdate {
  groupId: string;
  sessionId: string;
  playerFinalRatings: {
    [playerId: string]: {
      rating: number;
      ratingDelta: number;
      gamesPlayed: number;
      displayName?: string;
    };
  };
}

/**
 * Sammle alle Sessions und Tournaments chronologisch
 */
async function collectAllEvents(): Promise<GameEvent[]> {
  console.log('\n📥 PHASE 1: Sammle alle Events (Sessions + Tournaments)...\n');
  
  const events: GameEvent[] = [];
  
  // 1. Sammle alle Sessions aus allen Gruppen
  const groupsSnap = await db.collection('groups').get();
  console.log(`   Gefunden: ${groupsSnap.size} Gruppen`);
  
  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id;
    const summariesSnap = await db
      .collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .get();
    
    console.log(`   - Gruppe ${groupId}: ${summariesSnap.size} Sessions`);
    
    for (const summaryDoc of summariesSnap.docs) {
      const data = summaryDoc.data();
      
      // Prüfe ob es ein Tournament ist
      const isTournament = data.isTournamentSession === true || data.tournamentId || data.type === 'tournament';
      
      if (isTournament) {
        // Tournament: Verwende die bereits aggregierten Daten aus dem Summary
        // ✅ WICHTIG: Verwende summaryDoc.id (nicht tournamentId) als Event-ID
        const players: GameEvent['players'] = [];
        
        // Top Team
        if (data.teams?.top?.players && Array.isArray(data.teams.top.players)) {
          for (const player of data.teams.top.players) {
            players.push({
              playerId: player.playerId,
              displayName: player.displayName || player.playerId,
              team: 'top',
              striche: data.finalScores?.top || 0,
              weisScore: 0, // Weis ist in finalScores bereits eingerechnet
            });
          }
        }
        
        // Bottom Team
        if (data.teams?.bottom?.players && Array.isArray(data.teams.bottom.players)) {
          for (const player of data.teams.bottom.players) {
            players.push({
              playerId: player.playerId,
              displayName: player.displayName || player.playerId,
              team: 'bottom',
              striche: data.finalScores?.bottom || 0,
              weisScore: 0, // Weis ist in finalScores bereits eingerechnet
            });
          }
        }
        
        if (players.length > 0 && data.completedAt) {
          let completedAt: admin.firestore.Timestamp;
          
          if (data.completedAt.toDate) {
            completedAt = data.completedAt as admin.firestore.Timestamp;
          } else if (typeof data.completedAt === 'object' && ('_seconds' in data.completedAt || 'seconds' in data.completedAt)) {
            const seconds = (data.completedAt as any)._seconds ?? (data.completedAt as any).seconds;
            const nanoseconds = (data.completedAt as any)._nanoseconds ?? (data.completedAt as any).nanoseconds ?? 0;
            completedAt = admin.firestore.Timestamp.fromMillis(seconds * 1000 + Math.floor(nanoseconds / 1000000));
          } else {
            console.warn(`   ⚠️ Überspringe Tournament ${summaryDoc.id}: Ungültiges completedAt-Format`);
            continue;
          }
          
          events.push({
            type: 'tournament',
            id: summaryDoc.id,  // ✅ Verwende Summary-ID
            groupId,
            completedAt,
            players,
          });
        }
      } else {
        // Session: Lade Spielerdaten aus teams-Struktur
        const players: GameEvent['players'] = [];
        
        // Top Team
        if (data.teams?.top?.players && Array.isArray(data.teams.top.players)) {
          for (const player of data.teams.top.players) {
            players.push({
              playerId: player.playerId,
              displayName: player.displayName || player.playerId,
              team: 'top',
              striche: data.finalScores?.top || 0,
              weisScore: 0, // Weis ist in finalScores bereits eingerechnet
            });
          }
        }
        
        // Bottom Team
        if (data.teams?.bottom?.players && Array.isArray(data.teams.bottom.players)) {
          for (const player of data.teams.bottom.players) {
            players.push({
              playerId: player.playerId,
              displayName: player.displayName || player.playerId,
              team: 'bottom',
              striche: data.finalScores?.bottom || 0,
              weisScore: 0, // Weis ist in finalScores bereits eingerechnet
            });
          }
        }
        
        if (players.length > 0 && data.completedAt) {
          let completedAt: admin.firestore.Timestamp;
          
          if (data.completedAt.toDate) {
            completedAt = data.completedAt as admin.firestore.Timestamp;
          } else if (typeof data.completedAt === 'object' && ('_seconds' in data.completedAt || 'seconds' in data.completedAt)) {
            const seconds = (data.completedAt as any)._seconds ?? (data.completedAt as any).seconds;
            const nanoseconds = (data.completedAt as any)._nanoseconds ?? (data.completedAt as any).nanoseconds ?? 0;
            completedAt = admin.firestore.Timestamp.fromMillis(seconds * 1000 + Math.floor(nanoseconds / 1000000));
          } else {
            console.warn(`   ⚠️ Überspringe Session ${summaryDoc.id}: Ungültiges completedAt-Format`);
            continue;
          }
          
          events.push({
            type: 'session',
            id: summaryDoc.id,
            groupId,
            completedAt,
            players,
          });
        }
      }
    }
  }
  
  // Sortiere alle Events chronologisch
  events.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());
  
  console.log(`\n   ✅ Gesammelt: ${events.length} Events (Sessions + Tournaments)\n`);
  
  return events;
}

/**
 * Berechne Elo-Ratings chronologisch und erstelle Updates
 */
async function calculatePlayerFinalRatings(events: GameEvent[]): Promise<BackfillUpdate[]> {
  console.log('\n🧮 PHASE 2: Berechne Elo-Ratings chronologisch...\n');
  
  const playerRatings = new Map<string, PlayerRatingState>();
  const updates: BackfillUpdate[] = [];
  
  // Initialisiere alle Spieler mit Default-Rating
  for (const event of events) {
    for (const player of event.players) {
      if (!playerRatings.has(player.playerId)) {
        playerRatings.set(player.playerId, {
          rating: JASS_ELO_CONFIG.DEFAULT_RATING,
          gamesPlayed: 0,
        });
      }
    }
  }
  
  console.log(`   Initialisiert: ${playerRatings.size} Spieler mit Rating ${JASS_ELO_CONFIG.DEFAULT_RATING}\n`);
  
  // Iteriere durch alle Events chronologisch
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    
    // Speichere Ratings VOR diesem Event für Delta-Berechnung
    const ratingsBeforeEvent = new Map<string, number>();
    for (const player of event.players) {
      const state = playerRatings.get(player.playerId)!;
      ratingsBeforeEvent.set(player.playerId, state.rating);
    }
    
    // Berechne Team-Ratings
    const topPlayers = event.players.filter(p => p.team === 'top');
    const bottomPlayers = event.players.filter(p => p.team === 'bottom');
    
    const topRating = topPlayers.reduce((sum, p) => sum + playerRatings.get(p.playerId)!.rating, 0) / topPlayers.length;
    const bottomRating = bottomPlayers.reduce((sum, p) => sum + playerRatings.get(p.playerId)!.rating, 0) / bottomPlayers.length;
    
    // Berechne Expected Score
    const expectedTop = expectedScore(topRating, bottomRating);
    const expectedBottom = 1 - expectedTop;
    
    // Berechne Actual Score (Striche-basiert)
    const topStriche = sumStriche(topPlayers.map(p => ({ striche: p.striche, weisScore: p.weisScore })));
    const bottomStriche = sumStriche(bottomPlayers.map(p => ({ striche: p.striche, weisScore: p.weisScore })));
    const actualTop = stricheScore(topStriche, bottomStriche);
    const actualBottom = 1 - actualTop;
    
    // Berechne Delta
    const deltaTop = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
    const deltaBottom = JASS_ELO_CONFIG.K_TARGET * (actualBottom - expectedBottom);
    
    // Update Ratings
    for (const player of topPlayers) {
      const state = playerRatings.get(player.playerId)!;
      state.rating += deltaTop;
      state.gamesPlayed += 1;
    }
    
    for (const player of bottomPlayers) {
      const state = playerRatings.get(player.playerId)!;
      state.rating += deltaBottom;
      state.gamesPlayed += 1;
    }
    
    // Erstelle playerFinalRatings für dieses Event
    const playerFinalRatings: BackfillUpdate['playerFinalRatings'] = {};
    
    for (const player of event.players) {
      const state = playerRatings.get(player.playerId)!;
      const ratingBefore = ratingsBeforeEvent.get(player.playerId)!;
      const ratingDelta = state.rating - ratingBefore;
      
      playerFinalRatings[player.playerId] = {
        rating: state.rating,
        ratingDelta,
        gamesPlayed: state.gamesPlayed,
        displayName: player.displayName,
      };
    }
    
    updates.push({
      groupId: event.groupId,
      sessionId: event.id,
      playerFinalRatings,
    });
    
    // Log Progress
    if ((i + 1) % 10 === 0 || i === events.length - 1) {
      console.log(`   Verarbeitet: ${i + 1}/${events.length} Events`);
    }
  }
  
  console.log(`\n   ✅ ${updates.length} playerFinalRatings Updates vorbereitet\n`);
  
  return updates;
}

/**
 * Schreibe Updates zu Firestore
 */
async function applyUpdates(updates: BackfillUpdate[]): Promise<void> {
  console.log('\n💾 PHASE 3: Schreibe playerFinalRatings zu jassGameSummaries...\n');
  
  if (isDryRun) {
    console.log('🧪 DRY-RUN: Keine Änderungen werden geschrieben\n');
    
    // Zeige erste 5 Updates als Beispiel
    console.log('📝 Beispiel-Updates (erste 5):\n');
    for (let i = 0; i < Math.min(5, updates.length); i++) {
      const update = updates[i];
      console.log(`${i + 1}. Group ${update.groupId}, Session ${update.sessionId}:`);
      Object.entries(update.playerFinalRatings).forEach(([playerId, data]) => {
        console.log(`   ${data.displayName || playerId}: Rating ${data.rating.toFixed(2)} (${data.ratingDelta > 0 ? '+' : ''}${data.ratingDelta.toFixed(2)}) | Games: ${data.gamesPlayed}`);
      });
      console.log('');
    }
    
    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ DRY-RUN ABGESCHLOSSEN!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`\nFühre das Skript mit --confirm aus, um ${updates.length} Updates zu schreiben:\n`);
    console.log('   npx ts-node scripts/backfillPlayerFinalRatings.ts --confirm\n');
    
    return;
  }
  
  // Echtes Schreiben in Batches
  const batchSize = 500;
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = db.batch();
    const batchUpdates = updates.slice(i, i + batchSize);
    
    for (const update of batchUpdates) {
      const docRef = db
        .collection(`groups/${update.groupId}/jassGameSummaries`)
        .doc(update.sessionId);
      
      batch.update(docRef, { playerFinalRatings: update.playerFinalRatings });
    }
    
    try {
      await batch.commit();
      successCount += batchUpdates.length;
      console.log(`   ✅ Batch ${Math.floor(i / batchSize) + 1}: ${batchUpdates.length} Updates geschrieben`);
    } catch (error) {
      errorCount += batchUpdates.length;
      console.error(`   ❌ Batch ${Math.floor(i / batchSize) + 1} fehlgeschlagen:`, error);
    }
  }
  
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ BACKFILL ABGESCHLOSSEN!');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`   Erfolgreich: ${successCount} Updates`);
  console.log(`   Fehler: ${errorCount} Updates`);
  console.log('');
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔄 BACKFILL: playerFinalRatings in jassGameSummaries');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`   K-Faktor: ${JASS_ELO_CONFIG.K_TARGET}`);
  console.log(`   Default Rating: ${JASS_ELO_CONFIG.DEFAULT_RATING}`);
  console.log(`   Elo Scale: ${JASS_ELO_CONFIG.ELO_SCALE}`);
  console.log(`   Modus: ${isDryRun ? '🧪 DRY-RUN' : '✅ LIVE'}`);
  console.log('════════════════════════════════════════════════════════════════');
  
  try {
    // Phase 1: Sammle alle Events
    const events = await collectAllEvents();
    
    if (events.length === 0) {
      console.log('\n⚠️ Keine Events gefunden. Beende Skript.\n');
      process.exit(0);
    }
    
    // Phase 2: Berechne Ratings
    const updates = await calculatePlayerFinalRatings(events);
    
    // Phase 3: Schreibe Updates
    await applyUpdates(updates);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    process.exit(1);
  }
}

main();

