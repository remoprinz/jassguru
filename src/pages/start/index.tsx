"use client";

import React, {useEffect, useState, useRef, useCallback, useMemo} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {useGroupStore} from "@/store/groupStore";
import {useGameStore} from "@/store/gameStore";
import {useJassStore, createInitialTeamStand} from "@/store/jassStore";
import {useUIStore} from "@/store/uiStore";
import {Button} from "@/components/ui/button";
import Image from "next/image";
import MainLayout from "@/components/layout/MainLayout";
import {GroupSelector} from "@/components/group/GroupSelector";
import {Users, Settings, UserPlus, Camera, Upload, X, Loader2, BarChart, Archive, CheckCircle, XCircle, MinusCircle, Award as AwardIcon, BarChart2, BarChart3, AlertTriangle, ArrowLeft, DownloadCloud, Smartphone, Monitor, Laptop, LayoutGrid, Columns, Mail, Copy } from "lucide-react";
import imageCompression from "browser-image-compression";
import {uploadGroupLogo} from "@/services/groupService";
import ImageCropModal from "@/components/ui/ImageCropModal";
import InviteModal from "@/components/group/InviteModal";
import {getFunctions, httpsCallable} from "firebase/functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupMemberList } from "@/components/group/GroupMemberList";
import { getGroupMembersSortedByGames } from "@/services/playerService";
import type { FirestorePlayer, ActiveGame, RoundDataFirebase, GameEntry, RoundEntry, CompletedGameSummary, StricheRecord, JassColor, FarbeSettings, ScoreSettings } from "@/types/jass";
import { getFirestore, doc, getDoc, collection, getDocs, query, where, orderBy, limit, onSnapshot, Unsubscribe, Timestamp, FieldValue } from "firebase/firestore";
import { firebaseApp } from "@/services/firebaseInit";
import { useTimerStore } from "@/store/timerStore";
import { fetchCompletedSessionsForUser, SessionSummary } from '@/services/sessionService';
import Link from 'next/link';
import { format } from 'date-fns';
import { fetchTournamentInstancesForGroup } from '@/services/tournamentService';
import type { TournamentInstance } from '@/types/tournament';
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import {
  GroupStatistics,
  subscribeToGroupStatistics,
} from "@/services/statisticsService";
import { FormattedDescription } from '@/components/ui/FormattedDescription';
import { StatRow } from '@/components/statistics/StatRow';
import { FarbePictogram } from '@/components/settings/FarbePictogram';
import { StrokeSettings } from '@/types/jass';
import JoinByInviteUI from "@/components/ui/JoinByInviteUI";
import { extractAndValidateToken } from "@/utils/tokenUtils";
import { TournamentSelector } from "@/components/tournament/TournamentSelector"; // NEU: TournamentSelector importieren

// NEUE IMPORTE FÜR KARTENSYMBOL-MAPPING
import { CARD_SYMBOL_MAPPINGS } from '@/config/CardStyles';
import { toTitleCase } from '@/utils/formatUtils';
import ProfileImage from '@/components/ui/ProfileImage';
// ENDE NEUE IMPORTE
import { useNestedScrollFix } from '@/hooks/useNestedScrollFix';
import { formatMillisecondsDuration } from '@/utils/formatUtils';

// Hilfsfunktion zum Finden des Spieler-Profilbilds anhand des Namens
function findPlayerPhotoByName(playerName: string, membersList: FirestorePlayer[]): string | undefined {
  if (!playerName) return undefined; // <-- HIER DIE NEUE PRÜFUNG
  if (!membersList?.length) return undefined;
  
  const player = membersList.find(
    m => m.displayName?.toLowerCase() === playerName.toLowerCase()
  );
  
  // Umwandeln von null zu undefined für typekompatibilität
  return player?.photoURL || undefined;
}

