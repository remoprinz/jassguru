'use client';

import React, { useState, useEffect } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { JASS_ELO_CONFIG, createDefaultPlayerRating, type PlayerRating } from '@/services/jassElo';

// Jass-Elo Rating System

// Rating Tier System
interface RatingTier {
  name: string;
  color: string;
  minRating: number;
}

const RATING_TIERS: RatingTier[] = [
  { name: 'Legendary', color: '#9333EA', minRating: 1080 },
  { name: 'Grandmaster', color: '#8B5CF6', minRating: 1060 },
  { name: 'Master', color: '#EF4444', minRating: 1050 },
  { name: 'Diamant', color: '#EC4899', minRating: 1040 },
  { name: 'Gold', color: '#F59E0B', minRating: 1030 },
  { name: 'Silber', color: '#6B7280', minRating: 1020 },
  { name: 'Bronze', color: '#92400E', minRating: 1010 },
  { name: 'Fortgeschritten', color: '#059669', minRating: 1000 },
  { name: 'Rookie', color: '#0891B2', minRating: 990 },
  { name: 'Ambitioniert', color: '#4B5563', minRating: 980 },
  { name: 'Entwicklung', color: '#16A34A', minRating: 970 },
  { name: 'Learner', color: '#CA8A04', minRating: 960 },
  { name: 'Schwimmer', color: '#0284C7', minRating: 950 },
  { name: 'Beginner', color: '#65A30D', minRating: 940 },
  { name: 'Neuling', color: '#78716C', minRating: 0 },
];

function getRatingTier(rating: number): RatingTier {
  for (const tier of RATING_TIERS) {
    if (rating >= tier.minRating) {
      return tier;
    }
  }
  return RATING_TIERS[RATING_TIERS.length - 1]; // Neuling fallback
}

interface PlayerRatingBadgeProps {
  playerId: string;
  variant?: 'full' | 'compact' | 'minimal';
  showTrend?: boolean;
  className?: string;
}

export const PlayerRatingBadge: React.FC<PlayerRatingBadgeProps> = ({
  playerId,
  variant = 'compact',
  showTrend = false,
  className = ''
}) => {
  const [rating, setRating] = useState<PlayerRating | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlayerRating();
  }, [playerId]);

  const loadPlayerRating = async () => {
    if (!playerId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // TODO: Implementiere Firebase Client-Side Loading
      // Für jetzt: Fallback zu Default-Rating
      console.warn('PlayerRatingBadge: Client-side Firebase loading not yet implemented');
      const defaultRating = createDefaultPlayerRating(playerId);
      setRating(defaultRating);
    } catch (err) {
      console.error('Fehler beim Laden des Jass-Elo Ratings:', err);
      setError('Rating konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-200 rounded ${getVariantClasses(variant)} ${className}`}>
        <div className="h-4 bg-gray-300 rounded w-16"></div>
      </div>
    );
  }

  if (error || !rating) {
    return (
      <div className={`text-gray-400 text-sm ${className}`}>
        {variant === 'minimal' ? '?' : 'Kein Rating'}
      </div>
    );
  }

  const tier = getRatingTier(rating.rating);
  
  // Jass-Elo hat keine Confidence - verwende Spiel-basierte "Stabilität"
  const stabilityPercentage = Math.min(100, Math.round((rating.gamesPlayed / 50) * 100));

  if (variant === 'minimal') {
    return (
      <span 
        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${className}`}
        style={{ backgroundColor: tier.color + '20', color: tier.color }}
      >
        {rating.rating}
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm ${className}`}
           style={{ backgroundColor: tier.color + '15' }}>
        <Trophy className="w-3 h-3" style={{ color: tier.color }} />
        <span className="font-medium">{rating.rating}</span>
        <span className="text-xs text-gray-500">({tier.name})</span>
      </div>
    );
  }

  // Full variant
  return (
    <div className={`p-3 rounded-lg border ${className}`}
         style={{ borderColor: tier.color + '40' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4" style={{ color: tier.color }} />
          <span className="font-bold text-lg">{rating.rating}</span>
        </div>
        {showTrend && <TrendIcon trend="stable" />}
      </div>
      
      <div className="text-xs text-gray-600 space-y-1">
        <div className="flex justify-between">
          <span>Liga:</span>
          <span className="font-medium" style={{ color: tier.color }}>
            {tier.name}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Spiele:</span>
          <span>{rating.gamesPlayed}</span>
        </div>
        <div className="flex justify-between">
          <span>Stabilität:</span>
          <span>{stabilityPercentage}%</span>
        </div>
      </div>
      
      {/* Stability Bar */}
      <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
        <div 
          className="h-1 rounded-full transition-all duration-300"
          style={{ 
            width: `${stabilityPercentage}%`,
            backgroundColor: tier.color 
          }}
        />
      </div>
    </div>
  );
};

// Hilfsfunktionen
function getVariantClasses(variant: string): string {
  switch (variant) {
    case 'minimal': return 'px-2 py-1';
    case 'compact': return 'px-2 py-1 w-24';
    case 'full': return 'p-3 w-48';
    default: return 'px-2 py-1';
  }
}

type TrendType = 'up' | 'down' | 'stable';

const TrendIcon: React.FC<{ trend?: TrendType }> = ({ trend = 'stable' }) => {
  switch (trend) {
    case 'up':
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    case 'down':
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    default:
      return <Minus className="w-4 h-4 text-gray-400" />;
  }
};

export default PlayerRatingBadge;
