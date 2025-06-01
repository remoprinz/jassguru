import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserCheck, ExternalLink } from 'lucide-react'; // Icon für Admin und externen Link
import Image from 'next/image'; // Wichtig: Füge diesen Import hinzu
import { Button } from '@/components/ui/button'; // Import für Button-Komponente
import { ParticipantWithProgress } from '@/store/tournamentStore';

interface TournamentParticipantsListProps {
  participants: ParticipantWithProgress[];
  tournamentAdminId?: string; 
  onParticipantClick?: (participant: ParticipantWithProgress) => void; // NEU: Callback Prop
}

const TournamentParticipantsList: React.FC<TournamentParticipantsListProps> = ({
  participants,
  tournamentAdminId,
  onParticipantClick, // NEU
}) => {
  if (!participants || participants.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        Keine Teilnehmer für dieses Turnier gefunden oder Teilnehmerdaten werden noch geladen.
      </div>
    );
  }

  const handleItemClick = (participant: ParticipantWithProgress) => {
    if (onParticipantClick) {
      onParticipantClick(participant);
    } else {
      // Fallback oder Standardverhalten, falls kein onParticipantClick übergeben wird
      // z.B. Navigation zum Profil, falls gewünscht und Link-Komponente wieder aktiv ist
      console.log("Participant clicked, but no onParticipantClick handler provided. UID:", participant.uid);
    }
  };

  return (
    <div className="p-0 md:p-4">
      <Card className="bg-gray-800/70 border-gray-700/50 shadow-lg">
        <CardHeader className="pb-3 pt-4 px-4 md:px-5">
          <CardTitle className="text-lg text-white">Teilnehmer ({participants.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-2 py-2 md:px-4 md:pb-4 max-h-[400px] overflow-y-auto">
          {participants.map((player) => {
            const playerId = player.uid;
            
            return (
              <div 
                key={playerId || `player-${player.displayName}`}
                onClick={() => handleItemClick(player)} 
                className={`block rounded-md ${playerId ? 'cursor-pointer' : 'cursor-default'} bg-gray-700/40 hover:bg-gray-700/70 transition-colors duration-150 relative`}
              >
                <div className="flex items-center justify-between p-2.5">
                  <div className="flex items-center space-x-3 min-w-0">
                    <Avatar className="h-10 w-10 mr-3">
                      {player.photoURL ? (
                        <Image
                          src={player.photoURL}
                          alt={player.displayName || 'Teilnehmer'}
                          width={40}
                          height={40}
                          className="rounded-full object-cover"
                        />
                      ) : (
                        <AvatarFallback className="bg-gray-700 text-gray-300">
                          {player.displayName?.charAt(0).toUpperCase() || '?'}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-white truncate" title={player.displayName || 'Unbekannter Spieler'}>
                        {player.displayName || 'Unbekannter Spieler'}
                      </p>
                      {/* Optional: Anzeige einer Rolle, falls relevant */}
                      {player.uid === tournamentAdminId && (
                        <span className="text-xs text-purple-400 flex items-center">
                          <UserCheck className="w-3 h-3 mr-1" />
                          Turnier-Admin
                        </span>
                      )}
                      {/* NEU: Passen anzeigen */}
                      <span className="text-xs text-gray-400">
                        {player.completedPassesCount} {player.completedPassesCount === 1 ? 'Passe' : 'Passen'} abgeschlossen
                      </span>
                    </div>
                  </div>
                  
                  {/* Pfeil-Icon kann bleiben, signalisiert Klickbarkeit oder zukünftige Navigation */}
                  {playerId && (
                    <div className="text-gray-400 group-hover:text-white flex items-center text-xs pr-1">
                      {/* <ExternalLink className="w-3.5 h-3.5 ml-1" /> // Vorerst entfernt, da Navigation über Modal geht */}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default TournamentParticipantsList; 