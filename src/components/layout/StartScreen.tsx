import React, {useState, useEffect, MouseEvent} from "react";
import {useGameStore} from "../../store/gameStore";
import {useUIStore} from "../../store/uiStore";
import {useJassStore} from "../../store/jassStore";
import {useTimerStore} from "../../store/timerStore";
import {motion, AnimatePresence} from "framer-motion";
import {PlayerNames, TeamConfig, DEFAULT_TEAM_CONFIG, setTeamConfig, PlayerNumber, GamePlayers, PlayerInfo, MemberInfo, GuestInfo, ActiveGame, FarbeSettings, ScoreSettings, StrokeSettings} from "../../types/jass";
import {useTutorialStore} from "../../store/tutorialStore";
import {useGroupStore} from "../../store/groupStore";
import {useAuthStore} from "../../store/authStore";
import {PlayerSelectPopover} from "../player/PlayerSelectPopover";
import {AddGuestModal} from "../player/AddGuestModal";
import { X } from "lucide-react";
import { useRouter } from "next/router";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firebaseApp } from "@/services/firebaseInit";
import { createActiveGame, createSessionDocument, updateSessionActiveGameId } from "@/services/gameService";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import GlobalLoader from "./GlobalLoader";
import { Button } from "../ui/button";
import { getPlayerIdForUser } from "@/services/playerService";

// Importiere die Default-Einstellungen
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';

const screenVariants = {
  initial: {opacity: 0, scale: 0.95},
  visible: {opacity: 1, scale: 1},
  exit: {opacity: 0, scale: 0.95},
};

interface StartScreenProps {
  onCancel?: () => void;
}

