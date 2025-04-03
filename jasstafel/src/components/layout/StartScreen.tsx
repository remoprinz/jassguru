import React, {useState, useEffect} from "react";
import {useGameStore} from "../../store/gameStore";
import {useUIStore} from "../../store/uiStore";
import {useJassStore} from "../../store/jassStore";
import {useTimerStore} from "../../store/timerStore";
import {motion, AnimatePresence} from "framer-motion";
import {PlayerNames, TeamConfig, DEFAULT_TEAM_CONFIG, setTeamConfig, PlayerNumber} from "../../types/jass";
import {useTutorialStore} from "../../store/tutorialStore";
import {useGroupStore} from "../../store/groupStore";
import {useAuthStore} from "../../store/authStore";
import {PlayerSelectPopover} from "../player/PlayerSelectPopover";
import {AddGuestModal} from "../player/AddGuestModal";

// NEUE DATENSTRUKTUR für Spieler (Mitglied oder Gast)
export type MemberInfo = { type: "member"; uid: string; name: string; };
export type GuestInfo = {
  type: "guest";
  name: string;
  email?: string | null;
  consent?: boolean; // Für E-Mail-Speicherung
};
export type PlayerInfo = MemberInfo | GuestInfo | null; // Null, wenn Slot leer ist

export type GamePlayers = {
  1: PlayerInfo;
  2: PlayerInfo;
  3: PlayerInfo;
  4: PlayerInfo;
};

const screenVariants = {
  initial: {opacity: 0, scale: 0.95},
  visible: {opacity: 1, scale: 1},
  exit: {opacity: 0, scale: 0.95},
};

