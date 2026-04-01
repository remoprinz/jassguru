import React, {useState, useEffect, MouseEvent, useMemo} from "react";
import {useGameStore} from "../../store/gameStore";
import {useUIStore} from "../../store/uiStore";
import {useJassStore} from "../../store/jassStore";
import {useTimerStore} from "../../store/timerStore";
import {motion} from "framer-motion";
import {PlayerNames, TeamConfig, DEFAULT_TEAM_CONFIG, setTeamConfig, PlayerNumber, GamePlayers, PlayerInfo, MemberInfo, GuestInfo, ActiveGame, FarbeSettings, ScoreSettings, StrokeSettings} from "../../types/jass";
import {useTutorialStore} from "../../store/tutorialStore";
import {useGroupStore} from "../../store/groupStore";
import {useAuthStore} from "../../store/authStore";
import {PlayerSelectPopover} from "../player/PlayerSelectPopover";
import {AddGuestModal} from "../player/AddGuestModal";
import { X } from "lucide-react";
import { IoMdArrowRoundBack } from "react-icons/io";
import { useRouter } from "next/router";
import { createActiveGame, createSessionDocument, updateSessionActiveGameId, updateSessionParticipantPlayerIds } from "@/services/gameService";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { getPlayerIdForUser } from "@/services/playerService";
import { shouldShowiOSScreenLockWarning, createSimpleiOSScreenLockNotification, markiOSScreenLockWarningAsShown } from "@/utils/iosNotificationHelper";
import { getWakeLockStatus } from "@/utils/wakeLockHelper";

// Importiere die Default-Einstellungen
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import ProfileImage from '@/components/ui/ProfileImage';
import type { FirestorePlayer } from '@/types/jass';


interface StartScreenProps {
  onCancel?: () => void;
  members?: FirestorePlayer[];
}

