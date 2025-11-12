/**
 * Elo Rating History Backfill V2 - PERFEKT CHRONOLOGISCH
 * 
 * ✅ KRITISCHE ANFORDERUNGEN:
 * 1. Session für Session chronologisch
 * 2. Game für Game innerhalb jeder Session (gameNumber)
 * 3. Passe für Passe bei Tournaments (passeNumber)
 * 4. Teampartner MÜSSEN identisches Delta haben!
 * 5. Kein Cross-Session-Mixing
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Elo-Konfiguration
const JASS_ELO_CONFIG = {
  K_TARGET: 15,
  DEFAULT_RATING: 100,
  ELO_SCALE: 1000,
} as const;

// Command-line Arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');

// ✅ Hilfsfunktion: Berechne Striche aus finalStriche (EXAKT wie jassEloUpdater.ts)
function calculateStricheFromFinalStriche(finalStriche: any): number {
  if (!finalStriche) return 0;
  const sieg = finalStriche.sieg || 0;
  const berg = finalStriche.berg || 0;
  const matsch = finalStriche.matsch || 0;
  const kontermatsch = finalStriche.kontermatsch || 0;
  const schneider = finalStriche.schneider || 0;
  // In jassEloUpdater.ts werden die Ereignisse ungewichtet summiert
  return sieg + berg + matsch + schneider + kontermatsch;
}

// Hilfsfunktionen für Elo-Berechnung
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

function stricheScore(stricheA: number, stricheB: number): number {
  const total = stricheA + stricheB;
  if (total === 0) return 0.5;
  return stricheA / total;
}

// EXAKT wie im Live-Updater: Weis-Punkte NICHT zu den Strichen addieren
function sumStriche(team: { striche: number; weisScore: number }[]): number {
  return team.reduce((sum, player) => sum + player.striche, 0);
}

interface GameEvent {
  type: 'session_game' | 'tournament_passe';
  groupId: string;
  sessionId: string;
  tournamentId?: string;
  gameNumber?: number;
  passeNumber?: number;
  completedAt: admin.firestore.Timestamp;
  players: {
    playerId: string;
    displayName: string;
    team: 'top' | 'bottom';
    striche: number;
    weisScore: number;
  }[];
}

interface RatingHistoryUpdate {
  playerId: string;
  docId: string;
  rating: number;
  delta: number;
}

interface GlobalRatingUpdate {
  globalRating: number;
  totalGamesPlayed: number;
  lastGlobalRatingUpdate: admin.firestore.Timestamp;
}

/**
 * Sammle ALLE Spiele aus allen Sessions (chronologisch)
 */
