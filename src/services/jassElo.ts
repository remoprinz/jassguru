/**
 * 🎯 JASS-ELO RATING SYSTEM - FINALE VERSION
 * ==========================================
 * 
 * Produktives Elo-System für Jassguru, optimiert für Jass-Spiele.
 * 
 * ✅ KERN-EIGENSCHAFTEN:
 * - Team-basierte Bewertung (2vs2)  
 * - Striche-basierte Performance (nicht Win/Loss)
 * - Konstanter K-Faktor K=32 für alle Spieler
 * - Elo-Skala 300 für ausgewogene Reaktivität
 * - Start-Rating 1000 (psychologisch klar)
 * - 15-Tier System (👑 Legendary bis 🥚 Neuling)
 * - Zero-sum garantiert (Rating-Erhaltung)
 * 
 *  BASIS: Klassisches Elo-System (Wikipedia)
 * 🎮 JASS-ANPASSUNG: Score S = Striche-Anteil statt Win/Loss
 * 🔧 K-RAMPE: DEAKTIVIERT (alle K=32)
 * 
 * 🚀 VERWENDUNG:
 * - Frontend: loadPlayerRatings(), getRatingTier()
 * - Scripts: calculateRatingsPerGame.cjs, auditAndFixEloSystem.cjs  
 * - Cloud Functions: updateEloForSession()
 */

import { db } from '@/services/firebaseInit';
// ❌ ENTFERNT: getRatingTier Import - wird nicht mehr im Frontend berechnet
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';

// ===== TYPEN =====

export interface PlayerRating {
  id: string;
  rating: number;
  gamesPlayed: number;
  lastUpdated: number;
  lastDelta?: number;
  // 🆕 SESSION-DELTA TRACKING
  lastSessionDelta?: number;  // Delta der letzten Session (Summe aller Spiele)
  // 🆕 PEAK/LOW TRACKING
  peakRating?: number;
  peakRatingDate?: number;
  lowestRating?: number;
  lowestRatingDate?: number;
}

// ❌ ENTFERNT: Team, MatchInput, PlayerUpdate, MatchResult - nur noch für Scripts/Backend relevant

// ===== KONSTANTEN =====

export const JASS_ELO_CONFIG = {
  K_TARGET: 15,           // FINAL: K=15 (moderate Änderungen)
  DEFAULT_RATING: 100,    // Startwert bei 100 (neue Skala)
  ELO_SCALE: 1000,        // FINAL: Skala=1000 (optimale Spreizung)
} as const;

// ===== HILFSFUNKTIONEN =====

// ❌ ENTFERNT: expectedScore, teamRating, stricheScore - Scripts haben eigene Implementierungen

function getTierForRating(rating: number): { name: string; emoji: string } {
  if (rating >= 150) return { name: 'Göpf Egg', emoji: '👼' };
  if (rating >= 145) return { name: 'Jassgott', emoji: '🔱' };
  if (rating >= 140) return { name: 'Jasskönig', emoji: '👑' };
  if (rating >= 135) return { name: 'Grossmeister', emoji: '🏆' };
  if (rating >= 130) return { name: 'Jasser mit Auszeichnung', emoji: '🎖' };
  if (rating >= 125) return { name: 'Diamantjasser II', emoji: '💎' };
  if (rating >= 120) return { name: 'Diamantjasser I', emoji: '💍' };
  if (rating >= 115) return { name: 'Goldjasser', emoji: '🥇' };
  if (rating >= 110) return { name: 'Silberjasser', emoji: '🥈' };
  if (rating >= 105) return { name: 'Bronzejasser', emoji: '🥉' };
  if (rating >= 100) return { name: 'Jassstudent (START)', emoji: '👨‍🎓' };
  if (rating >= 95) return { name: 'Kleeblatt vierblättrig', emoji: '🍀' };
  if (rating >= 90) return { name: 'Kleeblatt dreiblättrig', emoji: '☘️' };
  if (rating >= 85) return { name: 'Sprössling', emoji: '🌱' };
  if (rating >= 80) return { name: 'Hahn', emoji: '🐓' };
  if (rating >= 75) return { name: 'Huhn', emoji: '🐔' };
  if (rating >= 70) return { name: 'Kücken', emoji: '🐥' };
  if (rating >= 65) return { name: 'Chlaus', emoji: '🎅' };
  if (rating >= 60) return { name: 'Chäs', emoji: '🧀' };
  if (rating >= 55) return { name: 'Ente', emoji: '🦆' };
  if (rating >= 50) return { name: 'Gurke', emoji: '🥒' };
  return { name: 'Just Egg', emoji: '🥚' };
}


// ===== HAUPTFUNKTION =====

// ❌ ENTFERNT: updateMatchRatings() - wird nur von Scripts/Backend verwendet, nicht vom Frontend

// ===== HILFSFUNKTIONEN FÜR SCRIPTS =====