const StartScreen: React.FC<StartScreenProps> = ({ onCancel }) => {
  const {setStartScreenState, showNotification} = useUIStore();
  const jassStore = useJassStore();
  const tutorialStore = useTutorialStore();
  const {user, status} = useAuthStore();
  const {currentGroup} = useGroupStore();
  const router = useRouter();

  const [gamePlayers, setGamePlayers] = useState<GamePlayers>({1: null, 2: null, 3: null, 4: null});
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [guestTargetSlot, setGuestTargetSlot] = useState<PlayerNumber | null>(null);
  const [names, setNames] = useState<PlayerNames>({ 1: '', 2: '', 3: '', 4: '' });
  const [teamConfig] = useState<TeamConfig>(DEFAULT_TEAM_CONFIG);
  const [startingPlayer, setStartingPlayer] = useState<PlayerNumber | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSelectedStartingPlayer, setHasSelectedStartingPlayer] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && user) {
      setGamePlayers((prev) => ({
        ...prev,
        1: {type: "member", uid: user.uid, name: user.displayName || "Ich"},
      }));
      setNames({ 1: user.displayName || "Ich", 2: '', 3: '', 4: '' });
    } else {
      setGamePlayers({1: null, 2: null, 3: null, 4: null});
      setNames({ 1: '', 2: '', 3: '', 4: '' });
    }
  }, [status, user]);

  // Flag setzen, wenn Komponente gemountet wird
  useEffect(() => {
    // Flag setzen für die Navigation zurück zum WelcomeScreen
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('comingFromStartScreen', 'true');
    }
  }, []);

  const areAllSlotsFilled = (players: GamePlayers): boolean => {
    return Object.values(players).every((player) => player !== null);
  };

  const areAllNamesEntered = (currentNames: PlayerNames): boolean => {
    return Object.values(currentNames).every(name => name.trim() !== '');
  };

  const handlePlayerFieldClick = (playerNumber: PlayerNumber) => {
    if (status === 'authenticated') {
      if (areAllSlotsFilled(gamePlayers)) {
        setStartingPlayer(playerNumber);
        setHasSelectedStartingPlayer(true);
      }
    } else {
      if (areAllNamesEntered(names)) {
        setStartingPlayer(playerNumber);
      }
    }
  };

  const handleSelectPlayerClick = (slotNumber: PlayerNumber) => {
    // Diese Funktion ist nun obsolet durch die Popover-Logik, kann aber für spätere Zwecke bleiben.
    console.log(`TODO: Auswahl für Slot ${slotNumber} öffnen`);
  };

  const handleMemberSelected = (slot: PlayerNumber, member: MemberInfo) => {
    const isAlreadySelected = Object.values(gamePlayers).some(p => p?.type === 'member' && p.uid === member.uid);

    if (isAlreadySelected) {
        showNotification({ type: 'warning', message: 'Dieser Spieler ist bereits einem anderen Slot zugewiesen.' });
        return;
    }

    setGamePlayers((prev) => ({
      ...prev,
      [slot]: member,
    }));
  };

  const handleRemovePlayer = (slot: PlayerNumber) => {
    setGamePlayers((prev) => ({ ...prev, [slot]: null }));
    if (startingPlayer === slot) {
        setStartingPlayer(null);
        setHasSelectedStartingPlayer(false);
    }
  };

  const handleOpenGuestModal = (slot: PlayerNumber) => {
    setGuestTargetSlot(slot);
    setIsGuestModalOpen(true);
  };

  const handleGuestAdded = (slot: PlayerNumber, guestInfo: GuestInfo) => {
    setGamePlayers((prev) => ({
      ...prev,
      [slot]: guestInfo,
    }));
  };

  const handleNameChange = (player: PlayerNumber, value: string) => {
    setNames(prev => ({ ...prev, [player]: value }));
  };

  const handleCancel = () => {
    // Wenn eine benutzerdefinierte onCancel-Funktion übergeben wird, rufe diese auf.
    // Dies wird für den Online-Flow unter /game/new verwendet.
    if (onCancel) {
      onCancel();
      return;
    }

    // Andernfalls führe die Standard-Logik für Gäste/Offline aus.
    if (useAuthStore.getState().isGuest) {
      useAuthStore.getState().clearGuestStatus();
      console.log("[StartScreen] Gastmodus zurückgesetzt vor der Navigation");
    }
    
    try {
      console.log("[StartScreen] Navigiere zur Register-Seite (Standard-Aktion)");
      router.push('/auth/register');
    } catch (err) {
      console.error("[StartScreen] Navigationsfehler:", err);
      window.location.href = '/auth/register';
    }
  };

  const handleStart = async () => {
    if (status === 'authenticated') {
      if (!areAllSlotsFilled(gamePlayers)) {
        showNotification({
          type: "warning",
          message: "Es wurden noch nicht alle Spieler zugewiesen.",
        });
        return;
      }
      if (!hasSelectedStartingPlayer || startingPlayer === null) {
        showNotification({ type: 'warning', message: 'Bitte wähle einen Startspieler aus (auf einen Spieler klicken).' });
        return;
      }
      const playerNamesForStore: PlayerNames = {
        1: gamePlayers[1]?.name ?? 'Spieler 1', 
        2: gamePlayers[2]?.name ?? 'Spieler 2',
        3: gamePlayers[3]?.name ?? 'Spieler 3',
        4: gamePlayers[4]?.name ?? 'Spieler 4',
      };
      await startGameFlow(playerNamesForStore, gamePlayers as Required<GamePlayers>);
    } else {
      const emptyNames = Object.entries(names).filter(([_, name]) => !name.trim());
      if (emptyNames.length > 0) {
        showNotification({
          type: 'warning',
          message: 'Es wurden nicht alle Spielernamen eingegeben. Möchtest du trotzdem fortfahren?',
          actions: [
            {
              label: 'Ohne\nNamen',
              onClick: async () => {
                const validatedNames: PlayerNames = {
                  1: names[1]?.trim() || 'Du',
                  2: names[2]?.trim() || 'Gegner 1',
                  3: names[3]?.trim() || 'Partner',
                  4: names[4]?.trim() || 'Gegner 2'
                };
                setNames(validatedNames);
                await startGameFlow(validatedNames);
              }
            },
            {
              label: 'Namen\neingeben',
              onClick: () => {
                const firstEmptyField = document.querySelector<HTMLInputElement>(`input[data-player="${emptyNames[0][0]}"]`);
                firstEmptyField?.focus();
              }
            }
          ]
        });
        return;
      }
      await startGameFlow(names);
    }
  };

  const startGameFlow = async (playerNames: PlayerNames, finalGamePlayers?: Required<GamePlayers>) => {
    if (startingPlayer === null) {
      toast.error("Bitte wähle einen Startspieler aus.");
      setIsLoading(false);
      return;
    }
    // console.log(`[StartScreen startGameFlow] STARTING - Initial values: startingPlayer=${startingPlayer}`);
    
    // NEU: Loading-State setzen
    setIsLoading(true);
    
    const auth = useAuthStore.getState();
    const uiStoreSettingsState = useUIStore.getState().settings; // Globale UI-Einstellungen aus dem UIStore holen

    // Bereite die initialSettings für den jassStore vor
    // Sicherer Zugriff, falls die Properties nicht direkt auf uiStoreSettingsState existieren
    // oder falls sie unter einem verschachtelten Objekt wie 'jassConfig' liegen.
    // Die genaue Struktur von UISettingsState müsste geprüft werden für eine typsichere Lösung.
    const initialSettingsForJassStore = {
      farbeSettings: (uiStoreSettingsState as any)?.farbeSettings ?? (uiStoreSettingsState as any)?.jassConfig?.farbeSettings ?? DEFAULT_FARBE_SETTINGS,
      scoreSettings: (uiStoreSettingsState as any)?.scoreSettings ?? (uiStoreSettingsState as any)?.jassConfig?.scoreSettings ?? DEFAULT_SCORE_SETTINGS,
      strokeSettings: (uiStoreSettingsState as any)?.strokeSettings ?? (uiStoreSettingsState as any)?.jassConfig?.strokeSettings ?? DEFAULT_STROKE_SETTINGS,
    };
    console.log("[StartScreen] Übergebe folgende initialSettings an jassStore.startJass:", JSON.parse(JSON.stringify(initialSettingsForJassStore)));

    if (auth.status !== 'authenticated' && !auth.isGuest) {
      console.log("[StartScreen startGameFlow] User ist nicht authentifiziert und kein Gast. Setze Gaststatus jetzt.", { status: auth.status, isGuest: auth.isGuest });
      auth.continueAsGuest();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log("[StartScreen startGameFlow] Nach continueAsGuest:", { 
        status: useAuthStore.getState().status, 
        isGuest: useAuthStore.getState().isGuest 
      });
    }

    if (tutorialStore.isActive) {
      // console.log("[StartScreen startGameFlow] Tutorial is active, ending it...");
      tutorialStore.endTutorial(true);
      // console.log(`[StartScreen startGameFlow] Tutorial ended. isActive: ${useTutorialStore.getState().isActive}`);
    }
    useUIStore.getState().resetStartScreen();
    // console.log("[StartScreen startGameFlow] UI Store reset.");
    // console.log("[StartScreen startGameFlow] Setting team config...");
    setTeamConfig(teamConfig);

    let activeGameId: string | null = null;
    let newSessionId: string | null = null;
    let groupId: string | null = null;
    let participantUids: string[] = [];
    let participantPlayerIds: string[] = [];

    if (status === 'authenticated' && user && finalGamePlayers) {
      // console.log("[StartScreen startGameFlow] Authenticated user detected. Preparing to create session and active game...");
      try {
        // 1. Session ID generieren
        newSessionId = nanoid(); 
        // console.log(`[StartScreen startGameFlow] Generated new Session ID: ${newSessionId}`);

        // 2. Teilnehmer-UIDs sammeln (wie bisher)
        const calculatedParticipantUids = Object.values(finalGamePlayers)
                                     .map(p => (p?.type === 'member' ? p.uid : null)) 
                                     .filter((uid): uid is string => !!uid);
        if (!calculatedParticipantUids.includes(user.uid)) {
            calculatedParticipantUids.push(user.uid);
        }
        const uniqueParticipantUids = [...new Set(calculatedParticipantUids)];
        participantUids = uniqueParticipantUids;
        groupId = currentGroup?.id ?? null;

        // 3. **NEU:** Session-Dokument in Firestore erstellen
        // console.log(`[StartScreen startGameFlow] Creating session document ${newSessionId}...`);
        await createSessionDocument(newSessionId, {
          groupId: groupId,
          participantUids: participantUids,
          playerNames: playerNames
        });
        // console.log(`[StartScreen startGameFlow] Session document ${newSessionId} created.`);

        // 4. Initiales activeGame-Dokument erstellen (wie bisher)
        const teamBottom = teamConfig.bottom;
        const teamTop = teamConfig.top;
        const initialGameDataForService: Omit<ActiveGame, 'createdAt' | 'lastUpdated' | 'status' | 'gameStartTime' | 'jassStartTime' | 'activeGameId'> & { groupId: string | null } = {
          groupId: groupId,
          sessionId: newSessionId,
          participantUids: uniqueParticipantUids, 
          playerNames: playerNames,
          teams: { top: teamTop, bottom: teamBottom }, 
          scores: { top: 0, bottom: 0 },
          striche: {
            top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
            bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
          },
          weisPoints: { top: 0, bottom: 0 },
          currentPlayer: startingPlayer,
          currentRound: 1,
          currentGameNumber: 1,
          startingPlayer: startingPlayer,
          initialStartingPlayer: startingPlayer,
        };

        // console.log("[StartScreen startGameFlow] Calling createActiveGame with data:", initialGameDataForService);
        // Stelle sicher, dass groupId ein string ist, bevor createActiveGame aufgerufen wird.
        // Wenn groupId null ist, wird ein leerer String verwendet, um den Typfehler zu beheben.
        // Die Logik, ob ein Spiel ohne Gruppe online erstellt werden soll, ist davon getrennt zu betrachten.
        const gameDataForCreation = {
          ...initialGameDataForService,
          groupId: initialGameDataForService.groupId ?? "", // Null zu Leerstring für den Aufruf
        };

        activeGameId = await createActiveGame(gameDataForCreation as Omit<ActiveGame, 'createdAt' | 'lastUpdated' | 'status' | 'gameStartTime' | 'jassStartTime' | 'activeGameId'> & { groupId: string });
        // console.log("[StartScreen startGameFlow] Active game created with ID: ", activeGameId);

        // 5. **NEU:** Session-Dokument mit der activeGameId aktualisieren
        // console.log(`[StartScreen startGameFlow] Updating session ${newSessionId} with activeGameId ${activeGameId}...`);
        await updateSessionActiveGameId(newSessionId, activeGameId);
        // console.log(`[StartScreen startGameFlow] Session ${newSessionId} updated.`);

        // 6. **NEU:** Teilnehmer-Player IDs sammeln
        const playerIdPromises = Object.values(finalGamePlayers)
                               .map(async (p) => {
                                 if (p?.type === 'member') {
                                   return await getPlayerIdForUser(p.uid, p.name);
                                 }
                                 return null;
                               });
        const resolvedPlayerIds = await Promise.all(playerIdPromises);
        participantPlayerIds = resolvedPlayerIds.filter((id): id is string => !!id);

      } catch (error) {
        // console.error("[StartScreen startGameFlow] Error creating session or active game: ", error);
        toast.error("Online-Spiel konnte nicht erstellt werden.");
        setIsLoading(false); // NEU: Loading-State zurücksetzen bei Fehler
        return;
      } finally {
        // console.log("[StartScreen startGameFlow] Firestore operations finished.");
      }
    } else {
      // console.log("[StartScreen startGameFlow] Starting game in guest mode or user not fully authenticated.");
    }

    // console.log("[StartScreen startGameFlow] Calling jassStore.startJass...");
    jassStore.startJass({
      playerNames: playerNames,
      initialStartingPlayer: startingPlayer, 
      activeGameId: activeGameId ?? undefined, // Use activeGameId if available
      sessionId: newSessionId ?? `local_${Date.now()}`, // Use newSessionId or generate local
      groupId: groupId,
      participantUids: participantUids,
      participantPlayerIds: participantPlayerIds,
      initialSettings: initialSettingsForJassStore, // NEU: Übergabe der Einstellungen
    });
    // console.log("[StartScreen startGameFlow] jassStore.startJass called.");
    
    // Session-Subscription (nur im Online-Modus)
    if (newSessionId) {
      // console.log(`[StartScreen startGameFlow] Subscribing to session ${newSessionId}...`);
      jassStore.subscribeToSession(newSessionId);
    }

    // console.log("[StartScreen startGameFlow] Navigating to /jass...");
    router.push('/jass');
    // console.log("[StartScreen startGameFlow] COMPLETED.");
    
    // NEU: Loading-State wird automatisch nach Navigation zurückgesetzt
    // Das passiert, wenn die StartScreen-Komponente unmounted wird
  };

  const getPlayerFieldClass = (playerNumber: PlayerNumber, isInput: boolean = false) => {
    const isAuth = status === 'authenticated';
    const allFilled = isAuth ? areAllSlotsFilled(gamePlayers) : areAllNamesEntered(names);
    
    // Logik für Startspieler-Auswahl
    const isSelectedAsStartingPlayer = allFilled && startingPlayer === playerNumber;

    if (isAuth) {
        const player = gamePlayers[playerNumber];
        const isTeamBottom = teamConfig.bottom.includes(playerNumber);
        const baseBg = isTeamBottom ? "bg-gray-500" : "bg-gray-700";
        const hoverBg = isTeamBottom ? "hover:bg-gray-600" : "hover:bg-gray-800";
        const teamBorderColor = isTeamBottom ? "border-l-yellow-400" : "border-l-blue-400";
        
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

    } else { // Bestehende Logik für Gastmodus
        const isStarting = allFilled && startingPlayer === playerNumber;
        const baseBg = "bg-gray-600";
        const hoverBg = "hover:bg-gray-700";
        const focusRing = "focus:ring-green-500 focus:border-green-500";

    let classes = `w-full p-3 outline-none ${baseBg} border transition-all duration-150 rounded-xl text-white`;
       classes += " placeholder-gray-300";

    if (isStarting) {
      classes += " border-yellow-500 ring-2 ring-yellow-500";
    } else {
      classes += " border-gray-600";
    }

        if (allFilled) {
       if (!isStarting) {
          classes += ` ${hoverBg} cursor-pointer`;
       }
       if (isInput) classes += ` ${focusRing}`; 
    } else if (isInput) {
       classes += ` ${focusRing}`; 
    }
    return classes;
    }
  };

  return (
    <AnimatePresence>
      {/* NEU: GlobalLoader wenn isLoading true ist */}
      {isLoading && <GlobalLoader message="Jasstafel wird geladen..." />}
      
      <motion.div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-90 z-50 p-4">
        <div className="relative bg-gray-800 bg-opacity-95 rounded-xl p-6 w-full max-w-xs space-y-6 shadow-lg text-center">
          <button
            onClick={handleCancel}
            className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors z-10"
            aria-label="Schliessen"
          >
            <X size={24} />
          </button>

          <h2 className={`text-2xl font-bold text-center mb-4 ${
            (status === 'authenticated' && areAllSlotsFilled(gamePlayers)) || (status !== 'authenticated' && areAllNamesEntered(names))
              ? "text-yellow-400"
              : "text-white"
            }`}
          >
            {status === 'authenticated' ?
              (areAllSlotsFilled(gamePlayers) ? "Startspieler wählen" : "Spieler erfassen") :
              (areAllNamesEntered(names) ? "Startspieler wählen" : "Spielernamen eingeben")
            }
          </h2>

          <h3 className="text-lg font-semibold text-white mb-4">
            Sitzreihenfolge:
          </h3>

          <div className="space-y-4">
            {status === 'authenticated' ? (
              <>
                {[1, 2, 3, 4].map((slotNum) => {
                  const playerNumber = slotNum as PlayerNumber;
                  const player = gamePlayers[playerNumber];

                  const isTeamBottom = teamConfig.bottom.includes(playerNumber);
                  const teamName = isTeamBottom ? "Team 1" : "Team 2";
                  const teamColor = isTeamBottom ? 'text-yellow-400' : 'text-blue-400';
                  const placeholderText = `Spieler (${teamName}) wählen...`;

                  const playerDisplayOrSelector = (
                    <div
                      key={`slotdisplay-${slotNum}`}
                      onClick={() => handlePlayerFieldClick(playerNumber)}
                      className={getPlayerFieldClass(playerNumber)}
                    >
                      {player ? (
                        <>
                          <span className='text-white font-medium'>
                            {player.name}{' '}
                            <span className={`text-sm font-bold ${teamColor}`}>
                              ({teamName})
                            </span>
                          </span>
                          <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => { 
                                  e.stopPropagation();
                                  handleRemovePlayer(playerNumber); 
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
                    <div key={slotNum}>
                      {!player ? (
                    <PlayerSelectPopover
                          trigger={playerDisplayOrSelector}
                      group={currentGroup}
                      currentSelection={gamePlayers}
                      targetSlot={playerNumber}
                      onSelectMember={handleMemberSelected}
                      onAddGuest={handleOpenGuestModal}
                    />
                      ) : (
                        playerDisplayOrSelector
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                {[1, 2, 3, 4].map((slotNum) => {
                  const playerNumber = slotNum as PlayerNumber;
                  return (
                    <input
                      key={slotNum}
                      type="text"
                      data-player={slotNum}
                      placeholder={
                        playerNumber === 1 ? "Deinen Namen eingeben..." :
                        (playerNumber === 2 ? "Gegner 1 eingeben..." :
                        (playerNumber === 3 ? "Partner eingeben..." :
                        "Gegner 2 eingeben..."))
                      }
                      value={names[playerNumber]}
                      onChange={(e) => handleNameChange(playerNumber, e.target.value)}
                      onClick={() => areAllNamesEntered(names) ? handlePlayerFieldClick(playerNumber) : undefined}
                      className={getPlayerFieldClass(playerNumber, true)}
                    />
                  );
                })}
              </>
            )}
          </div>

          <motion.button
            initial={{scale: 0.9}}
            animate={{scale: 1}}
            whileTap={{scale: 0.95}}
            onClick={handleStart}
            className={`w-full text-white text-lg font-bold py-4 px-8 rounded-xl shadow-lg transition-colors border-b-4 min-h-[56px] flex items-center justify-center ${
              (status === 'authenticated' ? areAllSlotsFilled(gamePlayers) && hasSelectedStartingPlayer : areAllNamesEntered(names) && startingPlayer) 
                ? "bg-green-600 hover:bg-green-700 border-green-900 cursor-pointer" 
                : "bg-gray-500 border-gray-700 cursor-not-allowed opacity-70"
            }`}
            disabled={status === 'authenticated' ? !areAllSlotsFilled(gamePlayers) || !hasSelectedStartingPlayer : !areAllNamesEntered(names) || !startingPlayer}
          >
            START
          </motion.button>
        </div>

        {status === 'authenticated' && (
          <AddGuestModal
            isOpen={isGuestModalOpen}
            onClose={() => setIsGuestModalOpen(false)}
            targetSlot={guestTargetSlot}
            onAddGuest={handleGuestAdded}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default StartScreen;
