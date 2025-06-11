import React from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2 } from 'lucide-react';
import type { FirestorePlayer } from '@/types/jass';
import { cn } from '@/lib/utils'; // Für bedingte Klassen
import { Award } from 'lucide-react'; // Award Icon importieren
import ProfileImage from '@/components/ui/ProfileImage';

interface GroupMemberListProps {
  members: FirestorePlayer[];
  isLoading: boolean;
}

// Typ für FirestorePlayer mit _isPlaceholder Eigenschaft (wie in settings.tsx)
type PlayerWithPlaceholder = FirestorePlayer & { _isPlaceholder?: boolean };

export const GroupMemberList: React.FC<GroupMemberListProps> = ({ members, isLoading }) => {

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mb-2" />
        <span>Lade Mitglieder...</span>
      </div>
    );
    // Optional: Skeleton-Loader für ein besseres UX
    /*
    return (
      <ul className="space-y-3 pt-2">
        {[...Array(3)].map((_, i) => (
          <li key={i} className="flex items-center gap-3 p-3 bg-gray-700/40 rounded-md animate-pulse">
            <div className="h-10 w-10 rounded-full bg-gray-600"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-600 rounded w-3/4"></div>
              <div className="h-3 bg-gray-600 rounded w-1/2"></div>
            </div>
            <div className="h-4 bg-gray-600 rounded w-8"></div>
          </li>
        ))}
      </ul>
    );
    */
  }

  if (!members || members.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        Noch keine Mitglieder in dieser Gruppe.
      </div>
    );
  }

  return (
    <ul className="space-y-3 pt-2">
      {members.map((member) => {
        const player = member as PlayerWithPlaceholder; // Cast für Zugriff auf _isPlaceholder
        const isPlaceholder = player._isPlaceholder;

        return (
          <li key={player.id}>
            <Link
              href={`/profile/${player.id}`}
              passHref
              className={cn(
                "flex items-center gap-3 p-3 rounded-md transition-colors duration-150",
                isPlaceholder ? 'bg-yellow-900/20 hover:bg-yellow-900/40 cursor-default' // Kein Hover-Effekt für Platzhalter? Oder anderer Style?
                : 'bg-gray-700/50 hover:bg-gray-700/80'
              )}
            >
              {/* Avatar */}
              <ProfileImage 
                src={player.photoURL} 
                alt={player.displayName || 'Mitglied'} 
                size="lg"
                className="mr-3 flex-shrink-0"
                fallbackClassName={cn(
                  "bg-gray-700 text-gray-300",
                  isPlaceholder && "bg-yellow-700"
                )}
                fallbackText={player.displayName?.charAt(0).toUpperCase() || '?'}
              />

              {/* Nickname & Placeholder Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                  {/* OG Badge Icon (Annahme) - Links vom Namen */}
                  {player?.metadata?.isOG && (
                    <Award className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  )}
                  <span>{player.displayName || "Unbekannter Spieler"}</span>
                </p>
                {isPlaceholder && (
                  <p className="text-xs text-yellow-400 truncate">
                    (Daten unvollständig)
                  </p>
                )}
              </div>

              {/* Badges Area (Future) */}
              <div className="flex-shrink-0 flex items-center gap-1">
                {/* Beispiel: OG Badge - Logik später hinzufügen */}
                {/* {player.metadata?.isOG && <Badge variant="outline" className="border-purple-500 text-purple-400 bg-purple-900/30">OG</Badge>} */}
              </div>

              {/* Games Played (Rechtsbündig) */}
              <div className="flex-shrink-0 text-sm text-gray-300 font-medium ml-2">
                {player.stats?.gamesPlayed ?? 0}
                <span className="text-xs text-gray-400 ml-1">Spiele</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}; 