/**
 * Erstellt Default-Rating für neuen Spieler
 */
export function createDefaultPlayerRating(playerId: string): PlayerRating {
  return {
    id: playerId,
    rating: JASS_ELO_CONFIG.DEFAULT_RATING,
    gamesPlayed: 0,
    lastUpdated: Date.now(),
  };
}

// ❌ ENTFERNT: validateZeroSum - verwendet PlayerUpdate Type der nicht mehr existiert

// ===== FRONTEND UTILITIES =====

export interface PlayerRatingWithTier extends PlayerRating {
  displayName?: string;
  tier: string;
  tierEmoji: string;
}

// ❌ ENTFERNT: getRatingTier Re-Export - Frontend verwendet Firebase-Daten direkt

/**
 * 🚀 PERFORMANCE: Lädt das voraggregierte Leaderboard einer Gruppe
 */
export async function loadGroupLeaderboard(groupId: string): Promise<Map<string, PlayerRatingWithTier>> {
  const ratings = new Map<string, PlayerRatingWithTier>();
  
  try {
    const leaderboardRef = collection(db, `groups/${groupId}/aggregated`);
    const snapshot = await getDocs(leaderboardRef);
    
    const leaderboardDoc = snapshot.docs.find(doc => doc.id === 'leaderboard');
    if (!leaderboardDoc) {
      console.warn(`Kein Leaderboard für Gruppe ${groupId} gefunden - Fallback auf loadPlayerRatings`);
      return ratings;
    }
    
    const data = leaderboardDoc.data();
    const entries = data?.entries || [];
    
    entries.forEach((entry: any) => {
      ratings.set(entry.playerId, {
        id: entry.playerId,
        rating: entry.rating || JASS_ELO_CONFIG.DEFAULT_RATING,
        gamesPlayed: entry.gamesPlayed || 0,
        lastUpdated: Date.now(),
        displayName: entry.displayName || `Spieler_${entry.playerId.slice(0, 6)}`,
        tier: entry.tier || 'Just Egg',
        tierEmoji: entry.tierEmoji || '🥚',
        lastDelta: entry.lastDelta || 0,
        // photoURL ist schon in der Leaderboard-Struktur verfügbar, aber nicht im PlayerRatingWithTier Interface
      });
    });
    
    console.log(`Leaderboard für Gruppe ${groupId} geladen: ${entries.length} Einträge`);
  } catch (error) {
    console.warn('Fehler beim Laden des Leaderboards:', error);
  }
  
  return ratings;
}

/**
 * Lädt Elo-Ratings für eine Liste von Spieler-IDs
 */
export async function loadPlayerRatings(playerIds: string[]): Promise<Map<string, PlayerRatingWithTier>> {
  const ratings = new Map<string, PlayerRatingWithTier>();
  
  if (playerIds.length === 0) return ratings;
  
  try {
    // Batch-Load in Gruppen von 10 (Firestore 'in' limit)
    const batches: string[][] = [];
    for (let i = 0; i < playerIds.length; i += 10) {
      batches.push(playerIds.slice(i, i + 10));
    }
    
    for (const batch of batches) {
      const playersQuery = query(
        collection(db, 'players'),
        where(documentId(), 'in', batch)
      );
      const snapshot = await getDocs(playersQuery);
      
      snapshot.forEach(doc => {
        const data: any = doc.data();
        const ratingValRaw = data?.globalRating;
        const ratingVal = typeof ratingValRaw === 'number' ? ratingValRaw : (Number(ratingValRaw) || JASS_ELO_CONFIG.DEFAULT_RATING);
        const gamesPlayedValRaw = data?.totalGamesPlayed;
        const gamesPlayedVal = typeof gamesPlayedValRaw === 'number' ? gamesPlayedValRaw : (Number(gamesPlayedValRaw) || 0);
        const lastUpdatedTs = data?.lastGlobalRatingUpdate;
        const lastUpdated = lastUpdatedTs?.toMillis ? lastUpdatedTs.toMillis() : Date.now();
        const name = data?.displayName || `Spieler_${doc.id.slice(0, 6)}`;
        const tierInfo = getTierForRating(ratingVal);
        
        ratings.set(doc.id, {
          id: doc.id,
          rating: ratingVal,
          gamesPlayed: gamesPlayedVal,
          lastUpdated,
          displayName: name,
          tier: tierInfo.name,
          tierEmoji: tierInfo.emoji,
          lastDelta: data?.lastDelta || 0, // Game-Delta
          // 🆕 SESSION-DELTA: Lade lastSessionDelta aus players/{playerId}
          lastSessionDelta: data?.lastSessionDelta || data?.lastDelta || 0,
        });
      });
    }
  } catch (error) {
    console.warn('Fehler beim Laden der Elo-Ratings:', error);
  }
  
  return ratings;
}

// ❌ ENTFERNT: getLatestRatingDelta() - nicht mehr nötig, da lastDelta direkt im Rating gespeichert wird
