import * as logger from 'firebase-functions/logger';

// Firebase wird erst im ausführbaren Script initialisiert
let db: any = null;

function getDb() {
  if (!db) {
    const admin = require('firebase-admin');
    db = admin.firestore();
    getDb().settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

// 🎯 Elo-Konfiguration (identisch zu jassEloUpdater.ts)
const JASS_ELO_CONFIG = {
  K_TARGET: 15,
  DEFAULT_RATING: 100,
  ELO_SCALE: 1000,
} as const;

/**
 * 🔧 Berechne Expected Score (Standard-Elo-Formel)
 */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

/**
 * 🧹 Bereinige Objekt von undefined/null Werten für Firestore
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)).filter(item => item !== undefined && item !== null);
  }
  
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      const sanitizedValue = sanitizeForFirestore(value);
      if (sanitizedValue !== undefined) {
        sanitized[key] = sanitizedValue;
      }
    }
  }
  
  return sanitized;
}

/**
 * 🔧 Berechne Total Striche aus Striche-Objekt
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

/**
 * 🔧 Berechne Actual Score aus Striche-Verhältnis
 */
function stricheScore(stricheA: number, stricheB: number): number {
  const total = stricheA + stricheB;
  if (total === 0) return 0.5;
  return stricheA / total;
}

/**
 * 🔧 POST-EX: Berechne Rating-Historie für alle historischen Sessions
 * 
 * Dieses Script iteriert chronologisch durch alle Sessions einer Gruppe
 * und erstellt für jeden Spieler History-Snapshots mit Deltas und kumulativen Werten.
 * 
 * @param groupId - Die Gruppen-ID für die Backfill durchgeführt werden soll
 */
export async function backfillRatingHistoryForGroup(groupId: string, clearExisting: boolean = true): Promise<void> {
  logger.info(`🚀 Starting rating history backfill for group ${groupId}`);
  
  try {
    // 🗑️ STEP 0: Clear existing history entries (optional)
    if (clearExisting) {
      logger.info(`🗑️  Clearing existing history entries for group ${groupId}...`);
      
      // Get all players in the group
      const playersRef = getDb().collection(`groups/${groupId}/playerRatings`);
      const playersSnap = await playersRef.get();
      
      let deletedCount = 0;
      for (const playerDoc of playersSnap.docs) {
        const historyRef = getDb().collection(`groups/${groupId}/playerRatings/${playerDoc.id}/history`);
        const historySnap = await historyRef.get();
        
        if (!historySnap.empty) {
          const batch = getDb().batch();
          historySnap.docs.forEach((doc: any) => {
            batch.delete(doc.ref);
            deletedCount++;
          });
          await batch.commit();
        }
      }
      
      logger.info(`✅ Deleted ${deletedCount} old history entries`);
    }
    
    // 1. Lade alle jassGameSummaries (Sessions + Turniere)
    const summariesRef = getDb().collection(`groups/${groupId}/jassGameSummaries`);
    const summariesSnap = await summariesRef.get();
    
    // Filtere nur completed Summaries
    const completedSummaries = summariesSnap.docs.filter((doc: any) => doc.data().status === 'completed');
    
    // Trenne Sessions und Turniere
    const completedSessions = completedSummaries.filter((doc: any) => !doc.data().tournamentId);
    const completedTournaments = completedSummaries.filter((doc: any) => doc.data().tournamentId);
    
    logger.info(`📊 Found ${completedSessions.length} completed sessions and ${completedTournaments.length} completed tournaments for group ${groupId}`);
    
    // 3. Kombiniere Sessions und Turniere chronologisch
    interface EventData {
      type: 'session' | 'tournament';
      id: string;
      data: any;
      timestamp: number;
    }
    
    const allEvents: EventData[] = [];
    
    // Sessions hinzufügen
    completedSessions.forEach((doc: any) => {
      const session = doc.data();
      
      // 🎯 KORRIGIERT: Für Turnier-Sessions verwende endedAt, für normale Sessions startedAt
      let timestamp: number;
      if (session.tournamentId) {
        // Turnier-Session: Verwende endedAt für korrekte chronologische Position
        timestamp = session.endedAt?.toMillis ? session.endedAt.toMillis() : 
                   (typeof session.endedAt === 'number' ? session.endedAt : 0);
      } else {
        // Normale Session: Verwende startedAt
        timestamp = session.startedAt?.toMillis ? session.startedAt.toMillis() : 
                   (typeof session.startedAt === 'number' ? session.startedAt : 0);
      }
      
      allEvents.push({
        type: 'session',
        id: doc.id,
        data: session,
        timestamp
      });
    });
    
    // Turniere hinzufügen
    completedTournaments.forEach((doc: any) => {
      const tournament = doc.data();
      const timestamp = tournament.createdAt?.toMillis ? tournament.createdAt.toMillis() : 
                       (typeof tournament.createdAt === 'number' ? tournament.createdAt : 0);
      
      allEvents.push({
        type: 'tournament',
        id: doc.id,
        data: tournament,
        timestamp
      });
    });
    
    // Chronologisch sortieren
    allEvents.sort((a, b) => a.timestamp - b.timestamp);
    
    // ✅ DEBUG-MODUS ENTFERNT: Script läuft jetzt vollständig durch

    if (allEvents.length === 0) {
      logger.info(`✅ No completed events found for group ${groupId}`);
      return;
    }
    
    logger.info(`📊 Processing ${allEvents.length} events chronologically for group ${groupId}`);
    
    // 4. Sammle alle Spieler der Gruppe (aus Sessions und Turnieren)
    const allPlayerIds = new Set<string>();
    allEvents.forEach(event => {
      if (event.type === 'session') {
        if (event.data.participantPlayerIds) {
          event.data.participantPlayerIds.forEach((id: string) => allPlayerIds.add(id));
        }
      } else if (event.type === 'tournament') {
        // 🎯 KORRIGIERT: Verwende `rankedPlayerUids` (Player Doc IDs) statt `playerUids` (Auth UIDs)
        if (event.data.rankedPlayerUids) {
          event.data.rankedPlayerUids.forEach((id: string) => allPlayerIds.add(id));
        }
      }
    });
    
    logger.info(`👥 Found ${allPlayerIds.size} unique players in group ${groupId}`);
    
    // 3. Für jeden Spieler: Initialisiere Tracking mit Elo-Start
    const playerTracking = new Map<string, {
      rating: number;
      gamesPlayed: number;
      cumulative: {
        striche: number;
        wins: number;
        losses: number;
        points: number;
      };
    }>();
    
    allPlayerIds.forEach(playerId => {
      playerTracking.set(playerId, {
        rating: JASS_ELO_CONFIG.DEFAULT_RATING, // Start-Elo = 100
        gamesPlayed: 0,
        cumulative: { 
          striche: 0, 
          wins: 0, 
          losses: 0, 
          points: 0,
          pointsReceived: 0,  // Punkte die der Spieler erhalten hat
          sessionWins: 0,      // Session-Gewinne (nur Sessions, nicht Turniere)
          sessionLosses: 0,    // Session-Niederlagen (nur Sessions, nicht Turniere)
          sessionDraws: 0      // Session-Unentschieden (nur Sessions, nicht Turniere)
        } as any  // Explizite Typisierung um TypeScript-Fehler zu vermeiden
      });
    });
    
    // 5. Iteriere chronologisch durch alle Events (Sessions + Turniere)
    let processedEvents = 0;
    let totalSnapshots = 0;
    
    for (const event of allEvents) {
      const eventId = event.id;
      const eventData = event.data;
      
      const eventDate = event.timestamp ? new Date(event.timestamp) : new Date();
      logger.info(`📅 Processing ${event.type} ${processedEvents + 1}/${allEvents.length}: ${eventId} (${eventDate.toLocaleDateString()})`);
      
      // 🎯 SCHRITT 1: Berechne Elo-Deltas für dieses Event (Team-basiert)
      let topPlayers: string[] = [];
      let bottomPlayers: string[] = [];
      const eloDeltas = new Map<string, number>();
      
      if (event.type === 'session') {
        // --- LOGIK FÜR SESSION-SPIELE ---
        
        // Finde Teams für die gesamte Session
        topPlayers = eventData?.teams?.top?.players?.map((p: any) => p.playerId).filter(Boolean) || [];
        bottomPlayers = eventData?.teams?.bottom?.players?.map((p: any) => p.playerId).filter(Boolean) || [];
        
        if (topPlayers.length < 1 || bottomPlayers.length < 1) {
          logger.warn(`  ⚠️  Invalid team structure for session ${eventId}, skipping Elo calculation.`);
        } else {
          // Lade alle Spiele der Session
          const games: Array<{ stricheTop: number; stricheBottom: number; }> = [];
          const cgSnap = await getDb().collection(`groups/${groupId}/jassGameSummaries/${eventId}/completedGames`).orderBy('gameNumber', 'asc').get();
            
          if (!cgSnap.empty) {
            cgSnap.forEach((doc: any) => {
              const g = doc.data() as any;
              const stricheTop = calculateTotalStriche(g.finalStriche?.top || {});
              const stricheBottom = calculateTotalStriche(g.finalStriche?.bottom || {});
              games.push({ stricheTop, stricheBottom });
            });
          } else {
            // Fallback auf Session-Ebene, falls keine Subcollection existiert
            const stricheTop = calculateTotalStriche(eventData.finalStriche?.top || {});
            const stricheBottom = calculateTotalStriche(eventData.finalStriche?.bottom || {});
            games.push({ stricheTop, stricheBottom });
          }

          // Berechne Elo für jedes Spiel der Session
          for (const game of games) {
            const teamTopRating = topPlayers.reduce((sum, pid) => sum + (playerTracking.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / topPlayers.length;
            const teamBottomRating = bottomPlayers.reduce((sum, pid) => sum + (playerTracking.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / bottomPlayers.length;
            
            const expectedTop = expectedScore(teamTopRating, teamBottomRating);
            const actualTop = stricheScore(game.stricheTop, game.stricheBottom);
            
            const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
            const deltaPerTopPlayer = delta / topPlayers.length;
            const deltaPerBottomPlayer = -delta / bottomPlayers.length;
            
            topPlayers.forEach(pid => {
              const tracking = playerTracking.get(pid)!;
              tracking.rating += deltaPerTopPlayer;
              eloDeltas.set(pid, (eloDeltas.get(pid) || 0) + deltaPerTopPlayer);
            });
            bottomPlayers.forEach(pid => {
              const tracking = playerTracking.get(pid)!;
              tracking.rating += deltaPerBottomPlayer;
              eloDeltas.set(pid, (eloDeltas.get(pid) || 0) + deltaPerBottomPlayer);
            });
          }
        }
        } else if (event.type === 'tournament') {
          // --- 🎯 KORRIGIERTE LOGIK FÜR TURNIER-SPIELE (aus jassGameSummaries) ---
          
          // Verwende gameResults aus der jassGameSummary (nicht tournaments/{tournamentId}/games)
          if (eventData.gameResults && Array.isArray(eventData.gameResults)) {
            logger.info(`  🎮 Processing ${eventData.gameResults.length} games for tournament ${eventId}`);
            
            eventData.gameResults.forEach((game: any) => {
              // 🎯 Teams wechseln pro Spiel - hole Team-Zuordnung aus game.teams
              const gameTopPlayers: string[] = [];
              const gameBottomPlayers: string[] = [];
              
              // Extrahiere Teams aus game.teams
              if (game.teams?.top?.players) {
                game.teams.top.players.forEach((p: any) => {
                  if (p.playerId) gameTopPlayers.push(p.playerId);
                });
              }
              if (game.teams?.bottom?.players) {
                game.teams.bottom.players.forEach((p: any) => {
                  if (p.playerId) gameBottomPlayers.push(p.playerId);
                });
              }
              
              if (gameTopPlayers.length !== 2 || gameBottomPlayers.length !== 2) {
                logger.warn(`  ⚠️  Invalid team structure in game ${game.gameNumber} for tournament ${eventId} (top: ${gameTopPlayers.length}, bottom: ${gameBottomPlayers.length}), skipping game.`);
                return;
              }
              
              // Berechne Striche für DIESES EINE SPIEL
              const stricheTop = calculateTotalStriche(game.finalStriche?.top || {});
              const stricheBottom = calculateTotalStriche(game.finalStriche?.bottom || {});
              
              // Berechne Elo für DIESES EINE SPIEL
              const teamTopRating = gameTopPlayers.reduce((sum, pid) => sum + (playerTracking.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / gameTopPlayers.length;
              const teamBottomRating = gameBottomPlayers.reduce((sum, pid) => sum + (playerTracking.get(pid)?.rating || JASS_ELO_CONFIG.DEFAULT_RATING), 0) / gameBottomPlayers.length;
              
              const expectedTop = expectedScore(teamTopRating, teamBottomRating);
              const actualTop = stricheScore(stricheTop, stricheBottom);
              
              const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
              const deltaPerTopPlayer = delta / gameTopPlayers.length;
              const deltaPerBottomPlayer = -delta / gameBottomPlayers.length;
              
              // Wende Delta auf Spieler an
              gameTopPlayers.forEach(pid => {
                const tracking = playerTracking.get(pid);
                if (tracking) {
                  tracking.rating += deltaPerTopPlayer;
                  eloDeltas.set(pid, (eloDeltas.get(pid) || 0) + deltaPerTopPlayer);
                }
              });
              gameBottomPlayers.forEach(pid => {
                const tracking = playerTracking.get(pid);
                if (tracking) {
                  tracking.rating += deltaPerBottomPlayer;
                  eloDeltas.set(pid, (eloDeltas.get(pid) || 0) + deltaPerBottomPlayer);
                }
              });
            });
          } else {
            logger.warn(`  ⚠️  No gameResults found for tournament ${eventId}, skipping Elo calculation.`);
          }
      }
      
      // 🎯 SCHRITT 2: Für jeden Spieler in diesem Event: Erstelle History-Snapshot
      const participantIds = event.type === 'session' ? eventData.participantPlayerIds : eventData.participantPlayerIds;
      
      for (const playerId of (participantIds || [])) {
        try {
          const tracking = playerTracking.get(playerId);
          
          if (!tracking) {
            logger.warn(`  ⚠️  No tracking found for player ${playerId}`);
            continue;
          }
          
          // Hole Elo-Delta aus Map (wurde in SCHRITT 1 berechnet)
          const eloRatingDelta = eloDeltas.get(playerId) || 0;
          
          // 🎯 KORRIGIERT: Berechne Deltas direkt aus Event-Daten
          let eventDelta = { 
            striche: 0, 
            games: 0, 
            wins: 0, 
            losses: 0, 
            points: 0,
            pointsReceived: 0,    // Punkte die der Spieler erhalten hat
            sessionWin: false,     // Session-Gewinn (nur für Sessions)
            sessionLoss: false,    // Session-Niederlage (nur für Sessions)
            sessionDraw: false    // Session-Unentschieden (nur für Sessions)
          };
          
          if (event.type === 'session') {
            // Für Sessions: Berechne aus gameResults
            if (eventData.gameResults && Array.isArray(eventData.gameResults)) {
              const isTopTeam = eventData.teams?.top?.players?.some((p: any) => p.playerId === playerId);
              const isBottomTeam = eventData.teams?.bottom?.players?.some((p: any) => p.playerId === playerId);
              
              if (isTopTeam || isBottomTeam) {
                const playerTeam = isTopTeam ? 'top' : 'bottom';
                const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
                
                // Berechne Striche
                const ownStriche = calculateTotalStriche(eventData.finalStriche?.[playerTeam] || {});
                const opponentStriche = calculateTotalStriche(eventData.finalStriche?.[opponentTeam] || {});
                eventDelta.striche = ownStriche - opponentStriche;
                
                // Berechne Wins/Losses
                eventData.gameResults.forEach((game: any) => {
                  if (game.winnerTeam === playerTeam) {
                    eventDelta.wins++;
                  } else if (game.winnerTeam === opponentTeam) {
                    eventDelta.losses++;
                  }
                });
                
                eventDelta.games = eventData.gameResults.length;
                eventDelta.points = eventData.finalScores?.[playerTeam] || 0;
                eventDelta.pointsReceived = eventData.finalScores?.[opponentTeam] || 0;
                
                // 🎯 Session-Gewinn/Verlust/Unentschieden berechnen
                const playerTeamScore = eventData.finalScores?.[playerTeam] || 0;
                const opponentTeamScore = eventData.finalScores?.[opponentTeam] || 0;
                
                if (playerTeamScore > opponentTeamScore) {
                  eventDelta.sessionWin = true;
                } else if (playerTeamScore < opponentTeamScore) {
                  eventDelta.sessionLoss = true;
                } else {
                  eventDelta.sessionDraw = true;
                }
              }
            }
          } else if (event.type === 'tournament') {
            // Für Turniere: Berechne aus gameResults (wurde bereits in SCHRITT 1 verarbeitet)
            if (eventData.gameResults && Array.isArray(eventData.gameResults)) {
              let totalStriche = 0;
              let totalWins = 0;
              let totalLosses = 0;
              let totalPoints = 0;
              
              eventData.gameResults.forEach((game: any) => {
                const isTopTeam = game.teams?.top?.players?.some((p: any) => p.playerId === playerId);
                const isBottomTeam = game.teams?.bottom?.players?.some((p: any) => p.playerId === playerId);
                
                if (isTopTeam || isBottomTeam) {
                  const playerTeam = isTopTeam ? 'top' : 'bottom';
                  
                  // Berechne Striche für dieses Spiel
                  const ownStriche = calculateTotalStriche(game.finalStriche?.[playerTeam] || {});
                  const opponentStriche = calculateTotalStriche(game.finalStriche?.[playerTeam === 'top' ? 'bottom' : 'top'] || {});
                  totalStriche += (ownStriche - opponentStriche);
                  
                  // Berechne Wins/Losses
                  if (game.winnerTeam === playerTeam) {
                    totalWins++;
                  } else if (game.winnerTeam === (playerTeam === 'top' ? 'bottom' : 'top')) {
                    totalLosses++;
                  }
                  
                  // Punkte
                  totalPoints += (game.finalScores?.[playerTeam] || 0);
                }
              });
              
              eventDelta = {
                striche: totalStriche,
                games: eventData.gameResults.length,
                wins: totalWins,
                losses: totalLosses,
                points: totalPoints,
                pointsReceived: 0,  // Für Turniere: Punkte die der Spieler erhalten hat (wird separat berechnet)
                sessionWin: false,  // Turniere haben keine Session-Gewinne
                sessionLoss: false, // Turniere haben keine Session-Niederlagen
                sessionDraw: false  // Turniere haben keine Session-Unentschieden
              };
              
              // Berechne pointsReceived für Turniere
              let totalPointsReceived = 0;
              eventData.gameResults.forEach((game: any) => {
                const isTopTeam = game.teams?.top?.players?.some((p: any) => p.playerId === playerId);
                const isBottomTeam = game.teams?.bottom?.players?.some((p: any) => p.playerId === playerId);
                
                if (isTopTeam || isBottomTeam) {
                  const playerTeam = isTopTeam ? 'top' : 'bottom';
                  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
                  
                  // Punkte die der Spieler erhalten hat (Gegner-Punkte)
                  totalPointsReceived += (game.finalScores?.[opponentTeam] || 0);
                }
              });
              
              eventDelta.pointsReceived = totalPointsReceived;
            }
          }
          
          // Update Tracking (Elo wurde schon in SCHRITT 1 aktualisiert)
          tracking.gamesPlayed += eventDelta.games;
          tracking.cumulative.striche += eventDelta.striche;
          tracking.cumulative.wins += eventDelta.wins;
          tracking.cumulative.losses += eventDelta.losses;
          tracking.cumulative.points += eventDelta.points;
          (tracking.cumulative as any).pointsReceived += eventDelta.pointsReceived;
          
          // Session-Statistiken (nur für Sessions, nicht für Turniere)
          if (event.type === 'session') {
            if (eventDelta.sessionWin) {
              (tracking.cumulative as any).sessionWins += 1;
            } else if (eventDelta.sessionLoss) {
              (tracking.cumulative as any).sessionLosses += 1;
            } else if (eventDelta.sessionDraw) {
              (tracking.cumulative as any).sessionDraws += 1;
            }
          }
          
          // 🎯 Aktuelles Elo aus Tracking (wurde in SCHRITT 1 berechnet)
          const currentRating = tracking.rating;
          
          // Tier-Info
          const tierInfo = getRatingTier(currentRating);
          
          // 🎯 ROBUSTE LÖSUNG: Defensive Objekt-Konstruktion mit expliziten Fallbacks
          const historyEntry: any = {
            // 🔑 IDENTIFIERS - Alle Felder mit expliziten Fallbacks
            createdAt: eventData.endedAt || eventData.finalizedAt || eventData.createdAt || eventData.startedAt || getDb().Timestamp.now(),
            playerId: playerId || '',
            groupId: groupId || '',
            
            // 🎮 EVENT CONTEXT - Explizite Werte ohne undefined
            eventType: event.type === 'session' ? 'session_end' : 'tournament_end',
            eventId: eventId || '',
            
            // 📊 SNAPSHOT - Alle numerischen Werte mit Fallbacks
            rating: typeof currentRating === 'number' ? currentRating : JASS_ELO_CONFIG.DEFAULT_RATING,
            gamesPlayed: typeof tracking.gamesPlayed === 'number' ? tracking.gamesPlayed : 0,
            tier: tierInfo?.name || 'Anfänger',
            tierEmoji: tierInfo?.emoji || '🆕',
            
            // 🎯 DELTA - Defensive Konstruktion mit expliziten Werten
            delta: {
              rating: typeof eloRatingDelta === 'number' ? eloRatingDelta : 0,
              striche: typeof eventDelta.striche === 'number' ? eventDelta.striche : 0,
              games: typeof eventDelta.games === 'number' ? eventDelta.games : 0,
              wins: typeof eventDelta.wins === 'number' ? eventDelta.wins : 0,
              losses: typeof eventDelta.losses === 'number' ? eventDelta.losses : 0,
              points: typeof eventDelta.points === 'number' ? eventDelta.points : 0,
              pointsReceived: typeof eventDelta.pointsReceived === 'number' ? eventDelta.pointsReceived : 0,
              sessionWin: eventDelta.sessionWin || false,
              sessionLoss: eventDelta.sessionLoss || false,
              sessionDraw: eventDelta.sessionDraw || false
            },
            
            // 🔢 CUMULATIVE - Defensive Kopie mit Fallbacks
            cumulative: {
              striche: typeof tracking.cumulative.striche === 'number' ? tracking.cumulative.striche : 0,
              wins: typeof tracking.cumulative.wins === 'number' ? tracking.cumulative.wins : 0,
              losses: typeof tracking.cumulative.losses === 'number' ? tracking.cumulative.losses : 0,
              points: typeof tracking.cumulative.points === 'number' ? tracking.cumulative.points : 0,
              pointsReceived: typeof (tracking.cumulative as any).pointsReceived === 'number' ? (tracking.cumulative as any).pointsReceived : 0,
              sessionWins: typeof (tracking.cumulative as any).sessionWins === 'number' ? (tracking.cumulative as any).sessionWins : 0,
              sessionLosses: typeof (tracking.cumulative as any).sessionLosses === 'number' ? (tracking.cumulative as any).sessionLosses : 0,
              sessionDraws: typeof (tracking.cumulative as any).sessionDraws === 'number' ? (tracking.cumulative as any).sessionDraws : 0
            },
            
            // 🔄 BACKWARDS COMPATIBILITY
            context: event.type === 'session' ? 'session_end' : 'tournament_end'
          };
          
          // 🧹 FINALE SICHERHEIT: Bereinige das Objekt vor dem Speichern
          const sanitizedHistoryEntry = sanitizeForFirestore(historyEntry);
          
          // 🔍 DEBUG: Zeige das finale Objekt (nur für die ersten 3 Events)
          if (processedEvents < 3) {
            logger.info(`[DEBUG] Final sanitized entry for player ${playerId}:`, JSON.stringify(sanitizedHistoryEntry, null, 2));
          }
          
          // Speichere History-Entry (mit Event-Timestamp als ID)
          const eventTimestamp = eventData.endedAt || eventData.finalizedAt || eventData.createdAt || eventData.startedAt;
          const timestamp = eventTimestamp?.toMillis ? eventTimestamp.toMillis().toString() : event.timestamp.toString();
          const historyRef = getDb().collection(`groups/${groupId}/playerRatings/${playerId}/history`);
          
          await historyRef.doc(timestamp).set(sanitizedHistoryEntry);
          
          totalSnapshots++;
          logger.debug(`    ✓ Player ${playerId}: Striche ${eventDelta.striche >= 0 ? '+' : ''}${eventDelta.striche}, Wins: ${eventDelta.wins}`);
        } catch (error) {
          logger.error(`  ❌ Error processing player ${playerId} in ${event.type} ${eventId}:`, error);
        }
      }
      
      processedEvents++;
      
      // Progress-Update alle 10 Events
      if (processedEvents % 10 === 0) {
        logger.info(`📈 Progress: ${processedEvents}/${allEvents.length} events processed (${totalSnapshots} snapshots created)`);
      }
    }
    
    // 🧮 SCHRITT 5: Schreibe die rekalkulierten End-Ratings in playerRatings (global + gruppenspezifisch)
    logger.info(`🧮 Writing recalculated playerRatings for group ${groupId}...`);
    const batch = getDb().batch();
    let playersUpdated = 0;
    playerTracking.forEach((tracking, playerId) => {
      const tierInfo = getRatingTier(tracking.rating);
      const docData = {
        rating: tracking.rating,
        gamesPlayed: tracking.gamesPlayed,
        lastUpdated: Date.now(),
        tier: tierInfo.name,
        tierEmoji: tierInfo.emoji
      } as any;

      // Global playerRatings
      batch.set(getDb().collection('playerRatings').doc(playerId), docData, { merge: true });
      // Gruppen-spezifisch
      batch.set(getDb().collection(`groups/${groupId}/playerRatings`).doc(playerId), docData, { merge: true });
      playersUpdated++;
    });
    await batch.commit();
    logger.info(`✅ Recalculated playerRatings written for ${playersUpdated} players in group ${groupId}`);

    // 🏆 SCHRITT 6: Aggregiertes Leaderboard der Gruppe aktualisieren (Konsistenz Frontend)
    try {
      const membersSnap = await getDb().collection(`groups/${groupId}/members`).get();
      const memberIds = membersSnap.docs.map((doc: any) => doc.id);
      const leaderboardEntries: any[] = [];

      for (const memberId of memberIds) {
        const memberDoc = membersSnap.docs.find((doc: any) => doc.id === memberId);
        const memberData = memberDoc?.data();
        const ratingSnap = await getDb().doc(`groups/${groupId}/playerRatings/${memberId}`).get();
        if (ratingSnap.exists) {
          const r = ratingSnap.data() as any;
          leaderboardEntries.push({
            playerId: memberId,
            rating: r.rating || JASS_ELO_CONFIG.DEFAULT_RATING,
            displayName: r.displayName || memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`,
            tier: r.tier || 'Anfänger',
            tierEmoji: r.tierEmoji || '🆕',
            gamesPlayed: r.gamesPlayed || 0,
            lastDelta: r.lastDelta || 0,
            photoURL: memberData?.photoURL || null,
          });
        }
      }

      leaderboardEntries.sort((a, b) => (b.rating || 0) - (a.rating || 0));

      const leaderboardData = {
        entries: leaderboardEntries,
        lastUpdated: getDb().Timestamp.now(),
        totalMembers: leaderboardEntries.length,
      };
      await getDb().doc(`groups/${groupId}/aggregated/leaderboard`).set(leaderboardData);
      logger.info(`🏆 Leaderboard updated for group ${groupId} with ${leaderboardEntries.length} members`);
    } catch (lbError) {
      logger.warn(`⚠️ Failed to update leaderboard for group ${groupId}:`, lbError);
    }

    logger.info(`🎉 Backfill completed for group ${groupId}:`);
    logger.info(`   - Events processed: ${processedEvents}`);
    logger.info(`   - Snapshots created: ${totalSnapshots}`);
    logger.info(`   - Players affected: ${allPlayerIds.size}`);
  } catch (error) {
    logger.error(`❌ Backfill failed for group ${groupId}:`, error);
    throw error;
  }
}

// calculateEventDeltaForBackfill entfernt - wird nicht mehr verwendet

// calculateSessionDeltaForBackfill entfernt - wird nicht mehr verwendet

// calculateTournamentDeltaForBackfill entfernt - wird nicht mehr verwendet

/**
 * 🔧 Hole Rating-Tier für ein Rating
 * 
 * HINWEIS: Diese Funktion sollte eigentlich aus shared/rating-tiers importiert werden,
 * aber für das Backfill-Script duplicate ich sie hier, um Abhängigkeiten zu minimieren.
 */
function getRatingTier(rating: number): { name: string; emoji: string } {
  // Vereinfachte Tier-Logik (sollte mit der echten Logik synchronisiert werden)
  if (rating >= 150) return { name: 'Diamantjasser III', emoji: '💎' };
  if (rating >= 140) return { name: 'Diamantjasser II', emoji: '💎' };
  if (rating >= 130) return { name: 'Diamantjasser I', emoji: '💍' };
  if (rating >= 120) return { name: 'Platinjasser', emoji: '💍' };
  if (rating >= 110) return { name: 'Goldjasser', emoji: '🥇' };
  if (rating >= 100) return { name: 'Silberjasser', emoji: '🥈' };
  if (rating >= 90) return { name: 'Bronzejasser', emoji: '🥉' };
  if (rating >= 80) return { name: 'Kleeblattjasser', emoji: '🍀' };
  if (rating >= 70) return { name: 'Dreiblattjasser', emoji: '☘️' };
  if (rating >= 60) return { name: 'Grünschnabel', emoji: '🌱' };
  return { name: 'Anfänger', emoji: '🐣' };
}

/**
 * 🧪 Test-Funktion: Validiere die Sanitize-Funktion
 */
export function testSanitizeFunction(): void {
  const testCases = [
    { input: { a: 1, b: undefined, c: null }, expected: { a: 1, c: null } },
    { input: { nested: { x: undefined, y: 2 } }, expected: { nested: { y: 2 } } },
    { input: { arr: [1, undefined, 3] }, expected: { arr: [1, 3] } },
    { input: undefined, expected: null },
    { input: null, expected: null },
    { input: "string", expected: "string" },
    { input: 42, expected: 42 }
  ];
  
  testCases.forEach((testCase, index) => {
    const result = sanitizeForFirestore(testCase.input);
    const passed = JSON.stringify(result) === JSON.stringify(testCase.expected);
    logger.info(`Test ${index + 1}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) {
      logger.info(`  Expected: ${JSON.stringify(testCase.expected)}`);
      logger.info(`  Got: ${JSON.stringify(result)}`);
    }
  });
}

/**
 * 🚀 HTTP Cloud Function: Trigger Backfill für eine Gruppe
 * 
 * Aufruf via HTTP POST:
 * {
 *   "groupId": "Tz0wgIHMTlhvTtFastiJ"
 * }
 */
export async function backfillRatingHistoryHTTP(groupId: string): Promise<{ success: boolean; message: string }> {
  try {
    await backfillRatingHistoryForGroup(groupId);
    return { 
      success: true, 
      message: `Backfill completed successfully for group ${groupId}` 
    };
  } catch (error) {
    logger.error(`HTTP Backfill failed for group ${groupId}:`, error);
    return { 
      success: false, 
      message: `Backfill failed: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

