'use client';

import React, { useState, useEffect } from 'react';
import { Trophy, Medal, Award, Crown } from 'lucide-react';
import { jassguruRatingService } from '@/services/jassguruRatingService';
import { getRatingTier, type PlayerRating } from '@/services/jassguruRating';

interface RatingLeaderboardProps {
  limit?: number;
  groupId?: string;
  className?: string;
}

export const RatingLeaderboard: React.FC<RatingLeaderboardProps> = ({
  limit = 50,
  groupId,
  className = ''
}) => {
  const [players, setPlayers] = useState<PlayerRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLeaderboard();
  }, [limit, groupId]);

  const loadLeaderboard = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const topPlayers = await jassguruRatingService.getTopPlayers(limit);
      setPlayers(topPlayers);
    } catch (err) {
      console.error('Fehler beim Laden der Rangliste:', err);
      setError('Rangliste konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`space-y-2 ${className}`}>
        {[...Array(10)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg">
              <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-300 rounded w-32 mb-1"></div>
                <div className="h-3 bg-gray-300 rounded w-20"></div>
              </div>
              <div className="h-6 bg-gray-300 rounded w-16"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <Trophy className="w-12 h-12 mx-auto mb-2 text-gray-300" />
        <p>{error}</p>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <Trophy className="w-12 h-12 mx-auto mb-2 text-gray-300" />
        <p>Noch keine Ratings verfügbar</p>
        <p className="text-sm mt-1">Spielen Sie ein paar Sessions, um Ihr Rating zu berechnen!</p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-yellow-500" />
        <h2 className="text-lg font-bold">Jassguru Rangliste</h2>
        <span className="text-sm text-gray-500">({players.length} Spieler)</span>
      </div>

      {players.map((player, index) => {
        const tier = getRatingTier(player.rating);
        const position = index + 1;
        
        return (
          <div 
            key={player.playerId}
            className={`flex items-center gap-3 p-3 rounded-lg transition-all hover:shadow-md ${
              position <= 3 ? 'bg-gradient-to-r' : 'bg-white border'
            }`}
            style={position <= 3 ? {
              backgroundImage: `linear-gradient(to right, ${tier.color}10, ${tier.color}05)`
            } : {}}
          >
            {/* Position & Icon */}
            <div className="flex items-center justify-center w-8 h-8">
              {getPositionIcon(position, tier.color)}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 truncate">
                  {getPlayerDisplayName(player.playerId)}
                </span>
                <span 
                  className="px-2 py-0.5 text-xs rounded-full font-medium"
                  style={{ 
                    backgroundColor: tier.color + '20',
                    color: tier.color 
                  }}
                >
                  {tier.name}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                {player.gamesPlayed} Spiele • Sicherheit: {Math.round((1 - player.confidence / 350) * 100)}%
              </div>
            </div>

            {/* Rating */}
            <div className="text-right">
              <div className="text-lg font-bold" style={{ color: tier.color }}>
                {player.rating}
              </div>
              <div className="text-xs text-gray-400">
                Rating
              </div>
            </div>
          </div>
        );
      })}

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 mt-4 pt-4 border-t">
        Ratings basieren auf 70% Striche-Differenz und 30% Win/Loss-Verhältnis
      </div>
    </div>
  );
};

// Hilfsfunktionen
function getPositionIcon(position: number, color: string) {
  switch (position) {
    case 1:
      return <Crown className="w-5 h-5 text-yellow-500" />;
    case 2:
      return <Medal className="w-5 h-5 text-gray-400" />;
    case 3:
      return <Award className="w-5 h-5 text-amber-600" />;
    default:
      return (
        <span 
          className="text-sm font-bold"
          style={{ color: position <= 10 ? color : '#6B7280' }}
        >
          {position}
        </span>
      );
  }
}

function getPlayerDisplayName(playerId: string): string {
  // Vereinfacht - in der echten App würden Sie den Player-Service verwenden
  // um den Display-Namen zu holen
  return playerId.length > 10 ? `${playerId.substring(0, 10)}...` : playerId;
}

export default RatingLeaderboard;
