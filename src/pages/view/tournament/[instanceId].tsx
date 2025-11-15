"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import {
  useTournamentStore,
  selectCurrentTournamentInstance,
  selectDetailsStatus,
  selectTournamentParticipants,
  selectCompletedTournamentGames,
  selectTournamentStatus,
  selectGamesStatus,
  selectIsTournamentLoading,
  selectParticipantsStatus,
  selectLoadingInstanceId,
  ParticipantWithProgress
} from "@/store/tournamentStore";
import { useGroupStore } from '@/store/groupStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useJassStore } from '@/store/jassStore';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Loader2, AlertTriangle, Award, Settings as SettingsIcon,
  Users as UsersIcon, ListChecks as ListChecksIcon, BarChart2,
  UserPlus as UserPlusIcon, PlayCircle, Archive as ArchiveIcon,
  Camera, Upload, X
} from 'lucide-react';
import { FiShare2 } from 'react-icons/fi';
import { format } from 'date-fns';
import { Timestamp, getFirestore, collection, query, where, orderBy, limit, onSnapshot, Unsubscribe, doc, getDoc } from 'firebase/firestore';
import { firebaseApp } from '@/services/firebaseInit';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TournamentInviteModal from '@/components/tournament/TournamentInviteModal';
import TournamentParticipantsList from '@/components/tournament/TournamentParticipantsList';
import TournamentStartScreen from '@/components/tournament/TournamentStartScreen';
import TournamentRankingList from '@/components/tournament/TournamentRankingList';
import TournamentPasseArchive from '@/components/tournament/TournamentPasseArchive';
import imageCompression from "browser-image-compression";
import PowerRatingChart from '@/components/charts/PowerRatingChart';
import { fetchTournamentRankingHistory, type PasseRankingSnapshot } from '@/services/tournamentRankingService';
import { getRankingColor } from '@/config/chartColors';
import ImageCropModal from "@/components/ui/ImageCropModal";
import { updateTournamentSettings, uploadTournamentLogoFirebase } from '@/services/tournamentService';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { getGroupMembersSortedByGames } from "@/services/playerService";
import GlobalLoader from '@/components/layout/GlobalLoader';
import { calculateNextPasse, calculateCompletedPassesCountFromGames } from '@/utils/tournamentPasseUtils';
import { sortPlayersByRankingMode, type RankingMode } from '@/utils/tournamentSorting';

import type { PlayerNumber, PlayerNames, StrokeSettings, ScoreSettings, FirestorePlayer } from '@/types/jass';
import type { TournamentGame } from '@/types/tournament';

import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

function isFirestoreTimestamp(value: any): value is Timestamp {
  return value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function';
}

