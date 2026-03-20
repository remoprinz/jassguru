"use client";

import React, {useEffect, useState, useRef, useCallback, useMemo} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {useGroupStore} from "@/store/groupStore";
import {useGameStore} from "@/store/gameStore";
import {useJassStore, createInitialTeamStand} from "@/store/jassStore";
import {useUIStore} from "@/store/uiStore";
import {useTournamentStore} from "@/store/tournamentStore";
import MainLayout from "@/components/layout/MainLayout";
import {CheckCircle, XCircle, MinusCircle, Award as AwardIcon} from "lucide-react";
import imageCompression from "browser-image-compression";
import {uploadGroupLogo} from "@/services/groupService";
import {getFunctions, httpsCallable} from "firebase/functions";
import { getGroupMembersOptimized } from '@/services/groupService'; // 🚀 NEUER IMPORT
import ProfileImage from '@/components/ui/ProfileImage';
import type { FirestorePlayer, ActiveGame, GameEntry, RoundEntry, CompletedGameSummary, StricheRecord, JassColor, FarbeSettings, ScoreSettings } from "@/types/jass";
import { getFirestore, doc, getDoc, collection, getDocs, query, where, orderBy, limit, onSnapshot, Unsubscribe, Timestamp, FieldValue } from "firebase/firestore";
import { firebaseApp } from "@/services/firebaseInit";
import { useTimerStore } from "@/store/timerStore";
import { fetchAllGroupSessions, SessionSummary } from '@/services/sessionService';
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
import { StrokeSettings } from '@/types/jass';
import { extractAndValidateToken } from "@/utils/tokenUtils";

// THEME-SYSTEM IMPORTE
import { THEME_COLORS, getCurrentProfileTheme, type ThemeColor } from '@/config/theme';
// ENDE NEUE IMPORTE
import { useNestedScrollFix } from '@/hooks/useNestedScrollFix';
import { GroupView } from '@/components/group/GroupView'; // ✅ NEUE IMPORT

// 🚀 PERFORMANCE-OPTIMIERUNG: Erstelle eine Member-Map für schnellen Zugriff
const useMemberMap = (members: FirestorePlayer[]) => {
  return useMemo(() => {
    const map = new Map<string, FirestorePlayer>();
    members.forEach(member => {
      if (member.displayName) {
        map.set(member.displayName.toLowerCase(), member);
      }
    });
    return map;
  }, [members]);
};

// Hilfsfunktion zum Finden des Spieler-Profilbilds anhand des Namens
function findPlayerPhotoByName(playerName: string, memberMap: Map<string, FirestorePlayer>): string | undefined {
  if (!playerName) return undefined;
  const player = memberMap.get(playerName.toLowerCase());
  return player?.photoURL || undefined;
}

// Hilfsfunktion zum Finden des Spieler-Objekts anhand des Namens
function findPlayerByName(playerName: string, memberMap: Map<string, FirestorePlayer>): FirestorePlayer | undefined {
  if (!playerName) return undefined;
  return memberMap.get(playerName.toLowerCase());
}