const StartScreen: React.FC<StartScreenProps> = ({ onCancel, members = [] }) => {
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
  // ENTFERNT: Lokaler isLoading State - verwende globalen uiStore Loading
  // const [isLoading, setIsLoading] = useState(false);
  const [isStartButtonLoading, setIsStartButtonLoading] = useState(false);
  const [hasSelectedStartingPlayer, setHasSelectedStartingPlayer] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

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

  // Hilfsfunktion für schnellen Avatar-URL Lookup
  const getPlayerPhotoUrl = (player: MemberInfo | GuestInfo | null): string | undefined => {
    if (!player || player.type !== 'member') return undefined;
    // Zuerst nach uid suchen (genauer)
    if (player.uid && memberPhotoUrlMap.has(player.uid)) {
      return memberPhotoUrlMap.get(player.uid);
    }
    // Fallback: nach Name suchen
    if (player.name && memberPhotoUrlMap.has(player.name)) {
      return memberPhotoUrlMap.get(player.name);
    }
    return undefined;
  };

  useEffect(() => {
    if (status === 'authenticated' && user) {
      // 🎯 TODO: Lade die korrekte playerId für den Host-User
      // Für jetzt verwenden wir eine Fallback-Lösung
      setGamePlayers((prev) => ({
        ...prev,
        1: {
          type: "member", 
          uid: user.uid, 
          name: user.displayName || "Ich",
          playerId: user.playerId || user.uid // ✅ HINZUGEFÜGT: playerId
        },
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

  const handlePlayerFieldClick = (playerNumber: PlayerNumber, event?: React.MouseEvent) => {
    if (status === 'authenticated') {
      if (areAllSlotsFilled(gamePlayers)) {
        setStartingPlayer(playerNumber);
        setHasSelectedStartingPlayer(true);
      }
    } else {
      if (areAllNamesEntered(names)) {
        // Im Gast-Modus: Startspieler auswählen, NICHT das Input-Feld fokussieren
        setStartingPlayer(playerNumber);
        // Event stoppen, damit das Input-Feld nicht fokussiert wird
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    }
  };

  const handleSelectPlayerClick = (slotNumber: PlayerNumber) => {
    // Diese Funktion ist nun obsolet durch die Popover-Logik, kann aber für spätere Zwecke bleiben.
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
    // 🚨 SICHERHEIT: Verhindere, dass sich der Host selbst entfernt (außer Admin)
    const player = gamePlayers[slot];
    const isHostUser = status === 'authenticated' && user && player?.type === 'member' && player.uid === user.uid;
    const isAdminException = user?.uid === 'AaTUBO0SbWVfStdHmD7zi3qAMww2'; // Admin-Ausnahme
    
    if (isHostUser && !isAdminException) {
      showNotification({
        type: 'warning',
        message: 'Du kannst dich nicht selbst aus dem Spiel entfernen. Falls du nicht mitspielen möchtest, erstelle das Spiel im Gastmodus.',
        actions: [
          {
            label: 'Verstanden',
            onClick: () => {}
          }
        ]
      });
      return;
    }
    
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

  // 🧪 DEBUG: Wake Lock Test (Doppelklick auf Titel)
  const handleTitleDoubleClick = async () => {
    if (process.env.NODE_ENV === 'development') {
      setDebugMode(true);
      try {
        const wakeLockStatus = await getWakeLockStatus();
        const message = wakeLockStatus.isActive 
          ? `✅ Wake Lock funktioniert auf ${wakeLockStatus.platform}!` 
          : `❌ Wake Lock nicht verfügbar: ${wakeLockStatus.error}`;
        
        showNotification({
          type: wakeLockStatus.isActive ? 'success' : 'warning',
          message: message,
          actions: [{ label: 'OK', onClick: () => {} }]
        });
      } catch (error) {
        showNotification({
          type: 'error',
          message: `Wake Lock Test fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
          actions: [{ label: 'OK', onClick: () => {} }]
        });
      }
    }
  };

  const handleStart = async () => {
    // 🍎 iOS Bildschirmsperre-Warnung anzeigen (falls nötig) - ZENTRAL über uiStore verwaltet
    const { iosNotification, markIOSNotificationAsShown } = useUIStore.getState();
    
    if (shouldShowiOSScreenLockWarning() && !iosNotification.hasBeenShownThisSession) {

      markIOSNotificationAsShown(); // Verhindert Doppel-Anzeige in dieser Session
      
      const iOSNotification = createSimpleiOSScreenLockNotification(() => {

        // Logik für Persistierung ist jetzt im Helper enthalten
      });
      
      showNotification(iOSNotification);
      // Kurz warten, damit User die Notification sieht, bevor das Spiel startet
      await new Promise(resolve => setTimeout(resolve, 100));
    }

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
      await startGameFlow(gamePlayers as Required<GamePlayers>, playerNamesForStore, startingPlayer as PlayerNumber);
    } else {
      // DOM-Werte lesen (State wird erst bei onBlur aktualisiert, User könnte direkt START klicken)
      const currentNames: PlayerNames = { 1: '', 2: '', 3: '', 4: '' };
      for (const slot of [1, 2, 3, 4] as PlayerNumber[]) {
        const input = document.getElementById(`guest-input-${slot}`) as HTMLInputElement | null;
        currentNames[slot] = input?.value?.trim() || names[slot]?.trim() || '';
      }
      setNames(currentNames);
      const emptyNames = Object.entries(currentNames).filter(([_, name]) => !name.trim());
      if (emptyNames.length > 0) {
        showNotification({
          type: 'warning',
          message: 'Es wurden nicht alle Spielernamen eingegeben. Möchtest du trotzdem fortfahren?',
          actions: [
            {
              label: 'Ohne\nNamen',
              onClick: async () => {
                const validatedNames: PlayerNames = {
                  1: currentNames[1] || 'Du',
                  2: currentNames[2] || 'Gegner 1',
                  3: currentNames[3] || 'Partner',
                  4: currentNames[4] || 'Gegner 2'
                };
                setNames(validatedNames);
                await startGameFlow(gamePlayers as Required<GamePlayers>, validatedNames, startingPlayer as PlayerNumber);
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
      await startGameFlow(gamePlayers as Required<GamePlayers>, currentNames, startingPlayer as PlayerNumber);
    }
  };

  const startGameFlow = async (
    selectedPlayers: GamePlayers,
    selectedNames: PlayerNames,
    selectedStartingPlayer: PlayerNumber
  ) => {
    setIsStartButtonLoading(true);
    // ✅ GLOBALER Loading-State für nahtlose Navigation
    useUIStore.getState().setLoading(true);
    
    try {
      const auth = useAuthStore.getState();

      if (auth.status !== 'authenticated' && !auth.isGuest) {

        auth.continueAsGuest();
        
        await new Promise(resolve => setTimeout(resolve, 100));

      }

      // ✅ NEU: Prüfe, ob der eingeloggte User als Spieler teilnimmt
      if (status === 'authenticated' && user && selectedPlayers) {
        const selectedPlayerUids = Object.values(selectedPlayers)
          .map(p => (p?.type === 'member' ? p.uid : null))
          .filter((uid): uid is string => !!uid);
        
        const isUserParticipating = selectedPlayerUids.includes(user.uid);
        
        if (!isUserParticipating) {
          // Zeige Notification, dass der User als Spielleiter fungiert
          showNotification({
            type: "info",
            message: "🎮 Du leitest dieses Spiel, nimmst aber nicht als Spieler teil. Die Punkte werden für die anderen Teilnehmer getrackt.",
            preventClose: true,
            actions: [
              {
                label: "Verstanden",
                onClick: () => {},
              },
            ],
          });
          
          // Kurz warten, damit der User die Notification lesen kann
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // 🔧 FIX: Tutorial-Behandlung für Gäste verbessert
      if (tutorialStore.isActive) {
        tutorialStore.endTutorial(true);
      }

      useUIStore.getState().resetStartScreen();
      setTeamConfig(teamConfig);

      let activeGameId: string | null = null;
      let newSessionId: string | null = null;
      let groupId: string | null = null;
      let participantUids: string[] = [];
      let participantPlayerIds: string[] = [];

      if (status === 'authenticated' && user && selectedPlayers) {
        try {
          // 1. Session ID generieren
          newSessionId = nanoid(); 

          // 2. Teilnehmer-UIDs sammeln (wie bisher)
          const calculatedParticipantUids = Object.values(selectedPlayers)
                                       .map(p => (p?.type === 'member' ? p.uid : null)) 
                                       .filter((uid): uid is string => !!uid);
          if (!calculatedParticipantUids.includes(user.uid)) {
              calculatedParticipantUids.push(user.uid);
          }
          const uniqueParticipantUids = [...new Set(calculatedParticipantUids)];
          participantUids = uniqueParticipantUids;
          groupId = currentGroup?.id ?? null;

          // 3. **NEU:** Session-Dokument in Firestore erstellen
          await createSessionDocument(newSessionId, {
            groupId: groupId,
            participantUids: participantUids,
            playerNames: selectedNames
          });

          // 4. Initiales activeGame-Dokument erstellen (wie bisher)
          const teamBottom = teamConfig.bottom;
          const teamTop = teamConfig.top;
          const initialGameDataForService: Omit<ActiveGame, 'createdAt' | 'lastUpdated' | 'status' | 'gameStartTime' | 'jassStartTime' | 'activeGameId'> & { groupId: string | null } = {
            groupId: groupId,
            sessionId: newSessionId,
            participantUids: uniqueParticipantUids, 
            playerNames: selectedNames,
            teams: { top: teamTop, bottom: teamBottom }, 
            scores: { top: 0, bottom: 0 },
            striche: {
              top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
              bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
            },
            weisPoints: { top: 0, bottom: 0 },
            currentPlayer: selectedStartingPlayer,
            currentRound: 1,
            currentGameNumber: 1,
            startingPlayer: selectedStartingPlayer,
            initialStartingPlayer: selectedStartingPlayer,
          };

          // Stelle sicher, dass groupId ein string ist, bevor createActiveGame aufgerufen wird.
          // Wenn groupId null ist, wird ein leerer String verwendet, um den Typfehler zu beheben.
          // Die Logik, ob ein Spiel ohne Gruppe online erstellt werden soll, ist davon getrennt zu betrachten.
          const gameDataForCreation = {
            ...initialGameDataForService,
            groupId: initialGameDataForService.groupId ?? "", // Null zu Leerstring für den Aufruf
          };

          activeGameId = await createActiveGame(gameDataForCreation as Omit<ActiveGame, 'createdAt' | 'lastUpdated' | 'status' | 'gameStartTime' | 'jassStartTime' | 'activeGameId'> & { groupId: string });

          // 5. **NEU:** Session-Dokument mit der activeGameId aktualisieren
          await updateSessionActiveGameId(newSessionId, activeGameId);

          // 6. **NEU:** Teilnehmer-Player IDs DIREKT sammeln (ELEGANT!)
          // 🎯 EINFACH: Verwende direkt die Player-IDs aus den selectedPlayers
          participantPlayerIds = Object.values(selectedPlayers)
            .map(p => p?.type === 'member' ? p.playerId : null)
            .filter((id): id is string => !!id);
          

          
          if (participantPlayerIds.length !== uniqueParticipantUids.length) {
            console.warn("[StartScreen] Nicht alle Player-IDs verfügbar - prüfe Spieler-Auswahl");
          }
          
          // 7. **NEU:** Session mit aufgelösten Player-IDs aktualisieren
          if (participantPlayerIds.length > 0) {
            await updateSessionParticipantPlayerIds(newSessionId, participantPlayerIds);

          }

        } catch (error) {
          toast.error("Online-Spiel konnte nicht erstellt werden.");
          setIsStartButtonLoading(false);
          useUIStore.getState().setLoading(false); // ✅ GLOBAL: Loading-State zurücksetzen bei Fehler
          return;
        } finally {
        }
      } else {
      }

      jassStore.startJass({
        playerNames: selectedNames,
        initialStartingPlayer: selectedStartingPlayer, 
        activeGameId: activeGameId ?? undefined, // Use activeGameId if available
        sessionId: newSessionId ?? `local_${Date.now()}`, // Use newSessionId or generate local
        groupId: groupId,
        participantUids: participantUids,
        participantPlayerIds: participantPlayerIds,
        initialSettings: {
          farbeSettings: DEFAULT_FARBE_SETTINGS,
          scoreSettings: DEFAULT_SCORE_SETTINGS,
          strokeSettings: DEFAULT_STROKE_SETTINGS,
        },
      });
      
      // Session-Subscription (nur im Online-Modus)
      if (newSessionId) {
        jassStore.subscribeToSession(newSessionId);
      }

      router.push('/jass');
      
      // ✅ WICHTIG: Loading-State NICHT hier zurücksetzen!
      // Der globale Loader bleibt aktiv bis JassKreidetafel vollständig geladen ist
      // Das verhindert das "Flackern" zwischen den Komponenten
    } catch (error) {
      toast.error("Online-Spiel konnte nicht erstellt werden.");
      setIsStartButtonLoading(false);
      useUIStore.getState().setLoading(false); // ✅ GLOBAL: Loading-State nur bei Fehler zurücksetzen
    }
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

    } else { // Gastmodus — identisch zum Online-Modus gestylt
        const isStarting = allFilled && startingPlayer === playerNumber;
        const isTeamBottom = teamConfig.bottom.includes(playerNumber);
        const baseBg = isTeamBottom ? "bg-gray-500" : "bg-gray-700";
        const hoverBg = isTeamBottom ? "hover:bg-gray-600" : "hover:bg-gray-800";
        const teamBorderColor = isTeamBottom ? "border-l-yellow-400" : "border-l-blue-400";
        const focusRing = "focus:ring-green-500 focus:border-green-500";

    let classes = `w-full p-3 pl-4 outline-none border-l-4 ${baseBg} ${teamBorderColor} border transition-all duration-150 rounded-xl text-white`;
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

  const isAuth = status === 'authenticated';

  // Body auf solid dunkel setzen (verhindert Streifen bei iOS Keyboard im Gastmodus)
  useEffect(() => {
    if (isAuth) return;
    const originalBg = document.body.style.background;
    const originalBgColor = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#1a1a1a';
    document.body.style.background = '#1a1a1a';
    return () => {
      document.body.style.background = originalBg;
      document.body.style.backgroundColor = originalBgColor;
    };
  }, [isAuth]);

  return (
    <>
      {/* Content-Layer — BEIDE Modi: gleiches BG-Image für identische Farben */}
      <div
        className={`flex flex-col px-4 ${
          isAuth
            ? 'fixed inset-0 z-50'
            : 'min-h-[100dvh]'
        }`}
        style={{
          backgroundColor: '#1a1a1a',
          backgroundImage: 'url(/images/backgrounds/chalkboard-mobile.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Zurück-Button oben links */}
        <button
          onClick={handleCancel}
          className="fixed top-16 left-5 z-[51] text-white/60 hover:text-white transition-colors"
          aria-label="Zurück"
        >
          <IoMdArrowRoundBack size={26} />
        </button>

        {/* Spacer oben — kleiner als unten für Tendenz nach oben */}
        <div style={{ flex: '3 1 0%' }} />

        <div className="w-full max-w-xs mx-auto">
        <div className="w-full px-2 text-center space-y-5">

          <h2
            className={`text-center mb-1 transition-all duration-200 ${
              (status === 'authenticated' && areAllSlotsFilled(gamePlayers)) || (status !== 'authenticated' && areAllNamesEntered(names))
                ? "text-yellow-400"
                : "text-white"
            } ${
              ((status === 'authenticated' && areAllSlotsFilled(gamePlayers) && !hasSelectedStartingPlayer) ||
               (status !== 'authenticated' && areAllNamesEntered(names) && !startingPlayer))
                ? "animate-pulse [animation-duration:2s] drop-shadow-[0_0_8px_rgba(234,179,8,0.4)]"
                : ""
            } ${process.env.NODE_ENV === 'development' ? 'cursor-pointer' : ''}`}
            style={{
              fontFamily: "'Capita', Georgia, serif",
              fontWeight: 700,
              fontSize: 'clamp(24px, 5vw, 32px)',
              lineHeight: 1.25,
              letterSpacing: '-0.5px',
              textShadow: '0 2px 12px rgba(0,0,0,0.4)',
            }}
            onDoubleClick={handleTitleDoubleClick}
            title={process.env.NODE_ENV === 'development' ? 'Doppelklick für Wake Lock Test' : undefined}
          >
            {status === 'authenticated' ?
              (areAllSlotsFilled(gamePlayers) ? "Startspieler wählen" : "Spieler erfassen") :
              (areAllNamesEntered(names) ? "Startspieler wählen" : "Spielernamen eingeben")
            }
            {debugMode && process.env.NODE_ENV === 'development' && <span className="text-xs ml-2">🧪</span>}
          </h2>

          <h3
            className="text-white mb-4"
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 600,
              fontSize: '16px',
              textShadow: '0 1px 6px rgba(0,0,0,0.3)',
            }}
          >
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
                      onClick={(e) => handlePlayerFieldClick(playerNumber, e)}
                      className={getPlayerFieldClass(playerNumber)}
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
                              <span className={`text-sm font-bold ${teamColor}`}>
                                ({teamName})
                              </span>
                            </span>
                          </div>
                          {(() => {
                            // 🚨 SICHERHEIT: "X"-Button nur anzeigen, wenn sich der User entfernen darf
                            const isHostUser = status === 'authenticated' && user && player.type === 'member' && player.uid === user.uid;
                            const isAdminException = user?.uid === 'AaTUBO0SbWVfStdHmD7zi3qAMww2'; // Admin-Ausnahme
                            const canRemove = !isHostUser || isAdminException;
                            
                            return canRemove ? (
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
                            ) : null;
                          })()}
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
                  const isTeamBottom = teamConfig.bottom.includes(playerNumber);
                  const teamName = isTeamBottom ? "Team 1" : "Team 2";
                  const teamColor = isTeamBottom ? 'text-yellow-400' : 'text-blue-400';

                  return (
                    <div key={`guest-slot-${slotNum}`} className="relative">
                        <input
                          type="text"
                          id={`guest-input-${slotNum}`}
                          data-player={slotNum}
                          inputMode="text"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          placeholder={
                            playerNumber === 1 ? "Deinen Namen eingeben..." :
                            (playerNumber === 2 ? "Gegner 1 eingeben..." :
                            (playerNumber === 3 ? "Partner eingeben..." :
                            "Gegner 2 eingeben..."))
                          }
                          defaultValue={names[playerNumber]}
                          onFocus={(e) => {
                            // Alle Namen eingegeben → Keyboard NICHT öffnen, stattdessen Startspieler wählen
                            if (areAllNamesEntered(names)) {
                              e.target.blur();
                              setStartingPlayer(playerNumber);
                              return;
                            }
                          }}
                          onBlur={(e) => {
                            // State NUR bei Blur aktualisieren — kein Re-Render während des Tippens
                            handleNameChange(playerNumber, e.target.value);
                          }}
                          className={getPlayerFieldClass(playerNumber, true)}
                        />
                      {names[playerNumber] && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                          <span className={`text-sm font-bold ${teamColor}`}>
                            ({teamName})
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <motion.button
            initial={{scale: 0.9}}
            animate={{scale: 1}}
            whileTap={{scale: 0.95}}
            onClick={() => {
              const isReady = status === 'authenticated' ? 
                areAllSlotsFilled(gamePlayers) && hasSelectedStartingPlayer : 
                areAllNamesEntered(names) && startingPlayer;
              
              if (isReady) {
                handleStart();
              } else {
                // Zeige Notification je nach fehlendem Element
                if (status === 'authenticated') {
                  if (!areAllSlotsFilled(gamePlayers)) {
                    showNotification({
                      type: "warning",
                      message: "Es wurden noch nicht alle Spieler zugewiesen.",
                    });
                  } else if (!hasSelectedStartingPlayer) {
                    showNotification({
                      type: "info",
                      message: "Bitte wähle den Startspieler fürs erste Spiel aus (auf einen Spieler klicken).",
                    });
                  }
                } else {
                  if (!areAllNamesEntered(names)) {
                    showNotification({
                      type: "warning",
                      message: "Es wurden noch nicht alle Spielernamen eingegeben.",
                    });
                  } else if (!startingPlayer) {
                    showNotification({
                      type: "info",
                      message: "Bitte wähle den Startspieler fürs erste Spiel aus (auf einen Spieler klicken).",
                    });
                  }
                }
              }
            }}
            disabled={isStartButtonLoading}
          className={`w-full text-white text-lg font-bold py-4 px-8 rounded-xl shadow-lg transition-colors border-b-4 min-h-[56px] flex items-center justify-center ${
              isStartButtonLoading
                ? "bg-green-700 border-green-900 cursor-wait opacity-80"
                : (status === 'authenticated' ? areAllSlotsFilled(gamePlayers) && hasSelectedStartingPlayer : areAllNamesEntered(names) && startingPlayer)
                  ? "bg-green-600 hover:bg-green-700 border-green-900 cursor-pointer"
                  : "bg-green-700/60 border-green-900 cursor-pointer"
            }`}
          >
            {isStartButtonLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Wird gestartet…
              </span>
            ) : "START"}
          </motion.button>
        </div>
        </div>

        {/* Spacer unten — grösser als oben */}
        <div style={{ flex: '5 1 0%' }} />

        {status === 'authenticated' && (
          <AddGuestModal
            isOpen={isGuestModalOpen}
            onClose={() => setIsGuestModalOpen(false)}
            targetSlot={guestTargetSlot}
            onAddGuest={handleGuestAdded}
          />
        )}
      </div>
    </>
  );
};

export default StartScreen;