async function collectAllGames(): Promise<GameEvent[]> {
  console.log('\n📥 PHASE 1: Sammle alle Spiele chronologisch...\n');
  
  const allGames: GameEvent[] = [];
  
  // Lade alle Gruppen
  const groupsSnap = await db.collection('groups').get();
  console.log(`   Gefunden: ${groupsSnap.size} Gruppen`);
  
  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id;
    
    // Lade alle completed Sessions
    const summariesSnap = await db
      .collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .get();
    
    console.log(`   - Gruppe ${groupId}: ${summariesSnap.size} Sessions`);
    
    for (const summaryDoc of summariesSnap.docs) {
      const sessionId = summaryDoc.id;
      const sessionData = summaryDoc.data();
      
      const isTournament = sessionData.isTournamentSession === true || sessionData.tournamentId;
      
      if (isTournament) {
        // ✅ TOURNAMENT: Lade Passen aus tournaments/{tournamentId}/games
        const tournamentId = sessionData.tournamentId;
        if (!tournamentId) continue;
        
        const passesSnap = await db
          .collection(`tournaments/${tournamentId}/games`)
          .get();
        
        for (const passeDoc of passesSnap.docs) {
          const passeData = passeDoc.data();
          const passeNumber = passeData.passeNumber || parseInt(passeDoc.id.split('_').pop() || '0');
          
          // Extrahiere completedAt
          let completedAt: admin.firestore.Timestamp;
          if (passeData.completedAt?.toDate) {
            completedAt = passeData.completedAt;
          } else if (passeData.completedAt?._seconds) {
            completedAt = admin.firestore.Timestamp.fromMillis(passeData.completedAt._seconds * 1000);
          } else {
            continue; // Überspringe Passen ohne completedAt
          }
          
          // Sammle Spieler
          const players: GameEvent['players'] = [];
          
          // ✅ Für Tournaments: Verwende die bereits berechneten Striche-Werte
          const topStriche = passeData.stricheTop || 0;
          const bottomStriche = passeData.stricheBottom || 0;
          const topWeis = passeData.weisTop || 0;
          const bottomWeis = passeData.weisBottom || 0;
          
          // Top Team
          ['playerTop1', 'playerTop2'].forEach((key) => {
            const playerId = passeData[key];
            const displayName = passeData[`${key}Name`] || playerId;
            if (playerId) {
              players.push({
                playerId,
                displayName,
                team: 'top',
                striche: topStriche,
                weisScore: topWeis,
              });
            }
          });
          
          // Bottom Team
          ['playerBottom1', 'playerBottom2'].forEach((key) => {
            const playerId = passeData[key];
            const displayName = passeData[`${key}Name`] || playerId;
            if (playerId) {
              players.push({
                playerId,
                displayName,
                team: 'bottom',
                striche: bottomStriche,
                weisScore: bottomWeis,
              });
            }
          });
          
          if (players.length === 4) {
            allGames.push({
              type: 'tournament_passe',
              groupId,
              sessionId,
              tournamentId,
              passeNumber,
              completedAt,
              players
            });
          }
        }
      } else {
        // ✅ SESSION: Lade Games aus completedGames
        const gamesSnap = await db
          .collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
          .get();
        
        for (const gameDoc of gamesSnap.docs) {
          const gameData = gameDoc.data();
          const gameNumber = gameData.gameNumber || parseInt(gameDoc.id) || 0;
          
          // Extrahiere completedAt
          let completedAt: admin.firestore.Timestamp;
          if (gameData.completedAt?.toDate) {
            completedAt = gameData.completedAt;
          } else if (gameData.timestampCompleted?.toDate) {
            completedAt = gameData.timestampCompleted;
          } else if (gameData.completedAt?._seconds) {
            completedAt = admin.firestore.Timestamp.fromMillis(gameData.completedAt._seconds * 1000);
          } else {
            continue; // Überspringe Games ohne completedAt
          }
          
          // Extrahiere Spieler (bevorzugt pro Spiel, Fallback Session-Summary)
          const players: GameEvent['players'] = [];
          
          // ✅ Berechne Striche aus finalStriche
          const topStriche = calculateStricheFromFinalStriche(gameData.finalStriche?.top || {});
          const bottomStriche = calculateStricheFromFinalStriche(gameData.finalStriche?.bottom || {});
          
          // Für Elo-Berechnung ignorieren wir Weis-Punkte (Weis separat charten)
          const topWeis = 0;
          const bottomWeis = 0;

          // Quelle für Teamzuordnung wählen
          const teamsSource = (gameData.teams && gameData.teams.top?.players && gameData.teams.bottom?.players)
            ? gameData.teams
            : sessionData.teams;

          if (teamsSource?.top?.players) {
            teamsSource.top.players.forEach((p: any) => {
              if (!p?.playerId) return;
              players.push({
                playerId: p.playerId,
                displayName: p.displayName || p.playerId,
                team: 'top',
                striche: topStriche,
                weisScore: topWeis,
              });
            });
          }

          if (teamsSource?.bottom?.players) {
            teamsSource.bottom.players.forEach((p: any) => {
              if (!p?.playerId) return;
              players.push({
                playerId: p.playerId,
                displayName: p.displayName || p.playerId,
                team: 'bottom',
                striche: bottomStriche,
                weisScore: bottomWeis,
              });
            });
          }
          
          if (players.length === 4) {
            allGames.push({
              type: 'session_game',
              groupId,
              sessionId,
              gameNumber,
              completedAt,
              players
            });
          }
        }
      }
    }
  }
  
  // ✅ KRITISCH: Sortiere ALLE Spiele chronologisch
  allGames.sort((a, b) => {
    const diff = a.completedAt.toMillis() - b.completedAt.toMillis();
    if (diff !== 0) return diff;
    // Tie-Breaker innerhalb derselben Session/Turnier: gameNumber bzw. passeNumber
    if (a.type === 'session_game' && b.type === 'session_game') {
      if (a.sessionId === b.sessionId) {
        return (a.gameNumber || 0) - (b.gameNumber || 0);
      }
      return a.sessionId.localeCompare(b.sessionId);
    }
    if (a.type === 'tournament_passe' && b.type === 'tournament_passe') {
      if (a.tournamentId === b.tournamentId) {
        return (a.passeNumber || 0) - (b.passeNumber || 0);
      }
      return (a.tournamentId || '').localeCompare(b.tournamentId || '');
    }
    // Session-Games vor Turnier-Pässen (arbiträr, stabil)
    return a.type === 'session_game' ? -1 : 1;
  });
  
  console.log(`\n   ✅ Gesammelt: ${allGames.length} Spiele\n`);
  
  return allGames;
}

