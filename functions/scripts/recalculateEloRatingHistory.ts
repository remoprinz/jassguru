#!/usr/bin/env ts-node
/**
 * ✨ CHRONOLOGISCHES ELO-BACKFILL für ratingHistory
 * 
 * Dieses Script:
 * 1. Sammelt ALLE Events (Sessions + Tournament Pässe) chronologisch
 * 2. Berechnet Elo von Grund auf neu (Start: 100)
 * 3. Updated nur 'rating' und 'delta' in bestehenden ratingHistory Einträgen
 * 4. Behält Timestamps, gameNumber, etc. unverändert
 * 
 * WICHTIG: Backup der ratingHistory sollte vorher erstellt werden!
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

// Firebase Admin SDK initialisieren
const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Elo-Konfiguration (identisch zu jassEloUpdater.ts)
const JASS_ELO_CONFIG = {
  K_TARGET: 15,  // ✅ ERHÖHT von 10 auf 15
  DEFAULT_RATING: 100,
  ELO_SCALE: 1000,
} as const;

// Command-line Arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');
const isConfirmed = args.includes('--confirm');

// ============================================================================
// ELO-BERECHNUNGS-FUNKTIONEN (aus jassEloUpdater.ts)
// ============================================================================

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

function stricheScore(stricheA: number, stricheB: number): number {
  const total = stricheA + stricheB;
  if (total === 0) return 0.5;
  return stricheA / total;
}

function sumStriche(rec: any): number {
  if (!rec) return 0;
  return (rec.berg || 0) + (rec.sieg || 0) + (rec.matsch || 0) + (rec.schneider || 0) + (rec.kontermatsch || 0);
}

// ============================================================================
// DATENSTRUKTUREN
// ============================================================================

interface TimelineEvent {
  type: 'session_game' | 'tournament_passe';
  timestamp: Date;
  completedAt: admin.firestore.Timestamp;
  
  // Session-Game Daten
  groupId?: string;
  sessionId?: string;
  gameNumber?: number;
  topPlayers?: string[];
  bottomPlayers?: string[];
  stricheTop?: number;
  stricheBottom?: number;
  
  // Tournament-Passe Daten
  tournamentId?: string;
  passeId?: string;
  passeNumber?: number;
}

interface PlayerRating {
  rating: number;
  gamesPlayed: number;
}

interface RatingHistoryUpdate {
  docId: string;
  playerId: string;
  newRating: number;
  newDelta: number;
  oldRating?: number;
  oldDelta?: number;
}

// ============================================================================
// PHASE 1: DATENSAMMLUNG
// ============================================================================

async function collectAllEvents(groupId: string): Promise<TimelineEvent[]> {
  console.log('\n📊 PHASE 1: Sammle alle Events...\n');
  
  const events: TimelineEvent[] = [];
  
  // 1. Sammle alle Sessions und ihre Spiele
  console.log(`🔍 Lade Sessions aus groups/${groupId}/jassGameSummaries...`);
  const sessionsSnapshot = await db.collection(`groups/${groupId}/jassGameSummaries`)
    .orderBy('completedAt', 'asc')
    .get();
  
  console.log(`📁 ${sessionsSnapshot.size} Sessions gefunden`);
  
  for (const sessionDoc of sessionsSnapshot.docs) {
    const sessionData = sessionDoc.data();
    const sessionId = sessionDoc.id;
    
    // Team-Zuordnung
    const topPlayers: string[] = sessionData?.teams?.top?.players?.map((p: any) => p.playerId).filter(Boolean) || [];
    const bottomPlayers: string[] = sessionData?.teams?.bottom?.players?.map((p: any) => p.playerId).filter(Boolean) || [];
    
    if (topPlayers.length !== 2 || bottomPlayers.length !== 2) {
      console.log(`   ⚠️  Session ${sessionId}: Invalid team structure, skipping`);
      continue;
    }
    
    // Lade Spiele
    const gamesSnapshot = await db.collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
      .orderBy('gameNumber', 'asc')
      .get();
    
    if (gamesSnapshot.empty) {
      console.log(`   ⚠️  Session ${sessionId}: No completedGames, skipping`);
      continue;
    }
    
    for (const gameDoc of gamesSnapshot.docs) {
      const gameData = gameDoc.data();
      const gameNumber = parseInt(gameDoc.id);
      
      let completedAt = gameData.completedAt || gameData.timestampCompleted;
      if (!completedAt) {
        console.log(`   ⚠️  Session ${sessionId}, Game ${gameNumber}: No completedAt, skipping`);
        continue;
      }
      
      // ✅ WICHTIG: Konvertiere zu Firestore Timestamp falls nötig
      if (typeof completedAt === 'object' && !completedAt.toDate) {
        if ('_seconds' in completedAt && '_nanoseconds' in completedAt) {
          completedAt = admin.firestore.Timestamp.fromMillis(completedAt._seconds * 1000 + Math.floor(completedAt._nanoseconds / 1000000));
        } else if ('seconds' in completedAt && 'nanoseconds' in completedAt) {
          completedAt = admin.firestore.Timestamp.fromMillis((completedAt as any).seconds * 1000 + Math.floor((completedAt as any).nanoseconds / 1000000));
        } else {
          console.log(`   ⚠️  Session ${sessionId}, Game ${gameNumber}: Invalid completedAt format, skipping`);
          continue;
        }
      }
      
      const stricheTop = sumStriche(gameData.finalStriche?.top);
      const stricheBottom = sumStriche(gameData.finalStriche?.bottom);
      
      events.push({
        type: 'session_game',
        timestamp: completedAt.toDate(),
        completedAt: completedAt,
        groupId: groupId,
        sessionId: sessionId,
        gameNumber: gameNumber,
        topPlayers: topPlayers,
        bottomPlayers: bottomPlayers,
        stricheTop: stricheTop,
        stricheBottom: stricheBottom,
      });
    }
    
    console.log(`   ✅ Session ${sessionId}: ${gamesSnapshot.size} Spiele geladen`);
  }
  
  // 2. Sammle Tournament Pässe (Krakau 2025)
  console.log(`\n🏆 Lade Tournament: Krakau 2025...`);
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
  
  const tournamentGamesSnapshot = await db.collection(`tournaments/${tournamentId}/games`)
    .orderBy('completedAt', 'asc')
    .get();
  
  console.log(`📁 ${tournamentGamesSnapshot.size} Pässe gefunden`);
  
  for (const passeDoc of tournamentGamesSnapshot.docs) {
    const passeData = passeDoc.data();
    const passeId = passeDoc.id;
    const passeNumber = passeData.passeNumber || 0;
    
    let completedAt = passeData.completedAt;
    if (!completedAt) {
      console.log(`   ⚠️  Passe ${passeNumber}: No completedAt, skipping`);
      continue;
    }
    
    // ✅ WICHTIG: Konvertiere zu Firestore Timestamp falls nötig
    if (typeof completedAt === 'object' && !completedAt.toDate) {
      if ('_seconds' in completedAt && '_nanoseconds' in completedAt) {
        completedAt = admin.firestore.Timestamp.fromMillis(completedAt._seconds * 1000 + Math.floor(completedAt._nanoseconds / 1000000));
      } else if ('seconds' in completedAt && 'nanoseconds' in completedAt) {
        completedAt = admin.firestore.Timestamp.fromMillis((completedAt as any).seconds * 1000 + Math.floor((completedAt as any).nanoseconds / 1000000));
      } else {
        console.log(`   ⚠️  Passe ${passeNumber}: Invalid completedAt format, skipping`);
        continue;
      }
    }
    
    // Teams extrahieren
    const playerDetails = passeData.playerDetails || [];
    if (playerDetails.length !== 4) {
      console.log(`   ⚠️  Passe ${passeNumber}: Invalid playerDetails, skipping`);
      continue;
    }
    
    const topPlayers: string[] = [];
    const bottomPlayers: string[] = [];
    
    playerDetails.forEach((player: any) => {
      if (player.team === 'top') {
        topPlayers.push(player.playerId);
      } else if (player.team === 'bottom') {
        bottomPlayers.push(player.playerId);
      }
    });
    
    if (topPlayers.length !== 2 || bottomPlayers.length !== 2) {
      console.log(`   ⚠️  Passe ${passeNumber}: Invalid team structure, skipping`);
      continue;
    }
    
    const teamStriche = passeData.teamStrichePasse || {};
    const stricheTop = sumStriche(teamStriche.top);
    const stricheBottom = sumStriche(teamStriche.bottom);
    
    events.push({
      type: 'tournament_passe',
      timestamp: completedAt.toDate(),
      completedAt: completedAt,
      tournamentId: tournamentId,
      passeId: passeId,
      passeNumber: passeNumber,
      topPlayers: topPlayers,
      bottomPlayers: bottomPlayers,
      stricheTop: stricheTop,
      stricheBottom: stricheBottom,
    });
    
    console.log(`   ✅ Passe ${passeNumber}: ${completedAt.toDate().toISOString()}`);
  }
  
  // 3. Sortiere chronologisch
  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  console.log(`\n✅ Total: ${events.length} Events gesammelt und chronologisch sortiert`);
  
  return events;
}

// ============================================================================
// PHASE 2: MAPPING (nicht mehr benötigt - direktes Matching in Phase 3)
// ============================================================================
// Funktion entfernt - wir matchen direkt in recalculateElo()

// ============================================================================
// PHASE 2: ELO-NEUBERECHNUNG
// ============================================================================

async function recalculateElo(events: TimelineEvent[]): Promise<EloBackfillResult> {
  console.log('\n🧮 PHASE 2: Elo-Neuberechnung...\n');
  
  const updates: RatingHistoryUpdate[] = [];
  
  // Sammle alle Spieler
  const allPlayerIds = new Set<string>();
  events.forEach(event => {
    event.topPlayers?.forEach(pid => allPlayerIds.add(pid));
    event.bottomPlayers?.forEach(pid => allPlayerIds.add(pid));
  });
  
  // Initialisiere Ratings
  const playerRatings = new Map<string, PlayerRating>();
  allPlayerIds.forEach(pid => {
    playerRatings.set(pid, {
      rating: JASS_ELO_CONFIG.DEFAULT_RATING,
      gamesPlayed: 0,
    });
  });
  
  console.log(`👥 ${allPlayerIds.size} Spieler initialisiert mit Rating ${JASS_ELO_CONFIG.DEFAULT_RATING}\n`);
  
  // Iteriere durch Events chronologisch
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const eventLabel = event.type === 'session_game' 
      ? `Session ${event.sessionId?.slice(0, 8)} Game ${event.gameNumber}`
      : `Tournament Passe ${event.passeNumber}`;
    
    console.log(`${i + 1}/${events.length} ${eventLabel} (${event.timestamp.toISOString()})`);
    
    const topPlayers = event.topPlayers || [];
    const bottomPlayers = event.bottomPlayers || [];
    const stricheTop = event.stricheTop || 0;
    const stricheBottom = event.stricheBottom || 0;
    
    // Berechne Team-Ratings VOR diesem Spiel
    const teamTopRating = topPlayers.reduce((sum, pid) => sum + (playerRatings.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / topPlayers.length;
    const teamBottomRating = bottomPlayers.reduce((sum, pid) => sum + (playerRatings.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / bottomPlayers.length;
    
    // Elo-Berechnung
    const expectedTop = expectedScore(teamTopRating, teamBottomRating);
    const actualTop = stricheScore(stricheTop, stricheBottom);
    const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
    const deltaPerTopPlayer = delta / topPlayers.length;
    const deltaPerBottomPlayer = -delta / bottomPlayers.length;
    
    console.log(`   Top: ${teamTopRating.toFixed(2)} | Bottom: ${teamBottomRating.toFixed(2)} | Delta: ${delta.toFixed(2)}`);
    
    // Update Ratings und sammle Updates für ratingHistory
    for (const pid of topPlayers) {
      const oldRating = playerRatings.get(pid)!.rating;
      const newRating = oldRating + deltaPerTopPlayer;
      
      playerRatings.get(pid)!.rating = newRating;
      playerRatings.get(pid)!.gamesPlayed += 1;
      
      console.log(`      ${pid.slice(0, 8)}: ${oldRating.toFixed(2)} → ${newRating.toFixed(2)} (+${deltaPerTopPlayer.toFixed(2)})`);
      
      // Finde ratingHistory Dokument(e) für dieses Event
      const historySnapshot = await db.collection(`players/${pid}/ratingHistory`).get();
      for (const historyDoc of historySnapshot.docs) {
        const historyData = historyDoc.data();
        
        let isMatch = false;
        if (event.type === 'session_game') {
          isMatch = historyData.sessionId === event.sessionId && historyData.gameNumber === event.gameNumber;
        } else if (event.type === 'tournament_passe') {
          isMatch = historyData.tournamentId === event.tournamentId && historyData.passeNumber === event.passeNumber;
        }
        
        if (isMatch) {
          updates.push({
            docId: historyDoc.id,
            playerId: pid,
            newRating: newRating,
            newDelta: deltaPerTopPlayer,
            oldRating: historyData.rating,
            oldDelta: historyData.delta,
          });
        }
      }
    }
    
    for (const pid of bottomPlayers) {
      const oldRating = playerRatings.get(pid)!.rating;
      const newRating = oldRating + deltaPerBottomPlayer;
      
      playerRatings.get(pid)!.rating = newRating;
      playerRatings.get(pid)!.gamesPlayed += 1;
      
      console.log(`      ${pid.slice(0, 8)}: ${oldRating.toFixed(2)} → ${newRating.toFixed(2)} (${deltaPerBottomPlayer.toFixed(2)})`);
      
      // Finde ratingHistory Dokument(e) für dieses Event
      const historySnapshot = await db.collection(`players/${pid}/ratingHistory`).get();
      for (const historyDoc of historySnapshot.docs) {
        const historyData = historyDoc.data();
        
        let isMatch = false;
        if (event.type === 'session_game') {
          isMatch = historyData.sessionId === event.sessionId && historyData.gameNumber === event.gameNumber;
        } else if (event.type === 'tournament_passe') {
          isMatch = historyData.tournamentId === event.tournamentId && historyData.passeNumber === event.passeNumber;
        }
        
        if (isMatch) {
          updates.push({
            docId: historyDoc.id,
            playerId: pid,
            newRating: newRating,
            newDelta: deltaPerBottomPlayer,
            oldRating: historyData.rating,
            oldDelta: historyData.delta,
          });
        }
      }
    }
  }
  
  console.log(`\n✅ ${updates.length} ratingHistory Updates vorbereitet`);
  
  // ✅ NEU: Füge globalRating Updates hinzu
  const globalRatingUpdates: Array<{ playerId: string; rating: number; gamesPlayed: number }> = [];
  Array.from(playerRatings.entries()).forEach(([pid, data]) => {
    globalRatingUpdates.push({
      playerId: pid,
      rating: data.rating,
      gamesPlayed: data.gamesPlayed,
    });
  });
  
  // Zeige finale Ratings
  console.log('\n📊 FINALE RATINGS:');
  Array.from(playerRatings.entries())
    .sort((a, b) => b[1].rating - a[1].rating)
    .forEach(([pid, data]) => {
      console.log(`   ${pid.slice(0, 8)}: ${data.rating.toFixed(2)} (${data.gamesPlayed} Spiele)`);
    });
  
  return { updates, globalRatingUpdates };
}

interface EloBackfillResult {
  updates: RatingHistoryUpdate[];
  globalRatingUpdates: Array<{ playerId: string; rating: number; gamesPlayed: number }>;
}

// Alte recalculateElo Funktion gibt jetzt EloBackfillResult zurück

async function applyUpdatesWithGlobal(result: EloBackfillResult): Promise<void> {
  console.log('\n💾 PHASE 3: Batch-Update (ratingHistory + globalRating)...\n');
  
  if (isDryRun) {
    console.log('🧪 DRY-RUN: Keine Änderungen werden geschrieben\n');
    
    // Zeige Beispiel-Änderungen für ratingHistory
    console.log('📝 ratingHistory Änderungen (erste 5):');
    result.updates.slice(0, 5).forEach((update, i) => {
      console.log(`${i + 1}. Player ${update.playerId.slice(0, 8)}, Doc ${update.docId}:`);
      console.log(`   Rating: ${update.oldRating?.toFixed(2)} → ${update.newRating.toFixed(2)}`);
      console.log(`   Delta: ${update.oldDelta?.toFixed(2)} → ${update.newDelta.toFixed(2)}`);
    });
    
    // Zeige globalRating Updates
    console.log('\n📝 globalRating Updates (erste 5):');
    result.globalRatingUpdates.slice(0, 5).forEach((update, i) => {
      console.log(`${i + 1}. Player ${update.playerId.slice(0, 8)}: Rating ${update.rating.toFixed(2)} (${update.gamesPlayed} Spiele)`);
    });
    
    return;
  }
  
  if (!isConfirmed) {
    console.log('❌ Bestätigung erforderlich! Verwenden Sie --confirm um fortzufahren\n');
    return;
  }
  
  // 1. Update ratingHistory
  const BATCH_SIZE = 500;
  let totalWritten = 0;
  
  for (let i = 0; i < result.updates.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const batchUpdates = result.updates.slice(i, i + BATCH_SIZE);
    
    for (const update of batchUpdates) {
      const docRef = db.doc(`players/${update.playerId}/ratingHistory/${update.docId}`);
      batch.update(docRef, {
        rating: update.newRating,
        delta: update.newDelta,
      });
    }
    
    await batch.commit();
    totalWritten += batchUpdates.length;
    
    console.log(`   ✅ ratingHistory Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchUpdates.length} Updates geschrieben`);
  }
  
  console.log(`✅ ${totalWritten} ratingHistory Einträge aktualisiert!`);
  
  // 2. Update globalRating
  for (const globalUpdate of result.globalRatingUpdates) {
    const playerRef = db.doc(`players/${globalUpdate.playerId}`);
    await playerRef.update({
      globalRating: globalUpdate.rating,
      totalGamesPlayed: globalUpdate.gamesPlayed,
      lastGlobalRatingUpdate: admin.firestore.Timestamp.now(),
    });
  }
  
  console.log(`✅ ${result.globalRatingUpdates.length} globalRating Einträge aktualisiert!`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  ✨ CHRONOLOGISCHES ELO-BACKFILL für ratingHistory            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  if (isDryRun) {
    console.log('\n🧪 DRY-RUN Modus - keine Änderungen werden geschrieben');
    console.log('💡 Verwenden Sie --confirm um tatsächlich zu schreiben\n');
  }
  
  try {
    const groupId = 'Tz0wgIHMTlhvTtFastiJ'; // Hauptgruppe
    
    // Phase 1: Sammle alle Events
    const events = await collectAllEvents(groupId);
    
    // Phase 2: Elo-Neuberechnung mit globalRating
    const result = await recalculateElo(events);
    
    // Phase 3: Batch-Update mit globalRating
    await applyUpdatesWithGlobal(result);
    
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ ERFOLGREICH ABGESCHLOSSEN!');
    console.log('════════════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Starten
main();