// Typ-Guard für Firestore Timestamp
function isFirestoreTimestamp(value: unknown): value is Timestamp {
  return Boolean(value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function');
}

type GroupLoadingStatus = "idle" | "loading" | "success" | "error";

type ArchiveItem = (SessionSummary & { type: 'session' }) | (TournamentInstance & { type: 'tournament' });

const isLoadingOrIdle = (status: string | undefined): boolean => status === "loading" || status === "idle";

// Hilfsfunktion zum Normalisieren der Trumpffarben-Namen für die JassColor Typ-Kompatibilität
const normalizeJassColor = (farbe: string): JassColor => {
  const mappings: Record<string, JassColor> = {
    "eichel": "Eicheln",
    "rosen": "Rosen",
    "schilten": "Schilten",
    "schellen": "Schellen",
    "unde": "Une",
    "obe": "Obe"
  };
  
  return (mappings[farbe.toLowerCase()] ?? farbe) as JassColor;
};

// Hilfsfunktion zum Finden des Spieler-Profilbilds UND der ID anhand des Namens
function findPlayerByName(playerName: string, membersList: FirestorePlayer[]): FirestorePlayer | undefined {
  if (!membersList?.length) return undefined;
  return membersList.find(
    m => m.displayName?.toLowerCase() === playerName.toLowerCase()
  );
}

const StartPage = () => {
  const {user, status, isAuthenticated, isGuest} = useAuthStore();
  const {currentGroup, userGroups, status: groupStatus, error: groupError, clearError: clearGroupError, setCurrentGroupId, setError: setGroupError, lastSettingsUpdateTimestamp} = useGroupStore();
  const gameStore = useGameStore();
  const jassStore = useJassStore();
  const isGameInProgress = useGameStore((state) => state.isGameStarted && !state.isGameCompleted);
  const router = useRouter();
  const setPageCta = useUIStore((state) => state.setPageCta);
  const resetPageCta = useUIStore((state) => state.resetPageCta);
  const showNotification = useUIStore((state) => state.showNotification);
  const setResumableGameId = useUIStore((state) => state.setResumableGameId);
  const clearResumableGameId = useUIStore((state) => state.clearResumableGameId);
  const resumableGameId = useUIStore((state) => state.resumableGameId);
  const setLoading = useUIStore((state) => state.setLoading);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [members, setMembers] = useState<FirestorePlayer[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [completedSessions, setCompletedSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [groupTournaments, setGroupTournaments] = useState<TournamentInstance[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);

  const [groupStats, setGroupStats] = useState<GroupStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [isDataLoadDetermined, setIsDataLoadDetermined] = useState(false);

  const showGlobalLoader = status === "loading" || (status === 'authenticated' && groupStatus === "loading");

  const isAdmin = currentGroup && user && currentGroup.adminIds.includes(user.uid);

  const activeGameListenerUnsubscribe = useRef<Unsubscribe | null>(null);

  const [isResuming, setIsResuming] = useState(false);
  
  const [isProcessingInvite, setIsProcessingInvite] = useState(false);

  // Refs für die scrollbaren Statistik-Container
  // Übersicht
  const overviewMostGamesRef = useRef<HTMLDivElement>(null);
  const overviewTrumpfRef = useRef<HTMLDivElement>(null);
  // Spieler
  const playerStricheDiffRef = useRef<HTMLDivElement>(null);
  const playerPointsDiffRef = useRef<HTMLDivElement>(null);
  const playerWinRateSessionRef = useRef<HTMLDivElement>(null);
  const playerWinRateGameRef = useRef<HTMLDivElement>(null);
  const playerMatschRateRef = useRef<HTMLDivElement>(null);
  const playerSchneiderRateRef = useRef<HTMLDivElement>(null);
  const playerWeisAvgRef = useRef<HTMLDivElement>(null);
  const playerRoundTimeRef = useRef<HTMLDivElement>(null);
  // Teams
  const teamStricheDiffRef = useRef<HTMLDivElement>(null);
  const teamPointsDiffRef = useRef<HTMLDivElement>(null);
  const teamWinRateSessionRef = useRef<HTMLDivElement>(null);
  const teamWinRateGameRef = useRef<HTMLDivElement>(null);
  const teamMatschRateRef = useRef<HTMLDivElement>(null);
  const teamSchneiderRateRef = useRef<HTMLDivElement>(null);
  const teamWeisAvgRef = useRef<HTMLDivElement>(null);
  const teamRoundTimeRef = useRef<HTMLDivElement>(null);

  // Wende den Scroll-Fix-Hook auf alle Refs an
  useNestedScrollFix(overviewMostGamesRef);
  useNestedScrollFix(overviewTrumpfRef);
  useNestedScrollFix(playerStricheDiffRef);
  useNestedScrollFix(playerPointsDiffRef);
  useNestedScrollFix(playerWinRateSessionRef);
  useNestedScrollFix(playerWinRateGameRef);
  useNestedScrollFix(playerMatschRateRef);
  useNestedScrollFix(playerSchneiderRateRef);
  useNestedScrollFix(playerWeisAvgRef);
  useNestedScrollFix(playerRoundTimeRef);
  useNestedScrollFix(teamStricheDiffRef);
  useNestedScrollFix(teamPointsDiffRef);
  useNestedScrollFix(teamWinRateSessionRef);
  useNestedScrollFix(teamWinRateGameRef);
  useNestedScrollFix(teamMatschRateRef);
  useNestedScrollFix(teamSchneiderRateRef);
  useNestedScrollFix(teamWeisAvgRef);
  useNestedScrollFix(teamRoundTimeRef);

  const trumpfStatistikArray = useMemo(() => {
    if (!groupStats?.trumpfStatistik || groupStats.totalTrumpfCount === 0) {
      return [];
    }
    
    // KORREKTUR: Duplikate zusammenfassen (eichel+eicheln, unde+une)
    const consolidatedStats: Record<string, number> = {};
    
    Object.entries(groupStats.trumpfStatistik).forEach(([farbe, anzahl]) => {
      const normalizedFarbe = farbe.toLowerCase();
      
      // Mapping für Duplikate
      let mappedFarbe = normalizedFarbe;
      if (normalizedFarbe === 'eicheln') {
        mappedFarbe = 'eichel';
      } else if (normalizedFarbe === 'une') {
        mappedFarbe = 'unde';
      }
      
      // Zusammenfassen
      consolidatedStats[mappedFarbe] = (consolidatedStats[mappedFarbe] || 0) + anzahl;
    });
    
    return Object.entries(consolidatedStats)
      .map(([farbe, anzahl]) => ({
        farbe,
        anzahl,
        anteil: anzahl / groupStats.totalTrumpfCount,
      }))
      .sort((a, b) => b.anzahl - a.anzahl);
  }, [groupStats]);

  // Statistiken laden, wenn sich die Gruppe ändert
  useEffect(() => {
    if (currentGroup?.id) {
      setStatsLoading(true);
      setStatsError(null);

      const unsubscribe = subscribeToGroupStatistics(
        currentGroup.id,
        (statistics) => {
          setGroupStats(statistics);
          // ENTFERNT: Irreführende Fehlermeldung wenn noch keine Statistiken existieren
          // Das ist ein normaler Zustand wenn noch keine Spiele gespielt wurden
          setStatsLoading(false);
        },
        currentGroup?.mainLocationZip
      );

      // Bereinigungsfunktion, die beim Unmounten der Komponente aufgerufen wird
      return () => unsubscribe();
    }
  }, [currentGroup]);

  useEffect(() => {
    if (status === "loading" || status === "idle") {
      return;
    }

    if (status === "unauthenticated" && !useAuthStore.getState().isGuest) {
      if (process.env.NODE_ENV === "production") {
        router.push("/");
      } else {
        // console.log("StartPage: Auth status is definitively 'unauthenticated' and not guest in non-production, redirect skipped.");
      }
    } else {
      // Status ist 'authenticated', 'error' oder ('unauthenticated' aber Gast)
      // console.log(`StartPage: Auth status is '${status}', isGuest: ${useAuthStore.getState().isGuest}. No redirect needed.`);
      // Hier können andere Aktionen für eingeloggte User oder Gäste stattfinden
    }

    clearGroupError();
    return () => {
      clearGroupError();
      setMembersError(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      clearResumableGameId();
    };
  }, [status, router, clearGroupError, previewUrl, clearResumableGameId]);

  useEffect(() => {
    const loadMembers = async () => {
      if (!currentGroup) {
        setMembers([]);
        setMembersLoading(false);
        return;
      }

      setMembersLoading(true);
      setMembersError(null);
      try {
        const fetchedMembers = await getGroupMembersSortedByGames(currentGroup.id);
        setMembers(fetchedMembers);
      } catch (error) {
        console.error("Fehler beim Laden der Gruppenmitglieder:", error);
        const message = error instanceof Error ? error.message : "Mitglieder konnten nicht geladen werden.";
        setMembersError(message);
        showNotification({ message, type: "error" });
      } finally {
        setMembersLoading(false);
      }
    };

    loadMembers();
  }, [currentGroup?.id, showNotification]);

  useEffect(() => {
    const loadArchiveData = async () => {
      if (status === 'authenticated' && user) {
        // Sessions laden
        setSessionsLoading(true);
        setSessionsError(null);
        try {
          const sessions = await fetchCompletedSessionsForUser(user.uid);
          setCompletedSessions(sessions);
        } catch (error) {
          console.error("Fehler beim Laden der abgeschlossenen Sessions:", error);
          const message = error instanceof Error ? error.message : "Abgeschlossene Partien konnten nicht geladen werden.";
          setSessionsError(message);
        } finally {
          setSessionsLoading(false);
        }

        // Turniere der Gruppe laden
        if (currentGroup) {
          setTournamentsLoading(true);
          setTournamentsError(null);
          try {
            const tournaments = await fetchTournamentInstancesForGroup(currentGroup.id);
            setGroupTournaments(tournaments.filter(t => 
              t.status === 'active' || 
              t.status === 'upcoming' || 
              t.status === 'completed'
            )); 
          } catch (error) {
            console.error("Fehler beim Laden der Gruppen-Turniere:", error);
            const message = error instanceof Error ? error.message : "Turniere konnten nicht geladen werden.";
            setTournamentsError(message);
          } finally {
            setTournamentsLoading(false);
          }
        }
      }
    };

    loadArchiveData();
  }, [status, user, currentGroup, showNotification]);

  useEffect(() => {
    if (status === 'authenticated' && user && currentGroup) {
      // console.log(`[StartPage] Setting up active game listener for user ${user.uid} in group ${currentGroup.id}`);
      const db = getFirestore(firebaseApp);
      const gamesRef = collection(db, "activeGames");

      const q = query(
        gamesRef,
        where("groupId", "==", currentGroup.id),
        where("participantUids", "array-contains", user.uid),
        where("status", "not-in", ["aborted", "completed"]),
        orderBy("createdAt", "desc"),
        limit(1)
      );

      activeGameListenerUnsubscribe.current = onSnapshot(
        q,
        async (snapshot) => {
          if (!snapshot.empty) {
            const latestGameDoc = snapshot.docs[0];
            const gameId = latestGameDoc.id;
            const db = getFirestore(firebaseApp);

            try {
              // console.log(`[StartPage Listener] Found potential active game: ${gameId}. Checking status...`);
              const gameDocRef = doc(db, 'activeGames', gameId);
              const gameDocSnap = await getDoc(gameDocRef);

              if (gameDocSnap.exists() && gameDocSnap.data()?.status === 'aborted') {
                console.warn(`[StartPage Listener] Ignoring game ${gameId} because its status is 'aborted'. Clearing resumable ID.`);
                clearResumableGameId();
                return;
              } 
              // console.log(`[StartPage Listener] Game ${gameId} is valid (not aborted). Setting as resumable.`);
              if (useUIStore.getState().resumableGameId !== gameId) {
                  setResumableGameId(gameId);
              }
            } catch (error) {
              console.error(`[StartPage Listener] Error checking game status for ${gameId}:`, error);
              clearResumableGameId();
            }

          } else {
            // console.log("[StartPage Listener] No active game found for user in this group.");
            if (useUIStore.getState().resumableGameId) {
                clearResumableGameId();
            }
          }
        },
        (error) => {
          console.error("[StartPage Listener] Error listening for active games:", error);
          showNotification({ message: "Fehler bei der Suche nach laufenden Spielen.", type: "error" });
          clearResumableGameId();
        }
      );

      return () => {
        if (activeGameListenerUnsubscribe.current) {
          // console.log("[StartPage] Cleaning up active game listener.");
          activeGameListenerUnsubscribe.current();
          activeGameListenerUnsubscribe.current = null;
        }
      };
    } else {
      if (activeGameListenerUnsubscribe.current) {
        // console.log("[StartPage] Cleaning up active game listener due to user/group change.");
        activeGameListenerUnsubscribe.current();
        activeGameListenerUnsubscribe.current = null;
      }
      clearResumableGameId();
      return () => {};
    }
  }, [status, user, currentGroup, setResumableGameId, clearResumableGameId, showNotification]);

  useEffect(() => {
    const isAuthDone = !isLoadingOrIdle(status);
    const isGroupDoneOrNotNeeded = status !== 'authenticated' || !isLoadingOrIdle(groupStatus);

    if (isAuthDone && isGroupDoneOrNotNeeded) {
      setIsDataLoadDetermined(true);
    } else {
      setIsDataLoadDetermined(false);
    }
  }, [status, groupStatus]);

  useEffect(() => {
    if (!isDataLoadDetermined) {
      return;
    }

    if (status === "unauthenticated" && !useAuthStore.getState().isGuest) {
      if (process.env.NODE_ENV === "production") {
        router.push("/");
      } else {
        // console.log("[StartPage] Auth status is 'unauthenticated' and not guest in non-production, redirect skipped.");
      }
    } else {
      // Status ist 'authenticated', 'error' oder ('unauthenticated' aber Gast)
      // console.log(`[StartPage] Auth status is '${status}', isGuest: ${useAuthStore.getState().isGuest}. No redirect needed.`);
    }

    clearGroupError();
    return () => {
      clearGroupError();
      setMembersError(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      clearResumableGameId();
    };
  }, [isDataLoadDetermined, status, router, clearGroupError, previewUrl, clearResumableGameId]);

  const handleResumeGame = async (gameId: string) => {
    setIsResuming(true);

    try {
      const db = getFirestore(firebaseApp);
      const gameDocRef = doc(db, "activeGames", gameId);
      const gameDocSnap = await getDoc(gameDocRef);

      if (!gameDocSnap.exists()) {
        throw new Error(`Aktives Spiel mit ID ${gameId} nicht gefunden.`);
      }

      const activeGameData = gameDocSnap.data() as ActiveGame;

      if (activeGameData.status === 'aborted' || activeGameData.status === 'completed') {
        console.warn(`[StartPage] Versuch, ein bereits beendetes/abgebrochenes Spiel fortzusetzen (ID: ${gameId}, Status: ${activeGameData.status}). Breche ab.`);
        showNotification({
          type: "warning",
          message: "Dieses Spiel wurde bereits beendet oder abgebrochen.",
        });
        clearResumableGameId();
        setIsResuming(false);
        return;
      }

      const sessionId = activeGameData.sessionId;

      if (!sessionId) {
        throw new Error("Session-ID im aktiven Spiel fehlt.");
      }

      // Falls eine Session-ID vorhanden ist, lade Spiele und Runden
      try {
        // console.log(`[StartPage] Aktives Spiel gefunden mit Session ID: ${sessionId}`);

        // Lade zuerst alle abgeschlossenen Spiele
        let completedGames: CompletedGameSummary[] = [];
        try {
          const { fetchCompletedGamesFromFirestore } = await import('@/services/gameService');
          completedGames = await fetchCompletedGamesFromFirestore(sessionId);
          // console.log(`[StartPage] ${completedGames.length} abgeschlossene Spiele aus jassGameSummaries/${sessionId}/completedGames geladen.`);
        } catch (loadCompletedError) {
          console.error(`[StartPage] Fehler beim Laden abgeschlossener Spiele aus jassGameSummaries/${sessionId}/completedGames:`, loadCompletedError);
          showNotification({
            type: "warning",
            message: "Abgeschlossene Spiele konnten nicht vollständig geladen werden.",
          });
        }

        let loadedRounds: RoundEntry[] = [];
        try {
          const { loadRoundsFromFirestore } = await import('@/services/gameService');
          loadedRounds = await loadRoundsFromFirestore(gameId);
          // console.log(`[StartPage] Successfully loaded ${loadedRounds.length} rounds from Firestore for game ${gameId}.`);
        } catch (loadError) {
          console.error(`[StartPage] Error loading rounds from Firestore for game ${gameId}:`, loadError);
          showNotification({
            type: "warning",
            message: "Rundenverlauf konnte nicht vollständig geladen werden.",
          });
        }

        const createdAtMillis = activeGameData.createdAt instanceof Timestamp
            ? activeGameData.createdAt.toMillis()
            : Date.now();

        // VEREINFACHTE FALLBACK-HIERARCHIE: sessions → activeGame → defaults
        let settingsFromActiveGame: {
          farbeSettings: FarbeSettings;
          scoreSettings: ScoreSettings;
          strokeSettings: StrokeSettings;
        } | null = null;

        console.log("[StartPage] 🛡️ VEREINFACHTE FALLBACK-HIERARCHIE für Settings wird gestartet...");

        // ERSTE PRIORITÄT: sessions Dokument (HAUPTQUELLE)
        try {
          const sessionDocRef = doc(db, 'sessions', sessionId);
          const sessionDocSnap = await getDoc(sessionDocRef);
          
          if (sessionDocSnap.exists()) {
            const sessionData = sessionDocSnap.data();
            if (sessionData.currentFarbeSettings && sessionData.currentScoreSettings && sessionData.currentStrokeSettings) {
              settingsFromActiveGame = {
                farbeSettings: sessionData.currentFarbeSettings,
                scoreSettings: sessionData.currentScoreSettings,
                strokeSettings: sessionData.currentStrokeSettings,
              };
              console.log("[StartPage] ✅ ERSTE PRIORITÄT: Einstellungen aus sessions-Dokument geladen:", {
                farbeCardStyle: settingsFromActiveGame.farbeSettings.cardStyle,
                scoreWerte: settingsFromActiveGame.scoreSettings.values,
                strokeSchneider: settingsFromActiveGame.strokeSettings.schneider
              });
            } else {
              throw new Error("Einstellungen in sessions unvollständig");
            }
          } else {
            throw new Error("sessions-Dokument nicht gefunden");
          }
        } catch (error) {
          console.warn("[StartPage] ❌ ERSTE PRIORITÄT fehlgeschlagen:", error);
          
          // ZWEITE PRIORITÄT: activeGame Dokument
          try {
            if (activeGameData.activeFarbeSettings && activeGameData.activeScoreSettings && activeGameData.activeStrokeSettings) {
              settingsFromActiveGame = {
                farbeSettings: activeGameData.activeFarbeSettings,
                scoreSettings: activeGameData.activeScoreSettings,
                strokeSettings: activeGameData.activeStrokeSettings,
              };
              console.log("[StartPage] ✅ ZWEITE PRIORITÄT: Einstellungen aus activeGame-Dokument geladen:", {
                farbeCardStyle: settingsFromActiveGame.farbeSettings.cardStyle,
                scoreWerte: settingsFromActiveGame.scoreSettings.values,
                strokeSchneider: settingsFromActiveGame.strokeSettings.schneider
              });
            } else {
              throw new Error("Einstellungen in activeGame unvollständig");
            }
          } catch (error2) {
            console.warn("[StartPage] ❌ ZWEITE PRIORITÄT fehlgeschlagen:", error2);
            
            // LETZTE RETTUNG: Default-Einstellungen
            settingsFromActiveGame = {
              farbeSettings: DEFAULT_FARBE_SETTINGS,
              scoreSettings: DEFAULT_SCORE_SETTINGS,
              strokeSettings: DEFAULT_STROKE_SETTINGS,
            };
            console.log("[StartPage] ⚠️ LETZTE RETTUNG: Default-Einstellungen werden verwendet");
          }
        }

        const reconstructedGameEntry: GameEntry = {
            id: activeGameData.currentGameNumber,
            activeGameId: gameId,
            timestamp: createdAtMillis,
            teams: {
              top: { ...(createInitialTeamStand()), striche: activeGameData.striche.top, total: activeGameData.scores.top, weisPoints: activeGameData.weisPoints?.top ?? 0 },
              bottom: { ...(createInitialTeamStand()), striche: activeGameData.striche.bottom, total: activeGameData.scores.bottom, weisPoints: activeGameData.weisPoints?.bottom ?? 0 }
          },
          sessionId: sessionId,
          currentRound: activeGameData.currentRound,
          startingPlayer: activeGameData.startingPlayer,
          initialStartingPlayer: activeGameData.initialStartingPlayer,
          currentPlayer: activeGameData.currentPlayer,
          roundHistory: loadedRounds,
          currentHistoryIndex: loadedRounds.length - 1,
          historyState: { lastNavigationTimestamp: Date.now() },
          isGameStarted: true,
          isRoundCompleted: activeGameData.isRoundCompleted ?? false,
          isGameCompleted: false,
      };

      useJassStore.setState({
          isJassStarted: true,
          currentGameId: activeGameData.currentGameNumber,
          games: [reconstructedGameEntry],
          currentSession: {
              id: sessionId,
              gruppeId: activeGameData.groupId ?? "",
              startedAt: createdAtMillis,
              playerNames: activeGameData.playerNames,
              games: [activeGameData.currentGameNumber],
              currentScoreLimit: useGroupStore.getState().currentGroup?.scoreSettings?.values.sieg ?? DEFAULT_SCORE_SETTINGS.values.sieg,
              completedGamesCount: activeGameData.currentGameNumber > 0 ? activeGameData.currentGameNumber - 1 : 0,
              metadata: {},
              participantUids: activeGameData.participantUids,
              statistics: { 
                gamesPlayed: 1,
                scores: { top: 0, bottom: 0 },
                weisCount: 0,
                stricheCount: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
              },
              // PHASE 1 KORREKTUR: Setze die Session-Einstellungen aus dem activeGame-Dokument
              currentFarbeSettings: settingsFromActiveGame.farbeSettings,
              currentScoreSettings: settingsFromActiveGame.scoreSettings,
              currentStrokeSettings: settingsFromActiveGame.strokeSettings,
          },
          isJassCompleted: false,
          currentRound: activeGameData.currentRound,
          teams: reconstructedGameEntry.teams,
          onlineCompletedGames: completedGames,
          currentGameCache: null,
          jassSessionId: sessionId,
      });

      useGameStore.setState({
          activeGameId: gameId,
          currentPlayer: activeGameData.currentPlayer,
          startingPlayer: activeGameData.startingPlayer,
          initialStartingPlayer: activeGameData.initialStartingPlayer,
          isGameStarted: true,
          currentRound: activeGameData.currentRound,
          weisPoints: activeGameData.weisPoints ?? { top: 0, bottom: 0 },
          jassPoints: activeGameData.currentJassPoints ?? { top: 0, bottom: 0 },
          scores: activeGameData.scores,
          striche: activeGameData.striche,
          roundHistory: loadedRounds,
          currentRoundWeis: activeGameData.currentRoundWeis ?? [],
          isGameCompleted: false,
          isRoundCompleted: activeGameData.isRoundCompleted ?? false,
          playerNames: activeGameData.playerNames,
          gamePlayers: activeGameData.gamePlayers ?? null,
          currentHistoryIndex: loadedRounds.length - 1,
          historyState: { lastNavigationTimestamp: Date.now() },
          // KRITISCH: Setze die korrekten Einstellungen aus dem activeGame-Dokument
          farbeSettings: settingsFromActiveGame.farbeSettings,
          scoreSettings: settingsFromActiveGame.scoreSettings,
          strokeSettings: settingsFromActiveGame.strokeSettings,
      });

      const jassStartMillis = activeGameData.jassStartTime instanceof Timestamp
        ? activeGameData.jassStartTime.toMillis()
        : null;
      const gameStartMillis = activeGameData.gameStartTime instanceof Timestamp
        ? activeGameData.gameStartTime.toMillis()
        : null;
      useTimerStore.getState().restoreTimers(jassStartMillis, gameStartMillis);

      useUIStore.getState().setStartScreenState("complete");

      clearResumableGameId();
      setIsResuming(false);
      router.push("/jass");
      } catch (innerError) {
        console.error("[StartPage] Error in inner try block:", innerError);
        throw innerError; // Wirf den Fehler erneut, damit der äußere catch-Block ihn fangen kann
      }
    } catch (error) {
      console.error("[StartPage] Error resuming game: ", error);
      showNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Fehler beim Laden des Spiels.",
      });
      clearResumableGameId();
      setIsResuming(false);
    }
  };

  const handleGameAction = useCallback(() => {
    if (resumableGameId) {
      handleResumeGame(resumableGameId);
    } else {
      if (!currentGroup && userGroups.length > 0) {
        showNotification({ message: "Bitte zuerst eine Gruppe auswählen.", type: "warning" });
        return;
      }
      // Leitet den Benutzer zur dedizierten Seite für die Erstellung eines neuen
      // Online-Spiels, anstatt direkt zum Jass-Bildschirm.
      // Der Offline/Gast-Flow wird dadurch nicht beeinflusst.
      router.push("/game/new");
    }
  }, [resumableGameId, router, handleResumeGame, currentGroup, userGroups, showNotification]);

  useEffect(() => {
    if (isResuming) {
      setPageCta({
        isVisible: true,
        text: "Laden...",
        onClick: () => {},
        loading: true,
        disabled: true,
        variant: "info",
      });
      return;
    }

    const isTournamentPasseActive = jassStore.currentSession?.isTournamentSession && gameStore.isGameStarted && !gameStore.isGameCompleted;

    if (isTournamentPasseActive) {
      resetPageCta();
    } else if (resumableGameId) {
      setPageCta({
        isVisible: true,
        text: "Laufendem Jass beitreten",
        onClick: handleGameAction,
        loading: false,
        disabled: false,
        variant: "info",
      });
    } else if (currentGroup) {
      const ctaText = isGameInProgress ? "Jass fortsetzen" : "Neuen Jass starten";
      const ctaVariant = isGameInProgress ? "info" : "default";

      setPageCta({
        isVisible: true,
        text: ctaText,
        onClick: handleGameAction,
        loading: false,
        disabled: false,
        variant: ctaVariant,
      });
    } else if (userGroups.length === 0 && !currentGroup && status !== 'loading') {
      setPageCta({
        isVisible: true,
        text: "Neue Gruppe erstellen",
        onClick: () => router.push("/groups/new"),
        loading: false,
        disabled: false,
        variant: "warning",
      });
    } else {
      resetPageCta();
    }

    return () => {
      resetPageCta();
    };
  }, [currentGroup, isGameInProgress, setPageCta, resetPageCta, userGroups, router, resumableGameId, status, handleGameAction, isResuming, jassStore.currentSession, gameStore.isGameStarted, gameStore.isGameCompleted]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const originalFile = files[0];
      if (!originalFile.type.startsWith("image/")) {
        showNotification({message: "Bitte wählen Sie eine Bilddatei (JPEG oder PNG)..", type: "error"});
        return;
      }
      const initialMaxSizeInBytes = 10 * 1024 * 1024;
      if (originalFile.size > initialMaxSizeInBytes) {
        showNotification({message: "Die Datei ist zu groß (max. 10 MB).", type: "error"});
        return;
      }

      clearGroupError();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setSelectedFile(null);

      const objectUrl = URL.createObjectURL(originalFile);
      setImageToCrop(objectUrl);
      setCropModalOpen(true);
    }
  };

  const handleCropComplete = async (croppedImageBlob: Blob | null) => {
    setCropModalOpen(false);
    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop);
      setImageToCrop(null);
    }

    if (!croppedImageBlob) {
      // console.log("Cropping abgebrochen oder fehlgeschlagen.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsUploading(false);
      return;
    }

    setIsUploading(true);
    // console.log(`Zugeschnittenes Gruppenlogo erhalten, Größe: ${(croppedImageBlob.size / 1024).toFixed(2)} KB`);

    const options = {
      maxSizeMB: 0.2,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.8,
    };

    try {
      // console.log("Komprimiere zugeschnittenes Gruppenlogo...");
      const compressedBlob = await imageCompression(new File([croppedImageBlob], "cropped_logo.jpg", {type: "image/jpeg"}), options);
      // console.log(`Komprimiertes Gruppenlogo, Größe: ${(compressedBlob.size / 1024).toFixed(2)} KB`);

      const finalPreviewUrl = URL.createObjectURL(compressedBlob);
      setPreviewUrl(finalPreviewUrl);
      setSelectedFile(new File([compressedBlob], "group_logo.jpg", {type: "image/jpeg"}));
      setIsUploading(false);
    } catch (compressionError) {
      console.error("Fehler bei der Komprimierung des zugeschnittenen Gruppenlogos:", compressionError);
      showNotification({message: "Fehler bei der Bildkomprimierung.", type: "error"});
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !currentGroup) return;

    setIsUploading(true);
    try {
      await uploadGroupLogo(currentGroup.id, selectedFile);
      showNotification({message: "Gruppenlogo erfolgreich aktualisiert.", type: "success"});
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Fehler beim Hochladen des Gruppenlogos:", error);
      showNotification({message: error instanceof Error ? error.message : "Hochladen fehlgeschlagen.", type: "error"});
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectClick = () => {
    if (isAdmin && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleCancelSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleInviteClick = async () => {
    if (!currentGroup) return;

    setIsInviteModalOpen(true);
    setIsGeneratingInvite(true);
    setInviteError(null);
    setInviteToken(null);

    try {
      const functions = getFunctions(undefined, "europe-west1");
      const generateToken = httpsCallable(functions, 'generateGroupInviteToken');
      
      // console.log(`Calling generateGroupInviteToken for group ${currentGroup.id} in region europe-west1`);
      const result = await generateToken({ groupId: currentGroup.id });
      // console.log("Function result:", result);

      const token = (result.data as { token: string }).token;

      if (!token) {
        throw new Error("Kein Token vom Server erhalten.");
      }

      setInviteToken(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler beim Generieren des Codes.";
      console.error("Error calling generateGroupInviteToken:", error);
      setInviteError(message);
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleCloseInviteModal = () => {
    setIsInviteModalOpen(false);
  };

  const handleGenerateNewInvite = () => {
    handleInviteClick();
  };

  const combinedArchiveItems = useMemo(() => {
    const filteredUserSessions = currentGroup
      ? completedSessions.filter(session => 
          session.groupId === currentGroup.id && 
          (session.status === 'completed' || session.status === 'completed_empty') &&
          !session.tournamentId // KRITISCH: Filtere Turnier-Sessions heraus, da sie bereits als separate Turniere angezeigt werden
        )
      : [];

    const sessionsWithType: ArchiveItem[] = filteredUserSessions.map(s => ({ ...s, type: 'session' }));
    
    // Die Filterung der Turniere geschieht nun bereits beim Laden in setGroupTournaments.
    // Daher können wir groupTournaments hier direkt verwenden.
    const tournamentsWithType: ArchiveItem[] = groupTournaments.map(t => ({ ...t, type: 'tournament' }));

    const combined = [...sessionsWithType, ...tournamentsWithType];

    combined.sort((a, b) => {
      let dateAValue: number | Timestamp | FieldValue | undefined | null;
      let dateBValue: number | Timestamp | FieldValue | undefined | null;

      if (a.type === 'session') {
        dateAValue = a.startedAt;
      } else { 
        dateAValue = a.instanceDate ?? a.createdAt;
      }

      if (b.type === 'session') {
        dateBValue = b.startedAt;
      } else { 
        dateBValue = b.instanceDate ?? b.createdAt;
      }

      const timeA = isFirestoreTimestamp(dateAValue) ? dateAValue.toMillis() :
                    (typeof dateAValue === 'number' ? dateAValue :
                    (dateAValue && typeof (dateAValue as Timestamp).isEqual === 'function') ? Date.now() : 0);
      
      const timeB = isFirestoreTimestamp(dateBValue) ? dateBValue.toMillis() :
                    (typeof dateBValue === 'number' ? dateBValue :
                    (dateBValue && typeof (dateBValue as Timestamp).isEqual === 'function') ? Date.now() : 0);

      return timeB - timeA;
    });

    return combined;
  }, [completedSessions, groupTournaments, currentGroup]);

  const groupedArchiveByYear = combinedArchiveItems.reduce<Record<string, ArchiveItem[]>>((acc, item) => {
    const dateToSort = item.type === 'session' ? item.startedAt : (item.instanceDate ?? item.createdAt);
    const year = isFirestoreTimestamp(dateToSort) ? dateToSort.toDate().getFullYear().toString() :
                 (typeof dateToSort === 'number' ? new Date(dateToSort).getFullYear().toString() :
                 'Unbekannt');
    if (!acc[year]) {
      acc[year] = [];
    }
    acc[year].push(item);
    return acc;
  }, {});

  const sortedYears = Object.keys(groupedArchiveByYear).sort((a, b) => parseInt(b) - parseInt(a));

  const renderArchiveItem = (item: ArchiveItem) => {
    if (item.type === 'session') {
      const session = item;
      const { id, startedAt, playerNames, finalScores, status: sessionStatus, finalStriche: sessionFinalStriche, participantUids } = session; 

      // ---- START DEBUG LOG ----
      // Gelöschter Debug-Block
      // ---- END DEBUG LOG ----

      const userId = user?.uid;
      let outcome: 'win' | 'loss' | 'draw' | 'unknown' = 'unknown';

      if (sessionStatus === 'completed' && finalScores && userId && participantUids.includes(userId)) {
        let userTeam: 'top' | 'bottom' | null = null;
        if (playerNames && user?.displayName) {
            if (playerNames['1'] === user.displayName || playerNames['3'] === user.displayName) {
                userTeam = 'bottom';
            } else if (playerNames['2'] === user.displayName || playerNames['4'] === user.displayName) {
                userTeam = 'top';
            }
        }

        if (userTeam) {
          if (finalScores.top === finalScores.bottom) {
            outcome = 'draw';
          } else if (userTeam === 'top' && finalScores.top > finalScores.bottom) {
              outcome = 'win';
          } else if (userTeam === 'bottom' && finalScores.bottom > finalScores.top) {
            outcome = 'win';
          } else {
            outcome = 'loss';
          }
        }
      }

      const outcomeIcon = {
        win: <CheckCircle className="w-4 h-4 text-green-500" />,
        loss: <XCircle className="w-4 h-4 text-red-500" />,
        draw: <MinusCircle className="w-4 h-4 text-yellow-500" />,
        unknown: null 
      }[outcome];

      // Stark vereinfachte Bedingung - nur status wird geprüft
      const sessionStatusIcon = sessionStatus === 'completed'
        ? <CheckCircle className="w-4 h-4 text-green-500" />
        : <XCircle className="w-4 h-4 text-red-500" />;

      const title = currentGroup?.name || 'Partie';

      const calculateTotalStriche = (
        stricheP: StricheRecord | undefined,
        settings?: StrokeSettings
      ): number => {
        if (!stricheP) return 0;
        // KORREKTUR: Kein Multiplikator für kontermatsch, da der Wert bereits 
        // den Multiplikator aus den Einstellungen enthält
        return (
          (stricheP.berg || 0) +
          (stricheP.sieg || 0) +
          (stricheP.matsch || 0) +
          (stricheP.schneider || 0) +
          (stricheP.kontermatsch || 0) // Direkt den Wert ohne erneute Multiplikation verwenden
        );
      };

      const activeStrokeSettings = currentGroup?.strokeSettings ?? DEFAULT_STROKE_SETTINGS;

      const totalStricheBottom = sessionStatus === 'completed' && sessionFinalStriche 
          ? calculateTotalStriche(sessionFinalStriche.bottom, activeStrokeSettings) 
          : null;
      const totalStricheTop = sessionStatus === 'completed' && sessionFinalStriche 
          ? calculateTotalStriche(sessionFinalStriche.top, activeStrokeSettings) 
          : null;
      
      let displayDateValue: number | Timestamp | FieldValue | undefined | null = null;
      if (sessionStatus === 'completed' && session.endedAt && isFirestoreTimestamp(session.endedAt)) {
          displayDateValue = session.endedAt;
      } else if (session.startedAt) {
          displayDateValue = session.startedAt;
      }

      const displayDate = isFirestoreTimestamp(displayDateValue) ? displayDateValue.toDate() : 
                         (typeof displayDateValue === 'number' ? new Date(displayDateValue) : null);
      const formattedDate = displayDate ? format(displayDate, 'dd.MM.yy, HH:mm') : 'Unbekannt';

      return (
        <Link href={`/view/session/${id}`} key={`session-${id}`} passHref>
          <div className="p-3 bg-gray-700/50 rounded-lg hover:bg-gray-600/50 transition-colors duration-150 cursor-pointer mb-2">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center flex-grow">
                <span className="text-sm font-medium text-white mr-2">
                  {title} - {formattedDate}
                </span>
                <div className="flex-shrink-0">
                  {sessionStatusIcon}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center text-sm text-gray-400">
                <div>
                  <span className="block">Team 1:&nbsp;<span className="text-white">{playerNames['1'] || '?'} + {playerNames['3'] || '?'}</span></span>
                </div>
                <span className="text-sm font-semibold text-white pl-2">{totalStricheBottom !== null ? totalStricheBottom : '-'}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-gray-400">
                <div>
                  <span className="block">Team 2:&nbsp;<span className="text-white">{playerNames['2'] || '?'} + {playerNames['4'] || '?'}</span></span>
                </div>
                <span className="text-sm font-semibold text-white pl-2">{totalStricheTop !== null ? totalStricheTop : '-'}</span>
              </div>
            </div>
          </div>
        </Link>
      );
    } else if (item.type === 'tournament') {
      const tournament = item;
      const { id, name, instanceDate, status: tournamentStatus } = tournament;
      const displayDate = instanceDate instanceof Timestamp ? instanceDate.toDate() : (typeof instanceDate === 'number' ? new Date(instanceDate) : null);
      const formattedDate = displayDate ? format(displayDate, 'dd.MM.yyyy') : null;

      return (
        <Link href={`/view/tournament/${id}`} key={`tournament-${id}`} passHref>
          <div className="p-3 bg-purple-900/30 rounded-lg hover:bg-purple-800/40 transition-colors duration-150 cursor-pointer mb-2 border border-purple-700/50">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <AwardIcon className="w-5 h-5 text-purple-400 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">{name}</span>
                  {formattedDate && (
                    <span className="text-sm text-gray-400">{formattedDate}</span>
                  )}
                </div>
              </div>
              <span className={`text-sm px-2 py-0.5 rounded-full ${tournamentStatus === 'completed' ? 'bg-gray-600 text-gray-300' : (tournamentStatus === 'active' ? 'bg-green-600 text-white' : 'bg-blue-500 text-white')}`}>
                {tournamentStatus === 'completed' ? 'Abgeschlossen' : (tournamentStatus === 'active' ? 'Aktiv' : 'Anstehend')}
              </span>
            </div>
          </div>
        </Link>
      );
    }
    return null;
  };

  // Gruppe wechseln
  const handleGroupChange = async (groupId: string) => {
    if (groupStatus === "loading") return;

    clearGroupError();
    
    try {
      setCurrentGroupId(groupId);
      // Der Gruppenwechsel löst automatisch den useEffect für die Statistiken aus
    } catch (error) {
      console.error("Fehler beim Wechseln der Gruppe:", error);
      const message = error instanceof Error ? error.message : "Gruppe konnte nicht gewechselt werden.";
      setGroupError(message);
    }
  };

  // NEU: Leite den aktiven Tab direkt aus dem Router ab
  const { mainTab, statsSubTab } = router.query;
  const activeMainTab = (typeof mainTab === 'string' && ['statistics', 'archive', 'members'].includes(mainTab)) 
    ? mainTab 
    : 'statistics';
  const activeStatsSubTab = (typeof statsSubTab === 'string' && ['overview', 'players', 'teams'].includes(statsSubTab)) 
    ? statsSubTab 
    : 'overview';

  // NEUE Funktion für Einladungsverarbeitung
  const handleProcessInviteInput = useCallback(async (inputValue: string, inviteUiType: 'group' | 'tournament') => {
    if (!showNotification || !router) {
        console.error("showNotification oder router nicht initialisiert in handleProcessInviteInput");
        return;
    }
    setIsProcessingInvite(true);

    const result = extractAndValidateToken(inputValue, inviteUiType);

    if (result.token) {
      if (result.type === 'group') {
        console.log(`[StartPage] Navigiere zu /join mit Gruppentoken: ${result.token}`);
        router.push(`/join?token=${result.token}`);
      } else if (result.type === 'tournament') {
        console.log(`[StartPage] Navigiere zu /join mit Turniertoken: ${result.token}`);
        router.push(`/join?tournamentToken=${result.token}`);
      } else if (result.type === 'ambiguous') {
        showNotification({
          message: result.error || "Der Typ des Codes (Gruppe/Turnier) ist unklar. Bitte prüfen Sie Ihre Eingabe.",
          type: "error",
        });
      } else { // type === 'invalid'
        showNotification({
          message: result.error || "Ungültige Eingabe.",
          type: "error",
        });
      }
    } else { // Kein Token extrahiert, nur Fehler
      showNotification({
        message: result.error || "Eingabe konnte nicht verarbeitet werden.",
        type: "error",
      });
    }
    setIsProcessingInvite(false);
  }, [router, showNotification]);

  // Der Gatekeeper: Zeige den Loader, bis die Daten UND der Router bereit sind.
  if (!isDataLoadDetermined || !router.isReady) {
    return (
      <MainLayout>
        <div className="flex flex-1 flex-col items-center justify-center min-h-[calc(100vh-112px)]">
          <div>
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
            <span className="ml-3 text-white">Laden...</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (isAuthenticated() && !isGuest && userGroups.length === 0 && !currentGroup) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <Image src="/welcome-guru.png" alt="Jassguru Logo" width={150} height={150} className="mb-8"/>
          <h1 className="text-3xl font-bold mb-3 text-center">Willkommen bei Jassguru!</h1>
          <p className="text-gray-400 mb-6 text-center max-w-md">
            Du bist noch keiner Gruppe beigetreten. Erstelle eine neue Gruppe oder gib hier einen Einladungscode ein, um loszulegen.
          </p>
          <div className="w-full max-w-sm">
            <JoinByInviteUI 
              inviteType="group" 
              onProcessInput={(inputValue) => handleProcessInviteInput(inputValue, "group")} 
              isLoading={isProcessingInvite} 
              showNotification={showNotification}
            />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (isAuthenticated() && !isGuest && userGroups.length > 0 && !currentGroup) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <Image src="/welcome-guru.png" alt="Jassguru Logo" width={150} height={150} className="mb-8"/>
          <h1 className="text-2xl font-bold mb-4">Wähle deine Jassgruppe</h1>
          <p className="text-gray-400 mb-6">Du bist Mitglied in mehreren Gruppen. Wähle eine aus oder tritt einer neuen bei.</p>
          <div className="w-full max-w-sm mb-6">
            <GroupSelector />
          </div>
          <div className="w-full max-w-sm">
            <JoinByInviteUI 
              inviteType="group" 
              onProcessInput={(inputValue) => handleProcessInviteInput(inputValue, "group")} 
              isLoading={isProcessingInvite} 
              showNotification={showNotification}
            />
          </div>
        </div>
      </MainLayout>
    );
  }
  
  if (isGuest || (groupStatus === 'error' && !currentGroup)) {
    // Für Gäste oder wenn Gruppen nicht geladen werden konnten, zeige nur Basis-UI ohne Gruppenspezifika
    // ODER eine Fehlermeldung. Hier erstmal vereinfacht:
    // Wenn Gast, zeige die normale Startseitenansicht für Gäste (ohne Gruppenauswahl/Einladung)
    // Wenn Fehler, zeige Fehlermeldung.
    // Dieser Teil muss ggf. noch verfeinert werden, je nachdem, was Gäste sehen sollen.
    if (isGuest) {
        return (
            <MainLayout>
                 <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
                    <h1 className="text-3xl font-bold mb-4 text-center">Gastmodus</h1>
                    <p className="text-gray-400 mb-6 text-center max-w-sm">
                        Im Gastmodus kannst du die App erkunden. Für vollen Funktionsumfang bitte anmelden.
                    </p>
                    {/* Ggf. CTA zum Anmelden/Registrieren */}
                </div>
            </MainLayout>
        );
    }
    if (groupStatus === 'error') {
         return (
            <MainLayout>
                <div className="text-center py-10">
                    <p className="text-red-500">Fehler beim Laden der Gruppe: {groupError}</p>
                </div>
            </MainLayout>
        );
    }
  }

  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-start min-h-screen bg-gray-900 text-white p-4 relative pt-8 pb-20">
        <div className="relative mb-4 mt-6">
          <div className={`relative w-32 h-32 rounded-full overflow-hidden border-2 ${selectedFile && previewUrl ? 'border-purple-500' : 'border-gray-700'} flex items-center justify-center bg-gray-800`}>
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt="Vorschau Gruppenlogo"
                layout="fill"
                objectFit="cover"
              />
            ) : currentGroup?.logoUrl ? (
              <Image
                src={currentGroup.logoUrl}
                alt={`Logo ${currentGroup?.name ?? 'Gruppe'}`}
                layout="fill"
                objectFit="cover"
                priority
                sizes="(max-width: 768px) 128px, 128px" // Beispiel: Passt die Grösse an (128px Breite)
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/placeholder-logo.png";
                }}
              />
            ) : (
              <span className="text-4xl font-bold text-gray-500">
                {(currentGroup?.name ?? '?').charAt(0).toUpperCase()}
              </span>
            )}

            {isAdmin && (
              <button
                onClick={handleSelectClick}
                className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-60 transition-all duration-200"
                disabled={isUploading}
                aria-label="Gruppenlogo ändern"
              >
                <Camera className="text-white opacity-0 hover:opacity-100 transition-opacity duration-200" size={32} />
              </button>
            )}
          </div>
        </div>

        <div className="w-full text-center mb-6 px-4">
          <h1 className="text-3xl font-bold mb-1 text-white break-words">{currentGroup?.name ?? 'Keine Gruppe ausgewählt'}</h1>
          <div className="text-sm text-gray-400 mx-auto max-w-xl break-words">
            <FormattedDescription 
              description={currentGroup?.description} 
              className="mx-auto" 
            />
          </div>
        </div>

        {selectedFile && previewUrl && (
          <div className="flex gap-2 justify-center mb-4">
            <Button
              onClick={handleUpload}
              className="bg-green-600 hover:bg-green-700 flex items-center gap-1"
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-1"></div>
                  Hochladen...
                </>
              ) : (
                <>
                  <Upload size={16} /> Hochladen
                </>
              )}
            </Button>
            <Button
              onClick={handleCancelSelection}
              className="bg-gray-600 hover:bg-gray-700 flex items-center gap-1"
              disabled={isUploading}
            >
              <X size={16} /> Abbrechen
            </Button>
          </div>
        )}

        <div className="flex justify-center items-center gap-3 mb-6 px-4">
          {isAdmin && (
              <Button
              variant="ghost" 
              size="sm" 
                onClick={handleInviteClick}
              className="hover:bg-gray-700/30 text-gray-300 hover:text-white"
              title="Teilnehmer einladen"
              >
              <UserPlus className="h-4 w-4 mr-1.5" /> Einladen
              </Button>
          )}
          {isAdmin && (
              <Button
              variant="ghost" 
              size="sm" 
                onClick={() => router.push("/groups/settings")}
              className="hover:bg-gray-700/30 text-gray-300 hover:text-white"
              title="Einstellungen"
              >
              <Settings className="h-4 w-4 mr-1.5" /> Einstellungen
              </Button>
          )}
        </div>

        <Tabs 
          value={activeMainTab} 
          onValueChange={(value) => {
            const query: { [key: string]: string | string[] | undefined } = { ...router.query, mainTab: value };
            if (value !== 'statistics') {
              delete query.statsSubTab;
            } else {
              // Beim Wechsel zum Statistik-Tab, setze den Sub-Tab auf 'overview', falls nicht vorhanden
              query.statsSubTab = query.statsSubTab || 'overview';
            }
            router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
          }} 
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3 bg-gray-800 p-1 rounded-lg mb-4 sticky top-0 z-30 backdrop-blur-md">
            <TabsTrigger 
              value="statistics" 
              className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-2.5 text-sm font-medium"
              style={{
                backgroundColor: activeMainTab === 'statistics' ? '#d97706' : 'transparent'
              }}
            >
              <BarChart className="w-4 h-4 mr-2" /> Statistik
            </TabsTrigger>
            <TabsTrigger 
              value="archive"
              className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-2.5 text-sm font-medium"
              style={{
                backgroundColor: activeMainTab === 'archive' ? '#d97706' : 'transparent'
              }}
            >
              <Archive className="w-4 h-4 mr-2" /> Archiv
            </TabsTrigger>
            <TabsTrigger
              value="members" 
              className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-2.5 text-sm font-medium"
              style={{
                backgroundColor: activeMainTab === 'members' ? '#d97706' : 'transparent'
              }}
            >
              <Users className="w-4 h-4 mr-2" /> Mitglieder
            </TabsTrigger>
          </TabsList>

          <TabsContent value="statistics" className="w-full mb-8">
            {statsError && !statsLoading && (
              <div className="text-red-400 text-sm text-center p-4 bg-red-900/30 rounded-md mb-4">
                Fehler beim Laden der Statistiken: {statsError}
              </div>
            )}
            {statsLoading ? (
              <div className="flex justify-center items-center py-10">
                <div className="h-8 w-8 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                <span className="ml-3 text-gray-300">Lade Statistiken...</span>
              </div>
            ) : (
                <Tabs 
                  value={activeStatsSubTab} 
                  onValueChange={(value) => {
                    router.replace({
                      pathname: router.pathname,
                      query: { ...router.query, mainTab: 'statistics', statsSubTab: value },
                    }, undefined, { shallow: true });
                  }} 
                  className="w-full"
                >
                  {/* Kleinerer Abstand (8px statt 16px) */}
                  <div className="h-2"></div>
                  
                  {/* Sticky Container für Sub-Tabs */}
                  <div className="sticky top-[44px] z-20 bg-gray-900 pt-0 pb-4">
                    <TabsList className="grid w-full grid-cols-3 bg-gray-800 p-1 rounded-lg backdrop-blur-md">
                      <TabsTrigger value="overview" className="data-[state=active]:bg-gray-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-1.5 text-sm font-medium">
                        <BarChart2 className="w-4 h-5 mr-1.5"/> Übersicht
                      </TabsTrigger>
                      <TabsTrigger value="players" className="data-[state=active]:bg-gray-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-1.5 text-sm font-medium">
                        <Users className="w-4 h-5 mr-1.5"/> Spieler
                      </TabsTrigger>
                      <TabsTrigger value="teams" className="data-[state=active]:bg-gray-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-1.5 text-sm font-medium">
                        <Users className="w-4 h-5 mr-1.5"/> Teams
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  
                  <TabsContent value="overview" className="w-full bg-gray-800/50 rounded-lg p-4">
                    <div className="space-y-3 text-sm">
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Gruppenübersicht</h3>
                      </div>
                        <div className="p-4 space-y-2">
                          <StatRow 
                            label="Mitglieder:" 
                            value={groupStats?.memberCount || 0} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow 
                            label="Anzahl Partien:" 
                            value={groupStats?.sessionCount || 0} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow 
                            label="Anzahl Turniere:" 
                            value={groupStats?.tournamentCount || 0} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow 
                            label="Anzahl Spiele:" 
                            value={groupStats?.gameCount || 0} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow 
                            label="Gesamte Jass-Zeit:" 
                            value={groupStats?.totalPlayTime || '-'} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow 
                            label="Erster Jass:" 
                            value={groupStats?.firstJassDate || '-'} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow 
                            label="Letzter Jass:" 
                            value={groupStats?.lastJassDate || '-'} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow 
                            label="Hauptspielort:" 
                            value={groupStats?.hauptspielortName || 'N/A'} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                      </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Durchschnittswerte & Details</h3>
                      </div>
                        <div className="p-4 space-y-2">
                          <StatRow 
                            label="Ø Dauer pro Partie:" 
                            value={groupStats?.avgSessionDuration || '-'} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow 
                            label="Ø Dauer pro Spiel:" 
                            value={groupStats?.avgGameDuration || '-'} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow 
                            label="Ø Spiele pro Partie:" 
                            value={groupStats?.avgGamesPerSession ? groupStats.avgGamesPerSession.toFixed(1) : '-'} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow 
                            label="Ø Runden pro Spiel:" 
                            value={groupStats?.avgRoundsPerGame ? groupStats.avgRoundsPerGame.toFixed(1) : '-'} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow 
                            label="Ø Matsch pro Spiel:" 
                            value={groupStats?.avgMatschPerGame ? groupStats.avgMatschPerGame.toFixed(2) : '-'} 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                          <StatRow
                            label="Ø Rundentempo:"
                            value={groupStats?.avgRoundDuration || '-'}
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                          />
                      </div>
                      </div>
                      
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Anzahl Spiele</h3>
                      </div>
                        <div ref={overviewMostGamesRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            if (groupStats?.playerWithMostGames && groupStats.playerWithMostGames.length > 0) {
                              return groupStats.playerWithMostGames.map((playerStat, index) => {
                                const playerData = findPlayerByName(playerStat.playerName, members);
                                const playerId = playerData?.id || playerData?.userId;
                                return (
                                  <Link href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=overview` : '#'} key={`mostGames-${index}`} className={`block rounded-md ${playerId ? 'cursor-pointer' : 'cursor-default'}`}>
                                    <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                      <div className="flex items-center">
                                        <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                        <ProfileImage 
                                          src={playerData?.photoURL} 
                                          alt={playerStat.playerName} 
                                          size="sm"
                                          className="mr-2 bg-yellow-600/20 flex items-center justify-center"
                                          fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                          fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                        />
                                        <span className="text-gray-300">{playerStat.playerName}</span>
                                      </div>
                                      <div className="flex items-center">
                                        <span className="text-white font-medium mr-2">{playerStat.value}</span>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              });
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Rundentempo</h3>
                        </div>
                        <div ref={playerRoundTimeRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            if (groupStats?.playerAllRoundTimes && groupStats.playerAllRoundTimes.length > 0) {
                              return groupStats.playerAllRoundTimes.map((playerStat, index) => {
                                const playerData = findPlayerByName(playerStat.playerName, members);
                                const playerId = playerData?.id || playerStat.playerId;
                                return (
                                  <Link href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=overview` : '#'} key={`roundTime-${index}`} className={`block rounded-md ${playerId ? 'cursor-pointer' : 'cursor-default'}`}>
                                    <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                      <div className="flex items-center">
                                        <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                        <ProfileImage 
                                          src={playerData?.photoURL} 
                                          alt={playerStat.playerName} 
                                          size="sm"
                                          className="mr-2 bg-yellow-600/20"
                                          fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                          fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                        />
                                        <span className="text-gray-300">{playerStat.playerName}</span>
                                      </div>
                                      <div className="flex items-center">
                                        <span className="text-white font-medium text-right whitespace-nowrap">{formatMillisecondsDuration(playerStat.value)}</span>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              });
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">% Trumpffarben</h3>
                        </div>
                        <div ref={overviewTrumpfRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {trumpfStatistikArray.length > 0 ? (
                            trumpfStatistikArray.map((item, index) => {
                              // NEU: Logik für dynamische Anzeige
                              const cardStyle = currentGroup?.farbeSettings?.cardStyle || 'DE';
                              const mappedColorKey = toTitleCase(item.farbe);
                              const displayName = CARD_SYMBOL_MAPPINGS[mappedColorKey as JassColor]?.[cardStyle] ?? mappedColorKey;
                              
                              return (
                                <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <FarbePictogram 
                                      farbe={normalizeJassColor(item.farbe)} 
                                      mode="svg" 
                                      cardStyle={cardStyle} // cardStyle übergeben
                                      className="h-8 w-8 mr-2"
                                    />
                                    <span className="text-gray-300 capitalize">{displayName}</span>
                                  </div>
                                  <span className="text-white font-medium">{(item.anteil * 100).toFixed(1)}%</span>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-gray-400 text-center py-2">Keine Trumpfstatistik verfügbar</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Spieler Tab */}
                  <TabsContent value="players" className="w-full bg-gray-800/50 rounded-lg p-4">
                    <div className="space-y-3 text-sm">
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Strichdifferenz</h3>
                      </div>
                        <div ref={playerStricheDiffRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            if (groupStats?.playerWithHighestStricheDiff && groupStats.playerWithHighestStricheDiff.length > 0) {
                              return groupStats.playerWithHighestStricheDiff.map((playerStat, index) => {
                                const playerData = findPlayerByName(playerStat.playerName, members);
                                const playerId = playerData?.id || playerData?.userId;
                                return (
                                 <Link href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`stricheDiff-${index}`} className={`block rounded-md ${playerId ? 'cursor-pointer' : 'cursor-default'}`}>
                                  <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                    <div className="flex items-center">
                                      <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                                                              <ProfileImage 
                                          src={playerData?.photoURL} 
                                          alt={playerStat.playerName} 
                                          size="sm"
                                          className="mr-2 bg-yellow-600/20"
                                          fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                          fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                        />
                                      <span className="text-gray-300">{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="text-white font-medium mr-2">{playerStat.value > 0 ? '+' : ''}{Math.trunc(playerStat.value)}</span>
                                    </div>
                                  </div>
                                </Link>
                              );
                            });
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Punktedifferenz</h3>
                        </div>
                        <div ref={playerPointsDiffRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            if (groupStats?.playerWithHighestPointsDiff && groupStats.playerWithHighestPointsDiff.length > 0) {
                              return groupStats.playerWithHighestPointsDiff.map((playerStat, index) => {
                                const playerData = findPlayerByName(playerStat.playerName, members);
                                const playerId = playerData?.id || playerStat.playerId;
                                return (
                                  <Link href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`pointsDiff-${index}`} className={`block rounded-md ${playerId ? 'cursor-pointer' : 'cursor-default'}`}>
                                    <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                      <div className="flex items-center">
                                        <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                        <ProfileImage 
                                          src={playerData?.photoURL} 
                                          alt={playerStat.playerName} 
                                          size="sm"
                                          className="mr-2 bg-yellow-600/20"
                                          fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                          fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                        />
                                        <span className="text-gray-300">{playerStat.playerName}</span>
                                      </div>
                                      <div className="flex items-center">
                                        <span className="text-white font-medium mr-2">{playerStat.value > 0 ? '+' : ''}{Math.trunc(playerStat.value)}</span>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              });
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Siegquote Partie</h3>
                        </div>
                        <div ref={playerWinRateSessionRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            if (groupStats?.playerWithHighestWinRateSession && groupStats.playerWithHighestWinRateSession.length > 0) {
                              return groupStats.playerWithHighestWinRateSession.map((playerStat, index) => {
                                const playerData = findPlayerByName(playerStat.playerName, members);
                                // KORREKTUR: Verwende die playerId aus der Statistik als Fallback
                                const playerId = playerData?.id || playerStat.playerId;
                                return (
                                  <Link href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`winRateSession-${index}`} className={`block rounded-md ${playerId ? 'cursor-pointer' : 'cursor-default'}`}>
                                    <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                      <div className="flex items-center">
                                        <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                        <ProfileImage 
                                          src={playerData?.photoURL} 
                                          alt={playerStat.playerName} 
                                          size="sm"
                                          className="mr-2 bg-yellow-600/20"
                                          fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                          fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                        />
                                        <span className="text-gray-300">{playerStat.playerName}</span>
                                      </div>
                                      <div className="flex items-center">
                                        {/* KORREKTUR: Stelle sicher, dass der Wert eine Zahl ist, bevor toFixed aufgerufen wird. Zeige 0.0% für ungültige Werte. */}
                                        <span className="text-white font-medium mr-2">{(typeof playerStat.value === 'number' ? playerStat.value * 100 : 0).toFixed(1)}%</span>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              });
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Siegquote Spiel</h3>
                        </div>
                        <div ref={playerWinRateGameRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            if (groupStats?.playerWithHighestWinRateGame && groupStats.playerWithHighestWinRateGame.length > 0) {
                              return groupStats.playerWithHighestWinRateGame.map((playerStat, index) => {
                                const playerData = findPlayerByName(playerStat.playerName, members);
                                const playerId = playerData?.id || playerStat.playerId;
                                return (
                                  <Link href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`winRateGame-${index}`} className={`block rounded-md ${playerId ? 'cursor-pointer' : 'cursor-default'}`}>
                                    <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                      <div className="flex items-center">
                                        <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                        <ProfileImage 
                                          src={playerData?.photoURL} 
                                          alt={playerStat.playerName} 
                                          size="sm"
                                          className="mr-2 bg-yellow-600/20"
                                          fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                          fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                        />
                                        <span className="text-gray-300">{playerStat.playerName}</span>
                                      </div>
                                      <div className="flex items-center">
                                        <span className="text-white font-medium mr-2">{(typeof playerStat.value === 'number' ? playerStat.value * 100 : 0).toFixed(1)}%</span>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              });
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Matsch-Bilanz</h3>
                        </div>
                        <div ref={playerMatschRateRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            if (groupStats?.playerWithHighestMatschBilanz && groupStats.playerWithHighestMatschBilanz.length > 0) {
                              return groupStats.playerWithHighestMatschBilanz.map((playerStat, index) => {
                                const playerData = findPlayerByName(playerStat.playerName, members);
                                const playerId = playerData?.id || playerStat.playerId;
                                return (
                                  <Link href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`matschBilanz-${index}`} className={`block rounded-md ${playerId ? 'cursor-pointer' : 'cursor-default'}`}>
                                    <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                      <div className="flex items-center">
                                        <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                        <ProfileImage 
                                          src={playerData?.photoURL} 
                                          alt={playerStat.playerName} 
                                          size="sm"
                                          className="mr-2 bg-yellow-600/20"
                                          fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                          fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                        />
                                        <span className="text-gray-300">{playerStat.playerName}</span>
                                      </div>
                                      <div className="flex items-center">
                                        <span className="text-white font-medium mr-2">{playerStat.value > 0 ? '+' : ''}{playerStat.value} ({playerStat.eventsMade || 0}/{playerStat.eventsReceived || 0})</span>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              });
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Schneider-Bilanz</h3>
                        </div>
                        <div ref={playerSchneiderRateRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            if (groupStats?.playerWithHighestSchneiderBilanz && groupStats.playerWithHighestSchneiderBilanz.length > 0) {
                              return groupStats.playerWithHighestSchneiderBilanz.map((playerStat, index) => {
                                const playerData = findPlayerByName(playerStat.playerName, members);
                                const playerId = playerData?.id || playerStat.playerId;
                                return (
                                  <Link href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`schneiderBilanz-${index}`} className={`block rounded-md ${playerId ? 'cursor-pointer' : 'cursor-default'}`}>
                                    <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                      <div className="flex items-center">
                                        <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                        <ProfileImage 
                                          src={playerData?.photoURL} 
                                          alt={playerStat.playerName} 
                                          size="sm"
                                          className="mr-2 bg-yellow-600/20"
                                          fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                          fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                        />
                                        <span className="text-gray-300">{playerStat.playerName}</span>
                                      </div>
                                      <div className="flex items-center">
                                        <span className="text-white font-medium mr-2">{playerStat.value > 0 ? '+' : ''}{playerStat.value} ({playerStat.eventsMade || 0}/{playerStat.eventsReceived || 0})</span>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              });
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Kontermatsch-Bilanz</h3>
                        </div>
                        <div ref={playerSchneiderRateRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            if (groupStats?.playerWithHighestKontermatschBilanz && groupStats.playerWithHighestKontermatschBilanz.length > 0) {
                              // Filtere nur Spieler mit Kontermatsch-Erfahrung (eventsMade > 0 oder eventsReceived > 0)
                              const playersWithKontermatsch = groupStats.playerWithHighestKontermatschBilanz.filter(playerStat => 
                                (playerStat.eventsMade || 0) > 0 || (playerStat.eventsReceived || 0) > 0
                              );
                              
                              if (playersWithKontermatsch.length > 0) {
                                return playersWithKontermatsch.map((playerStat, index) => {
                                  const playerData = findPlayerByName(playerStat.playerName, members);
                                  const playerId = playerData?.id || playerStat.playerId;
                                  return (
                                    <Link href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`kontermatschBilanz-${index}`} className={`block rounded-md ${playerId ? 'cursor-pointer' : 'cursor-default'}`}>
                                      <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                        <div className="flex items-center">
                                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                          <ProfileImage 
                                            src={playerData?.photoURL} 
                                            alt={playerStat.playerName} 
                                            size="sm"
                                            className="mr-2 bg-yellow-600/20"
                                            fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                            fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                          />
                                          <span className="text-gray-300">{playerStat.playerName}</span>
                                        </div>
                                        <div className="flex items-center">
                                          <span className="text-white font-medium mr-2">{playerStat.value > 0 ? '+' : ''}{playerStat.value} ({playerStat.eventsMade || 0}/{playerStat.eventsReceived || 0})</span>
                                        </div>
                                      </div>
                                    </Link>
                                  );
                                });
                              } else {
                                return <div className="text-gray-400 text-center py-2">Keine Kontermatsch-Erfahrung vorhanden</div>;
                              }
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Weis-Durchschnitt</h3>
                        </div>
                        <div ref={playerWeisAvgRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            if (groupStats?.playerWithMostWeisPointsAvg && groupStats.playerWithMostWeisPointsAvg.length > 0) {
                              return groupStats.playerWithMostWeisPointsAvg.map((playerStat, index) => {
                                const playerData = findPlayerByName(playerStat.playerName, members);
                                const playerId = playerData?.id || playerStat.playerId;
                                return (
                                  <Link href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`weisPoints-${index}`} className={`block rounded-md ${playerId ? 'cursor-pointer' : 'cursor-default'}`}>
                                    <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                      <div className="flex items-center">
                                        <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                        <ProfileImage 
                                          src={playerData?.photoURL} 
                                          alt={playerStat.playerName} 
                                          size="sm"
                                          className="mr-2 bg-yellow-600/20"
                                          fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                          fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                        />
                                        <span className="text-gray-300">{playerStat.playerName}</span>
                                      </div>
                                      <div className="flex items-center">
                                        <span className="text-white font-medium mr-2">{Math.round(Number(playerStat.value))}</span>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              });
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 text-center text-sm text-gray-500 px-4">
                      Hinweis: In den Ranglisten werden nur Spieler berücksichtigt, die innerhalb des letzten Jahres aktiv waren.
                    </div>
                  </TabsContent>

                  {/* Teams Tab */}
                  <TabsContent value="teams" className="w-full bg-gray-800/50 rounded-lg p-4">
                    <div className="space-y-3 text-sm">
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Strichdifferenz</h3>
                        </div>
                        <div ref={teamStricheDiffRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {groupStats?.teamWithHighestStricheDiff && groupStats.teamWithHighestStricheDiff.length > 0 ? (
                            groupStats.teamWithHighestStricheDiff.map((team, index) => (
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                <div className="flex items-center">
                                  <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                  <div className="flex -space-x-2 mr-2">
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[0], members)} 
                                      alt={team.names[0]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    />
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[1], members)} 
                                      alt={team.names[1]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    />
                                  </div>
                                  <span className="text-gray-300">{team.names.join(' & ')}</span>
                                </div>
                                <span className="text-white font-medium">{Math.round(Number(team.value))}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                          )}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Punktedifferenz</h3>
                        </div>
                        <div ref={teamPointsDiffRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {groupStats?.teamWithHighestPointsDiff && groupStats.teamWithHighestPointsDiff.length > 0 ? (
                            groupStats.teamWithHighestPointsDiff.map((team, index) => (
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                <div className="flex items-center">
                                  <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                  <div className="flex -space-x-2 mr-2">
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[0], members)} 
                                      alt={team.names[0]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    />
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[1], members)} 
                                      alt={team.names[1]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    />
                                  </div>
                                  <span className="text-gray-300">{team.names.join(' & ')}</span>
                                </div>
                                <span className="text-white font-medium">{Math.round(Number(team.value))}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                          )}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Siegquote (Partien)</h3>
                        </div>
                        <div ref={teamWinRateSessionRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {groupStats?.teamWithHighestWinRateSession && groupStats.teamWithHighestWinRateSession.length > 0 ? (
                            groupStats.teamWithHighestWinRateSession.map((team, index) => (
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                <div className="flex items-center">
                                  <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                  <div className="flex -space-x-2 mr-2">
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[0], members)} 
                                      alt={team.names[0]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    />
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[1], members)} 
                                      alt={team.names[1]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    />
                                  </div>
                                  <span className="text-gray-300">{team.names.join(' & ')}</span>
                                </div>
                                <span className="text-white font-medium">{(Number(team.value) * 100).toFixed(1)}%</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                          )}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Siegquote (Spiele)</h3>
                      </div>
                        <div ref={teamWinRateGameRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {groupStats?.teamWithHighestWinRateGame && groupStats.teamWithHighestWinRateGame.length > 0 ? (
                            groupStats.teamWithHighestWinRateGame.map((team, index) => (
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                <div className="flex items-center">
                                  <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                  <div className="flex -space-x-2 mr-2">
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[0], members)} 
                                      alt={team.names[0]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    />
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[1], members)} 
                                      alt={team.names[1]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    />
                                  </div>
                                  <span className="text-gray-300">{team.names.join(' & ')}</span>
                                </div>
                                <span className="text-white font-medium">{(Number(team.value) * 100).toFixed(1)}%</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                          )}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Matsch-Bilanz</h3>
                        </div>
                        <div ref={teamMatschRateRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            // ✅ KORRIGIERT: Verwende teamWithHighestMatschBilanz statt teamWithHighestMatschRate
                            const teamMatschData = groupStats?.teamWithHighestMatschBilanz || groupStats?.teamWithHighestMatschRate;
                            if (teamMatschData && teamMatschData.length > 0) {
                              return teamMatschData.map((team, index) => (
                                <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <div className="flex -space-x-2 mr-2">
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(team.names[0], members)} 
                                        alt={team.names[0]} 
                                        size="sm"
                                        className="border-2 border-gray-800 bg-yellow-600/20"
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={team.names[0].charAt(0).toUpperCase()}
                                      />
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(team.names[1], members)} 
                                        alt={team.names[1]} 
                                        size="sm"
                                        className="border-2 border-gray-800 bg-yellow-600/20"
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                      />
                                    </div>
                                    <span className="text-gray-300">{team.names.join(' & ')}</span>
                                  </div>
                                  <div className="flex items-center">
                                    {/* ✅ KORRIGIERT: Zeige absolute Bilanz statt Rate */}
                                    <span className="text-white font-medium mr-2">
                                      {team.value > 0 ? '+' : ''}{Math.round(Number(team.value))}
                                    </span>
                                    {team.eventsMade !== undefined && team.eventsReceived !== undefined && (
                                      <span className="text-gray-400 text-xs">
                                        ({team.eventsMade}/{team.eventsReceived})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ));
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Schneider-Bilanz</h3>
                        </div>
                        <div ref={teamSchneiderRateRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            // ✅ KORRIGIERT: Verwende teamWithHighestSchneiderBilanz statt teamWithHighestSchneiderRate
                            const teamSchneiderData = groupStats?.teamWithHighestSchneiderBilanz || groupStats?.teamWithHighestSchneiderRate;
                            if (teamSchneiderData && teamSchneiderData.length > 0) {
                              return teamSchneiderData.map((team, index) => (
                                <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <div className="flex -space-x-2 mr-2">
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(team.names[0], members)} 
                                        alt={team.names[0]} 
                                        size="sm"
                                        className="border-2 border-gray-800 bg-yellow-600/20"
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={team.names[0].charAt(0).toUpperCase()}
                                      />
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(team.names[1], members)} 
                                        alt={team.names[1]} 
                                        size="sm"
                                        className="border-2 border-gray-800 bg-yellow-600/20"
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                      />
                                    </div>
                                    <span className="text-gray-300">{team.names.join(' & ')}</span>
                                  </div>
                                  <div className="flex items-center">
                                    {/* ✅ KORRIGIERT: Zeige absolute Bilanz statt Rate */}
                                    <span className="text-white font-medium mr-2">
                                      {team.value > 0 ? '+' : ''}{Math.round(Number(team.value))}
                                    </span>
                                    {team.eventsMade !== undefined && team.eventsReceived !== undefined && (
                                      <span className="text-gray-400 text-xs">
                                        ({team.eventsMade}/{team.eventsReceived})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ));
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      {/* ✅ NEU: Kontermatsch-Bilanz für Teams */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Kontermatsch-Bilanz</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {(() => {
                            const teamKontermatschData = groupStats?.teamWithHighestKontermatschBilanz || groupStats?.teamWithHighestKontermatschRate;
                            if (teamKontermatschData && teamKontermatschData.length > 0) {
                              // ✅ KORRIGIERT: Filtere Teams mit Kontermatsch-Erfahrung basierend auf value statt eventsMade/eventsReceived
                              const teamsWithKontermatsch = teamKontermatschData.filter(team => 
                                // Für Teams: Wenn eventsMade/eventsReceived verfügbar, verwende diese, sonst verwende value != 0
                                (team.eventsMade !== undefined && team.eventsReceived !== undefined) 
                                  ? ((team.eventsMade && team.eventsMade > 0) || (team.eventsReceived && team.eventsReceived > 0))
                                  : (team.value !== 0) // Fallback: Zeige Teams mit Bilanz != 0
                              );
                              
                              if (teamsWithKontermatsch.length > 0) {
                                return teamsWithKontermatsch.map((team, index) => (
                                  <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                    <div className="flex items-center">
                                      <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                      <div className="flex -space-x-2 mr-2">
                                        <ProfileImage 
                                          src={findPlayerPhotoByName(team.names[0], members)} 
                                          alt={team.names[0]} 
                                          size="sm"
                                          className="border-2 border-gray-800 bg-yellow-600/20"
                                          fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                          fallbackText={team.names[0].charAt(0).toUpperCase()}
                                        />
                                        <ProfileImage 
                                          src={findPlayerPhotoByName(team.names[1], members)} 
                                          alt={team.names[1]} 
                                          size="sm"
                                          className="border-2 border-gray-800 bg-yellow-600/20"
                                          fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                          fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                        />
                                      </div>
                                      <span className="text-gray-300">{team.names.join(' & ')}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="text-white font-medium mr-2">
                                        {team.value > 0 ? '+' : ''}{Math.round(Number(team.value))}
                                      </span>
                                      {team.eventsMade !== undefined && team.eventsReceived !== undefined && (
                                        <span className="text-gray-400 text-xs">
                                          ({team.eventsMade}/{team.eventsReceived})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ));
                              } else {
                                return <div className="text-gray-400 text-center py-2">Keine Kontermatsch-Erfahrung vorhanden</div>;
                              }
                            } else {
                              return <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Weis-Durchschnitt</h3>
                      </div>
                        <div ref={teamWeisAvgRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {groupStats?.teamWithMostWeisPointsAvg && groupStats.teamWithMostWeisPointsAvg.length > 0 ? (
                            groupStats.teamWithMostWeisPointsAvg.map((team, index) => (
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                <div className="flex items-center">
                                  <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                  <div className="flex -space-x-2 mr-2">
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[0], members)} 
                                      alt={team.names[0]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    />
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[1], members)} 
                                      alt={team.names[1]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    />
                                  </div>
                                  <span className="text-gray-300">{team.names.join(' & ')}</span>
                                </div>
                                <span className="text-white font-medium">{Math.round(Number(team.value))}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                          )}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Rundentempo</h3>
                        </div>
                        <div ref={teamRoundTimeRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {groupStats?.teamWithFastestRounds && groupStats.teamWithFastestRounds.length > 0 ? (
                            groupStats.teamWithFastestRounds.map((team, index) => (
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                <div className="flex items-center">
                                  <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                  <div className="flex -space-x-2 mr-2">
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[0], members)} 
                                      alt={team.names[0]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    />
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[1], members)} 
                                      alt={team.names[1]} 
                                      size="sm"
                                      className="border-2 border-gray-800 bg-yellow-600/20"
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    />
                                  </div>
                                  <span className="text-gray-300">{team.names.join(' & ')}</span>
                                </div>
                                <span className="text-white font-medium text-right whitespace-nowrap">{formatMillisecondsDuration(Number(team.value))}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 text-center text-sm text-gray-500 px-4">
                      Hinweis: In den Ranglisten werden nur Spieler berücksichtigt, die innerhalb des letzten Jahres aktiv waren.
                    </div>
                  </TabsContent>
                </Tabs>
              )}
          </TabsContent>

            <TabsContent value="archive" className="w-full bg-gray-800/50 rounded-lg p-4 mb-8">
            {sessionsError && !sessionsLoading && !tournamentsLoading && combinedArchiveItems.length === 0 && (
                <div className="text-center text-gray-400 py-6 px-4 bg-gray-800/30 rounded-md">
                    <Archive size={32} className="mx-auto mb-3 text-gray-500" />
                    <p className="font-semibold text-gray-300">Keine Einträge im Archiv</p>
                    <p className="text-sm">Abgeschlossene Partien und Turniere werden hier angezeigt.</p>
                </div>
            )}
             {(sessionsLoading || tournamentsLoading) && (!sessionsError && !tournamentsError) && (
              <div className="flex justify-center items-center py-10">
                <div className="h-8 w-8 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                <span className="ml-3 text-gray-300">Lade Archiv...</span>
              </div>
            )}
            {!sessionsLoading && !tournamentsLoading && combinedArchiveItems.length === 0 && !sessionsError && !tournamentsError && (
                <div className="text-center text-gray-400 py-6 px-4 bg-gray-800/30 rounded-md">
                    <Archive size={32} className="mx-auto mb-3 text-gray-500" />
                    <p className="font-semibold text-gray-300">Keine Einträge im Archiv</p>
                    <p className="text-sm">Abgeschlossene Partien und Turniere werden hier angezeigt.</p>
                </div>
            )}
            {((sessionsError && completedSessions.length === 0) || (tournamentsError && groupTournaments.length === 0)) && !sessionsLoading && !tournamentsLoading && (
              <div className="text-center text-red-400 py-6 px-4 bg-red-900/20 rounded-md">
                <AlertTriangle size={32} className="mx-auto mb-3 text-red-500" />
                <p className="font-semibold text-red-300">Fehler beim Laden des Archivs</p>
                {sessionsError && <p className="text-sm">Sessions: {sessionsError}</p>}
                {tournamentsError && <p className="text-sm">Turniere: {tournamentsError}</p>}
              </div>
            )}
            {!sessionsLoading && !tournamentsLoading && combinedArchiveItems.length > 0 && (
              <div className="space-y-4">
                {sortedYears.map(year => (
                  <div key={year}>
                    <h3 className="text-lg font-semibold text-white mb-3 text-center">{year}</h3>
                    <div className="space-y-2">
                      {groupedArchiveByYear[year].map(renderArchiveItem)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

            <TabsContent value="members" className="w-full bg-gray-800/50 rounded-lg p-4 mb-8">
            {membersError && !membersLoading && (
                <div className="text-red-400 text-sm text-center p-4 bg-red-900/30 rounded-md">
                    Fehler: {membersError}
                </div>
            )}
            <GroupMemberList 
              members={members.map(member => {
                // Finde die korrekten Spielwerte aus groupStats, falls verfügbar
                const statsPlayer = groupStats?.playerWithMostGames?.find(p => 
                  p.playerName.toLowerCase() === member.displayName?.toLowerCase()
                );
                
                // Wenn Spieler in den Statistiken gefunden, setze die korrekte Spielezahl
                if (statsPlayer) {
                  return {
                    ...member,
                    stats: {
                      ...(member.stats || {}),
                      gamesPlayed: statsPlayer.value
                    }
                  } as FirestorePlayer;
                }
                return member;
              }).sort((a, b) => (b.stats?.gamesPlayed || 0) - (a.stats?.gamesPlayed || 0))} 
              isLoading={membersLoading} 
            />
            </TabsContent>

        </Tabs>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/jpeg, image/png"
          className="hidden"
          disabled={isUploading}
        />

      </div>

      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={handleCloseInviteModal}
        isLoading={isGeneratingInvite}
        error={inviteError}
        inviteToken={inviteToken}
        groupName={currentGroup?.name || "Gruppe"}
        onGenerateNew={handleGenerateNewInvite}
      />

      <ImageCropModal
        isOpen={cropModalOpen}
        onClose={() => handleCropComplete(null)}
        imageSrc={imageToCrop}
        onCropComplete={handleCropComplete}
      />


    </MainLayout>
  );
};

export default StartPage;