// NEUE HILFSFUNKTION
const getGermanTournamentStatus = (status: string, tournament?: any): string => {
  switch (status.toLowerCase()) {
    case 'active':
      return tournament?.pausedAt ? 'Pausiert' : 'Aktiv';
    case 'completed':
      return 'Abgeschlossen';
    case 'upcoming': 
      return 'Anstehend';
    case 'archived':
      return 'Archiviert';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
};

type PlayerIdToNameMapping = Record<string, string>;

const TournamentViewPage: React.FC = () => {
  const router = useRouter();
  // Debugging-Ausgaben nur für Entwicklung aktivieren und mit einer Bedingung versehen
  const isDebugMode = process.env.NODE_ENV === 'development' && false; // auf false setzen, um Debugging zu deaktivieren
  
  const { instanceId } = router.query as { instanceId: string };
  const { user, status: authStatus } = useAuthStore();
  const { currentGroup } = useGroupStore();
  
  // 🆕 Public View Detection
  const isPublicView = !user || authStatus !== 'authenticated';
  
  // 🎨 RESPONSIVE LAYOUT HOOK - Desktop/Tablet/Mobile Optimierung
  const layout = useResponsiveLayout();
  
  // ===== LOKALE TAB-COLOR FUNKTION =====
  const getTabActiveColor = (themeKey: string): string => {
    const colorMap: Record<string, string> = {
      'pink': '#ec4899',     // pink-600 (Standard Tailwind)
      'green': '#059669',    // emerald-600 (Standard Tailwind)
      'blue': '#2563eb',     // blue-600 (Standard Tailwind)
      'purple': '#9333ea',   // purple-600 (Standard Tailwind)
      'yellow': '#ca8a04',   // yellow-600 (Standard Tailwind, konsistent mit Theme)
      'teal': '#0d9488',     // teal-600 (Standard Tailwind)
      'orange': '#ea580c',   // orange-600 (Standard Tailwind)
      'cyan': '#0891b2',     // cyan-600 (Standard Tailwind)
    };
    return colorMap[themeKey] || '#9333ea'; // Fallback zu Purple (Turnier-Standard)
  };
  
  const tournamentTheme = 'purple'; // Turniere verwenden standardmäßig Purple
  
  const fetchTournamentInstanceDetails = useTournamentStore((state) => state.fetchTournamentInstanceDetails);
  const setupTournamentListener = useTournamentStore((state) => state.setupTournamentListener);
  const setupParticipantsListener = useTournamentStore((state) => state.setupParticipantsListener);
  const setupGamesListener = useTournamentStore((state) => state.setupGamesListener);
  const tournament = useTournamentStore((state) => state.currentTournamentInstance);
  const tournamentError = useTournamentStore((state) => state.error);
  const detailsStatus = useTournamentStore(selectDetailsStatus);
  const loadingInstanceIdFromStore = useTournamentStore(selectLoadingInstanceId);
  const showNotification = useUIStore((state) => state.showNotification);

  const [showStartPasseScreen, setShowStartPasseScreen] = useState(false);
  const [activeTab, setActiveTab] = useState("ranking");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  

  const currentTournamentGames = useTournamentStore((state) => state.currentTournamentGames);
  const loadTournamentGames = useTournamentStore((state) => state.loadTournamentGames);
  const gamesStatus = useTournamentStore(selectGamesStatus);

  const loadTournamentParticipants = useTournamentStore((state) => state.loadTournamentParticipants);
  const tournamentParticipants = useTournamentStore(selectTournamentParticipants);
  const participantsStatus = useTournamentStore(selectParticipantsStatus);


  const [resumablePasseId, setResumablePasseId] = useState<string | null>(null);
  const [isCheckingForResumablePasse, setIsCheckingForResumablePasse] = useState<boolean>(true);
  const activePasseListener = useRef<Unsubscribe | null>(null);

  // 🆕 NEU: Zustand für alle aktiven Passen des Turniers (für korrekte Passe-Nummerierung)
  const [activePassesInTournament, setActivePassesInTournament] = useState<any[]>([]);
  const allActivePassesListenerRef = useRef<Unsubscribe | null>(null);

  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  // Komponenten- und Datenladeverwaltung mit memoisierter instanceId
  const memoizedInstanceId = useMemo(() => instanceId, [instanceId]);

  const [isLoadingMembersForPasse, setIsLoadingMembersForPasse] = useState(false);
  const [membersForPasse, setMembersForPasse] = useState<FirestorePlayer[]>([]);

  // 🆕 NEU: Ranking History State
  const [rankingHistory, setRankingHistory] = useState<PasseRankingSnapshot[]>([]);
  const [rankingHistoryLoading, setRankingHistoryLoading] = useState(false);

  // ✅ NEU: Separate Ranking-Histories für "alle_ranglisten"
  const [allRankingHistories, setAllRankingHistories] = useState<{
    striche_difference: PasseRankingSnapshot[];
    striche: PasseRankingSnapshot[];
    total_points: PasseRankingSnapshot[];
    points_difference: PasseRankingSnapshot[];
  }>({
    striche_difference: [],
    striche: [],
    total_points: [],
    points_difference: []
  });
  const [allRankingHistoriesLoading, setAllRankingHistoriesLoading] = useState(false);

  useEffect(() => {
    if (!memoizedInstanceId || typeof memoizedInstanceId !== 'string') return;

    const isAlreadyLoadedAndCorrect = detailsStatus === 'success' && tournament?.id === memoizedInstanceId;
    const isLoadingThisInstance = detailsStatus === 'loading' && loadingInstanceIdFromStore === memoizedInstanceId;

    if (!isAlreadyLoadedAndCorrect && !isLoadingThisInstance) {
      fetchTournamentInstanceDetails(memoizedInstanceId);
    }
  }, [memoizedInstanceId, fetchTournamentInstanceDetails, detailsStatus, tournament?.id, loadingInstanceIdFromStore, isDebugMode]);

  // useEffect Hook für das Aufräumen beim Verlassen der Seite (Unmount)
  useEffect(() => {
    return () => {
      // Ruft die clearCurrentTournamentInstance Aktion aus dem Store auf, wenn die Komponente unmounted wird.
      // Dies stellt sicher, dass der Store-Zustand für Turniere zurückgesetzt wird, 
      // wenn der Benutzer die Turnierdetailansicht verlässt.
      // Die interne Logik von fetchTournamentInstanceDetails im Store kümmert sich bereits darum,
      // spezifische Teile des States (Spiele, Teilnehmer) zu leeren, wenn eine *neue* Instanz-ID geladen wird.
      // Dieser Cleanup hier ist für den Fall, dass die gesamte Sektion verlassen wird.
      // console.log(`[TournamentViewPage] Component unmounting. Clearing tournament store state via useTournamentStore.getState().clearCurrentTournamentInstance().`);
      useTournamentStore.getState().clearCurrentTournamentInstance();
    };
  }, []); // Leeres Dependency-Array stellt sicher, dass dies nur beim Mount und Unmount ausgeführt wird.

  // Separate useEffect-Hooks für Games und Participants
  useEffect(() => {
    if (!memoizedInstanceId || typeof memoizedInstanceId !== 'string') return;
    if (tournament?.id === memoizedInstanceId && detailsStatus === 'success' && gamesStatus !== 'loading' && gamesStatus !== 'success') {
      loadTournamentGames(memoizedInstanceId);
    }
  }, [memoizedInstanceId, tournament?.id, detailsStatus, gamesStatus, loadTournamentGames, isDebugMode]);

  useEffect(() => {
    if (!memoizedInstanceId || typeof memoizedInstanceId !== 'string') {
      return;
    }
    if (tournament?.id === memoizedInstanceId && (participantsStatus === 'success' || participantsStatus === 'loading')) {
        return;
    }

    if (tournament?.id === memoizedInstanceId && detailsStatus === 'success') {
      loadTournamentParticipants(memoizedInstanceId);
    }
  }, [memoizedInstanceId, tournament?.id, detailsStatus, participantsStatus, loadTournamentParticipants, isDebugMode, tournament?.status]);

  // 🆕 NEU: Lade Participants neu, wenn sich Games ändern (Real-time Updates!)
  useEffect(() => {
    if (!memoizedInstanceId || typeof memoizedInstanceId !== 'string') return;
    if (!tournament?.id || tournament.id !== memoizedInstanceId) return;
    if (currentTournamentGames.length === 0) return; // Warte bis Games geladen sind
    
    console.log(`[TournamentViewPage] 🔄 Games changed (${currentTournamentGames.length}), reloading participants...`);
    
    // Lade Participants neu, wenn sich Games ändern
    // Das aktualisiert completedPassesCount und andere Metriken in Echtzeit
    loadTournamentParticipants(memoizedInstanceId);
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoizedInstanceId, tournament?.id, currentTournamentGames.length]); // ✅ participantsStatus bewusst NICHT in Dependencies (würde Endlosschleife verursachen)

  // 🆕 NEU: Lade Ranking History (Real-time bei neuen Passen)
  useEffect(() => {
    if (!memoizedInstanceId || !tournament?.settings?.rankingMode) return;
    
    // ✅ NEU: Wenn "alle_ranglisten", lade alle Modi
    if ((tournament.settings.rankingMode as string) === 'alle_ranglisten') {
      setAllRankingHistoriesLoading(true);
      Promise.all([
        fetchTournamentRankingHistory(memoizedInstanceId, 'striche_difference'),
        fetchTournamentRankingHistory(memoizedInstanceId, 'striche'),
        fetchTournamentRankingHistory(memoizedInstanceId, 'total_points'),
        fetchTournamentRankingHistory(memoizedInstanceId, 'points_difference')
      ])
        .then(([stricheDiff, striche, points, pointsDiff]) => {
          setAllRankingHistories({
            striche_difference: stricheDiff,
            striche: striche,
            total_points: points,
            points_difference: pointsDiff
          });
        })
        .catch(err => {
          console.error('[TournamentViewPage] Error loading all ranking histories:', err);
          setAllRankingHistories({
            striche_difference: [],
            striche: [],
            total_points: [],
            points_difference: []
          });
        })
        .finally(() => setAllRankingHistoriesLoading(false));
    } else {
      // Normale Logik: Nur einen Modus laden
    setRankingHistoryLoading(true);
      fetchTournamentRankingHistory(memoizedInstanceId, tournament.settings.rankingMode as RankingMode)
      .then(history => setRankingHistory(history))
      .catch(err => {
        console.error('[TournamentViewPage] Error loading ranking history:', err);
        setRankingHistory([]);
      })
      .finally(() => setRankingHistoryLoading(false));
    }
  }, [memoizedInstanceId, tournament?.settings?.rankingMode, currentTournamentGames.length]); // ✅ NEU: Lädt neu bei neuen Games

  // ✅ NEU: Hilfsfunktion zur Transformation von Ranking-History in Chart-Daten
  const transformRankingHistoryToChartData = (history: PasseRankingSnapshot[]) => {
    if (!history || history.length === 0) return null;
        
    // ✅ KORRIGIERT: fetchTournamentRankingHistory gibt bereits pro Passe-Nummer gruppierte Snapshots zurück!
    // Wir können sie direkt verwenden, ohne weitere Gruppierung
    const groupedSnapshots = history.sort((a, b) => a.afterPasseNumber - b.afterPasseNumber);
    
    // 🎯 NEU: Sammle alle Spieler-IDs aus ALLEN Snapshots
    // Wichtig: Verwende alle Spieler, die jemals gespielt haben, nicht nur die ersten 8
    const allPlayerIds = new Set<string>();
    groupedSnapshots.forEach(snapshot => {
      snapshot.rankings.forEach(r => allPlayerIds.add(r.playerId));
    });
    
    // 🎯 NEU: Nimm ALLE Spieler, nicht nur die ersten 8
    // Das stellt sicher, dass alle Spieler aus Passe 1 (1A + 1B = 8 Spieler) angezeigt werden
    const playerList = Array.from(allPlayerIds);
    
    // Labels: Nur Passe-Nummern (1, 2, 3, etc.) - nicht "1A", "2B", etc.
    const labels = groupedSnapshots.map(snapshot => `${snapshot.afterPasseNumber}`);
    
    // 🎯 NEU: Verlauf benötigt mindestens 2 Passen (sonst gibt es keinen "Verlauf")
    if (labels.length < 2) return null;
    
    // 🎯 Erstelle Player-Info mit RÄNGEN (nicht Werte!)
    const playerInfos = playerList.map(playerId => {
      let playerName = playerId;
      let finalRank = 999; // Für Sortierung und Farben
      
      // Verwende den letzten Snapshot für den finalen Rang
      if (groupedSnapshots.length > 0) {
        const lastSnapshot = groupedSnapshots[groupedSnapshots.length - 1];
        const ranking = lastSnapshot.rankings.find(r => r.playerId === playerId);
        if (ranking) {
          playerName = ranking.playerName;
          finalRank = ranking.rank;
        }
      }
      
      // ✅ Sammle RÄNGE für diesen Spieler über alle gruppierten Snapshots
      const data = groupedSnapshots.map(snapshot => {
        const ranking = snapshot.rankings.find(r => r.playerId === playerId);
        return ranking ? ranking.rank : null;
      });
      
      return {
        playerId,
        playerName,
        finalRank,
        data
      };
    });
    
    // 🎯 SORTIERE nach finalem Rang (Rang 1 zuerst)
    playerInfos.sort((a, b) => a.finalRank - b.finalRank);
    
    // 🎯 KORREKTUR: maxRank sollte die GESAMTANZAHL DER SPIELER IM TURNIER sein
    // Nicht nur die angezeigten Spieler, sondern alle Spieler im letzten Snapshot
    // Das stellt sicher, dass die Y-Achse alle möglichen Ranks abdeckt (z.B. 1-15 bei 15 Spielern)
    const totalPlayers = groupedSnapshots.length > 0 
      ? groupedSnapshots[groupedSnapshots.length - 1].rankings.length 
      : playerInfos.length;
    const maxRank = totalPlayers;
    
    // 🎯 Berechne dynamische Chart-Höhe (3x kompakter: ~27px pro Rang)
    const chartHeight = 100 + (maxRank * 27); // Basis 100px + 27px pro Rang (3x kompakter)
    
    // 🎯 Erstelle Datasets (bereits sortiert nach finalem Rang)
    const datasets = playerInfos.map(info => ({
      label: info.playerName,
      displayName: info.playerName,
      data: info.data,
      borderColor: getRankingColor(info.finalRank),
      backgroundColor: getRankingColor(info.finalRank, 0.1),
      playerId: info.playerId,
      finalRank: info.finalRank, // Für Farben
    }));
    
    // 🎯 Erstelle Y-Achsen-Labels: Spielernamen nach finalem Rang sortiert
    const yAxisLabels = playerInfos.map(info => info.playerName);
    
    return { labels, datasets, maxRank, chartHeight, yAxisLabels };
  };
  
  // 🆕 NEU: Transformiere Ranking History für Chart (normale Modi)
  const rankingChartData = useMemo(() => {
    if ((tournament?.settings?.rankingMode as string) === 'alle_ranglisten') {
      return null; // Bei "alle_ranglisten" verwenden wir allRankingChartData
    }
    return transformRankingHistoryToChartData(rankingHistory);
  }, [rankingHistory, tournament]);
  
  // ✅ NEU: Transformiere alle Ranking-Histories für "alle_ranglisten"
  const allRankingChartData = useMemo(() => {
    if ((tournament?.settings?.rankingMode as string) !== 'alle_ranglisten') {
      return null;
    }
    
    return {
      striche_difference: transformRankingHistoryToChartData(allRankingHistories.striche_difference),
      striche: transformRankingHistoryToChartData(allRankingHistories.striche),
      total_points: transformRankingHistoryToChartData(allRankingHistories.total_points),
      points_difference: transformRankingHistoryToChartData(allRankingHistories.points_difference)
    };
  }, [allRankingHistories, tournament]);

  // ✅ NEU: Real-time Listener für Tournament-Details (Profilbild, Beschreibung, etc.)
  useEffect(() => {
    if (!memoizedInstanceId || typeof memoizedInstanceId !== 'string') return;
    
    // Aktiviere Real-time Listener sobald Tournament erfolgreich geladen wurde
    if (detailsStatus === 'success' && tournament?.id === memoizedInstanceId) {
      setupTournamentListener(memoizedInstanceId);
    }

    // Cleanup-Funktion wird automatisch beim nächsten Effect-Run oder Unmount aufgerufen
    return () => {
      // Der TournamentStore verwaltet bereits das Cleanup im clearCurrentTournamentInstance
    };
  }, [memoizedInstanceId, detailsStatus, tournament?.id, setupTournamentListener, isDebugMode]);

  // 🆕 NEU: Real-time Listener für Tournament Participants (completedPassesCount)
  useEffect(() => {
    if (!memoizedInstanceId || typeof memoizedInstanceId !== 'string') return;
    
    // Aktiviere Real-time Listener sobald Participants erfolgreich geladen wurden
    // WICHTIG: Wir aktivieren den Listener auch wenn participantsStatus 'success' ist,
    // weil wir dann echtzeitaktualisierungen für completedPassesCount erhalten
    if (participantsStatus === 'success' && tournament?.id === memoizedInstanceId) {
      setupParticipantsListener(memoizedInstanceId);
    }

    // Cleanup-Funktion wird automatisch beim nächsten Effect-Run oder Unmount aufgerufen
    return () => {
      // Der TournamentStore verwaltet bereits das Cleanup im clearCurrentTournamentInstance
    };
  }, [memoizedInstanceId, participantsStatus, tournament?.id, setupParticipantsListener, isDebugMode]);

  // 🆕 NEU: Real-time Listener für Tournament Games (abgeschlossene Passen)
  useEffect(() => {
    if (!memoizedInstanceId || typeof memoizedInstanceId !== 'string') return;
    
    // Aktiviere Real-time Listener sobald Tournament erfolgreich geladen wurde
    // Dies ermöglicht Echtzeit-Updates für den Button "Passe XY starten"
    if (detailsStatus === 'success' && tournament?.id === memoizedInstanceId) {
      setupGamesListener(memoizedInstanceId);
    }

    // Cleanup wird vom Store verwaltet
    return () => {
      // Der TournamentStore verwaltet bereits das Cleanup im clearCurrentTournamentInstance
    };
  }, [memoizedInstanceId, detailsStatus, tournament?.id, setupGamesListener]);

  useEffect(() => {
    const db = getFirestore(firebaseApp);
    const unsubscribeListener: Unsubscribe = () => {};

    const checkJassStoreAndSetupListener = async () => {
      // Nur prüfen, wenn alle notwendigen Daten und Bedingungen erfüllt sind
      if (!memoizedInstanceId || !user || !user.uid || detailsStatus !== 'success' || tournament?.status !== 'active') {
        if (resumablePasseId) {
          setResumablePasseId(null);
        }
        setIsCheckingForResumablePasse(false);
        return;
      }

      setIsCheckingForResumablePasse(true);

      // 1. Schritt: Prüfe, ob im jassStore eine aktive Passe existiert
      const activeGameIdFromJassStore = useJassStore.getState().activeGameId;
      
      try {
        let foundPasseIdInJassStore: string | null = null;
        
        // Wenn eine ID im JassStore vorhanden ist, prüfen wir, ob sie zu diesem Turnier gehört
        if (activeGameIdFromJassStore) {
          const gameRef = doc(db, 'activeGames', activeGameIdFromJassStore);
          const gameSnap = await getDoc(gameRef);
          
          if (gameSnap.exists()) {
            const gameData = gameSnap.data() as any;
            // Prüfen, ob die Passe zu diesem Turnier gehört und ob der Benutzer ein Teilnehmer ist
            if (gameData.tournamentInstanceId === memoizedInstanceId && 
                gameData.status === 'live' && 
                gameData.participantUids?.includes?.(user.uid)) {
              foundPasseIdInJassStore = activeGameIdFromJassStore;
              setResumablePasseId(activeGameIdFromJassStore);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching game ${activeGameIdFromJassStore} from jassStore:`, error);
      }
      
      // 2. Schritt: Einrichtung des Listeners für aktive Passen dieses Benutzers im Turnier
      try {
        // Ref für die Collection activeGames
        const activePasses = collection(db, 'activeGames');
        
        // Query, die nach Passen filtert, die:
        // 1. zu diesem Turnier gehören
        // 2. den Benutzer als Teilnehmer haben
        // 3. 'live' sind (nicht abgeschlossen)
        const passesQuery = query(
          activePasses,
          where('tournamentInstanceId', '==', memoizedInstanceId),
          where('participantUids', 'array-contains', user.uid),
          where('status', '==', 'live')
        );
        
        // Listener einrichten
        const unsubscribe = onSnapshot(passesQuery, (snapshot) => {
          try {
            // Hat der Listener Ergebnisse gefunden?
            if (!snapshot.empty) {
              // Nimm die erste aktive Passe (sollte in der Regel nur eine geben)
              const activePasseDoc = snapshot.docs[0];
              const currentPasseIdFromListener = activePasseDoc.id;
              
              if (resumablePasseId !== currentPasseIdFromListener) {
                setResumablePasseId(currentPasseIdFromListener);
              }
            } else {
              // Wenn der Listener keine aktive Passe gefunden hat, aber resumablePasseId gesetzt ist
              if (resumablePasseId) {
                setResumablePasseId(null);
              }
            }
            
            // Prüfung abgeschlossen
            setIsCheckingForResumablePasse(false);
          } catch (listenerError) {
            console.error("Error in active passe listener processing:", listenerError);
            
            if (resumablePasseId) {
              setResumablePasseId(null);
            }
            
            setIsCheckingForResumablePasse(false);
          }
        }, (error) => {
          console.error("Error in active passe listener:", error);
          setIsCheckingForResumablePasse(false);
          setResumablePasseId(null);
        });
        
        // Speichere die Unsubscribe-Funktion, um den Listener später zu entfernen
        activePasseListener.current = unsubscribe;
      } catch (setupError) {
        console.error("Error setting up active passe listener:", setupError);
        setIsCheckingForResumablePasse(false);
      }
    };

    // Verzögere die Ausführung leicht, um "Render-Thrashing" zu vermeiden
    const timeoutId = setTimeout(() => {
      checkJassStoreAndSetupListener();
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      unsubscribeListener();
      if (activePasseListener.current) {
        activePasseListener.current();
        activePasseListener.current = null;
      }
    };
  }, [memoizedInstanceId, user?.uid, detailsStatus, tournament?.status, resumablePasseId, isDebugMode]);

  // 🆕 NEU: Listener für ALLE aktiven Passen des Turniers (für korrekte Passe-Nummerierung)
  useEffect(() => {
    if (!memoizedInstanceId || detailsStatus !== 'success' || tournament?.status !== 'active') {
      // Cleanup: Setze State zurück, wenn Bedingungen nicht erfüllt sind
      if (activePassesInTournament.length > 0) {
        setActivePassesInTournament([]);
      }
      if (allActivePassesListenerRef.current) {
        allActivePassesListenerRef.current();
        allActivePassesListenerRef.current = null;
      }
      return;
    }

    
    const db = getFirestore(firebaseApp);
    const activePasses = collection(db, 'activeGames');
    
    // Query für ALLE aktiven Passen dieses Turniers (ohne array-contains)
    const allPassesQuery = query(
      activePasses,
      where('tournamentInstanceId', '==', memoizedInstanceId),
      where('status', '==', 'live')
    );
    
    // Listener einrichten
    const unsubscribe = onSnapshot(
      allPassesQuery,
      (snapshot) => {
        try {
          const activePasses = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          setActivePassesInTournament(activePasses);
        } catch (error) {
          console.error('[TournamentViewPage] Error processing all active passes snapshot:', error);
        }
      },
      (error) => {
        console.error('[TournamentViewPage] Error in all active passes listener:', error);
        setActivePassesInTournament([]);
      }
    );
    
    allActivePassesListenerRef.current = unsubscribe;
    
    // Cleanup beim Unmount
    return () => {
      if (allActivePassesListenerRef.current) {
        allActivePassesListenerRef.current();
        allActivePassesListenerRef.current = null;
      }
    };
  }, [memoizedInstanceId, detailsStatus, tournament?.status, activePassesInTournament.length]);

  // Angepasster Cleanup-Effekt: Nur beim Unmounten
  useEffect(() => {
    // Store the current URLs in variables accessible by the cleanup function closure
    const currentImageToCropUrl = imageToCrop;
    const currentLogoPreviewUrlValue = logoPreviewUrl;

    return () => {
      if (currentLogoPreviewUrlValue) {
        URL.revokeObjectURL(currentLogoPreviewUrlValue);
      }
      if (currentImageToCropUrl) {
        URL.revokeObjectURL(currentImageToCropUrl);
      }
      // setCropModalOpen(false); // Zustand sollte hier nicht manipuliert werden
    };
  }, []); // Leeres Abhängigkeitsarray für Unmount-Cleanup

  const playerNamesMapping = useMemo(() => {
    if (!tournamentParticipants || tournamentParticipants.length === 0) {
      return {};
    }
    return tournamentParticipants.reduce((acc, participant) => {
      if (participant && participant.uid && participant.displayName) {
        acc[participant.uid] = participant.displayName;
      }
      return acc;
    }, {} as PlayerIdToNameMapping);
  }, [tournamentParticipants]);

  const playerPhotoUrlMapping = useMemo(() => {
    if (!tournamentParticipants || tournamentParticipants.length === 0) {
      return {};
    }
    return tournamentParticipants.reduce((acc, participant) => {
      if (participant && participant.uid && participant.photoURL) {
        acc[participant.uid] = participant.photoURL;
      }
      return acc;
    }, {} as Record<string, string>);
  }, [tournamentParticipants]);

  const handleGoBack = () => {
    if (currentGroup) {
      router.push(`/start`);
    } else {
      router.push('/tournaments');
    }
  };
  
  const handleStartNextPasse = async () => {
    if (!tournament?.groupId) {
      showNotification({ type: 'error', message: 'Turnier-Gruppe nicht gefunden. Passe kann nicht gestartet werden.' });
      return;
    }

    // KRITISCHER FIX: Lade sowohl Gruppenmitglieder als auch Turnierteilnehmer
    setIsLoadingMembersForPasse(true);
    try {
      // 1. Lade Gruppenmitglieder
      const fetchedMembers = await getGroupMembersSortedByGames(tournament.groupId);
      setMembersForPasse(fetchedMembers);
      
      // 2. Stelle sicher, dass Turnierteilnehmer mit korrekten completedPassesCount geladen sind
      if (participantsStatus !== 'success') {
        await loadTournamentParticipants(instanceId);
      }
      
      setShowStartPasseScreen(true);
    } catch (error) {
      console.error("Fehler beim Laden der Gruppenmitglieder für Passe:", error);
      const message = error instanceof Error ? error.message : "Gruppenmitglieder konnten nicht geladen werden.";
      showNotification({ message, type: "error" });
    } finally {
      setIsLoadingMembersForPasse(false);
    }
  };

  const isLoading = detailsStatus === 'loading';
  const isLoadingGames = gamesStatus === 'loading';
  const isLoadingParticipants = participantsStatus === 'loading';
  const isLoadingDetails = isLoading || isLoadingParticipants;
  const isCurrentUserAdmin = !!tournament && !!user && tournament.adminIds?.includes(user.uid);
  
  // 🎯 NEUE ZENTRALE LOGIK: Berechne nächste Passe mit shared Helper
  const nextPasseInfo = useMemo(() => {
    if (!tournamentParticipants || tournamentParticipants.length === 0 || !tournament) {
      return { 
        nextPasseNumber: 1,
        nextPasseLabel: '1A',
        availablePlayers: [],
        isPlayable: false,
        reason: 'Keine Teilnehmer'
      };
    }
    
    // ✅ ELEGANT: Filtere aktive Spiele aus currentTournamentGames (die bereits aktiv + abgeschlossen enthält)
    // Aktive Spiele: Haben kein completedAt (undefined)
    const activeGames = (currentTournamentGames || []).filter(game => 
      !game.completedAt
    );
    
    // ✅ ELEGANT: Filtere abgeschlossene Spiele
    // Abgeschlossene Spiele: Haben completedAt (Timestamp)
    const completedGames = (currentTournamentGames || []).filter(game => 
      game.completedAt !== undefined
    );
    
    const basePasseInfo = calculateNextPasse(
      tournamentParticipants,
      completedGames,
      activeGames
    );
    
    // 🎯 ELEGANTER FIX: Wenn ein User eingeloggt ist und die vorgeschlagene Passe bereits gespielt hat,
    // zeige ihm SEINE nächste Passe statt der global nächsten spielbaren Passe
    if (user?.uid) {
      // ✅ Verwende die zentrale Utility-Funktion für konsistente Berechnung
      const userCompletedCount = calculateCompletedPassesCountFromGames(user.uid, completedGames);
      
      // User hat diese Passe bereits gespielt? → Zeige ihm die nächste!
      if (userCompletedCount >= basePasseInfo.nextPasseNumber) {
        return {
          ...basePasseInfo,
          nextPasseNumber: userCompletedCount + 1,
          nextPasseLabel: `${userCompletedCount + 1}A`,
        };
      }
    }
    
    return basePasseInfo;
  }, [tournamentParticipants, tournament, currentTournamentGames, user?.uid]);
  
  // Destrukturiere für einfacheren Zugriff
  const { nextPasseNumber, nextPasseLabel, availablePlayers, isPlayable, reason } = nextPasseInfo;

  const handleLogoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const originalFile = files[0];
      if (!originalFile.type.startsWith("image/")) {
        showNotification({message: "Bitte wählen Sie eine Bilddatei (JPEG oder PNG).", type: "error"});
        return;
      }
      const initialMaxSizeInBytes = 5 * 1024 * 1024;
      if (originalFile.size > initialMaxSizeInBytes) {
        showNotification({message: "Die Datei ist zu groß (max. 5 MB).", type: "error"});
        return;
      }

      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl(null);
      setSelectedLogoFile(null);

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
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
      setIsUploadingLogo(false);
      return;
    }

    setIsUploadingLogo(true);

    const options = {
      maxSizeMB: 0.2,
      maxWidthOrHeight: 500,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.8,
    };

    try {
      const compressedBlob = await imageCompression(new File([croppedImageBlob], "tournament_logo.jpg", {type: "image/jpeg"}), options);

      const finalPreviewUrl = URL.createObjectURL(compressedBlob);
      setLogoPreviewUrl(finalPreviewUrl);
      setSelectedLogoFile(new File([compressedBlob], "tournament_logo_final.jpg", {type: "image/jpeg"}));
      setIsUploadingLogo(false);
    } catch (compressionError) {
      console.error("Fehler bei der Komprimierung:", compressionError);
      showNotification({message: "Fehler bei der Bildkomprimierung.", type: "error"});
      setSelectedLogoFile(null);
      setLogoPreviewUrl(null);
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
      setIsUploadingLogo(false);
    }
  };

  const handleUploadTournamentLogo = async () => {
    if (!selectedLogoFile || !tournament) return;
    
    // 🚨 KORRIGIERT: userId für Storage-Regel-Kompatibilität hinzufügen
    if (!user?.uid) {
      showNotification({message: "Benutzer-Authentifizierung erforderlich für Logo-Upload.", type: "error"});
      return;
    }

    setIsUploadingLogo(true);
    try {
      const downloadUrl = await uploadTournamentLogoFirebase(tournament.id, selectedLogoFile, user.uid);
      

      await updateTournamentSettings(tournament.id, { logoUrl: downloadUrl });

      showNotification({message: "Turnierbild erfolgreich aktualisiert.", type: "success"});
      
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      setSelectedLogoFile(null);
      setLogoPreviewUrl(null);
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
      
      setIsUploadingLogo(false);

      // ✅ OPTIMIERT: Kein manueller Fetch nötig - Real-time Listener übernimmt das automatisch
      // if (memoizedInstanceId) fetchTournamentInstanceDetails(memoizedInstanceId);
    } catch (error) {
      console.error("Fehler beim Hochladen des Turnierbildes:", error);
      showNotification({message: error instanceof Error ? error.message : "Hochladen fehlgeschlagen.", type: "error"});
      setIsUploadingLogo(false);
    }
  };

  const handleLogoSelectClick = () => {
    if (isCurrentUserAdmin && logoFileInputRef.current) {
      logoFileInputRef.current.click();
    }
  };

  const handleCancelLogoSelection = () => {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setSelectedLogoFile(null);
    setLogoPreviewUrl(null);
    if (logoFileInputRef.current) logoFileInputRef.current.value = "";
    setIsUploadingLogo(false);
  };

  const handlePasseSuccessfullyStarted = (activeGameId: string) => {
    // ✅ NEU: Globaler Loading-State wurde bereits in TournamentStartScreen gesetzt
    // Hier nur Navigation starten
    router.push(`/game/${activeGameId}`);
    setShowStartPasseScreen(false);
    useUIStore.getState().showNotification({ type: 'success', message: 'Passe gestartet! Auf zum Jass!'});
  };

  const handleOpenInviteModal = () => {
    if (isCurrentUserAdmin) {
      setIsInviteModalOpen(true);
    }
  };

  const handleGenerateNewInvite = () => {
  };

  const currentUserIsAdmin = useMemo(() => {
    if (!user || !tournament) return false;
    return tournament.adminIds?.includes(user.uid) || false;
  }, [user, tournament]);

  const formatScheduledTime = (scheduledTime: any): string => {
    if (!scheduledTime || typeof scheduledTime.toDate !== 'function') return ''; // Basic check for Timestamp-like object
    try {
      const date = scheduledTime.toDate();
      return `Beginnt am ${date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })} um ${date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    } catch (e) {
      console.error("Error formatting scheduled time:", e);
      return 'Ungültige Startzeit';
    }
  };

  // NEU: Handler zum Öffnen des Spielerfortschritt-Modals
  const handleOpenPlayerProgress = useCallback((player: ParticipantWithProgress) => {
    // Navigiere zum öffentlichen Profil des Spielers (wie in GroupView.tsx)
    const playerId = player.playerId || player.uid;
    if (playerId) {
      router.push(`/profile/${playerId}`);
    }
  }, [router]);

  // 🆕 Share Handler
  const handleShareClick = async () => {
    if (!tournament || !memoizedInstanceId) return;
    
    const shareUrl = `https://jassguru.ch/view/tournament/${memoizedInstanceId}`;
    const tournamentName = tournament.name || 'Jass-Turnier';
    const shareText = `Schau dir das Jass-Turnier "${tournamentName}" live an! 🏆\n\n${shareUrl}\n\ngeneriert von:\n👉 jassguru.ch`;
    
    try {
      // Versuche native Share API (Mobile)
      if (navigator.share) {
        await navigator.share({
          title: `Jass-Turnier: ${tournamentName}`,
          text: shareText,
          url: shareUrl,
        });
      } else {
        // Fallback: Clipboard (Desktop)
        await navigator.clipboard.writeText(shareText);
        showNotification({ 
          type: 'success', 
          message: 'Link in Zwischenablage kopiert!' 
        });
      }
    } catch (error) {
      // Fehler beim Teilen (z.B. User-Abbruch oder keine Berechtigung)
      if ((error as Error).name !== 'AbortError') {
        console.error('Fehler beim Teilen:', error);
        showNotification({ 
          type: 'error', 
          message: 'Link konnte nicht geteilt werden.' 
        });
      }
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4 text-white">
          <Loader2 className="h-12 w-12 animate-spin text-purple-400" />
          <p className="mt-4 text-lg">Turnierdaten werden geladen...</p>
          {isLoadingDetails && <p className="text-sm text-gray-400">Lade Details...</p>}
          {isLoadingGames && <p className="text-sm text-gray-400">Lade Passen...</p>}
          {isLoadingParticipants && <p className="text-sm text-gray-400">Lade Teilnehmer...</p>}
        </div>
      </MainLayout>
    );
  }

  if (tournamentError && !isLoadingDetails) {
    return (
      <MainLayout>
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4 text-white">
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-6 py-4 rounded-lg shadow-lg text-center">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-red-400" />
            <p className="font-bold text-xl mb-2">Fehler beim Laden des Turniers</p>
            <p className="text-sm">{tournamentError}</p>
            <Button onClick={handleGoBack} variant="outline" className="mt-6 text-white border-white/50 hover:bg-white/10">
              Zurück
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!tournament && !isLoadingDetails && memoizedInstanceId) {
     return (
      <MainLayout>
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4 text-white">
          <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-300 px-6 py-4 rounded-lg shadow-lg text-center">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-yellow-400" />
            <p className="font-bold text-xl">Turnier nicht gefunden</p>
            <p className="text-sm">Das Turnier mit der ID "{memoizedInstanceId}" konnte nicht gefunden werden oder der Zugriff wurde verweigert.</p>
            <Button onClick={handleGoBack} variant="outline" className="mt-6 text-white border-white/50 hover:bg-white/10">
              Zurück
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }
  
  if (!tournament) {
      return (
          <MainLayout>
              <div className="flex min-h-screen items-center justify-center">Keine Turnierdaten verfügbar.</div>
          </MainLayout>
      );
  }

  // Zeige GlobalLoader beim Laden der Mitglieder für eine neue Passe
  if (isLoadingMembersForPasse) {
    return (
      <MainLayout>
        <GlobalLoader message="Lade Spieler für neue Passe..." />
      </MainLayout>
    );
  }

  return ( 
    <MainLayout>
      <div id="tournament-view-container" className={`flex flex-col items-center justify-start bg-gray-900 text-white ${layout.containerPadding} relative pt-8 pb-20 lg:w-full lg:px-0`}>
        
        {/* 🎨 RESPONSIVE CONTAINER WRAPPER */}
        <div className={`w-full ${layout.containerMaxWidth} mx-auto lg:px-12 lg:py-8`}>
        
        {tournament && (
          <div className="relative mb-4 mt-6 flex justify-center">
            <div 
              className={`relative ${layout.avatarSize} rounded-full overflow-hidden transition-all duration-300 flex items-center justify-center bg-gray-800 shadow-lg hover:shadow-xl hover:scale-105 border-4`}
              style={{
                borderColor: selectedLogoFile && logoPreviewUrl ? '#a855f7' : '#a855f7', // Immer lila
                boxShadow: selectedLogoFile && logoPreviewUrl 
                  ? '0 0 25px rgba(168, 85, 247, 0.3)'
                  : '0 0 20px rgba(168, 85, 247, 0.2), 0 4px 20px rgba(0,0,0,0.3)'
              }}
            >
              {logoPreviewUrl ? (
                <Image 
                  src={logoPreviewUrl} 
                  alt="Vorschau Turnierbild" 
                  fill 
                  style={{ objectFit: 'cover' }} 
                />
              ) : tournament?.logoUrl || tournament?.settings?.logoUrl ? (
                <Image
                  src={tournament.logoUrl || tournament.settings?.logoUrl || ''}
                  alt={`Logo ${tournament.name}`}
                  fill
                  style={{ objectFit: 'cover' }}
                  priority
                  sizes="(max-width: 768px) 128px, 128px"
                  onError={(e) => {
 (e.target as HTMLImageElement).src = "/placeholder-logo.png";
}}
                />
              ) : (
                <span className="text-4xl font-bold text-gray-500">
                  {(tournament.name ?? '?').charAt(0).toUpperCase()}
                </span>
              )}
              {/* 🔒 Camera Button nur für Admins UND nicht in Public View */}
              {isCurrentUserAdmin && !isPublicView && (
                <button
                  onClick={handleLogoSelectClick}
                  className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-60 transition-all duration-200"
                  disabled={isUploadingLogo}
                  aria-label="Turnierbild ändern"
                >
                  <Camera className={`text-white ${isUploadingLogo ? 'opacity-50' : 'opacity-0'} group-hover:opacity-100 transition-opacity duration-200`} size={32} />
                </button>
              )}
            </div>
            {/* 🔒 Logo-Upload-Preview nur für Admins */}
            {!isPublicView && selectedLogoFile && logoPreviewUrl && (
              <div className="flex gap-2 mt-3">
                <Button
                  onClick={handleUploadTournamentLogo}
                  className="bg-green-600 hover:bg-green-700 text-xs px-3 py-1.5 h-auto flex items-center gap-1"
                  disabled={!selectedLogoFile || isUploadingLogo}
                >
                  {isUploadingLogo ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload size={14} />}
                  Hochladen
                </Button>
                <Button
                  onClick={handleCancelLogoSelection}
                  variant="secondary"
                  className="text-xs px-3 py-1.5 h-auto flex items-center gap-1 bg-gray-600 hover:bg-gray-500 text-gray-100 border-gray-700"
                  disabled={isUploadingLogo}
                >
                  <X size={14} /> Abbrechen
                </Button>
              </div>
            )}
          </div>
        )}
        
        <div className={`w-full text-center mb-6 px-4`}>
          <h1 
            className={`${layout.titleSize} font-bold mb-1 text-white break-words transition-colors duration-300`}
          >
            {tournament?.name ?? 'Turnier laden...'}
          </h1>
          <div className={`${layout.subtitleSize} text-gray-300 mx-auto max-w-xl break-words mt-3`}>
            {tournament?.description ?? (isLoading ? '' : 'Keine Beschreibung vorhanden.')}
          </div>
        </div>

        {/* 🚨 NEU: SHARE BUTTON - IMMER SICHTBAR, WENN TURNIER EXISTIERT */}
        {tournament && (
          <button 
            onClick={handleShareClick}
            className={`absolute top-4 right-4 z-10 ${layout.actionButtonPadding} text-gray-300 hover:text-white transition-all duration-200 rounded-full bg-gray-700/50 hover:scale-110`}
            style={{
              backgroundColor: 'rgba(55, 65, 81, 0.5)',
              borderColor: 'transparent'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.4)';
              e.currentTarget.style.boxShadow = '0 0 15px rgba(168, 85, 247, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.5)';
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.boxShadow = 'none';
            }}
            aria-label="Turnier teilen"
          >
            <FiShare2 size={layout.actionButtonSize} />
          </button>
        )}

        <div className="flex justify-center items-center gap-3 mb-6 px-4">
          {/* Admin-Buttons - nur für Admins sichtbar */}
          {isCurrentUserAdmin && !isPublicView && (
            <>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleOpenInviteModal} 
                className="hover:bg-gray-700/30 text-gray-300 hover:text-white"
                title="Teilnehmer einladen"
              >
                <UserPlusIcon className="h-4 w-4 mr-1.5" /> Einladen
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push(`/tournaments/${memoizedInstanceId}/settings`)} 
                className="hover:bg-gray-700/30 text-gray-300 hover:text-white"
                title="Einstellungen"
              >
                <SettingsIcon className="h-4 w-4 mr-1.5" /> Einstellungen
              </Button>
            </>
          )}
        </div>
        
        {tournament && (
          <div className="text-xs text-gray-500 text-center mb-6">
            <span>Status: 
              <span className={cn(
                "font-medium",
                tournament.status === 'upcoming' && "text-yellow-400",
                tournament.status === 'active' && "text-green-400",
                tournament.status === 'completed' && "text-blue-400",
                tournament.status === 'archived' && "text-gray-500",
              )}>
                {getGermanTournamentStatus(tournament.status, tournament)}
              </span>
            </span>
            {tournament.instanceDate && isFirestoreTimestamp(tournament.instanceDate) && (
              <span className="ml-3">{format(tournament.instanceDate.toDate(), 'dd.MM.yyyy')}</span>
            )}
            {tournament.status === 'completed' && tournament.completedAt && isFirestoreTimestamp(tournament.completedAt) && (
                <span className="ml-1">{`(${format(tournament.completedAt.toDate(), 'dd.MM.yyyy')})`}</span>
            )}
        {tournament.status === 'active' && tournament.pausedAt && isFirestoreTimestamp(tournament.pausedAt) && (
            <span className="ml-1 text-gray-400">{`(${format(tournament.pausedAt.toDate(), 'dd.MM.yyyy')})`}</span>
        )}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full grid-cols-3 bg-gray-800 ${layout.mainTabContainerPadding} rounded-xl sticky top-[calc(env(safe-area-inset-top,0px)+12px)] z-30 backdrop-blur-md shadow-lg`}>
            <TabsTrigger 
              value="ranking" 
              className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.mainTabPadding} ${layout.mainTabTextSize} font-semibold min-h-[44px] flex items-center justify-center py-5 relative`}
              style={{
                backgroundColor: activeTab === 'ranking' ? getTabActiveColor(tournamentTheme) : 'transparent'
              }}
            >
              <Award size={18} className="mr-2" /> Rangliste
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-[1px] bg-gray-600/30"></div>
            </TabsTrigger>
            <TabsTrigger 
              value="archive" 
              className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.mainTabPadding} ${layout.mainTabTextSize} font-semibold min-h-[44px] flex items-center justify-center py-5 relative`}
              style={{
                backgroundColor: activeTab === 'archive' ? getTabActiveColor(tournamentTheme) : 'transparent'
              }}
            >
              <ArchiveIcon size={18} className="mr-2" /> Passen
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-[1px] bg-gray-600/30"></div>
            </TabsTrigger>
            <TabsTrigger
              value="participants" 
              className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.mainTabPadding} ${layout.mainTabTextSize} font-semibold min-h-[44px] flex items-center justify-center py-5`}
              style={{
                backgroundColor: activeTab === 'participants' ? getTabActiveColor(tournamentTheme) : 'transparent'
              }}
            >
              <UsersIcon size={18} className="mr-2" /> Teilnehmer
            </TabsTrigger>
          </TabsList>

          <div className="flex-grow p-0 md:p-4 overflow-y-auto">
            <TabsContent value="ranking">
              {(isLoadingDetails || isLoadingGames) ? (
                <div className="flex justify-center items-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                  <span className="ml-3 text-gray-400">Lade Rangliste...</span>
                </div>
              ) : (detailsStatus === 'error' || gamesStatus === 'error' || participantsStatus === 'error') ? (
                <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-3" />
                  <span>Fehler beim Laden der Ranglistendaten.</span>
                </div>
              ) : (tournament && tournament.settings && Array.isArray(tournamentParticipants) && Array.isArray(currentTournamentGames)) ? (
                <>
                  {/* ✅ NEU: Bei "alle_ranglisten" alle Ranglisten untereinander anzeigen */}
                  {(tournament.settings.rankingMode as string) === 'alle_ranglisten' ? (
                    <div className="space-y-6">
                      {/* 1. Rangliste Strichdifferenz */}
                      <TournamentRankingList 
                        instanceId={memoizedInstanceId} 
                        settings={{ ...tournament.settings, rankingMode: 'striche_difference' }}
                        participants={tournamentParticipants}
                        games={currentTournamentGames}
                        onParticipantClick={handleOpenPlayerProgress}
                      />
                      
                      {/* 2. Verlauf Rangliste Strichdifferenz */}
                      {allRankingChartData?.striche_difference && allRankingChartData.striche_difference.datasets.length > 0 && (
                        <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                          <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                            <div className="w-1 h-6 bg-purple-500 rounded-r-md mr-3"></div>
                            <h3 className="text-lg font-semibold text-white">📈 Verlauf Rangliste Strichdifferenz</h3>
                          </div>
                          <div className="py-4 pl-4 pr-2">
                            {allRankingHistoriesLoading ? (
                              <div className="flex justify-center items-center py-10">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                                <span className="ml-3 text-gray-300">Lade Chart-Daten...</span>
                              </div>
                            ) : (
                              <PowerRatingChart 
                                data={allRankingChartData.striche_difference}
                                title="Verlauf Rangliste Strichdifferenz"
                                height={allRankingChartData.striche_difference.chartHeight}
                                theme="purple"
                                isDarkMode={true}
                                isEloChart={false}
                                showBaseline={false}
                                hideLegend={true}
                                useThemeColors={false}
                                activeTab={activeTab}
                                animateImmediately={false}
                                invertYAxis={true}
                                yAxisMin={1}
                                yAxisMax={allRankingChartData.striche_difference.maxRank}
                                disableDatasetSorting={true}
                                hideOutliers={false}
                                yAxisLabels={allRankingChartData.striche_difference.yAxisLabels}
                              />
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* 3. Rangliste Striche */}
                      <TournamentRankingList 
                        instanceId={memoizedInstanceId} 
                        settings={{ ...tournament.settings, rankingMode: 'striche' }}
                        participants={tournamentParticipants}
                        games={currentTournamentGames}
                        onParticipantClick={handleOpenPlayerProgress}
                      />
                      
                      {/* 4. Verlauf Rangliste Striche */}
                      {allRankingChartData?.striche && allRankingChartData.striche.datasets.length > 0 && (
                        <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                          <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                            <div className="w-1 h-6 bg-purple-500 rounded-r-md mr-3"></div>
                            <h3 className="text-lg font-semibold text-white">📈 Verlauf Rangliste Striche</h3>
                          </div>
                          <div className="py-4 pl-4 pr-2">
                            {allRankingHistoriesLoading ? (
                              <div className="flex justify-center items-center py-10">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                                <span className="ml-3 text-gray-300">Lade Chart-Daten...</span>
                              </div>
                            ) : (
                              <PowerRatingChart 
                                data={allRankingChartData.striche}
                                title="Verlauf Rangliste Striche"
                                height={allRankingChartData.striche.chartHeight}
                                theme="purple"
                                isDarkMode={true}
                                isEloChart={false}
                                showBaseline={false}
                                hideLegend={true}
                                useThemeColors={false}
                                activeTab={activeTab}
                                animateImmediately={false}
                                invertYAxis={true}
                                yAxisMin={1}
                                yAxisMax={allRankingChartData.striche.maxRank}
                                disableDatasetSorting={true}
                                hideOutliers={false}
                                yAxisLabels={allRankingChartData.striche.yAxisLabels}
                              />
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* 5. Rangliste Punkte */}
                      <TournamentRankingList 
                        instanceId={memoizedInstanceId} 
                        settings={{ ...tournament.settings, rankingMode: 'total_points' }}
                        participants={tournamentParticipants}
                        games={currentTournamentGames}
                        onParticipantClick={handleOpenPlayerProgress}
                      />
                      
                      {/* 6. Verlauf Rangliste Punkte */}
                      {allRankingChartData?.total_points && allRankingChartData.total_points.datasets.length > 0 && (
                        <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                          <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                            <div className="w-1 h-6 bg-purple-500 rounded-r-md mr-3"></div>
                            <h3 className="text-lg font-semibold text-white">📈 Verlauf Rangliste Punkte</h3>
                          </div>
                          <div className="py-4 pl-4 pr-2">
                            {allRankingHistoriesLoading ? (
                              <div className="flex justify-center items-center py-10">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                                <span className="ml-3 text-gray-300">Lade Chart-Daten...</span>
                              </div>
                            ) : (
                              <PowerRatingChart 
                                data={allRankingChartData.total_points}
                                title="Verlauf Rangliste Punkte"
                                height={allRankingChartData.total_points.chartHeight}
                                theme="purple"
                                isDarkMode={true}
                                isEloChart={false}
                                showBaseline={false}
                                hideLegend={true}
                                useThemeColors={false}
                                activeTab={activeTab}
                                animateImmediately={false}
                                invertYAxis={true}
                                yAxisMin={1}
                                yAxisMax={allRankingChartData.total_points.maxRank}
                                disableDatasetSorting={true}
                                hideOutliers={false}
                                yAxisLabels={allRankingChartData.total_points.yAxisLabels}
                              />
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* 7. Rangliste Punktedifferenz */}
                      <TournamentRankingList 
                        instanceId={memoizedInstanceId} 
                        settings={{ ...tournament.settings, rankingMode: 'points_difference' }}
                        participants={tournamentParticipants}
                        games={currentTournamentGames}
                        onParticipantClick={handleOpenPlayerProgress}
                      />
                      
                      {/* 8. Verlauf Rangliste Punktedifferenz */}
                      {allRankingChartData?.points_difference && allRankingChartData.points_difference.datasets.length > 0 && (
                        <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                          <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                            <div className="w-1 h-6 bg-purple-500 rounded-r-md mr-3"></div>
                            <h3 className="text-lg font-semibold text-white">📈 Verlauf Rangliste Punktedifferenz</h3>
                          </div>
                          <div className="py-4 pl-4 pr-2">
                            {allRankingHistoriesLoading ? (
                              <div className="flex justify-center items-center py-10">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                                <span className="ml-3 text-gray-300">Lade Chart-Daten...</span>
                              </div>
                            ) : (
                              <PowerRatingChart 
                                data={allRankingChartData.points_difference}
                                title="Verlauf Rangliste Punktedifferenz"
                                height={allRankingChartData.points_difference.chartHeight}
                                theme="purple"
                                isDarkMode={true}
                                isEloChart={false}
                                showBaseline={false}
                                hideLegend={true}
                                useThemeColors={false}
                                activeTab={activeTab}
                                animateImmediately={false}
                                invertYAxis={true}
                                yAxisMin={1}
                                yAxisMax={allRankingChartData.points_difference.maxRank}
                                disableDatasetSorting={true}
                                hideOutliers={false}
                                yAxisLabels={allRankingChartData.points_difference.yAxisLabels}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Normale Logik: Ein Chart für den ausgewählten Modus */
                <>
                <TournamentRankingList 
                  instanceId={memoizedInstanceId} 
                  settings={tournament.settings}
                  participants={tournamentParticipants}
                  games={currentTournamentGames}
                  onParticipantClick={handleOpenPlayerProgress}
                />
                  
                  {/* 🆕 NEU: Ranking History Chart */}
                  {rankingChartData && rankingChartData.datasets.length > 0 && (
                    <div className="mt-6">
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        {/* Header mit Accent-Bar */}
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-purple-500 rounded-r-md mr-3"></div>
                              <h3 className="text-lg font-semibold text-white">
                                📈 {(tournament?.settings?.rankingMode as string) === 'striche_difference' ? 'Verlauf Rangliste Strichdifferenz' :
                                    (tournament?.settings?.rankingMode as string) === 'points_difference' ? 'Verlauf Rangliste Punktedifferenz' :
                                    (tournament?.settings?.rankingMode as string) === 'striche' ? 'Verlauf Rangliste Striche' :
                                    (tournament?.settings?.rankingMode as string) === 'total_points' ? 'Verlauf Rangliste Punkte' :
                                    'Verlauf Rangliste'}
                              </h3>
                        </div>
                        
                        {/* Chart Container - 16px padding-left, damit Y-Achse mit "#" Spalte übereinstimmt */}
                        <div className="py-4 pl-4 pr-2">
                          {rankingHistoryLoading ? (
                            <div className="flex justify-center items-center py-10">
                              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                              <span className="ml-3 text-gray-300">Lade Chart-Daten...</span>
                            </div>
                          ) : (
                           <PowerRatingChart 
                            data={rankingChartData}
                            title="Verlauf Rangliste"
                            height={rankingChartData.chartHeight}
                            theme="purple"
                            isDarkMode={true}
                            isEloChart={false}
                            showBaseline={false}
                            hideLegend={true}
                            useThemeColors={false}
                            activeTab={activeTab}
                            animateImmediately={false}
                            invertYAxis={true}
                            yAxisMin={1}
                            yAxisMax={rankingChartData.maxRank}
                            disableDatasetSorting={true}
                            hideOutliers={false}
                            yAxisLabels={rankingChartData.yAxisLabels}
                          />
                          )}
                        </div>
                      </div>
                    </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p className='text-center text-gray-500 py-8'>Rangliste konnte nicht geladen werden (fehlende Daten oder Einstellungen).</p>
              )}
            </TabsContent>

            <TabsContent value="archive">
              {isLoadingGames ? (
                 <div className="flex justify-center items-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                  <span className="ml-3 text-gray-400">Lade Passen...</span>
                </div>
              ) : gamesStatus === 'error' ? (
                <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-3" />
                  <span>Fehler beim Laden der Passen.</span>
                </div>
              ) : Array.isArray(currentTournamentGames) ? (
                 <TournamentPasseArchive 
                   instanceId={memoizedInstanceId}
                   games={currentTournamentGames}
                   playerPhotoUrlMapping={playerPhotoUrlMapping}
                   playerNamesMapping={playerNamesMapping}
                 />
              ) : (
                <p className='text-center text-gray-500 py-8'>Passen konnten nicht geladen werden.</p>
              )}
            </TabsContent>

            <TabsContent value="participants">
              {(detailsStatus === 'success' && tournament && (participantsStatus === 'success' || (participantsStatus !== 'loading' && tournamentParticipants?.length > 0))) ? (
                <TournamentParticipantsList 
                  participants={tournamentParticipants} 
                  tournamentAdminId={tournament.adminIds?.[0]}
                  onParticipantClick={handleOpenPlayerProgress}
                  tournamentGames={currentTournamentGames} // ✅ NEU: Für korrekte Passen-Berechnung
                />
              ) : isLoadingParticipants ? (
                <div className="flex justify-center items-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                  <span className="ml-3 text-gray-400">Lade Teilnehmer...</span>
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">Teilnehmerliste ist noch nicht verfügbar oder es gibt keine Teilnehmer.</p>
              )}
            </TabsContent>
          </div>
        </Tabs>
        

        {tournament.status === 'upcoming' && (
          <div className="sticky bottom-0 left-0 right-0 p-4 bg-gray-800 border-t border-gray-700 text-center">
            <p className="text-lg font-semibold text-yellow-400 mb-2">
              {tournament.settings?.scheduledStartTime
                ? formatScheduledTime(tournament.settings.scheduledStartTime)
                : "Das Turnier hat noch nicht begonnen."
              }
            </p>
            {/* 🔒 Admin-Link nur für authentifizierte Admins */}
            {isCurrentUserAdmin && !isPublicView && (
              <Button onClick={() => router.push(`/tournaments/${memoizedInstanceId}/settings`)} size="sm" variant="link" className="mt-1 text-purple-400 hover:text-purple-300">
                Turnierdetails bearbeiten / Starten
              </Button>
            )}
          </div>
        )}


        {/* 🔒 Modals nur für authentifizierte Admins */}
        {!isPublicView && showStartPasseScreen && memoizedInstanceId && (
          <TournamentStartScreen 
                isVisible={showStartPasseScreen}
                onClose={() => setShowStartPasseScreen(false)}
                tournamentId={memoizedInstanceId}
                tournamentParticipants={tournamentParticipants}
                currentPasseNumber={nextPasseNumber}
                onPasseStarted={handlePasseSuccessfullyStarted}
                members={membersForPasse}
          />
        )}

        {!isPublicView && isCurrentUserAdmin && memoizedInstanceId && tournament && (
          <TournamentInviteModal
            isOpen={isInviteModalOpen}
            onClose={() => setIsInviteModalOpen(false)}
            tournamentId={memoizedInstanceId}
            tournamentName={tournament?.name}
            onGenerateNew={handleGenerateNewInvite}
          />
        )}

        {!isPublicView && (
          <ImageCropModal
            isOpen={cropModalOpen}
            onClose={() => handleCropComplete(null)}
            imageSrc={imageToCrop}
            onCropComplete={handleCropComplete}
          />
        )}

        {/* 🔒 Logo-Upload nur für Admins */}
        {!isPublicView && (
          <input
            type="file"
            ref={logoFileInputRef}
            onChange={handleLogoFileChange}
            accept="image/jpeg, image/jpg, image/png, image/webp, image/gif, image/heic, image/heif"
            className="hidden"
            disabled={isUploadingLogo}
          />
        )}

        {/* 🎨 RESPONSIVE CONTAINER WRAPPER CLOSING TAG */}
        </div>

      </div>
      
      {/* 🔒 BUTTON AUSSERHALB DES MAINLAYOUT - Nur für authentifizierte Admins */}
      {tournament?.status === 'active' && !isPublicView && (
          <div className="fixed bottom-24 left-0 right-0 z-50 bg-gray-900/90 backdrop-blur-sm border-t border-gray-700/60 p-4">
              <div className="w-full">
                  {isCheckingForResumablePasse ? (
                      <Button 
                          className="w-full bg-gray-600 hover:bg-gray-500 text-white py-3 px-6 rounded-lg shadow-lg text-base font-semibold flex items-center justify-center transition-colors duration-150 ease-in-out"
                          disabled
                      >
                          <Loader2 className="animate-spin h-5 w-5 mr-2" />
                          Suche laufende Passe...
                      </Button>
                  ) : resumablePasseId ? (
                      <Button 
                          onClick={() => router.push(`/game/${resumablePasseId}`)}
                          className="w-full h-14 text-lg font-bold rounded-xl shadow-lg bg-blue-600 hover:bg-blue-700 border-b-4 border-blue-900 text-white active:scale-95 transition duration-100 ease-in-out"
                      >
                          <PlayCircle className="h-5 w-5 mr-2" />
                          Aktive Passe fortsetzen
                      </Button>
                  ) : (
                      // ✅ Button nur anzeigen wenn Turnier aktiv UND nicht pausiert UND Modal nicht geöffnet
                      !tournament?.pausedAt && !showStartPasseScreen && (
                          <Button 
                              onClick={handleStartNextPasse}
                              className="w-full h-14 text-lg font-bold rounded-xl shadow-lg bg-blue-600 hover:bg-blue-700 border-b-4 border-blue-900 text-white active:scale-95 transition duration-100 ease-in-out"
                              disabled={
                                participantsStatus === 'loading' || 
                                tournamentParticipants.length < 4 || 
                                isLoadingDetails
                              }
                          >
                              {(participantsStatus === 'loading' || isLoadingDetails) && <Loader2 className="animate-spin h-5 w-5 mr-2" />}
                              Passe {nextPasseLabel} starten
                          </Button>
                      )
                  )}
              </div>
          </div>
      )}
    </MainLayout>
  );
};

export default TournamentViewPage;