/**
 * 🎯 SHARED RATING TIERS - Single Source of Truth
 * ==============================================
 * 
 * Wird von Frontend UND Backend verwendet für konsistente Tier-Berechnung.
 */

export interface RatingTier {
  minRating: number;
  name: string;
  emoji: string;
}

// 🏆 Schweizer Jass-Tiers (von hoch zu niedrig) - NEU: Student startet bei 100
export const RATING_TIERS: RatingTier[] = [
  { minRating: 150, name: "Göpf Egg", emoji: "👼" },
  { minRating: 145, name: "Jassgott", emoji: "🔱" },
  { minRating: 140, name: "Jasskönig", emoji: "👑" },
  { minRating: 135, name: "Grossmeister", emoji: "🏆" },
  { minRating: 130, name: "Diamantjasser II", emoji: "💎" },
  { minRating: 125, name: "Diamantjasser I", emoji: "💍" },
  { minRating: 120, name: "Goldjasser", emoji: "🥇" },
  { minRating: 115, name: "Silberjasser", emoji: "🥈" },
  { minRating: 110, name: "Broncejasser", emoji: "🥉" },
  { minRating: 100, name: "A-Student", emoji: "👨‍🎓" },
  { minRating: 95,  name: "Kleeblatt vierblättrig", emoji: "🍀" },
  { minRating: 90,  name: "Kleeblatt dreiblättrig", emoji: "☘️" },
  { minRating: 85,  name: "Sprössling", emoji: "🌱" },
  { minRating: 80,  name: "Hahn", emoji: "🐓" },
  { minRating: 75,  name: "Huhn", emoji: "🐔" },
  { minRating: 70,  name: "Kücken", emoji: "🐥" },
  { minRating: 65,  name: "Ente", emoji: "🦆" },
  { minRating: 60,  name: "Chlaus", emoji: "🎅" },
  { minRating: 55,  name: "Chäs", emoji: "🧀" },
  { minRating: 50,  name: "Gurke", emoji: "🥒" },
];

// Default Tier für Ratings unter 45
export const DEFAULT_TIER: RatingTier = { 
  minRating: 0, 
  name: "Just Egg", 
  emoji: "🥚" 
};

/**
 * Bestimmt Tier basierend auf Rating
 */
export function getRatingTier(rating: number): { name: string; emoji: string } {
  for (const tier of RATING_TIERS) {
    if (rating >= tier.minRating) {
      return { name: tier.name, emoji: tier.emoji };
    }
  }
  return { name: DEFAULT_TIER.name, emoji: DEFAULT_TIER.emoji };
}