const StartScreen: React.FC = () => {
  const {setStartScreenState, showNotification} = useUIStore();
  const jassStore = useJassStore();
  const tutorialStore = useTutorialStore();
  const {user} = useAuthStore();
  const {currentGroup} = useGroupStore();

  // State für Namen und Team-Konfiguration
  const [gamePlayers, setGamePlayers] = useState<GamePlayers>({1: null, 2: null, 3: null, 4: null});
  const [teamConfig] = useState<TeamConfig>(DEFAULT_TEAM_CONFIG);
  const [startingPlayer, setStartingPlayer] = useState<PlayerNumber>(1);

  // States für Gast-Modal
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [guestTargetSlot, setGuestTargetSlot] = useState<PlayerNumber | null>(null);

  // Spieler 1 (aktueller Nutzer) initial setzen
  useEffect(() => {
    if (user) {
      setGamePlayers((prev) => ({
        ...prev,
        1: {type: "member", uid: user.uid, name: user.displayName || "Ich"},
      }));
      setStartingPlayer(1);
    } else {
      setGamePlayers((prev) => ({...prev, 1: null}));
    }
  }, [user]);

  const getNextPlayer = (current: PlayerNumber): PlayerNumber => {
    return ((current % 4) + 1) as PlayerNumber;
  };

  const handleRotateClick = () => {
    setStartingPlayer((current) => getNextPlayer(current));
  };

  const areAllSlotsFilled = (players: GamePlayers): boolean => {
    return Object.values(players).every((player) => player !== null);
  };

  const handlePlayerFieldClick = (playerNumber: PlayerNumber) => {
    if (areAllSlotsFilled(gamePlayers)) {
      setStartingPlayer(playerNumber);
    }
  };

  const handleSelectPlayerClick = (slotNumber: PlayerNumber) => {
    if (slotNumber === 1) return;
    console.log(`TODO: Auswahl für Slot ${slotNumber} öffnen`);
  };

  const handleStart = async () => {
    if (!areAllSlotsFilled(gamePlayers)) {
      showNotification({
        type: "warning",
        message: "Es wurden noch nicht alle Spieler zugewiesen.",
      });
      return;
    }
    const finalGamePlayers = gamePlayers as Required<GamePlayers>;
    await startGameFlow(finalGamePlayers);
  };

  const startGameFlow = async (playersToStart: Required<GamePlayers>) => {
    if (tutorialStore.isActive) {
      console.log("🎓 Force ending tutorial on game start...");
      tutorialStore.endTutorial(true);
    }
    useUIStore.getState().resetStartScreen();
    console.log("🎮 StartScreen.handleStart:", {startingPlayer, teamConfig, playersToStart});
    setTeamConfig(teamConfig);

    const playerNamesForStore: PlayerNames = {
      1: playersToStart[1]?.name || "Spieler 1",
      2: playersToStart[2]?.name || "Spieler 2",
      3: playersToStart[3]?.name || "Spieler 3",
      4: playersToStart[4]?.name || "Spieler 4",
    };

    jassStore.startJass({playerNames: playerNamesForStore, initialStartingPlayer: startingPlayer});

    useGameStore.setState({
      gamePlayers: playersToStart,
      currentPlayer: startingPlayer,
      startingPlayer: startingPlayer,
      isGameStarted: true,
      currentRound: 1,
      isGameCompleted: false,
      isRoundCompleted: false,
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

  // Funktion, die aufgerufen wird, wenn ein Mitglied ausgewählt wurde
  const handleMemberSelected = (slot: PlayerNumber, member: MemberInfo) => {
    setGamePlayers((prev) => ({
      ...prev,
      [slot]: member,
    }));
  };

  // Callback, wenn "Als Gast hinzufügen" im Popover geklickt wird
  const handleOpenGuestModal = (slot: PlayerNumber) => {
    setGuestTargetSlot(slot); // Speichere, für welchen Slot der Gast ist
    setIsGuestModalOpen(true);
  };

  // Callback, wenn Gast im Modal hinzugefügt wird
  const handleGuestAdded = (slot: PlayerNumber, guestInfo: GuestInfo) => {
    setGamePlayers((prev) => ({
      ...prev,
      [slot]: guestInfo,
    }));
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-90 z-50 p-4">
        <div className="bg-gray-800 bg-opacity-95 rounded-xl p-6 w-full max-w-xs space-y-6 shadow-lg text-center">
          <h2 className="text-2xl font-bold text-white text-center mb-4">
            {areAllSlotsFilled(gamePlayers) ?
              "Startspieler wählen" :
              "Spieler zuweisen"
            }
          </h2>

          <h3 className="text-lg font-semibold text-white mb-4">
            Sitzreihenfolge:
          </h3>

          <div className="space-y-4">
            <div
              data-player="1"
              onClick={() => handlePlayerFieldClick(1)}
              className={`w-full p-3 outline-none ${teamConfig.bottom.includes(1) ? "bg-gray-500" : "bg-gray-800"} 
                border transition-all duration-150 rounded-xl text-white 
                ${areAllSlotsFilled(gamePlayers) ?
      startingPlayer === 1 ?
        "border-yellow-500 ring-2 ring-yellow-500 focus:ring-yellow-500 focus:border-yellow-500" :
        "border-gray-600 hover:bg-gray-700 cursor-pointer focus:ring-yellow-500 focus:border-yellow-500" :
      "border-gray-600 focus:ring-2 focus:ring-green-500 focus:border-green-500"
    }`}
            >
              {gamePlayers[1]?.name || "Du"}
            </div>

            {[2, 3, 4].map((slotNum) => {
              const playerNumber = slotNum as PlayerNumber;
              const teamClass = teamConfig.top.includes(playerNumber) ? "bg-gray-700" : "bg-gray-500";
              const player = gamePlayers[playerNumber];
              const isStarting = areAllSlotsFilled(gamePlayers) && startingPlayer === playerNumber;
              const canSelectStarting = areAllSlotsFilled(gamePlayers);

              // Das Trigger-Element für das Popover
              const triggerElement = (
                <div
                  key={`trigger-${slotNum}`} // Eindeutiger Key für Trigger
                  data-player={slotNum}
                  // onClick nur noch für Startspieler-Auswahl, wenn Slot belegt
                  onClick={() => player && canSelectStarting ? handlePlayerFieldClick(playerNumber) : undefined}
                  className={`w-full p-3 outline-none ${teamClass} 
                    border transition-all duration-150 rounded-xl text-white 
                    ${player ? "" : "text-gray-400 italic"} 
                    ${isStarting ?
                  "border-yellow-500 ring-2 ring-yellow-500" :
                  canSelectStarting && player ? "border-gray-600 hover:bg-gray-700 cursor-pointer" : "border-gray-600"
                } 
                    ${!player ? "cursor-pointer hover:bg-gray-600" : ""}`}
                >
                  {player ? player.name : `Spieler ${slotNum} wählen...`}
                </div>
              );

              return (
                <PlayerSelectPopover
                  key={slotNum} // Eindeutiger Key für Popover
                  trigger={triggerElement}
                  group={currentGroup} // Aktuelle Gruppe übergeben
                  currentSelection={gamePlayers}
                  targetSlot={playerNumber}
                  onSelectMember={handleMemberSelected}
                  onAddGuest={handleOpenGuestModal} // Geändert: Öffnet Gast-Modal
                >
                  {/* Der Trigger wird innerhalb des Popovers gerendert */}
                </PlayerSelectPopover>
              );
            })}
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
        </div>

        <motion.button
          initial={{scale: 0.9}}
          animate={{scale: 1}}
          whileTap={{scale: 0.95}}
          onClick={handleStart}
          className="bg-green-600 text-white text-2xl font-bold py-6 px-12 rounded-xl shadow-lg hover:bg-green-700 transition-colors mt-6 border-b-4 border-green-900"
        >
          START
        </motion.button>
      </motion.div>

      {/* Gast-Modal rendern */}
      <AddGuestModal
        isOpen={isGuestModalOpen}
        onClose={() => setIsGuestModalOpen(false)}
        targetSlot={guestTargetSlot}
        onAddGuest={handleGuestAdded}
      />
    </AnimatePresence>
  );
};

export default StartScreen;