// Typ-Guard für Firestore Timestamp
function isFirestoreTimestamp(value: any): value is Timestamp {
  return value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function';
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

const StartPage = () => {
  // ===== FEATURE FLAG FÜR SICHERE MIGRATION =====
  const USE_GROUP_VIEW_COMPONENT = true; // 🚨 SICHERHEITS-FLAG: false = original, true = neue Komponente
  // ===============================================
  
  const {user, status, isAuthenticated, isGuest} = useAuthStore();
  const {currentGroup, userGroups, status: groupStatus, error: groupError, clearError: clearGroupError, setCurrentGroupId, setError: setGroupError, lastSettingsUpdateTimestamp} = useGroupStore();
  const gameStore = useGameStore();
  const jassStore = useJassStore();
  const isGameInProgress = useGameStore((state) => state.isGameStarted && !state.isGameCompleted);
  const userActiveTournamentId = useTournamentStore((state) => state.userActiveTournamentId);
  const userTournamentInstances = useTournamentStore((state) => state.userTournamentInstances);
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

  const [completedSessions, setCompletedSessions] = useState<any[]>([]);
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

  const [isResuming, setIsResuming] = useState(false);
  
  const [isProcessingInvite, setIsProcessingInvite] = useState(false);

  // Theme-System: Verwende Gruppen-Theme mit Fallback zu 'yellow'
  const groupTheme = currentGroup?.theme || 'yellow';
  const theme = THEME_COLORS[groupTheme as keyof typeof THEME_COLORS] || THEME_COLORS.yellow;

  // Hilfsfunktion zur Umwandlung von Theme-Namen zu Standard-Tailwind-600-Farben für Tab-Styling
  const getTabActiveColor = (themeKey: string): string => {
    const accentColorMap: Record<ThemeColor, string> = {
      'green': '#10b981',   // green-500 (Standard Tailwind)
      'blue': '#3b82f6',    // blue-500
      'purple': '#a855f7',  // purple-500
      'pink': '#ec4899',    // pink-500
      'yellow': '#eab308',  // yellow-500
      'teal': '#14b8a6',    // teal-500
      'orange': '#f97316',  // orange-500
      'cyan': '#06b6d4',    // cyan-500
    };
    return accentColorMap[themeKey as keyof typeof accentColorMap] || '#ca8a04'; // Fallback zu Standard-Gelb (yellow-600)
  };

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

  // 🚀 NEU: Preload Gruppenbild für sofortige Anzeige
  useEffect(() => {
    if (currentGroup?.logoUrl && typeof window !== 'undefined') {

      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = currentGroup.logoUrl;
      link.type = 'image/jpeg'; // Standard für Firebase Storage
      document.head.appendChild(link);

      // Cleanup: Link nach 10 Sekunden entfernen (Browser hat genug Zeit zum Preloaden)
      const cleanup = setTimeout(() => {
        if (document.head.contains(link)) {
          document.head.removeChild(link);
        }
      }, 10000);

      return () => {
        clearTimeout(cleanup);
        if (document.head.contains(link)) {
          document.head.removeChild(link);
        }
      };
    }
  }, [currentGroup?.logoUrl]);

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
      if (currentGroup) {
        setMembersLoading(true);
        try {
          // 🚀 PERFORMANCE-FIX: Ersetze ineffiziente Ladefunktion
          const fetchedMembers = await getGroupMembersOptimized(currentGroup.id);
          setMembers(fetchedMembers);
        } catch (error) {
          console.error("Fehler beim Laden der Gruppenmitglieder:", error);
          setMembersError("Mitglieder konnten nicht geladen werden.");
          showNotification({ message: "Fehler beim Laden der Gruppenmitglieder.", type: "error" });
        } finally {
          setMembersLoading(false);
        }
      } else {
        setMembers([]);
        setMembersLoading(false);
      }
    };

    loadMembers();
  }, [currentGroup?.id, showNotification]);

  useEffect(() => {
    const loadArchiveData = async () => {
      // Sessions-Laden ist nun gruppenspezifisch
      if (currentGroup) {
        setSessionsLoading(true);
        setSessionsError(null);
        try {
          // NEU: Verwende fetchAllGroupSessions mit der ID der aktuellen Gruppe
          const sessions = await fetchAllGroupSessions(currentGroup.id);
          setCompletedSessions(sessions);
        } catch (error) {
          console.error("Fehler beim Laden der abgeschlossenen Gruppensessions:", error);
          const message = error instanceof Error ? error.message : "Abgeschlossene Partien konnten nicht geladen werden.";
          setSessionsError(message);
        } finally {
          setSessionsLoading(false);
        }

        // Turniere der Gruppe laden
        setTournamentsLoading(true);
        setTournamentsError(null);
        try {
          // ✅ TURNIERE WIEDER LADEN: Alle Turniere (inklusive unterbrochene)
          const tournaments = await fetchTournamentInstancesForGroup(currentGroup.id);
          setGroupTournaments(tournaments);
        } catch (error) {
          console.error("Fehler beim Laden der Gruppen-Turniere:", error);
          const message = error instanceof Error ? error.message : "Turniere konnten nicht geladen werden.";
          setTournamentsError(message);
        } finally {
          setTournamentsLoading(false);
        }
      } else {
        // Wenn keine Gruppe ausgewählt ist, leere die Listen
        setCompletedSessions([]);
        setGroupTournaments([]);
        setSessionsLoading(false);
        setTournamentsLoading(false);
      }
    };

    loadArchiveData();
  }, [currentGroup, showNotification]); // Abhängigkeit von user und status entfernt, da jetzt alles von currentGroup abhängt

  // ===== RESUMABLE GAME DETECTION FIX =====
  
  // 🔧 FIX: Separate detection logic from group loading
    useEffect(() => {
    if (status === 'authenticated' && user) {
      // 🚀 ROBUST: Check for resumable games as soon as user is authenticated
      // Don't wait for currentGroup to load!
      
      const checkForResumableGames = async () => {
        if (!user?.uid || !user?.playerId) {
          return;
        }

        try {
          const db = getFirestore(firebaseApp);

          // ====================================================================
          // PRIORITÄT 0: Session-first Rejoin via User-Profil (überlebt Reinstall)
          // Geschrieben von subscribeToSession, gelöscht von resetJass.
          // ====================================================================
          try {
            const { USERS_COLLECTION } = await import('@/constants/firestore');
            const userDocSnap = await getDoc(doc(db, USERS_COLLECTION, user.uid));
            const currentActiveSessionId = userDocSnap.data()?.currentActiveSessionId as string | null;

            if (currentActiveSessionId) {
              // Session laden und currentActiveGameId holen
              const sessionSnap = await getDoc(doc(db, 'sessions', currentActiveSessionId));
              if (sessionSnap.exists()) {
                const activeGameId = sessionSnap.data()?.currentActiveGameId as string | null;
                if (activeGameId) {
                  // Verifizieren dass das Spiel noch live ist und dem User gehört
                  const gameSnap = await getDoc(doc(db, 'activeGames', activeGameId));
                  if (
                    gameSnap.exists() &&
                    gameSnap.data()?.status !== 'aborted' &&
                    gameSnap.data()?.status !== 'completed' &&
                    (gameSnap.data()?.participantUids?.includes(user.uid) ||
                      gameSnap.data()?.participantUids?.includes(user.playerId))
                  ) {
                    setResumableGameId(activeGameId);
                    try { sessionStorage.setItem(`resumableGameId_${user.uid}`, activeGameId); } catch (_) {}
                    return; // Fertig — korrekte Session gefunden
                  }
                }
              }
              // Session ungültig — Profil bereinigen (fire-and-forget)
              const { setDoc: sdCleanup } = await import('firebase/firestore');
              const { USERS_COLLECTION: UC } = await import('@/constants/firestore');
              sdCleanup(doc(db, UC, user.uid), { currentActiveSessionId: null, currentActiveGroupId: null }, { merge: true }).catch(() => {});
            }
          } catch (_sessionFirstError) {
            // Session-first fehlgeschlagen — Fall through zu Content-Score-Detection
          }

          const gamesRef = collection(db, "activeGames");
      
          // Query 1: Suche nach Firebase Auth UID (bestehende Logik)
          const uidQuery = query(
            gamesRef,
            where("participantUids", "array-contains", user.uid)
          );
      
          // Query 2: Suche nach Player ID (NEUE Logik für Kompatibilität)
          const playerIdQuery = query(
            gamesRef,
            where("participantUids", "array-contains", user.playerId)
          );
      
          // Führe beide Abfragen parallel aus
          const [uidSnapshot, playerIdSnapshot] = await Promise.all([
            getDocs(uidQuery),
            getDocs(playerIdQuery)
          ]);
      
          // Führe die Ergebnisse zusammen und entferne Duplikate
          const allDocs = new Map();
          uidSnapshot.forEach(doc => allDocs.set(doc.id, doc));
          playerIdSnapshot.forEach(doc => allDocs.set(doc.id, doc));
          
          const uniqueDocs = Array.from(allDocs.values());
      
          if (uniqueDocs.length > 0) {
            // Find the most recent active game
            const relevantGames = uniqueDocs.filter(doc => {
              const data = doc.data();
              return data.status !== 'aborted' && data.status !== 'completed';
            });
            
            if (relevantGames.length > 0) {
              // 🔧 KRITISCHER FIX: Sortiere nach "Inhalt" nicht nach "Alter"!
              // Priorität: Spiele mit Inhalt (höhere currentRound oder Scores) vor leeren Spielen
              const sortedGames = relevantGames.sort((a, b) => {
                const aData = a.data();
                const bData = b.data();
                
                // Berechne "Content Score" für jedes Spiel
                const getContentScore = (gameData: any): number => {
                  let score = 0;
                  
                  // Höhere Runde = mehr Inhalt
                  score += (gameData.currentRound || 1) * 100;
                  
                  // Scores > 0 = Spiel hat stattgefunden
                  const totalScore = (gameData.scores?.top || 0) + (gameData.scores?.bottom || 0);
                  score += totalScore;
                  
                  // Striche vorhanden = Spiel hat stattgefunden
                  const stricheTop = gameData.striche?.top || {};
                  const stricheBottom = gameData.striche?.bottom || {};
                  const totalStricheTop = Object.values(stricheTop).reduce((sum: number, val: unknown) => sum + ((val as number) || 0), 0) as number;
                  const totalStricheBottom = Object.values(stricheBottom).reduce((sum: number, val: unknown) => sum + ((val as number) || 0), 0) as number;
                  score += (totalStricheTop + totalStricheBottom) * 50;
                  
                  // Runden-Historie vorhanden = definitiv gespielt
                  // (Das prüfen wir nicht hier, da es in subcollection liegt)
                  
                  return score;
                };
                
                const aContentScore = getContentScore(aData);
                const bContentScore = getContentScore(bData);
                
                // 1. PRIORITÄT: Spiel mit mehr Inhalt
                if (aContentScore !== bContentScore) {
                  return bContentScore - aContentScore; // Höherer Content Score zuerst
                }
                
                // 2. FALLBACK: Bei gleichem Content Score, neueres Spiel bevorzugen
                const aTime = aData.createdAt?.toMillis() || 0;
                const bTime = bData.createdAt?.toMillis() || 0;
                  return bTime - aTime;
                });
                
              const mostRelevantGame = sortedGames[0];
              const gameId = mostRelevantGame.id;
              const gameData = mostRelevantGame.data();

              // console.log(`[StartPage] 🎯 CONTENT-BASED DETECTION: Selected game ${gameId} (Round: ${gameData.currentRound}, Scores: ${gameData.scores?.top || 0}:${gameData.scores?.bottom || 0})`);
              
              // 🔧 VERBESSERTE VALIDIERUNG: Unterscheide zwischen echten leeren Spielen und begonnenen Spielen
              const hasGameContent = (gameData.currentRound > 1) || 
                                     (gameData.scores?.top > 0) || 
                                     (gameData.scores?.bottom > 0) ||
                                     Object.values(gameData.striche?.top || {}).some((val: unknown) => (val as number) > 0) ||
                                     Object.values(gameData.striche?.bottom || {}).some((val: unknown) => (val as number) > 0);
              
              // ✅ ZUSÄTZLICHE KRITERIEN: Spiel gilt als "begonnen" wenn:
              // - createdAt ist älter als 5 Minuten (wahrscheinlich echtes Spiel)
              // - gameStartTime ist gesetzt (Spiel wurde gestartet)
              // 🔥 KRITISCH: Gib neuen Spielen eine Gnadenfrist von 2 Minuten!
              const gameAge = gameData.createdAt ? Date.now() - (gameData.createdAt.toMillis ? gameData.createdAt.toMillis() : gameData.createdAt) : 0;
              const isVeryNewGame = gameAge < 2 * 60 * 1000; // 2 Minuten Gnadenfrist
              
              const hasGameActivity = (gameData.gameStartTime && gameData.gameStartTime !== gameData.createdAt) ||
                                      (gameAge > 5 * 60 * 1000) || // Spiel älter als 5 Minuten
                                      isVeryNewGame; // ✅ NEUE Spiele bekommen automatisch eine Chance!
              
              const isRealGame = hasGameContent || hasGameActivity;
              
              if (!isRealGame) {
                // Empty game detected
                
                // Markiere das leere Spiel als aborted (aber warte nicht darauf)
                import('@/services/gameService').then(({ updateGameStatus }) => {
                  updateGameStatus(gameId, 'aborted').catch(error => 
                    console.warn('[StartPage] Failed to mark empty game as aborted:', error)
                  );
                });
                
                // Überspringe dieses leere Spiel und prüfe das nächste
                if (sortedGames.length > 1) {
                  const nextGame = sortedGames[1];
                  const nextGameId = nextGame.id;
                  const nextGameData = nextGame.data();
                  
                  if (process.env.NODE_ENV === 'development') {
                    console.log(`[StartPage] 🔄 FALLBACK: Trying next game ${nextGameId} (Round: ${nextGameData.currentRound}, Scores: ${nextGameData.scores?.top || 0}:${nextGameData.scores?.bottom || 0})`);
                  }
                  
                  setResumableGameId(nextGameId);
                  try {
                    sessionStorage.setItem(`resumableGameId_${user.uid}`, nextGameId);
                  } catch (storageError) {
                    console.warn('[StartPage] Could not persist resumableGameId to sessionStorage:', storageError);
                  }
                  return;
                } else {
                  if (process.env.NODE_ENV === 'development') {
                    console.log(`[StartPage] ❌ NO VALID GAMES: All games appear to be empty`);
                  }
                    clearResumableGameId();
                  try {
                    sessionStorage.removeItem(`resumableGameId_${user.uid}`);
                  } catch (storageError) {
                    console.warn('[StartPage] Could not clear resumableGameId from sessionStorage:', storageError);
                  }
                    return;
                  } 
              } else {
                // console.log(`[StartPage] 🎯 INITIAL: Game ${gameId} has content or activity (content=${hasGameContent}, activity=${hasGameActivity}, newGame=${isVeryNewGame}, age=${Math.round(gameAge/1000)}s), setting as resumable`);
              }
              
                      setResumableGameId(gameId);
              
              // 🔥 CRITICAL: Store in sessionStorage for persistence
              try {
                sessionStorage.setItem(`resumableGameId_${user.uid}`, gameId);
              } catch (storageError) {
                console.warn('[StartPage] Could not persist resumableGameId to sessionStorage:', storageError);
                }

              return; // Found and set, exit early
            }
          }
          
          // No active games found, clear any stored ID
          // No resumable games found
                    clearResumableGameId();
          try {
            sessionStorage.removeItem(`resumableGameId_${user.uid}`);
          } catch (storageError) {
            console.warn('[StartPage] Could not clear resumableGameId from sessionStorage:', storageError);
          }
          
        } catch (error) {
          console.error('[StartPage] Error checking for resumable games:', error);
          // Don't clear resumableGameId on error - could be temporary network issue
        }
      };
      
      // 🚀 IMMEDIATE CHECK: Run once on authentication
      checkForResumableGames();
      
      // 🔄 CONTINUOUS MONITORING: Set up listener for real-time updates
      let listenerUnsubscribe: Unsubscribe | null = null;
      
      const setupRealtimeListener = async () => {
        try {
          const db = getFirestore(firebaseApp);
          const gamesRef = collection(db, "activeGames");
          const q = query(
            gamesRef,
            where("participantUids", "array-contains", user.uid)
          );
          
          listenerUnsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
              const relevantGames = snapshot.docs.filter(doc => {
                const data = doc.data();
                return data.status !== 'aborted' && data.status !== 'completed';
              });
              
              if (relevantGames.length > 0) {
                const sortedGames = relevantGames.sort((a, b) => {
                  const aData = a.data();
                  const bData = b.data();
                  
                  // Berechne "Content Score" für jedes Spiel
                  const getContentScore = (gameData: any): number => {
                    let score = 0;
                    
                    // Höhere Runde = mehr Inhalt
                    score += (gameData.currentRound || 1) * 100;
                    
                    // Scores > 0 = Spiel hat stattgefunden
                    const totalScore = (gameData.scores?.top || 0) + (gameData.scores?.bottom || 0);
                    score += totalScore;
                    
                    // Striche vorhanden = Spiel hat stattgefunden
                    const stricheTop = gameData.striche?.top || {};
                    const stricheBottom = gameData.striche?.bottom || {};
                    const totalStricheTop = Object.values(stricheTop).reduce((sum: number, val: unknown) => sum + ((val as number) || 0), 0) as number;
                    const totalStricheBottom = Object.values(stricheBottom).reduce((sum: number, val: unknown) => sum + ((val as number) || 0), 0) as number;
                    score += (totalStricheTop + totalStricheBottom) * 50;
                    
                    // Runden-Historie vorhanden = definitiv gespielt
                    // (Das prüfen wir nicht hier, da es in subcollection liegt)
                    
                    return score;
                  };
                  
                  const aContentScore = getContentScore(aData);
                  const bContentScore = getContentScore(bData);
                  
                  // 1. PRIORITÄT: Spiel mit mehr Inhalt
                  if (aContentScore !== bContentScore) {
                    return bContentScore - aContentScore; // Höherer Content Score zuerst
                  }
                  
                  // 2. FALLBACK: Bei gleichem Content Score, neueres Spiel bevorzugen
                  const aTime = aData.createdAt?.toMillis() || 0;
                  const bTime = bData.createdAt?.toMillis() || 0;
                  return bTime - aTime;
                });
                
                const mostRelevantGame = sortedGames[0];
                const gameId = mostRelevantGame.id;
                const gameData = mostRelevantGame.data();
                
                if (useUIStore.getState().resumableGameId !== gameId) {
                  // console.log(`[StartPage] Real-time update: Setting resumable game ${gameId}`);
                  
                  // 🔧 VERBESSERTE VALIDIERUNG: Unterscheide zwischen echten leeren Spielen und begonnenen Spielen
                  const hasGameContent = (gameData.currentRound > 1) || 
                                         (gameData.scores?.top > 0) || 
                                         (gameData.scores?.bottom > 0) ||
                                         Object.values(gameData.striche?.top || {}).some((val: unknown) => (val as number) > 0) ||
                                         Object.values(gameData.striche?.bottom || {}).some((val: unknown) => (val as number) > 0);
                  
                  // ✅ ZUSÄTZLICHE KRITERIEN: Spiel gilt als "begonnen" wenn:
                  // - roundHistory existiert und mindestens eine Runde hat
                  // - createdAt ist älter als 5 Minuten (wahrscheinlich echtes Spiel)
                  // - gameStartTime ist gesetzt (Spiel wurde gestartet)
                  // 🔥 KRITISCH: Gib neuen Spielen eine Gnadenfrist von 2 Minuten!
                  const gameAge = gameData.createdAt ? Date.now() - (gameData.createdAt.toMillis ? gameData.createdAt.toMillis() : gameData.createdAt) : 0;
                  const isVeryNewGame = gameAge < 2 * 60 * 1000; // 2 Minuten Gnadenfrist
                  
                  const hasGameActivity = (gameData.roundHistory && gameData.roundHistory.length > 0) ||
                                          (gameData.gameStartTime && gameData.gameStartTime !== gameData.createdAt) ||
                                          (gameAge > 5 * 60 * 1000) || // Spiel älter als 5 Minuten
                                          isVeryNewGame; // ✅ NEUE Spiele bekommen automatisch eine Chance!
                  
                  const isRealGame = hasGameContent || hasGameActivity;
                  
                  if (!isRealGame) {
                    // Empty game detected
                    
                    // Markiere als aborted
                    import('@/services/gameService').then(({ updateGameStatus }) => {
                      updateGameStatus(gameId, 'aborted').catch(error => 
                        console.warn('[StartPage] Real-time: Failed to mark empty game as aborted:', error)
                      );
                    });
                    
                    // Clear resumable game ID da das Spiel leer ist
                    clearResumableGameId();
                    try {
                      sessionStorage.removeItem(`resumableGameId_${user.uid}`);
                    } catch (storageError) {
                      console.warn('[StartPage] Could not clear resumableGameId from sessionStorage:', storageError);
                    }
                    return;
              } else {
                    // console.log(`[StartPage] Real-time: Game ${gameId} has content or activity (content=${hasGameContent}, activity=${hasGameActivity}, newGame=${isVeryNewGame}, age=${Math.round(gameAge/1000)}s), keeping as resumable`);
                  }
                  
                  setResumableGameId(gameId);
                  try {
                    sessionStorage.setItem(`resumableGameId_${user.uid}`, gameId);
                  } catch (storageError) {
                    console.warn('[StartPage] Could not persist resumableGameId to sessionStorage:', storageError);
                  }
                }
              } else {
                // Real-time update processed
              clearResumableGameId();
                try {
                  sessionStorage.removeItem(`resumableGameId_${user.uid}`);
                } catch (storageError) {
                  console.warn('[StartPage] Could not clear resumableGameId from sessionStorage:', storageError);
                }
              }
            } else {
              // Real-time update processed
          clearResumableGameId();
              try {
                sessionStorage.removeItem(`resumableGameId_${user.uid}`);
              } catch (storageError) {
                console.warn('[StartPage] Could not clear resumableGameId from sessionStorage:', storageError);
              }
            }
          }, (error) => {
            console.error('[StartPage] Error in resumable games listener:', error);
            // Don't clear on error - could be temporary
          });
          
        } catch (error) {
          console.error('[StartPage] Error setting up resumable games listener:', error);
        }
      };
      
      // Set up real-time listener
      setupRealtimeListener();
      
      // 🔄 PERSISTENCE RECOVERY: Check sessionStorage on component mount
      try {
        const storedGameId = sessionStorage.getItem(`resumableGameId_${user.uid}`);
        if (storedGameId && !useUIStore.getState().resumableGameId) {
          // console.log(`[StartPage] 🔄 PERSISTENCE RECOVERY: Found stored resumable game ${storedGameId}`);
          
          // Verify the stored game is still valid
          const db = getFirestore(firebaseApp);
          const gameDocRef = doc(db, 'activeGames', storedGameId);
          getDoc(gameDocRef).then((gameDocSnap) => {
            if (gameDocSnap.exists() && 
                gameDocSnap.data()?.status !== 'aborted' && 
                gameDocSnap.data()?.status !== 'completed' &&
                (gameDocSnap.data()?.participantUids?.includes(user.uid) || (user.playerId && gameDocSnap.data()?.participantUids?.includes(user.playerId)))
            ) {
              
              // console.log(`[StartPage] ✅ PERSISTENCE RECOVERY: Restored resumable game ${storedGameId}`);
              setResumableGameId(storedGameId);
            } else {
              // console.log(`[StartPage] ❌ PERSISTENCE RECOVERY: Stored game ${storedGameId} is no longer valid, removing`);
              sessionStorage.removeItem(`resumableGameId_${user.uid}`);
            }
          }).catch((error) => {
            console.error(`[StartPage] Error verifying stored resumable game ${storedGameId}:`, error);
            // Keep the stored ID for now, let the real-time listener handle cleanup
          });
        }
      } catch (storageError) {
        console.warn('[StartPage] Could not check sessionStorage for resumableGameId:', storageError);
      }
      
      // Cleanup function
      return () => {
        if (listenerUnsubscribe) {
          listenerUnsubscribe();
        }
        // 🔧 FIX: DON'T clear resumableGameId on cleanup - let it persist!
        // The real-time listener will handle proper cleanup when games end
      };
    } else {
      // User not authenticated - clear everything
      clearResumableGameId();
      if (typeof window !== 'undefined' && user) {
        try {
          sessionStorage.removeItem(`resumableGameId_${user.uid}`);
        } catch (storageError) {
          console.warn('[StartPage] Could not clear resumableGameId from sessionStorage:', storageError);
        }
      }
      return () => {};
    }
  }, [status, user, setResumableGameId, clearResumableGameId]);

  // ===== LEGACY GROUP-BASED LISTENER (NOW DEPRECATED) =====
  // 🗑️ DEPRECATED: The old group-based detection is replaced by the robust user-based detection above
  // Keeping this commented for reference but it should be removed in future cleanup
  /*
  useEffect(() => {
    if (status === 'authenticated' && user && currentGroup) {
      // OLD GROUP-BASED DETECTION LOGIC WAS HERE
      // This is now handled by the robust user-based detection above
    }
  }, [status, user, currentGroup, setResumableGameId, clearResumableGameId, showNotification]);
  */

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
            
            // 🚨 KRITISCHE DRITTE PRIORITÄT: Gruppen-Settings aus Firestore laden!
            try {
              const groupId = activeGameData.groupId;
              if (groupId) {
                console.log("[StartPage] 🔄 DRITTE PRIORITÄT: Lade Gruppen-Settings aus Firestore für Gruppe", groupId);
                const groupDocRef = doc(db, 'groups', groupId);
                const groupDoc = await getDoc(groupDocRef);
                
                if (groupDoc.exists()) {
                  const groupData = groupDoc.data();
                  settingsFromActiveGame = {
                    farbeSettings: {
                        ...DEFAULT_FARBE_SETTINGS,
                        ...(groupData.farbeSettings || {}),
                        values: {
                            ...DEFAULT_FARBE_SETTINGS.values,
                            ...(groupData.farbeSettings?.values || {})
                        }
                    },
                    scoreSettings: {
                      ...DEFAULT_SCORE_SETTINGS,
                      ...(groupData.scoreSettings || {}),
                    },
                    strokeSettings: groupData.strokeSettings || DEFAULT_STROKE_SETTINGS,
                  };
                  console.log("[StartPage] ✅ DRITTE PRIORITÄT: Einstellungen aus Gruppen-Dokument geladen:", {
                    farbeCardStyle: settingsFromActiveGame.farbeSettings.cardStyle,
                    scoreWerte: settingsFromActiveGame.scoreSettings.values,
                    strokeSchneider: settingsFromActiveGame.strokeSettings.schneider
                  });
                } else {
                  throw new Error("Gruppen-Dokument nicht gefunden");
                }
              } else {
                throw new Error("Keine groupId verfügbar");
              }
            } catch (error3) {
              console.warn("[StartPage] ❌ DRITTE PRIORITÄT fehlgeschlagen:", error3);
            
            // LETZTE RETTUNG: Default-Einstellungen
            settingsFromActiveGame = {
              farbeSettings: DEFAULT_FARBE_SETTINGS,
              scoreSettings: DEFAULT_SCORE_SETTINGS,
              strokeSettings: DEFAULT_STROKE_SETTINGS,
            };
            console.log("[StartPage] ⚠️ LETZTE RETTUNG: Default-Einstellungen werden verwendet");
            }
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

      // FIX: Vollständige games-Array Rekonstruktion aus completedGames + aktuellem Spiel.
      // Ohne dies erscheinen abgeschlossene Spiele nach einem Crash/Neustart als "weg".
      const completedGameEntries: GameEntry[] = completedGames.map((cg) => ({
        id: cg.gameNumber,
        activeGameId: cg.activeGameId,
        timestamp: (cg as any).timestampCompleted?.seconds
          ? (cg as any).timestampCompleted.seconds * 1000
          : (cg as any).timestampCompleted?.toMillis?.() ?? createdAtMillis,
        sessionId: sessionId,
        teams: {
          top: { ...(createInitialTeamStand()), striche: cg.finalStriche?.top ?? { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, total: cg.finalScores?.top ?? 0, weisPoints: cg.weisPoints?.top ?? 0 },
          bottom: { ...(createInitialTeamStand()), striche: cg.finalStriche?.bottom ?? { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, total: cg.finalScores?.bottom ?? 0, weisPoints: cg.weisPoints?.bottom ?? 0 },
        },
        currentRound: (cg.roundHistory?.length ?? 0) + 1,
        startingPlayer: cg.startingPlayer ?? 1,
        initialStartingPlayer: cg.initialStartingPlayer ?? 1,
        currentPlayer: cg.startingPlayer ?? 1,
        roundHistory: cg.roundHistory ?? [],
        currentHistoryIndex: (cg.roundHistory?.length ?? 1) - 1,
        historyState: { lastNavigationTimestamp: 0 },
        isGameStarted: true,
        isRoundCompleted: true,
        isGameCompleted: true,
      }));

      const allGameEntries: GameEntry[] = [...completedGameEntries, reconstructedGameEntry];
      const allGameIds = allGameEntries.map((g) => (typeof g.id === 'number' ? g.id : parseInt(String(g.id), 10)));

      useJassStore.setState({
          isJassStarted: true,
          currentGameId: activeGameData.currentGameNumber,
          games: allGameEntries,
          currentSession: {
              id: sessionId,
              gruppeId: activeGameData.groupId ?? "",
              startedAt: createdAtMillis,
              playerNames: activeGameData.playerNames,
              games: allGameIds,
              currentScoreLimit: useGroupStore.getState().currentGroup?.scoreSettings?.values.sieg ?? DEFAULT_SCORE_SETTINGS.values.sieg,
              completedGamesCount: completedGameEntries.length,
              metadata: {},
              participantUids: activeGameData.participantUids,
              statistics: {
                gamesPlayed: allGameEntries.length,
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
      
      // ✅ PRÜFUNG: Genug Gruppenmitglieder für Online-Spiel?
      if (currentGroup && !membersLoading && members.length < 4) {
        showNotification({
          message: "Für Gruppenspiele mit Statistik braucht es mindestens vier Mitglieder. Du kannst aber trotzdem im Gastmodus jassen.",
          type: "info",
          actions: [
            {
              label: "Gastmodus",
              // 🔧 FIX: Zur WelcomeScreen navigieren anstatt direkt zu game/new
              onClick: () => router.push("/"),
            },
            {
              label: "Einladen", 
              onClick: () => {}, // Schliesst nur die Notification
            },
          ],
        });
        return;
      }
      
      // ENTFERNT: PWA-Prüfung, da sie den korrekten OnboardingFlow in JassKreidetafel.tsx blockiert
      // Die intelligente Onboarding-Logik (Desktop=QR-Code, Mobile=Installation) ist bereits in JassKreidetafel.tsx implementiert
      
      // Leitet den Benutzer zur dedizierten Seite für die Erstellung eines neuen
      // Online-Spiels, anstatt direkt zum Jass-Bildschirm.
      // Der Offline/Gast-Flow wird dadurch nicht beeinflusst.
      router.push("/game/new");
    }
  }, [resumableGameId, router, handleResumeGame, currentGroup, userGroups, showNotification, members, status]);

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

    // ✅ ELEGANT: Prüfe, ob User in einem AKTIVEN (nicht upcoming/paused/completed) Turnier ist
    // ✅ VERBESSERT: Prüfe direkt in userTournamentInstances, nicht nur über userActiveTournamentId
    // Das stellt sicher, dass der Button sofort verschwindet, sobald ein Turnier aktiv wird
    const activeTournament = userTournamentInstances.find(t => 
      t.status === 'active' && !t.pausedAt
    );
    const isUserInActiveTournament = !!activeTournament;

    if (isTournamentPasseActive || isUserInActiveTournament) {
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
  }, [currentGroup, isGameInProgress, setPageCta, resetPageCta, userGroups, router, resumableGameId, status, handleGameAction, isResuming, jassStore.currentSession, gameStore.isGameStarted, gameStore.isGameCompleted, userActiveTournamentId, userTournamentInstances]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const originalFile = files[0];
      if (!originalFile.type.startsWith("image/")) {
        showNotification({message: "Bitte wählen Sie eine Bilddatei (JPEG oder PNG)..", type: "error"});
        return;
      }
      const initialMaxSizeInBytes = 5 * 1024 * 1024;
      if (originalFile.size > initialMaxSizeInBytes) {
        showNotification({message: "Die Datei ist zu groß (max. 5 MB).", type: "error"});
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

    // ✅ FRONTEND ADMIN-PRÜFUNG für bessere Fehlermeldungen
    if (!isAdmin) {
      showNotification({
        message: "Nur Gruppenadministratoren können das Gruppenbild aktualisieren.",
        type: "warning",
        actions: [
          {
            label: "Verstanden",
            onClick: () => {},
          },
        ],
      });
      return;
    }

    setIsUploading(true);
    try {
      await uploadGroupLogo(currentGroup.id, selectedFile);
      showNotification({message: "Gruppenlogo erfolgreich aktualisiert.", type: "success"});
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Fehler beim Hochladen des Gruppenlogos:", error);
      
      // Verbesserte Fehlermeldung
      const errorMessage = error instanceof Error ? error.message : "Hochladen fehlgeschlagen.";
      if (errorMessage.includes('unauthorized') || errorMessage.includes('permission')) {
        showNotification({
          message: "Keine Berechtigung: Nur Gruppenadministratoren können das Gruppenbild ändern.",
          type: "error"
        });
      } else {
        showNotification({message: errorMessage, type: "error"});
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectClick = () => {
    if (!isAdmin) {
      showNotification({
        message: "Nur Gruppenadministratoren können das Gruppenbild ändern.",
        type: "info",
        actions: [
          {
            label: "Verstanden",
            onClick: () => {},
          },
        ],
      });
      return;
    }
    
    if (fileInputRef.current) {
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

    // ✅ FRONTEND ADMIN-PRÜFUNG für Einladungen
    if (!isAdmin) {
      showNotification({
        message: "Nur Gruppenadministratoren können Einladungen erstellen.",
        type: "info",
        actions: [
          {
            label: "Verstanden",
            onClick: () => {},
          },
        ],
      });
      return;
    }

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
    // ✅ FILTER: Nur normale Sessions (OHNE tournamentId UND OHNE isTournamentSession)
    const normalSessions = completedSessions.filter(session => 
      (session.status === 'completed' || session.status === 'completed_empty') &&
      !session.tournamentId && // Keine Turnier-Sessions
      !session.isTournamentSession // Keine jassGameSummaries mit isTournamentSession: true
    );

    const sessionsWithType: ArchiveItem[] = normalSessions.map(s => ({ ...s, type: 'session' }));
    
    // ✅ ALLE TURNIERE: Zeige alle Tournament-Instances (inklusive unterbrochene)
    const tournamentsWithType: ArchiveItem[] = groupTournaments.map(t => ({ ...t, type: 'tournament' }));

    const combined = [...sessionsWithType, ...tournamentsWithType];

    combined.sort((a, b) => {
      // 🎯 KORRIGIERT: Einheitliche Datums-Extraktion für alle Typen
      let dateAValue: number | Timestamp | FieldValue | undefined | null;
      let dateBValue: number | Timestamp | FieldValue | undefined | null;

      if (a.type === 'session') {
        dateAValue = a.startedAt;
      } else if ('tournamentId' in a && 'startedAt' in a) {
        // Turnier-Session: verwende startedAt
        dateAValue = (a as any).startedAt;
      } else {
        // Echte Tournament-Instance: verwende instanceDate oder createdAt
        dateAValue = (a as any).instanceDate ?? (a as any).createdAt;
      }

      if (b.type === 'session') {
        dateBValue = b.startedAt;
      } else if ('tournamentId' in b && 'startedAt' in b) {
        // Turnier-Session: verwende startedAt
        dateBValue = (b as any).startedAt;
      } else {
        // Echte Tournament-Instance: verwende instanceDate oder createdAt
        dateBValue = (b as any).instanceDate ?? (b as any).createdAt;
      }

      const timeA = isFirestoreTimestamp(dateAValue) ? dateAValue.toMillis() :
                    (typeof dateAValue === 'number' ? dateAValue :
                    (dateAValue && typeof (dateAValue as Timestamp).isEqual === 'function') ? Date.now() : 0);
      
      const timeB = isFirestoreTimestamp(dateBValue) ? dateBValue.toMillis() :
                    (typeof dateBValue === 'number' ? dateBValue :
                    (dateBValue && typeof (dateBValue as Timestamp).isEqual === 'function') ? Date.now() : 0);

      // 🎯 KORRIGIERT: Absteigende Sortierung (neueste zuerst)
      return timeB - timeA;
    });

    return combined;
  }, [completedSessions, groupTournaments]); // Abhängigkeit von currentGroup entfernt, da completedSessions bereits korrekt ist

  const groupedArchiveByYear = combinedArchiveItems.reduce<Record<string, ArchiveItem[]>>((acc, item) => {
    // 🎯 KORRIGIERT: Für Turnier-Sessions auch startedAt verwenden
    let dateToSort;
    if (item.type === 'session') {
      dateToSort = item.startedAt;
    } else if ('tournamentId' in item && 'startedAt' in item) {
      // Turnier-Session: verwende startedAt
      dateToSort = (item as any).startedAt;
    } else {
      // Echte Tournament-Instance: verwende instanceDate oder createdAt
      dateToSort = (item as any).instanceDate ?? (item as any).createdAt;
    }
    
    const year = isFirestoreTimestamp(dateToSort) ? dateToSort.toDate().getFullYear().toString() :
                 (typeof dateToSort === 'number' ? new Date(dateToSort).getFullYear().toString() :
                 '2025'); // Fallback zu 2025 statt 'Unbekannt'
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
          <div className="px-3 py-2 md:px-4 md:py-2.5 lg:px-6 lg:py-3 bg-gray-700/50 rounded-lg hover:bg-gray-600/50 transition-colors duration-150 cursor-pointer mb-2">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center flex-grow">
                <span className="text-base md:text-lg lg:text-xl font-medium mr-2" style={{ color: `${THEME_COLORS[currentGroup?.theme || 'purple']?.accentHex || '#a855f7'}` }}>
                  {title}
                </span>
                <span className="text-sm text-white mr-2">|</span>
                <span className="text-sm text-white">{formattedDate}</span>
                <div className="flex-shrink-0 ml-2">
                  {sessionStatusIcon}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              {/* Team Bottom */}
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  {/* 🎨 AVATAR-PAIR: Wie im GroupView Teams-Tab */}
                  <div className="flex mr-2">
                    <ProfileImage
                      src={members?.find(m => m.displayName === playerNames['1'])?.photoURL}
                      alt={playerNames['1'] || 'Spieler'}
                      size="sm"
                      className="border-2 border-gray-800"
                      style={{ zIndex: 1 }}
                      fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                      fallbackText={playerNames['1']?.charAt(0).toUpperCase() || '?'}
                      context="list"
                    />
                    <ProfileImage
                      src={members?.find(m => m.displayName === playerNames['3'])?.photoURL}
                      alt={playerNames['3'] || 'Spieler'}
                      size="sm"
                      className="border-2 border-gray-800 -ml-2"
                      style={{ zIndex: 0 }}
                      fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                      fallbackText={playerNames['3']?.charAt(0).toUpperCase() || '?'}
                      context="list"
                    />
                  </div>
                  <span className="text-sm text-gray-300 truncate pr-2">{playerNames['1'] || '?'} & {playerNames['3'] || '?'}</span>
                </div>
                <span className="text-lg font-medium text-white">{totalStricheBottom !== null ? totalStricheBottom : '-'}</span>
              </div>
              
              {/* Team Top */}
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  {/* 🎨 AVATAR-PAIR: Wie im GroupView Teams-Tab */}
                  <div className="flex mr-2">
                    <ProfileImage
                      src={members?.find(m => m.displayName === playerNames['2'])?.photoURL}
                      alt={playerNames['2'] || 'Spieler'}
                      size="sm"
                      className="border-2 border-gray-800"
                      style={{ zIndex: 1 }}
                      fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                      fallbackText={playerNames['2']?.charAt(0).toUpperCase() || '?'}
                      context="list"
                    />
                    <ProfileImage
                      src={members?.find(m => m.displayName === playerNames['4'])?.photoURL}
                      alt={playerNames['4'] || 'Spieler'}
                      size="sm"
                      className="border-2 border-gray-800 -ml-2"
                      style={{ zIndex: 0 }}
                      fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                      fallbackText={playerNames['4']?.charAt(0).toUpperCase() || '?'}
                      context="list"
                    />
                  </div>
                  <span className="text-sm text-gray-300 truncate pr-2">{playerNames['2'] || '?'} & {playerNames['4'] || '?'}</span>
                </div>
                <span className="text-lg font-medium text-white">{totalStricheTop !== null ? totalStricheTop : '-'}</span>
              </div>
            </div>
          </div>
        </Link>
      );
    } else if (item.type === 'tournament') {
      // 🎯 KORRIGIERT: Unterscheidung zwischen Turnier-Instanz und Turnier-Session
      const isTournamentSession = 'tournamentId' in item && 'startedAt' in item;
      
      if (isTournamentSession) {
        // Dies ist ein jassGameSummary mit tournamentId (Turnier-Session)
        const session = item as any;
        const tournamentId = session.tournamentId;
        // 🚨 ENDDATUM: endedAt ist das korrekte Enddatum aus jassGameSummaries
        const rawDate: any = (session as any).endedAt ?? null;
        const displayDate = rawDate instanceof Timestamp ? rawDate.toDate() : (typeof rawDate === 'number' ? new Date(rawDate) : null);
        const formattedDate = displayDate ? format(displayDate, 'dd.MM.yyyy') : null;
        
        // 🚨 TURNIERNAME: Direkt aus jassGameSummaries
        const tournamentName = (session as any).tournamentName || 'Turnier';
        
        return (
          <Link href={`/view/tournament/${tournamentId}`} key={`tournament-session-${session.id}`} passHref>
            <div className="px-3 py-2 lg:px-6 lg:py-3 bg-purple-900/30 rounded-lg hover:bg-purple-800/40 transition-colors duration-150 cursor-pointer mb-2 border border-purple-700/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <AwardIcon className="w-6 h-6 lg:w-8 lg:h-8 text-purple-400 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-base lg:text-xl font-medium text-white">{tournamentName}</span>
                    {formattedDate && (
                      <span className="text-sm lg:text-base text-gray-400">{formattedDate}</span>
                    )}
                  </div>
                </div>
                <span className={`text-sm lg:text-base px-2 py-0.5 rounded-full bg-gray-600 text-gray-300`}>
                  Abgeschlossen
                </span>
              </div>
            </div>
          </Link>
        );
      } else {
        // Dies ist eine echte TournamentInstance aus tournaments Collection
        const tournament = item;
        const { id, name, instanceDate, status: tournamentStatus } = tournament;
        // ✅ ROBUSTE DATUMS-LÖSUNG: Fallback-Kette für verschiedene Datumstypen
        let displayDate = null;
        
        if (instanceDate && isFirestoreTimestamp(instanceDate)) {
          // 1. Priorität: instanceDate (Turnier-Datum)
          displayDate = instanceDate.toDate();
        } else if ((tournament as any).createdAt && isFirestoreTimestamp((tournament as any).createdAt)) {
          // 2. Fallback: createdAt (Erstellungsdatum)
          displayDate = (tournament as any).createdAt.toDate();
        } else if (tournamentStatus === 'completed' && (tournament as any).completedAt && isFirestoreTimestamp((tournament as any).completedAt)) {
          // 3. Fallback für abgeschlossene: completedAt
          displayDate = (tournament as any).completedAt.toDate();
        }
        
        const formattedDate = displayDate ? format(displayDate, 'dd.MM.yyyy') : null;

        return (
          <Link href={`/view/tournament/${id}`} key={`tournament-${id}`} passHref>
            <div className="px-3 py-2 lg:px-6 lg:py-3 bg-purple-900/30 rounded-lg hover:bg-purple-800/40 transition-colors duration-150 cursor-pointer mb-2 border border-purple-700/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <AwardIcon className="w-6 h-6 lg:w-8 lg:h-8 text-purple-400 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-base lg:text-xl font-medium text-white">{(tournament as any).tournamentName || name || 'Turnier'}</span>
                    {formattedDate && (
                      <span className="text-sm lg:text-base text-gray-400">{formattedDate}</span>
                    )}
                  </div>
                </div>
                <span className={`text-sm lg:text-base px-2 py-0.5 rounded-full ${
                  tournamentStatus === 'completed' 
                    ? 'bg-gray-600 text-gray-300' 
                    : tournamentStatus === 'active' 
                      ? (tournament as any).pausedAt 
                        ? 'bg-yellow-600 text-white' 
                        : 'bg-green-600 text-white'
                      : 'bg-blue-500 text-white'
                }`}>
                  {tournamentStatus === 'completed' 
                    ? 'Abgeschlossen' 
                    : tournamentStatus === 'active' 
                      ? (tournament as any).pausedAt 
                        ? 'Pausiert' 
                        : 'Aktiv'
                      : 'Anstehend'
                  }
                </span>
              </div>
            </div>
          </Link>
        );
      }
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
  const { mainTab, statsSubTab, joined, newMember } = router.query;
  const activeMainTab = (typeof mainTab === 'string' && ['statistics', 'archive', 'members'].includes(mainTab)) 
    ? mainTab 
    : 'statistics';
  const activeStatsSubTab = (typeof statsSubTab === 'string' && ['overview', 'players', 'teams'].includes(statsSubTab)) 
    ? statsSubTab 
    : 'overview';
  
  // ✅ UX-VERBESSERUNG: Context-Parameter für personalisierte Willkommensnachricht
  const joinedGroupName = typeof joined === 'string' ? joined : null;
  const isNewMember = typeof newMember === 'string' ? newMember === 'true' : null;
  
  // ✅ CLEANUP: URL-Parameter nach Anzeige der Nachricht entfernen
  useEffect(() => {
    if (joinedGroupName && router.isReady) {
      const timer = setTimeout(() => {
        // Entferne Context-Parameter aus URL ohne Seitenneuladung
        const { joined, newMember, ...otherQuery } = router.query;
        router.replace({
          pathname: router.pathname,
          query: otherQuery
        }, undefined, { shallow: true });
      }, 3000); // Nach 3 Sekunden entfernen
      
      return () => clearTimeout(timer);
    }
  }, [joinedGroupName, router]);

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

  // 🚀 PERFORMANCE-OPTIMIERUNG: Member-Map für schnellen Zugriff
  const memberMap = useMemberMap(members);

  // 🚨 WATCHDOG: Automatischer Reset wenn App zu lange hängt
  useEffect(() => {
    if (!isDataLoadDetermined || !router.isReady) {
      const watchdog = setTimeout(() => {
        console.warn('[Watchdog] App hängt beim Laden (isDataLoadDetermined:', isDataLoadDetermined, ', router.isReady:', router.isReady, ') - prüfe Recovery-Status...');
        
        // 🛡️ SCHLEIFENSCHUTZ: Nur einmalig in dieser Session triggern
        try {
          const hasTriggeredRecovery = sessionStorage.getItem('watchdog-triggered');
          if (hasTriggeredRecovery === 'true') {
            console.warn('[Watchdog] Recovery bereits versucht - erzwinge einfachen Reload');
            window.location.reload();
            return;
          }
          
          sessionStorage.setItem('watchdog-triggered', 'true');
          console.warn('[Watchdog] Erster Recovery-Versuch - leite zu Kill-SW weiter');
          window.location.href = '/kill-sw.html?auto=true&source=startpage';
        } catch (error) {
          console.error('[Watchdog] Fehler beim Session-Check, führe einfachen Reload durch:', error);
          window.location.reload();
        }
      }, 20000); // 20 Sekunden Timeout
      
      return () => clearTimeout(watchdog);
    }
  }, [isDataLoadDetermined, router.isReady]);

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

  // ===== FEATURE FLAG SWITCH =====
  if (USE_GROUP_VIEW_COMPONENT) {
    return (
      <GroupView 
        currentGroup={currentGroup}
        user={user}
        isGuest={isGuest}
        userGroups={userGroups}
        isAuthenticated={isAuthenticated}
        isPublicView={false} // 🚨 Standard-Verhalten für eingeloggte/Gast-Ansicht
        handleProcessInviteInput={handleProcessInviteInput}
        isProcessingInvite={isProcessingInvite}
        showNotification={showNotification}
        groupStatus={groupStatus}
        groupError={groupError}
        // ✅ UX-VERBESSERUNG: Context-Parameter für personalisierte Willkommensnachricht
        joinedGroupName={joinedGroupName}
        isNewMember={isNewMember}
        // SCHRITT 2: Header & Upload Props
        isAdmin={isAdmin}
        selectedFile={selectedFile}
        previewUrl={previewUrl}
        isUploading={isUploading}
        handleSelectClick={handleSelectClick}
        handleUpload={handleUpload}
        handleCancelSelection={handleCancelSelection}
        handleInviteClick={handleInviteClick}
        router={router}
        // 🚨 NEU: FILE INPUT & CROP MODAL UI PROPS (FÜR 1000% PARITÄT)
        fileInputRef={fileInputRef}
        handleFileChange={handleFileChange}
        cropModalOpen={cropModalOpen}
        imageToCrop={imageToCrop}
        handleCropComplete={handleCropComplete}
        // SCHRITT 3: Tab-System Props
        activeMainTab={activeMainTab}
        activeStatsSubTab={activeStatsSubTab}
        groupTheme={groupTheme}
        statsLoading={statsLoading}
        statsError={statsError}
        members={members}
        membersLoading={membersLoading}
        membersError={membersError}
        completedSessions={completedSessions}
        groupTournaments={groupTournaments}
        combinedArchiveItems={combinedArchiveItems}
        groupedArchiveByYear={groupedArchiveByYear}
        sortedYears={sortedYears}
        renderArchiveItem={renderArchiveItem}
        // NEU: Archiv Loading/Error States
        sessionsLoading={sessionsLoading}
        sessionsError={sessionsError}
        tournamentsLoading={tournamentsLoading}
        tournamentsError={tournamentsError}
        // SCHRITT 4: Statistik-Daten Props
        groupStats={groupStats}
        theme={theme}
        findPlayerByName={(name) => findPlayerByName(name, memberMap)}
        findPlayerPhotoByName={(name) => findPlayerPhotoByName(name, memberMap)}
        // SCHRITT 5: InviteModal Props (FEHLTEN!)
        isInviteModalOpen={isInviteModalOpen}
        onCloseInviteModal={handleCloseInviteModal}
        inviteLoading={isGeneratingInvite}
        inviteError={inviteError}
        inviteToken={inviteToken}
        onGenerateNewInvite={handleGenerateNewInvite}
        // 🚨 NEUE MODAL HANDLER PROPS (FÜR EXAKTE ORIGINAL-KOMPATIBILITÄT)
        handleCloseInviteModal={handleCloseInviteModal}
        isGeneratingInvite={isGeneratingInvite}
        handleGenerateNewInvite={handleGenerateNewInvite}
      />
    );
  }
  
  // ✅ LEGACY FALLBACK: Nur für den Fall dass Feature Flag auf false gesetzt wird
  // TODO: Entfernen nach erfolgreicher Production-Migration
  throw new Error("Legacy UI wurde entfernt. Setze USE_GROUP_VIEW_COMPONENT = true");
  // ================================

  // 🚨 PHASE 1 LEGACY CLEANUP: Early Returns jetzt über GroupView abgehandelt
  // Diese Cases werden jetzt alle in der GroupView-Komponente behandelt
  
  // ❌ LEGACY REMOVED: Alle Early Return Cases sind nun in GroupView integriert
  //   - Welcome Screen für neue Benutzer
  //   - Group Selection Screen  
  //   - Guest Mode Screen
  //   - Error Handling Screens

  // ❌ LEGACY REMOVED: Komplettes MainLayout UI-System (~1500 Zeilen entfernt)
  //   - Header mit Logo-Upload
  //   - Tab-System (Statistik/Archiv/Mitglieder)  
  //   - Alle Statistik-Sub-Tabs
  //   - File Input und Modals
  
  // Die GroupView-Komponente übernimmt jetzt ALLE UI-Verantwortung
};

export default StartPage;
