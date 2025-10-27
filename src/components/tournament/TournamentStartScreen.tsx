"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Loader2 } from 'lucide-react';
import type { PlayerNumber, GamePlayers, FirestorePlayer, MemberInfo } from '@/types/jass';
import { useTournamentStore, ParticipantWithProgress } from '@/store/tournamentStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { PlayerSelectTournamentPopover } from './PlayerSelectTournamentPopover';
import GlobalLoader from '@/components/layout/GlobalLoader';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import ProfileImage from '@/components/ui/ProfileImage';

const screenVariants = {
  initial: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

type TournamentGamePlayers = {
  1: (MemberInfo & { playerId: string }) | null;
  2: (MemberInfo & { playerId: string }) | null;
  3: (MemberInfo & { playerId: string }) | null;
  4: (MemberInfo & { playerId: string }) | null;
};

interface TournamentStartScreenProps {
  isVisible: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentParticipants: ParticipantWithProgress[];
  currentPasseNumber: number;
  onPasseStarted: (activeGameId: string) => void;
  members?: FirestorePlayer[];
}

const TournamentStartScreen: React.FC<TournamentStartScreenProps> = ({
  isVisible,
  onClose,
  tournamentId,
  tournamentParticipants,
  currentPasseNumber,
  onPasseStarted,
  members = [],
}) => {
  const { user } = useAuthStore();
  const startNewPasseAction = useTournamentStore((state) => state.startNewPasse);
  const showNotification = useUIStore((state) => state.showNotification);

  const [selectedGamePlayers, setSelectedGamePlayers] = useState<TournamentGamePlayers>({ 1: null, 2: null, 3: null, 4: null });
  const [startingPlayer, setStartingPlayer] = useState<PlayerNumber | null>(null);
  const [hasSelectedStartingPlayer, setHasSelectedStartingPlayer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // NEU: Zustand für die Überprüfung, ob der aktuelle Benutzer Teil der ausgewählten Spieler ist
  const [isCurrentUserInSelectedPasse, setIsCurrentUserInSelectedPasse] = useState(false);
  
  // EINFACHE LÖSUNG: Dynamische Passe-Nummer basierend auf ausgewählten Spielern
  const dynamicPasseNumber = React.useMemo(() => {
    const selectedPlayers = Object.values(selectedGamePlayers).filter(p => p !== null);
    if (selectedPlayers.length === 0) {
      // Keine Spieler ausgewählt → Zeige die Standard-Nummer vom Parent
      return currentPasseNumber;
    }
    // Spieler ausgewählt → Zeige IHRE nächste Passe (Minimum der completedPassesCount + 1)
    const completedCounts = selectedPlayers.map(p => {
      const participant = tournamentParticipants.find(tp => tp.uid === p!.uid);
      return participant?.completedPassesCount || 0;
    });
    return Math.min(...completedCounts) + 1;
  }, [selectedGamePlayers, currentPasseNumber, tournamentParticipants]);

  useEffect(() => {
    if (!isVisible) {
      setSelectedGamePlayers({ 1: null, 2: null, 3: null, 4: null });
      setStartingPlayer(null);
      setHasSelectedStartingPlayer(false);
      setIsLoading(false);
      setError(null);
      setIsCurrentUserInSelectedPasse(false); // Zurücksetzen bei Schließen
    }
  }, [isVisible]);

  // NEU: Effekt, um isCurrentUserInSelectedPasse zu aktualisieren, wenn sich selectedGamePlayers oder user ändern
  useEffect(() => {
    if (user?.uid) {
      // Debug-Logging entfernt - zu viele repetitive Logs
      
      // Verbesserte Überprüfung mit Stringvergleich
      const isUserSelected = Object.values(selectedGamePlayers).some(p => {
        return p?.type === 'member' && p.uid && p.uid.toString() === user.uid.toString();
      });
      
      setIsCurrentUserInSelectedPasse(isUserSelected);
    } else {
      setIsCurrentUserInSelectedPasse(false);
    }
  }, [selectedGamePlayers, user]);

  const handlePlayerSelect = (slot: PlayerNumber, participant: ParticipantWithProgress) => {
    if (!participant.uid) {
      showNotification({ type: 'error', message: 'Fehler bei der Spielerauswahl: Spieler-ID fehlt.' });
      return;
    }
    const slotNumber = Number(slot) as PlayerNumber;
    const isAlreadySelected = Object.values(selectedGamePlayers).some(p => p?.type === 'member' && p.uid === participant.uid);
    const playerInCurrentSlot = selectedGamePlayers[slotNumber];

    if (isAlreadySelected && (playerInCurrentSlot?.type !== 'member' || playerInCurrentSlot.uid !== participant.uid)) {
      showNotification({ type: 'warning', message: 'Dieser Spieler ist bereits einem anderen Slot zugewiesen.' });
      return;
    }
    // ✅ FIX: Verwende playerId statt nur uid
    setSelectedGamePlayers(prev => ({ 
      ...prev, 
      [slotNumber]: { 
        type: 'member', 
        uid: participant.uid, 
        playerId: participant.playerId || participant.uid, // ✅ Player ID hinzugefügt
        name: participant.displayName || `Spieler ${slotNumber}` 
      } 
    }));
  };

  const handleRemovePlayer = (slot: PlayerNumber) => {
    const numSlot = Number(slot);
    setSelectedGamePlayers(prev => ({ ...prev, [numSlot]: null }));
    if (startingPlayer === numSlot) {
        setStartingPlayer(null);
        setHasSelectedStartingPlayer(false);
    }
  };

  const areAllSlotsFilled = (): boolean => Object.values(selectedGamePlayers).every(player => player !== null);

  const handlePlayerFieldClick = (playerNumber: PlayerNumber) => {
    if (areAllSlotsFilled()) {
      setStartingPlayer(Number(playerNumber) as PlayerNumber);
      setHasSelectedStartingPlayer(true);
    }
  };

  const getPlayerFieldClass = (playerNumber: PlayerNumber): string => {
    const numPlayerNumber = Number(playerNumber);
    const allFilled = areAllSlotsFilled();
    const isSelectedAsStartingPlayer = hasSelectedStartingPlayer && allFilled && startingPlayer === numPlayerNumber;
    const isTeamOne = numPlayerNumber === 1 || numPlayerNumber === 3;
    const player = selectedGamePlayers[numPlayerNumber];

    const baseBg = isTeamOne ? "bg-gray-500" : "bg-gray-700";
    const hoverBg = isTeamOne ? "hover:bg-gray-600" : "hover:bg-gray-800";
    const teamBorderColor = isTeamOne ? "border-l-yellow-400" : "border-l-blue-400";
    
    let classes = `relative w-full p-3 pl-4 pr-10 outline-none border-l-4 transition-all duration-150 rounded-xl text-white text-left ${baseBg} ${teamBorderColor}`;

    if (isSelectedAsStartingPlayer) {
      classes += ' border-yellow-500 ring-2 ring-yellow-500';
    } else {
      classes += ' border-gray-600';
    }
    
    if (allFilled) {
      classes += ` ${hoverBg} cursor-pointer`;
    } else if (!player) {
       classes += ' text-gray-400 italic cursor-pointer';
    }
    return classes;
  };
  
  const handleStartGame = async () => {
    if (!areAllSlotsFilled()) {
      showNotification({ type: 'warning', message: 'Alle Spielerpositionen müssen besetzt sein, um das Spiel starten zu können.' });
      return;
    }
    if (!hasSelectedStartingPlayer || startingPlayer === null) {
      showNotification({ type: 'warning', message: 'Bitte wähle einen Startspieler aus (auf einen Spieler klicken).' });
      return;
    }

    // NEU: Überprüfung, ob der aktuelle Benutzer Teil der Passe ist
    console.log("[TournamentStartScreen] Start-Check:", { isCurrentUserInSelectedPasse, userUid: user?.uid });
    if (!isCurrentUserInSelectedPasse) {
      showNotification({ 
        type: 'error', 
        message: 'Nur Spieler, die an dieser Passe teilnehmen, dürfen sie starten.',
        preventClose: true,
        actions: [
          {
            label: "Verstanden",
            onClick: () => {}
          }
        ]
      });
      return;
    }
    
    setIsLoading(true);
    setError(null);
    try {
      const playersForPasse = Object.entries(selectedGamePlayers)
        .filter(([_, p]) => p !== null)
        .map(([slotKey, p_val]) => {
          if (!p_val || p_val.type !== 'member') throw new Error(`Ungültiger Spieler in Slot ${slotKey}`);
          // Finde den Teilnehmer im tournamentParticipants-Array, um completedPassesCount zu erhalten
          const participant = tournamentParticipants.find(tp => tp.uid === p_val.uid);
          if (!participant) throw new Error(`Teilnehmer mit uid ${p_val.uid} wurde nicht gefunden`);
          
          return { 
            uid: p_val.uid, 
            playerId: p_val.playerId, // ✅ FIX: Player ID hinzugefügt
            name: p_val.name, 
            playerNumber: Number(slotKey) as PlayerNumber,
            completedPassesCount: participant.completedPassesCount || 0,
            photoURL: participant.photoURL
          };
        });

      const activeGameId = await startNewPasseAction(tournamentId, playersForPasse, startingPlayer as PlayerNumber);
      if (onPasseStarted && activeGameId) onPasseStarted(activeGameId);
      onClose();
    } catch (err) {
      console.error('Fehler beim Starten des Spiels:', err);
      setError(`Fehler beim Starten des Spiels: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible) return null;
  if (isLoading) return <GlobalLoader message="Passe wird gestartet..." />;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-95 z-50 p-4 overflow-y-auto"
          initial="initial"
          animate="visible"
          exit="exit"
          variants={screenVariants}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          <div className="relative bg-gray-800 bg-opacity-95 rounded-xl p-6 w-full max-w-xs space-y-6 shadow-lg text-center max-h-[95vh] overflow-y-auto">
            <Button variant="ghost" size="icon" onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors z-10" aria-label="Schliessen">
              <X size={24}/>
            </Button>
            
            <h2 className={`text-2xl font-bold ${areAllSlotsFilled() ? "text-yellow-400" : "text-white"} text-center mb-0`}>
              {areAllSlotsFilled() ? "Startspieler wählen" : "Passe starten"}
            </h2>

            <h3 className="text-lg font-semibold text-white pt-0">
              Sitzreihenfolge:
            </h3>

            <div className="space-y-4">
              {(Object.keys(selectedGamePlayers) as unknown as PlayerNumber[]).map(slotKey => {
                const slotNumber = Number(slotKey) as PlayerNumber;
                const player = selectedGamePlayers[slotNumber];
                const placeholderText = (() => {
                  const teamText = (slotNumber === 1 || slotNumber === 3) ? "Team 1" : "Team 2";
                  return `Spieler ${slotNumber} (${teamText}) wählen...`;
                })();

                const playerDisplayOrSelector = (
                  <div
                    key={`slotdisplay-${slotNumber}`}
                    onClick={() => handlePlayerFieldClick(slotNumber)}
                    className={getPlayerFieldClass(slotNumber)}
                  >
                    {player ? (
                      <>
                        <div className="flex items-center">
                          <ProfileImage 
                            src={(() => {
                              if (player.type === 'member') {
                                // Finde das FirestorePlayer-Objekt basierend auf dem Namen
                                const firestorePlayer = members.find(m => m.displayName === player.name);
                                return firestorePlayer?.photoURL;
                              }
                              return undefined;
                            })()}
                            alt={player.name} 
                            size="sm"
                            className="mr-3 flex-shrink-0"
                            fallbackClassName="bg-gray-600 text-gray-300 text-sm"
                            fallbackText={player.name.charAt(0).toUpperCase()}
                          />
                          <span className='text-white font-medium'>
                            {player.name}{' '}
                            <span className={`text-sm font-bold ${(slotNumber === 1 || slotNumber === 3) ? 'text-yellow-400' : 'text-blue-400'}`}>({(slotNumber === 1 || slotNumber === 3) ? "Team 1" : "Team 2"})</span>
                          </span>
                        </div>
                        <Button 
                           variant="ghost" 
                           size="icon" 
                           onClick={(e) => { 
                               e.stopPropagation();
                               handleRemovePlayer(slotNumber); 
                           }}
                           className="absolute top-1/2 right-2 transform -translate-y-1/2 text-gray-400 hover:text-white flex-shrink-0 p-1 h-8 w-8"
                           aria-label="Spieler entfernen"
                        >
                           <X size={18}/>
                        </Button>
                      </>
                    ) : (
                      <span className='text-gray-400 italic'>
                        {placeholderText}
                      </span>
                    )}
                  </div>
                );

                return (
                  <div key={slotNumber}>
                    {!player ? (
                      <PlayerSelectTournamentPopover
                        trigger={playerDisplayOrSelector}
                        participants={tournamentParticipants}
                        currentSelection={selectedGamePlayers as GamePlayers}
                        targetSlot={slotNumber}
                        onSelectParticipant={handlePlayerSelect}
                      />
                    ) : (
                      playerDisplayOrSelector
                    )}
                  </div>
                );
              })}
            </div>

            {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

            <motion.button
              initial={{scale: 0.9}}
              animate={{scale: 1}}
              whileTap={{scale: 0.95}}
              onClick={handleStartGame}
              className={`w-full text-white text-lg font-bold py-3 px-8 rounded-xl shadow-lg transition-colors border-b-4 min-h-[56px] flex items-center justify-center ${
                areAllSlotsFilled() && !isLoading && hasSelectedStartingPlayer && isCurrentUserInSelectedPasse 
                  ? "bg-green-600 hover:bg-green-700 border-green-900 cursor-pointer" 
                  : "bg-gray-500 border-gray-700 cursor-not-allowed opacity-70"
              }`}
              disabled={!areAllSlotsFilled() || isLoading || !hasSelectedStartingPlayer || !isCurrentUserInSelectedPasse}
              title={
                !areAllSlotsFilled() 
                  ? "Bitte wähle alle vier Spieler aus" 
                  : !hasSelectedStartingPlayer 
                    ? "Bitte wähle einen Startspieler (auf einen Spieler klicken)" 
                    : !isCurrentUserInSelectedPasse 
                      ? "Nur Spieler, die an dieser Passe teilnehmen, dürfen sie starten" 
                      : isLoading 
                        ? "Passe wird gestartet..." 
                        : "Passe starten"
              }
            >
              {isLoading ? <Loader2 className="animate-spin mr-2" /> : null}
              {dynamicPasseNumber}. Passe starten
            </motion.button>
            
            {!isCurrentUserInSelectedPasse && areAllSlotsFilled() && hasSelectedStartingPlayer && (
              <p className="text-amber-400 text-sm mt-2 text-center">
                Hinweis: Nur teilnehmende Spieler können die Passe starten.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TournamentStartScreen; 