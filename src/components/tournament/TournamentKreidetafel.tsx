"use client";

import React, { useEffect, useMemo } from 'react';
import { 
  useTournamentStore, 
  selectParticipantsStatus, 
  selectGamesStatus,
  selectTournamentParticipants,
  selectCompletedTournamentGames,
  ParticipantWithProgress
} from '@/store/tournamentStore';
import { Loader2, AlertTriangle, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { TournamentGame, TournamentSettings } from '@/types/tournament';
import type { FirestorePlayer } from '@/types/jass';
import ProfileImage from '@/components/ui/ProfileImage';

interface TournamentKreidetafelProps {
  instanceId: string;
  settings: TournamentSettings;
}

const TournamentKreidetafel: React.FC<TournamentKreidetafelProps> = ({ instanceId, settings }) => {
  const error = useTournamentStore(state => state.error);

  const tournamentParticipants = useTournamentStore(selectTournamentParticipants);
  const currentTournamentGames = useTournamentStore(selectCompletedTournamentGames) as TournamentGame[];
  const participantsStatus = useTournamentStore(selectParticipantsStatus);
  const gamesStatus = useTournamentStore(selectGamesStatus);

  useEffect(() => {
    if (instanceId) {
      const storeActions = useTournamentStore.getState();

      if (participantsStatus !== 'success' && participantsStatus !== 'loading') {
        console.log(`[TournamentKreidetafel] Requesting participants for ${instanceId}. Current status: ${participantsStatus}`);
        storeActions.loadTournamentParticipants(instanceId);
      } else if (participantsStatus === 'loading') {
        // console.log(`[TournamentKreidetafel] Participants for ${instanceId} are already loading.`);
      } else {
        // console.log(`[TournamentKreidetafel] Participants for ${instanceId} already loaded (status: ${participantsStatus}, count: ${tournamentParticipants.length}).`);
      }

      if (gamesStatus !== 'success' && gamesStatus !== 'loading') {
        console.log(`[TournamentKreidetafel] Requesting games for ${instanceId}. Current status: ${gamesStatus}`);
        storeActions.loadTournamentGames(instanceId);
      } else if (gamesStatus === 'loading') {
        // console.log(`[TournamentKreidetafel] Games for ${instanceId} are already loading.`);
      } else {
        // console.log(`[TournamentKreidetafel] Games for ${instanceId} already loaded (status: ${gamesStatus}, count: ${currentTournamentGames.length}).`);
      }
    }
  }, [instanceId, participantsStatus, gamesStatus]);

  const isLoadingParticipants = participantsStatus === 'loading';
  const isLoadingGames = gamesStatus === 'loading';
  const isLoading = isLoadingParticipants || isLoadingGames;

  const playerTotals = useMemo(() => {
    const totals: Record<string, { score: number; striche: number; weis: number }> = {};
    
    tournamentParticipants.forEach(p => {
      if (p && p.uid) {
        totals[p.uid] = { score: 0, striche: 0, weis: 0 };
      }
    });

    if (Array.isArray(currentTournamentGames)) {
      currentTournamentGames.forEach(game => {
        if (game.playerDetails && Array.isArray(game.playerDetails)) {
          game.playerDetails.forEach(detail => {
            const playerUid = detail.playerId;
            if (playerUid && totals[playerUid] && detail) {
              totals[playerUid].score += detail.scoreInPasse || 0;

              // KORRIGIERT: Verwende Team-Striche statt individuelle Spieler-Striche
              let stricheSumInPasse = 0;
              if (detail.team && game.teamStrichePasse && game.teamStrichePasse[detail.team]) {
                const teamStriche = game.teamStrichePasse[detail.team];
                stricheSumInPasse = Object.values(teamStriche).reduce((sum, val) => sum + (val || 0), 0);
              }
              totals[playerUid].striche += stricheSumInPasse;

              totals[playerUid].weis += detail.weisInPasse || 0;
            }
          });
        }
      });
    }
    return totals;
  }, [tournamentParticipants, currentTournamentGames]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-gray-800/50 rounded-lg min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400 mb-3" />
        <span className="text-gray-400">
          {isLoadingParticipants ? 'Lade Teilnehmer...' : 'Lade Passen...'}
        </span>
      </div>
    );
  }

  const hasError = participantsStatus === 'error' || gamesStatus === 'error';
  if (hasError && error) {
    return (
      <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md flex items-center">
        <AlertTriangle className="h-5 w-5 mr-3" />
        <span>Fehler beim Laden der Turnierdaten: {error}</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/70 p-4 rounded-lg shadow-inner border border-gray-700/50 overflow-x-auto">
      <h3 className="text-lg font-semibold text-center mb-4 text-purple-300">Turnierstand</h3>

      <div className="min-w-[400px]">
        <div className={`grid grid-cols-${tournamentParticipants.length + 1} gap-2 mb-3 border-b border-gray-600 pb-2 sticky top-0 bg-gray-800/90 z-10`}>
          <div className="text-center text-xs font-medium text-gray-400 flex items-end justify-center pb-1">Passe</div>
          {tournamentParticipants.map((participant, index) => (
            <div key={participant?.uid || index} className="text-center text-sm font-medium text-white flex flex-col items-center space-y-1">
              <ProfileImage 
                src={participant?.photoURL || undefined} 
                alt={participant?.displayName || 'Spieler'} 
                size="sm"
                className="mb-1"
                fallbackClassName="bg-gray-600 text-xs"
                fallbackText={participant?.displayName?.charAt(0) || 'P'}
              />
              <span className="text-xs truncate w-full">{participant?.displayName || `Spieler ${index + 1}`}</span>
            </div>
          ))}
        </div>

        <div className="divide-y divide-gray-700/50">
          {(!Array.isArray(currentTournamentGames) || currentTournamentGames.length === 0) && !isLoadingGames && (
            <div className={`grid grid-cols-${tournamentParticipants.length + 1} gap-2 py-4`}>
               <div className={`text-center text-gray-500 col-span-${tournamentParticipants.length + 1}`}>Noch keine Passen gespielt.</div>
            </div>
          )}
          {Array.isArray(currentTournamentGames) && currentTournamentGames.map((game, gameIndex) => (
            <div key={game.passeId} className={`grid grid-cols-${tournamentParticipants.length + 1} gap-2 py-2 text-sm`}>
              <div className="text-center text-gray-400 flex items-center justify-center font-medium">{game.passeNumber || gameIndex + 1}</div>
              {tournamentParticipants.map((participant, pIndex) => {
                const playerDetailInPasse = game.playerDetails?.find(detail => detail.playerId === participant.uid);
                let passeScore = 0;
                let passeStricheCount = 0;

                if (playerDetailInPasse) {
                  passeScore = playerDetailInPasse.scoreInPasse || 0;
                  // KORRIGIERT: Verwende Team-Striche für konsistente Anzeige
                  if (playerDetailInPasse.team && game.teamStrichePasse && game.teamStrichePasse[playerDetailInPasse.team]) {
                    const teamStriche = game.teamStrichePasse[playerDetailInPasse.team];
                    passeStricheCount = Object.values(teamStriche).reduce((sum, val) => sum + (val || 0), 0);
                  }
                }
                return (
                  <div key={participant?.uid || pIndex} className="text-center text-white">
                    <span className="font-semibold">{passeScore}</span>
                    {passeStricheCount > 0 && (
                      <span className="text-xs text-gray-400 ml-1">({passeStricheCount})</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className={`grid grid-cols-${tournamentParticipants.length + 1} gap-2 mt-4 border-t-2 border-purple-600 pt-3`}>
          <div className="text-center font-bold text-sm text-purple-300 flex items-center justify-center">Total</div>
          {tournamentParticipants.map((player, pIndex) => {
            const total = player && player.uid ? (playerTotals[player.uid] || { score: 0, striche: 0, weis: 0 }) : { score: 0, striche: 0, weis: 0 };
            return (
              <div key={player?.uid || pIndex} className="text-center">
                <div className="text-lg font-bold text-purple-300 mb-1">{total.striche}</div>
                <div className="text-xs text-gray-400">Punkte: {total.score}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TournamentKreidetafel; 