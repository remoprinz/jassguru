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
 * 📚 BASIS: Klassisches Elo-System (Wikipedia)
 * 🎮 JASS-ANPASSUNG: Score S = Striche-Anteil statt Win/Loss
 * 🔧 K-RAMPE: DEAKTIVIERT (alle K=32)
 * 
 * 🚀 VERWENDUNG:
 * - Frontend: loadPlayerRatings(), getRatingTier()
 * - Scripts: calculateRatingsPerGame.cjs, auditAndFixEloSystem.cjs  
 * - Cloud Functions: updateEloForSession()
 */

import { db } from '@/services/firebaseInit';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';

// ===== TYPEN =====

export interface PlayerRating {
  id: string;
  rating: number;
  gamesPlayed: number;
  lastUpdated: number;
}

export interface Team {
  player1: PlayerRating;
  player2: PlayerRating;
}

export interface MatchInput {
  teamA: Team;
  teamB: Team;
  stricheA: number;
  stricheB: number;
}

export interface PlayerUpdate {
  playerId: string;
  oldRating: number;
  newRating: number;
  delta: number;
  oldGamesPlayed: number;
  newGamesPlayed: number;
}

export interface MatchResult {
  teamAExpected: number;
  teamBExpected: number;
  stricheScore: number; // S = stricheA / (stricheA + stricheB)
  teamADelta: number;
  teamBDelta: number;
  updates: PlayerUpdate[];
}

// ===== KONSTANTEN =====

export const JASS_ELO_CONFIG = {
  K_TARGET: 32,           // FINAL: K=32 (optimale Volatilität)
  DEFAULT_RATING: 1000,   // Startwert für neue Spieler
  ELO_SCALE: 1000,        // FINAL: Skala=1000 (optimale Spreizung)
} as const;

// ===== HILFSFUNKTIONEN =====

/**
 * Berechnet den Erwartungswert für Team A (klassische Elo-Formel)
 * E = 1 / (1 + 10^((RatingB - RatingA) / 400))
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

/**
 * Berechnet Team-Rating als Durchschnitt der beiden Spieler
 */
export function teamRating(team: Team): number {
  return (team.player1.rating + team.player2.rating) / 2;
}

/**
 * Berechnet Striche-Score: Anteil der Striche von Team A
 * S = stricheA / (stricheA + stricheB)
 * Bei Gleichstand (0:0): S = 0.5 (neutral)
 */
export function stricheScore(stricheA: number, stricheB: number): number {
  const total = stricheA + stricheB;
  if (total === 0) return 0.5; // Neutral bei 0:0
  return stricheA / total;
}


// ===== HAUPTFUNKTION =====

/**
 * Berechnet Rating-Updates für ein Jass-Spiel
 * 
 * Algorithmus:
 * 1. Team-Ratings und Erwartungswerte berechnen
 * 2. Striche-Score S ermitteln
 * 3. Effektive K-Faktoren pro Spieler (Rampe)
 * 4. Team-Deltas berechnen (Zero-sum)
 * 5. Deltas gleichmäßig auf Spieler verteilen
 */
export function updateMatchRatings(match: MatchInput): MatchResult {
  // 1. Team-Ratings und Erwartungswerte
  const ratingA = teamRating(match.teamA);
  const ratingB = teamRating(match.teamB);
  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA; // Komplementär
  
  // 2. Striche-Score
  const S = stricheScore(match.stricheA, match.stricheB);
  
  // 3. K-Faktor ist fest für alle Spieler
  const K = JASS_ELO_CONFIG.K_TARGET;
  
  // 4. Team-Deltas (Zero-sum: deltaA = -deltaB)
  const deltaA = K * (S - expectedA);
  const deltaB = -deltaA; // Zero-sum garantiert
  
  // 5. Spieler-Updates
  const updates: PlayerUpdate[] = [
    // Team A
    {
      playerId: match.teamA.player1.id,
      oldRating: match.teamA.player1.rating,
      newRating: match.teamA.player1.rating + deltaA / 2,
      delta: deltaA / 2,
      oldGamesPlayed: match.teamA.player1.gamesPlayed,
      newGamesPlayed: match.teamA.player1.gamesPlayed + 1,
    },
    {
      playerId: match.teamA.player2.id,
      oldRating: match.teamA.player2.rating,
      newRating: match.teamA.player2.rating + deltaA / 2,
      delta: deltaA / 2,
      oldGamesPlayed: match.teamA.player2.gamesPlayed,
      newGamesPlayed: match.teamA.player2.gamesPlayed + 1,
    },
    // Team B
    {
      playerId: match.teamB.player1.id,
      oldRating: match.teamB.player1.rating,
      newRating: match.teamB.player1.rating + deltaB / 2,
      delta: deltaB / 2,
      oldGamesPlayed: match.teamB.player1.gamesPlayed,
      newGamesPlayed: match.teamB.player1.gamesPlayed + 1,
    },
    {
      playerId: match.teamB.player2.id,
      oldRating: match.teamB.player2.rating,
      newRating: match.teamB.player2.rating + deltaB / 2,
      delta: deltaB / 2,
      oldGamesPlayed: match.teamB.player2.gamesPlayed,
      newGamesPlayed: match.teamB.player2.gamesPlayed + 1,
    },
  ];
  
  return {
    teamAExpected: expectedA,
    teamBExpected: expectedB,
    stricheScore: S,
    teamADelta: deltaA,
    teamBDelta: deltaB,
    updates,
  };
}

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

