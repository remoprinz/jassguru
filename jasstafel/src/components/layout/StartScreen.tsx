import React, {useState, useEffect, MouseEvent} from "react";
import {useGameStore} from "../../store/gameStore";
import {useUIStore} from "../../store/uiStore";
import {useJassStore} from "../../store/jassStore";
import {useTimerStore} from "../../store/timerStore";
import {motion, AnimatePresence} from "framer-motion";
import {PlayerNames, TeamConfig, DEFAULT_TEAM_CONFIG, setTeamConfig, PlayerNumber, GamePlayers, PlayerInfo, MemberInfo, GuestInfo} from "../../types/jass";
import {useTutorialStore} from "../../store/tutorialStore";
import {useGroupStore} from "../../store/groupStore";
import {useAuthStore} from "../../store/authStore";
import {PlayerSelectPopover} from "../player/PlayerSelectPopover";
import {AddGuestModal} from "../player/AddGuestModal";
import { X } from "lucide-react";
import { useRouter } from "next/router";

const screenVariants = {
  initial: {opacity: 0, scale: 0.95},
  visible: {opacity: 1, scale: 1},
  exit: {opacity: 0, scale: 0.95},
};

const StartScreen: React.FC = () => {
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
  const [startingPlayer, setStartingPlayer] = useState<PlayerNumber>(1);

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

  const getNextPlayer = (current: PlayerNumber): PlayerNumber => {
    return ((current % 4) + 1) as PlayerNumber;
  };

  const handleRotateClick = () => {
    setStartingPlayer((current) => getNextPlayer(current));
  };

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
      }
    } else {
      if (areAllNamesEntered(names)) {
        setStartingPlayer(playerNumber);
      }
    }
  };

  const handleSelectPlayerClick = (slotNumber: PlayerNumber) => {
    if (slotNumber === 1) return;
    console.log(`TODO: Auswahl für Slot ${slotNumber} öffnen`);
  };

  const handleMemberSelected = (slot: PlayerNumber, member: MemberInfo) => {
    setGamePlayers((prev) => ({
      ...prev,
      [slot]: member,
    }));
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
    router.push('/');
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
    if (tutorialStore.isActive) {
      console.log("🎓 Force ending tutorial on game start...");
      tutorialStore.endTutorial(true);
    }
    useUIStore.getState().resetStartScreen();
    console.log("🎮 StartScreen.startGameFlow:", {startingPlayer, teamConfig, playerNames, finalGamePlayers});
    setTeamConfig(teamConfig);

    jassStore.startJass({playerNames: playerNames, initialStartingPlayer: startingPlayer});

    useGameStore.setState({
      currentPlayer: startingPlayer,
      startingPlayer: startingPlayer,
      isGameStarted: true,
      currentRound: 1,
      isGameCompleted: false,
      isRoundCompleted: false,
      playerNames: playerNames,
      gamePlayers: finalGamePlayers ? finalGamePlayers : {
        1: { type: "guest", name: playerNames[1] ?? 'Spieler 1' },
        2: { type: "guest", name: playerNames[2] ?? 'Spieler 2' },
        3: { type: "guest", name: playerNames[3] ?? 'Spieler 3' },
        4: { type: "guest", name: playerNames[4] ?? 'Spieler 4' },
      }
    });

    console.log("🎲 GameStore Updated:", useGameStore.getState());
    const timerStore = useTimerStore.getState();
    timerStore.resetGameTimers();
    timerStore.startGameTimer();
    timerStore.startRoundTimer();
    setStartScreenState("starting");
    await new Promise((resolve) => setTimeout(resolve, 300));
    setStartScreenState("complete");
  };

  const getPlayerFieldClass = (playerNumber: PlayerNumber, isInput: boolean = false) => {
    const isActiveModeFilled = status === 'authenticated' ? areAllSlotsFilled(gamePlayers) : areAllNamesEntered(names);
    const isStarting = startingPlayer === playerNumber;
    const canSelectStartingViaClick = isActiveModeFilled;
    const baseBg = teamConfig.bottom.includes(playerNumber) ? "bg-gray-500" : (status === 'authenticated' ? "bg-gray-700" : "bg-gray-600");
    const hoverBg = status === 'authenticated' ? "hover:bg-gray-700" : "hover:bg-gray-700";
    const focusRing = areAllNamesEntered(names) ? "focus:ring-yellow-500 focus:border-yellow-500" : "focus:ring-green-500 focus:border-green-500";

    let classes = `w-full p-3 outline-none ${baseBg} border transition-all duration-150 rounded-xl text-white`;

    if (isInput) {
       classes += " placeholder-gray-300";
    }

    if (isStarting) {
      classes += " border-yellow-500 ring-2 ring-yellow-500";
    } else {
      classes += " border-gray-600";
    }

    if (canSelectStartingViaClick) {
       if (!isStarting) {
          classes += ` ${hoverBg} cursor-pointer`;
       }
       if (isInput) classes += ` ${focusRing}`; 
    } else if (isInput) {
       classes += ` ${focusRing}`; 
    }
    
    if (status === 'authenticated' && !gamePlayers[playerNumber] && playerNumber !== 1) {
       classes += " text-gray-400 italic cursor-pointer hover:bg-gray-600";
    }
    if (status === 'authenticated' && !gamePlayers[playerNumber] && playerNumber !== 1) {
      // Klick wird durch Popover behandelt
    } else if (status !== 'authenticated' && !names[playerNumber]) {
      // Keine spezielle Klasse für leere Inputs nötig
    }

    return classes;
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-90 z-50 p-4">
        <div className="relative bg-gray-800 bg-opacity-95 rounded-xl p-6 w-full max-w-xs space-y-6 shadow-lg text-center">
          <button
            onClick={handleCancel}
            className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors z-10"
            aria-label="Schliessen"
          >
            <X size={24} />
          </button>

          <h2 className="text-2xl font-bold text-white text-center mb-4">
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
                <div
                  data-player="1"
                  onClick={() => handlePlayerFieldClick(1)}
                  className={getPlayerFieldClass(1)}
                >
                  {gamePlayers[1]?.name || "Ich"}
                </div>

                {[2, 3, 4].map((slotNum) => {
                  const playerNumber = slotNum as PlayerNumber;
                  const player = gamePlayers[playerNumber];
                  const triggerElement = (
                    <div
                      key={`trigger-${slotNum}`}
                      data-player={slotNum}
                      onClick={() => player && areAllSlotsFilled(gamePlayers) ? handlePlayerFieldClick(playerNumber) : undefined}
                      className={getPlayerFieldClass(playerNumber)}
                    >
                      {player ? player.name : 
                       (playerNumber === 2 ? "Gegner 1 wählen..." :
                       (playerNumber === 3 ? "Partner wählen..." :
                       "Gegner 2 wählen..."))}
                    </div>
                  );

                  return (
                    <PlayerSelectPopover
                      key={slotNum}
                      trigger={triggerElement}
                      group={currentGroup}
                      currentSelection={gamePlayers}
                      targetSlot={playerNumber}
                      onSelectMember={handleMemberSelected}
                      onAddGuest={handleOpenGuestModal}
                    />
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
            onClick={handleRotateClick}
            className="w-full p-2 bg-yellow-600 text-white rounded-xl
              transition-colors border-b-4 border-yellow-900"
            whileTap={{scale: 0.95}}
            animate={{opacity: 1}}
            transition={{duration: 0}}
          >
            Rosen 10 (Startspieler)
          </motion.button>

          <motion.button
            initial={{scale: 0.9}}
            animate={{scale: 1}}
            whileTap={{scale: 0.95}}
            onClick={handleStart}
            className="w-full bg-green-600 text-white text-lg font-bold py-4 px-8 rounded-xl shadow-lg hover:bg-green-700 transition-colors border-b-4 border-green-900"
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
