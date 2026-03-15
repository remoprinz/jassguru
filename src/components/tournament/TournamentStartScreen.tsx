"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Loader2 } from 'lucide-react';
import type { PlayerNumber, GamePlayers, FirestorePlayer, MemberInfo } from '@/types/jass';
import { useTournamentStore, ParticipantWithProgress } from '@/store/tournamentStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { PlayerSelectTournamentPopover } from './PlayerSelectTournamentPopover';
import GlobalLoader from '@/components/layout/GlobalLoader';
import ProfileImage from '@/components/ui/ProfileImage';
import { collection, query, where, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '@/services/firebaseInit';
import { isPlayerAvailableForPasse, calculateCompletedPassesCountFromGames } from '@/utils/tournamentPasseUtils';

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
  const currentTournamentGames = useTournamentStore((state) => state.currentTournamentGames); // ✅ NEU
  const showNotification = useUIStore((state) => state.showNotification);

  const [selectedGamePlayers, setSelectedGamePlayers] = useState<TournamentGamePlayers>({ 1: null, 2: null, 3: null, 4: null });
  const [startingPlayer, setStartingPlayer] = useState<PlayerNumber | null>(null);
  const [hasSelectedStartingPlayer, setHasSelectedStartingPlayer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // NEU: Zustand für die Überprüfung, ob der aktuelle Benutzer Teil der ausgewählten Spieler ist
  const [isCurrentUserInSelectedPasse, setIsCurrentUserInSelectedPasse] = useState(false);
  
  // 🆕 NEU: Zustand für Spieler, die bereits in einer aktiven Passe sind
  const [playersInActivePasses, setPlayersInActivePasses] = useState<Set<string>>(new Set());
  const activePassesListenerRef = useRef<Unsubscribe | null>(null);
  
  // 🆕 REALTIME: Dynamischer Buchstabe basierend auf bereits gestarteten Passen
  const [dynamicPasseLetter, setDynamicPasseLetter] = useState<string>('A');
  const passeLetterListenerRef = useRef<Unsubscribe | null>(null);
  
  // 🚀 PERFORMANCE-FIX: Optimierter Lookup-Map für Avatar-URLs (statt wiederholter Array-Suche)
  const memberPhotoUrlMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    members.forEach(member => {
      // Erstelle Lookup nach userId (priorisiert) und displayName (Fallback)
      if (member.userId) {
        map.set(member.userId, member.photoURL || undefined);
      }
      if (member.displayName) {
        map.set(member.displayName, member.photoURL || undefined);
      }
    });
    return map;
  }, [members]);

  // 🚀 PERFORMANCE-FIX: Zusätzlicher Lookup für tournamentParticipants (kann auch photoURL enthalten)
  const participantPhotoUrlMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    tournamentParticipants.forEach(participant => {
      if (participant.uid) {
        map.set(participant.uid, participant.photoURL);
      }
    });
    return map;
  }, [tournamentParticipants]);

  // Hilfsfunktion für schnellen Avatar-URL Lookup
  const getPlayerPhotoUrl = (player: (MemberInfo & { playerId: string }) | null): string | undefined => {
    if (!player || player.type !== 'member') return undefined;
    // Zuerst in tournamentParticipants suchen (aktueller Kontext)
    if (player.uid && participantPhotoUrlMap.has(player.uid)) {
      return participantPhotoUrlMap.get(player.uid);
    }
    // Dann in members suchen
    if (player.uid && memberPhotoUrlMap.has(player.uid)) {
      return memberPhotoUrlMap.get(player.uid);
    }
    // Fallback: nach Name suchen
    if (player.name && memberPhotoUrlMap.has(player.name)) {
      return memberPhotoUrlMap.get(player.name);
    }
    return undefined;
  };
  
  // EINFACHE LÖSUNG: Dynamische Passe-Nummer basierend auf ausgewählten Spielern
  const dynamicPasseNumber = React.useMemo(() => {
    const selectedPlayers = Object.values(selectedGamePlayers).filter(p => p !== null);
    if (selectedPlayers.length === 0) {
      // Keine Spieler ausgewählt → Zeige die Standard-Nummer vom Parent
      return currentPasseNumber;
    }
    
    // ✅ KRITISCH: Filtere NUR abgeschlossene Games für korrekte Zählung
    const completedGamesOnly = (currentTournamentGames || []).filter(g => g.completedAt);
    
    // Spieler ausgewählt → Zeige IHRE nächste Passe (Minimum der completedPassesCount + 1)
    const completedCounts = selectedPlayers.map(p => {
      // ✅ Berechne completedPassesCount DYNAMISCH (in Echtzeit!)
      return calculateCompletedPassesCountFromGames(p!.uid, completedGamesOnly);
    });
    return Math.min(...completedCounts) + 1;
  }, [selectedGamePlayers, currentPasseNumber, currentTournamentGames]); // ✅ Abhängigkeit von currentTournamentGames!

  useEffect(() => {
    if (!isVisible) {
      setSelectedGamePlayers({ 1: null, 2: null, 3: null, 4: null });
      setStartingPlayer(null);
      setHasSelectedStartingPlayer(false);
      setIsLoading(false);
      setError(null);
      setIsCurrentUserInSelectedPasse(false); // Zurücksetzen bei Schließen
      // Cleanup: Listener entfernen
      if (activePassesListenerRef.current) {
        activePassesListenerRef.current();
        activePassesListenerRef.current = null;
      }
      if (passeLetterListenerRef.current) {
        passeLetterListenerRef.current();
        passeLetterListenerRef.current = null;
      }
      setPlayersInActivePasses(new Set());
      setDynamicPasseLetter('A');
    }
  }, [isVisible]);

  // 🆕 NEU: Automatisch den aktuellen Benutzer in Slot 1 setzen, wenn Screen geöffnet wird
  useEffect(() => {
    if (!isVisible || !user?.uid || tournamentParticipants.length === 0) {
      return;
    }

    // Warte kurz, damit playersInActivePasses geladen werden kann
    const timer = setTimeout(() => {
      const currentUserParticipant = tournamentParticipants.find(p => p.uid === user.uid);
      if (currentUserParticipant && !playersInActivePasses.has(user.uid)) {
        // Setze den User nur, wenn Slot 1 noch leer ist
        setSelectedGamePlayers(prev => {
          if (prev[1] === null) {
            return {
              ...prev,
              1: {
                type: 'member',
                uid: currentUserParticipant.uid,
                playerId: currentUserParticipant.playerId || currentUserParticipant.uid,
                name: currentUserParticipant.displayName || `Spieler 1`
              }
            };
          }
          return prev;
        });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isVisible, user?.uid, tournamentParticipants, playersInActivePasses]);

  // 🆕 NEU: Listener für alle aktiven Passen des Turniers einrichten
  useEffect(() => {
    if (!isVisible || !tournamentId) {
      return;
    }

    console.log(`[TournamentStartScreen] Setting up active passes listener for tournament ${tournamentId}`);
    
    // Query für alle aktiven Passen dieses Turniers
    const activePassesQuery = query(
      collection(db, 'activeGames'),
      where('tournamentInstanceId', '==', tournamentId),
      where('status', '==', 'live')
    );

    // Listener einrichten
    const unsubscribe = onSnapshot(
      activePassesQuery,
      (snapshot) => {
        try {
          // Sammle alle participantUids aus allen aktiven Passen
          const uidsInActivePasses = new Set<string>();
          
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const participantUids = data.participantUids || [];
            
            // Füge alle UIDs dieser Passe zum Set hinzu
            participantUids.forEach((uid: string) => {
              if (uid) {
                uidsInActivePasses.add(uid);
              }
            });
          });

          console.log(`[TournamentStartScreen] Found ${uidsInActivePasses.size} players in active passes:`, Array.from(uidsInActivePasses));
          setPlayersInActivePasses(uidsInActivePasses);
        } catch (error) {
          console.error('[TournamentStartScreen] Error processing active passes snapshot:', error);
        }
      },
      (error) => {
        console.error('[TournamentStartScreen] Error in active passes listener:', error);
        setPlayersInActivePasses(new Set());
      }
    );

    activePassesListenerRef.current = unsubscribe;

    // Cleanup beim Unmount
    return () => {
      if (activePassesListenerRef.current) {
        activePassesListenerRef.current();
        activePassesListenerRef.current = null;
      }
    };
  }, [isVisible, tournamentId]);

  // 🆕 REALTIME: Listener für dynamischen Buchstaben basierend auf Passe-Nummer
  useEffect(() => {
    if (!isVisible || !tournamentId) {
      setDynamicPasseLetter('A');
      return;
    }

    // Berechne die Passe-Nummer basierend auf ausgewählten Spielern (oder currentPasseNumber als Fallback)
    const targetPasseNumber = dynamicPasseNumber;

    console.log(`[TournamentStartScreen] Setting up passe letter listener for tournament ${tournamentId}, passe ${targetPasseNumber}`);
    
    // Query für ALLE aktiven Passen dieses Turniers
    // Wir filtern dann manuell nach der Passe-Nummer, weil Firestore manchmal Probleme mit mehreren where() hat
    const activePassesQuery = query(
      collection(db, 'activeGames'),
      where('tournamentInstanceId', '==', tournamentId),
      where('status', '==', 'live')
    );

    // Listener einrichten
    const unsubscribe = onSnapshot(
      activePassesQuery,
      (snapshot) => {
        try {
          // Sammle alle bereits verwendeten Buchstaben für diese Passe-Nummer
          const usedLetters = new Set<string>();
          let matchingDocs = 0;
          
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const docPasseNumber = data.passeTournamentNumber || data.currentGameNumber;
            
            // ✅ KRITISCH: Nur Passen mit der richtigen Nummer berücksichtigen
            if (docPasseNumber === targetPasseNumber) {
              matchingDocs++;
              const passeInRound = data.passeInRound;
              
              if (passeInRound) {
                usedLetters.add(passeInRound);
                console.log(`[TournamentStartScreen] Found active passe ${targetPasseNumber}${passeInRound} (doc: ${doc.id})`);
              }
            }
          });

          // ✅ KRITISCH: Berechne die maximale Anzahl an Tischen für dieses Turnier
          const totalParticipants = tournamentParticipants.length;
          const maxTische = Math.floor(totalParticipants / 4);
          
          // Finde den nächsten freien Buchstaben (aber nur bis maxTische!)
          const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          let nextLetter = 'A';
          
          for (let i = 0; i < Math.min(letters.length, maxTische); i++) {
            if (!usedLetters.has(letters[i])) {
              nextLetter = letters[i];
              break;
            }
          }
          
          // ✅ SICHERHEITSCHECK: Falls alle erlaubten Tische belegt sind, zeige den letzten möglichen Buchstaben
          if (usedLetters.size >= maxTische) {
            nextLetter = letters[maxTische - 1]; // Z.B. bei 8 Spielern (2 Tische): B ist der letzte
            console.log(`[TournamentStartScreen] ⚠️ Passe ${targetPasseNumber}: Alle ${maxTische} Tische belegt! Zeige letzten: ${nextLetter}`);
          }

          console.log(`[TournamentStartScreen] Passe ${targetPasseNumber}: Total ${totalParticipants} Spieler → max ${maxTische} Tische. Found ${matchingDocs} active games, Used letters:`, Array.from(usedLetters), '→ Next:', nextLetter);
          setDynamicPasseLetter(nextLetter);
        } catch (error) {
          console.error('[TournamentStartScreen] Error processing passe letter snapshot:', error);
          setDynamicPasseLetter('A');
        }
      },
      (error) => {
        console.error('[TournamentStartScreen] Error in passe letter listener:', error);
        setDynamicPasseLetter('A');
      }
    );

    passeLetterListenerRef.current = unsubscribe;

    // Cleanup beim Unmount
    return () => {
      if (passeLetterListenerRef.current) {
        passeLetterListenerRef.current();
        passeLetterListenerRef.current = null;
      }
    };
  }, [isVisible, tournamentId, dynamicPasseNumber]);

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

    // ❌ ENTFERNT: Diese Logik war falsch! Spieler in aktiven Passen dürfen ausgewählt werden,
    // solange sie alle dieselbe nächste Passe haben. Der Check erfolgt erst beim Start!
    // if (playersInActivePasses.has(participant.uid)) {
    //   showNotification({ type: 'warning', message: 'Dieser Spieler spielt gerade eine Passe und kann nicht ausgewählt werden.' });
    //   return;
    // }

    const slotNumber = Number(slot) as PlayerNumber;

    // ❌ KOMPLETT ENTFERNT: Keine Einschränkungen mehr bei der Auswahl!
    // Spieler können FREI kombiniert werden, die Validierung erfolgt erst beim Start!

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

    // 🎯 KRITISCHE VALIDIERUNG: Alle ausgewählten Spieler müssen verfügbar sein
    const selected = Object.entries(selectedGamePlayers)
      .filter(([_, p]) => p !== null)
      .map(([slotKey, p_val]) => ({ slotKey, p_val: p_val as (MemberInfo & { playerId: string; uid: string; name: string }) }));

    // Sammle UIDs aller Spieler in aktiven Passen
    const playersInActivePassesSet = new Set<string>();
    if (playersInActivePasses) {
      playersInActivePasses.forEach(uid => playersInActivePassesSet.add(uid));
    }

    // Prüfe jeden Spieler:
    // 1. Hat dieser Spieler die dynamicPasseNumber noch nicht gespielt?
    // 2. Ist dieser Spieler nicht in einer aktiven Passe?
    const invalidPlayers: string[] = [];
    for (const { slotKey, p_val } of selected) {
      const participant = tournamentParticipants.find(tp => tp.uid === p_val.uid);
      if (!participant) {
        invalidPlayers.push(`Spieler ${p_val.name} (Slot ${slotKey}): Nicht im Turnier gefunden`);
        continue;
      }
      
      // ✅ KRITISCH: Berechne completedPassesCount DYNAMISCH (NUR aus abgeschlossenen Games!)
      const completedGamesOnly = (currentTournamentGames || []).filter(g => g.completedAt);
      const dynamicCompletedPassesCount = calculateCompletedPassesCountFromGames(
        p_val.uid,
        completedGamesOnly
      );
      
      // Erstelle temporären Participant mit dynamischem Count für Validierung
      const participantWithDynamicCount = {
        ...participant,
        completedPassesCount: dynamicCompletedPassesCount
      };
      
      // Prüfe Verfügbarkeit mit shared Helper
      const available = isPlayerAvailableForPasse(
        participantWithDynamicCount,
        dynamicPasseNumber,
        playersInActivePassesSet
      );
      
      if (!available) {
        if (dynamicCompletedPassesCount >= dynamicPasseNumber) {
          invalidPlayers.push(`${p_val.name}: Hat Passe ${dynamicPasseNumber} bereits gespielt (${dynamicCompletedPassesCount} abgeschlossen)`);
        } else if (playersInActivePassesSet.has(p_val.uid)) {
          invalidPlayers.push(`${p_val.name}: Spielt gerade eine aktive Passe`);
        }
      }
    }
    
    // Falls ungültige Spieler gefunden: Zeige Fehler und breche ab
    if (invalidPlayers.length > 0) {
      const errorMsg = `Nicht alle Spieler sind für Passe ${dynamicPasseNumber} verfügbar:\n\n${invalidPlayers.join('\n')}`;
      showNotification({ type: 'error', message: errorMsg });
      console.error('[TournamentStartScreen] Validation failed:', invalidPlayers);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    try {
      const playersForPasse = Object.entries(selectedGamePlayers)
        .filter(([_, p]) => p !== null)
        .map(([slotKey, p_val]) => {
          if (!p_val || p_val.type !== 'member') throw new Error(`Ungültiger Spieler in Slot ${slotKey}`);
          // Finde den Teilnehmer im tournamentParticipants-Array
          const participant = tournamentParticipants.find(tp => tp.uid === p_val.uid);
          if (!participant) throw new Error(`Teilnehmer mit uid ${p_val.uid} wurde nicht gefunden`);
          
          // ✅ KRITISCH: Berechne completedPassesCount DYNAMISCH (NUR aus abgeschlossenen Games!)
          const completedGamesOnly = (currentTournamentGames || []).filter(g => g.completedAt);
          const dynamicCompletedPassesCount = calculateCompletedPassesCountFromGames(
            p_val.uid,
            completedGamesOnly
          );
          
          return { 
            uid: p_val.uid, 
            playerId: p_val.playerId, // ✅ Player ID
            name: p_val.name, 
            playerNumber: Number(slotKey) as PlayerNumber,
            completedPassesCount: dynamicCompletedPassesCount, // ✅ Dynamisch berechnet!
            photoURL: participant.photoURL
          };
        });

      const activeGameId = await startNewPasseAction(tournamentId, playersForPasse, startingPlayer as PlayerNumber);
      if (onPasseStarted && activeGameId) {
        // ✅ NEU: Setze globalen Loading-State BEVOR Navigation startet
        // Das stellt sicher, dass [instanceId].tsx überdeckt wird während der Navigation
        useUIStore.getState().setLoading(true);
        onPasseStarted(activeGameId);
      }
      onClose();
    } catch (err) {
      console.error('Fehler beim Starten des Spiels:', err);
      setError(`Fehler beim Starten des Spiels: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
      // ✅ NEU: Setze globalen Loading-State auch bei Fehler zurück
      useUIStore.getState().setLoading(false);
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
          className="fixed inset-0 flex flex-col items-center justify-center chalkboard-fixed z-50 p-4 overflow-y-auto"
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
                            src={getPlayerPhotoUrl(player)}
                            alt={player.name} 
                            size="md"
                            className="mr-3 flex-shrink-0"
                            fallbackClassName="bg-gray-600 text-gray-300 text-base"
                            fallbackText={player.name.charAt(0).toUpperCase()}
                            priority={true}
                            context="hero"
                            lazy={false}
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
                        playersInActivePasses={playersInActivePasses}
                        passeNumber={dynamicPasseNumber}
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
                areAllSlotsFilled() && !isLoading && hasSelectedStartingPlayer
                  ? "bg-green-600 hover:bg-green-700 border-green-900 cursor-pointer" 
                  : "bg-gray-500 border-gray-700 cursor-not-allowed opacity-70"
              }`}
              disabled={!areAllSlotsFilled() || isLoading || !hasSelectedStartingPlayer}
              title={
                !areAllSlotsFilled() 
                  ? "Bitte wähle alle vier Spieler aus" 
                  : !hasSelectedStartingPlayer 
                    ? "Bitte wähle einen Startspieler (auf einen Spieler klicken)" 
                    : isLoading 
                      ? "Passe wird gestartet..." 
                      : "Passe starten"
              }
            >
              {isLoading ? <Loader2 className="animate-spin mr-2" /> : null}
              Passe {dynamicPasseNumber}{dynamicPasseLetter} starten
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TournamentStartScreen; 