/**
 * Validiert Zero-sum Property (für Tests/Debugging)
 */
export function validateZeroSum(updates: PlayerUpdate[]): boolean {
  const totalDelta = updates.reduce((sum, update) => sum + update.delta, 0);
  return Math.abs(totalDelta) < 0.001; // Floating-point Toleranz
}

// ===== FRONTEND UTILITIES =====

export interface PlayerRatingWithTier extends PlayerRating {
  displayName?: string;
  tier: string;
  tierEmoji: string;
}

/**
 * Bestimmt Tier basierend auf Rating (Schweizer Jass-Tiers)
 */
export function getRatingTier(rating: number): { name: string; emoji: string } {
  if (rating >= 1100) return { name: "Göpf Egg", emoji: "👼" };
  if (rating >= 1090) return { name: "Jassgott", emoji: "🔱" };
  if (rating >= 1080) return { name: "Jasskönig", emoji: "👑" };
  if (rating >= 1070) return { name: "Eidgenoss", emoji: "🇨🇭" };
  if (rating >= 1060) return { name: "Kranzjasser", emoji: "🍀" };
  if (rating >= 1050) return { name: "Grossmeister", emoji: "🏆" };
  if (rating >= 1040) return { name: "Jassmeister", emoji: "💎" };
  if (rating >= 1030) return { name: "Goldjasser", emoji: "🥇" };
  if (rating >= 1020) return { name: "Silberjasser", emoji: "🥈" };
  if (rating >= 1010) return { name: "Bronzejasser", emoji: "🥉" };
  if (rating >= 1000) return { name: "Akademiker", emoji: "👨‍🎓" };
  if (rating >= 990) return { name: "Aspirant", emoji: "💡" };
  if (rating >= 980) return { name: "Praktikant", emoji: "☘️" };
  if (rating >= 970) return { name: "Schüler", emoji: "📚" };
  if (rating >= 960) return { name: "Hahn", emoji: "🐓" };
  if (rating >= 950) return { name: "Huhn", emoji: "🐔" };
  if (rating >= 940) return { name: "Kücken", emoji: "🐥" };
  if (rating >= 930) return { name: "Anfänger", emoji: "🌱" };
  if (rating >= 920) return { name: "Chlaus", emoji: "🎅" };
  if (rating >= 910) return { name: "Käse", emoji: "🧀" };
  if (rating >= 900) return { name: "Ente", emoji: "🦆" };
  if (rating >= 890) return { name: "Gurke", emoji: "🥒" };
  return { name: "Just Egg", emoji: "🥚" };
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
      const ratingsQuery = query(
        collection(db, 'playerRatings'),
        where(documentId(), 'in', batch)
      );
      
      const snapshot = await getDocs(ratingsQuery);
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const tier = getRatingTier(data.rating || JASS_ELO_CONFIG.DEFAULT_RATING);
        
        ratings.set(doc.id, {
          id: doc.id,
          rating: data.rating || JASS_ELO_CONFIG.DEFAULT_RATING,
          gamesPlayed: data.gamesPlayed || 0,
          lastUpdated: data.lastUpdated || Date.now(),
          displayName: data.displayName || `Spieler_${doc.id.slice(0, 6)}`,
          tier: tier.name,
          tierEmoji: tier.emoji
        });
      });
    }
  } catch (error) {
    console.warn('Fehler beim Laden der Elo-Ratings:', error);
  }
  
  return ratings;
}