/**
 * Berechne Elo-Ratings für alle Spiele chronologisch
 */
async function calculateRatings(games: GameEvent[]): Promise<{
  updates: Map<string, RatingHistoryUpdate[]>;
  globalUpdates: Map<string, GlobalRatingUpdate>;
}> {
  console.log('\n🧮 PHASE 2: Berechne Elo-Ratings chronologisch...\n');
  
  const playerRatings = new Map<string, number>();
  const playerGamesPlayed = new Map<string, number>();
  const updates = new Map<string, RatingHistoryUpdate[]>();
  const globalRatingUpdates = new Map<string, GlobalRatingUpdate>();
  
  // Initialisiere alle Spieler mit Default-Rating
  for (const game of games) {
    for (const player of game.players) {
      if (!playerRatings.has(player.playerId)) {
        playerRatings.set(player.playerId, JASS_ELO_CONFIG.DEFAULT_RATING);
        playerGamesPlayed.set(player.playerId, 0);
        updates.set(player.playerId, []);
      }
    }
  }
  
  console.log(`   Initialisiert: ${playerRatings.size} Spieler mit Rating ${JASS_ELO_CONFIG.DEFAULT_RATING}\n`);
  
  // Iteriere durch alle Spiele chronologisch
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    
    // Speichere Ratings VOR diesem Spiel
    const ratingsBefore = new Map<string, number>();
    for (const player of game.players) {
      ratingsBefore.set(player.playerId, playerRatings.get(player.playerId)!);
    }
    
    // Berechne Team-Ratings
    const topPlayers = game.players.filter(p => p.team === 'top');
    const bottomPlayers = game.players.filter(p => p.team === 'bottom');
    
    const topRating = topPlayers.reduce((sum, p) => sum + playerRatings.get(p.playerId)!, 0) / topPlayers.length;
    const bottomRating = bottomPlayers.reduce((sum, p) => sum + playerRatings.get(p.playerId)!, 0) / bottomPlayers.length;
    
    // Berechne Expected Score
    const expectedTop = expectedScore(topRating, bottomRating);
    
    // Berechne Actual Score
    const topStriche = sumStriche(topPlayers.map(p => ({ striche: p.striche, weisScore: p.weisScore })));
    const bottomStriche = sumStriche(bottomPlayers.map(p => ({ striche: p.striche, weisScore: p.weisScore })));
    const actualTop = stricheScore(topStriche, bottomStriche);
    
    // ✅ EXAKT WIE IN jassEloUpdater.ts (Zeile 149): Ein Delta, aufgeteilt pro Spieler
    const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
    const deltaPerTopPlayer = delta / topPlayers.length;
    const deltaPerBottomPlayer = -delta / bottomPlayers.length;
    
    // ✅ WICHTIG: Teampartner haben IDENTISCHES Delta (durch Teilung)!
    console.log(`   ${i + 1}/${games.length} ${game.type === 'tournament_passe' ? 'Tournament' : 'Session'} ${game.sessionId.substring(0, 8)} Game ${game.gameNumber || game.passeNumber}:`);
    console.log(`      Top Delta per Player: ${deltaPerTopPlayer.toFixed(2)} | Bottom Delta per Player: ${deltaPerBottomPlayer.toFixed(2)}`);
    
    // Update Ratings und erstelle Updates
    for (const player of topPlayers) {
      const oldRating = playerRatings.get(player.playerId)!;
      const newRating = oldRating + deltaPerTopPlayer;
      playerRatings.set(player.playerId, newRating);
      
      const gamesPlayed = playerGamesPlayed.get(player.playerId)! + 1;
      playerGamesPlayed.set(player.playerId, gamesPlayed);
      
      // Finde ratingHistory Document ID
      const historySnap = await db
        .collection(`players/${player.playerId}/ratingHistory`)
        .get();
      
      // Finde passenden Eintrag
      let docId: string | null = null;
      
      for (const doc of historySnap.docs) {
        const data = doc.data();
        
        if (game.type === 'tournament_passe') {
          if (data.tournamentId === game.tournamentId && data.passeNumber === game.passeNumber) {
            docId = doc.id;
            break;
          }
        } else {
          if (data.sessionId === game.sessionId && data.gameNumber === game.gameNumber) {
            docId = doc.id;
            break;
          }
        }
      }
      
      if (docId) {
        updates.get(player.playerId)!.push({
          playerId: player.playerId,
          docId,
          rating: newRating,
          delta: deltaPerTopPlayer
        });
      }
    }
    
    for (const player of bottomPlayers) {
      const oldRating = playerRatings.get(player.playerId)!;
      const newRating = oldRating + deltaPerBottomPlayer;
      playerRatings.set(player.playerId, newRating);
      
      const gamesPlayed = playerGamesPlayed.get(player.playerId)! + 1;
      playerGamesPlayed.set(player.playerId, gamesPlayed);
      
      // Finde ratingHistory Document ID
      const historySnap = await db
        .collection(`players/${player.playerId}/ratingHistory`)
        .get();
      
      // Finde passenden Eintrag
      let docId: string | null = null;
      
      for (const doc of historySnap.docs) {
        const data = doc.data();
        
        if (game.type === 'tournament_passe') {
          if (data.tournamentId === game.tournamentId && data.passeNumber === game.passeNumber) {
            docId = doc.id;
            break;
          }
        } else {
          if (data.sessionId === game.sessionId && data.gameNumber === game.gameNumber) {
            docId = doc.id;
            break;
          }
        }
      }
      
      if (docId) {
        updates.get(player.playerId)!.push({
          playerId: player.playerId,
          docId,
          rating: newRating,
          delta: deltaPerBottomPlayer
        });
      }
    }
    
    if ((i + 1) % 50 === 0) {
      console.log('');
    }
  }
  
  console.log(`\n   ✅ ${Array.from(updates.values()).reduce((sum, arr) => sum + arr.length, 0)} Updates vorbereitet\n`);
  
  // ✅ AKTUALISIERE GLOBALE RATINGS FÜR LEADERBOARD
  console.log('📝 Aktualisiere globale Ratings...\n');
  for (const [playerId, finalRating] of playerRatings) {
    const gamesPlayed = playerGamesPlayed.get(playerId)!;
    globalRatingUpdates.set(playerId, {
      globalRating: finalRating,
      totalGamesPlayed: gamesPlayed,
      lastGlobalRatingUpdate: admin.firestore.Timestamp.now()
    });
  }
  
  return { updates, globalUpdates: globalRatingUpdates };
}

/**
 * Schreibe Updates zu Firestore (inkl. globale Ratings)
 */
async function applyUpdates(
  updates: Map<string, RatingHistoryUpdate[]>, 
  globalUpdates: Map<string, GlobalRatingUpdate>
): Promise<void> {
  console.log('\n💾 PHASE 3: Schreibe Updates zu ratingHistory...\n');
  
  if (isDryRun) {
    console.log('🧪 DRY-RUN: Keine Änderungen werden geschrieben\n');
    
    // Zeige erste 5 Updates
    console.log('📝 Beispiel-Updates (erste 5):\n');
    let count = 0;
    for (const [playerId, playerUpdates] of updates) {
      if (count >= 5) break;
      console.log(`Player ${playerId}: ${playerUpdates.length} Updates`);
      if (playerUpdates.length > 0) {
        console.log(`   Erstes Update: Rating ${playerUpdates[0].rating.toFixed(2)}, Delta ${playerUpdates[0].delta.toFixed(2)}`);
      }
      count++;
    }
    
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ DRY-RUN ABGESCHLOSSEN!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`\nFühre das Skript mit --confirm aus:\n`);
    console.log('   npx ts-node scripts/recalculateEloRatingHistoryV2.ts --confirm\n');
    
    return;
  }
  
  // Echtes Schreiben
  const batchSize = 500;
  let successCount = 0;
  let errorCount = 0;
  
  const allUpdates: RatingHistoryUpdate[] = [];
  for (const playerUpdates of updates.values()) {
    allUpdates.push(...playerUpdates);
  }
  
  for (let i = 0; i < allUpdates.length; i += batchSize) {
    const batch = db.batch();
    const batchUpdates = allUpdates.slice(i, i + batchSize);
    
    for (const update of batchUpdates) {
      const docRef = db
        .collection(`players/${update.playerId}/ratingHistory`)
        .doc(update.docId);
      
      batch.update(docRef, {
        rating: update.rating,
        delta: update.delta
      });
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
  
  // ✅ Schreibe globale Ratings
  console.log('\n💾 Aktualisiere globale Ratings für Leaderboard...\n');
  const globalBatch = db.batch();
  
  for (const [playerId, update] of globalUpdates) {
    const docRef = db.collection('players').doc(playerId);
    globalBatch.update(docRef, {
      globalRating: update.globalRating,
      totalGamesPlayed: update.totalGamesPlayed,
      lastGlobalRatingUpdate: update.lastGlobalRatingUpdate
    });
  }
  
  try {
    await globalBatch.commit();
    console.log(`   ✅ ${globalUpdates.size} globale Ratings aktualisiert`);
  } catch (error) {
    console.error(`   ❌ Globale Ratings fehlgeschlagen:`, error);
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
  console.log('🔄 ELO RATING HISTORY BACKFILL V2 - PERFEKT CHRONOLOGISCH');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`   K-Faktor: ${JASS_ELO_CONFIG.K_TARGET}`);
  console.log(`   Default Rating: ${JASS_ELO_CONFIG.DEFAULT_RATING}`);
  console.log(`   Modus: ${isDryRun ? '🧪 DRY-RUN' : '✅ LIVE'}`);
  console.log('════════════════════════════════════════════════════════════════');
  
  try {
    // Phase 1: Sammle alle Spiele
    const games = await collectAllGames();
    
    if (games.length === 0) {
      console.log('\n⚠️ Keine Spiele gefunden. Beende Skript.\n');
      process.exit(0);
    }
    
    // Phase 2: Berechne Ratings
    const { updates, globalUpdates } = await calculateRatings(games);
    
    // Phase 3: Schreibe Updates
    await applyUpdates(updates, globalUpdates);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    process.exit(1);
  }
}

main();

