"use client";

import React, {useRef, useMemo, useState} from "react";
import {useRouter} from "next/router";
import {Button} from "@/components/ui/button";
import {Alert, AlertDescription} from "@/components/ui/alert";
import Image from "next/image";
import MainLayout from "@/components/layout/MainLayout";
import {UserCog, Users, BarChart3, CheckCircle, XCircle, Archive, Award as AwardIcon, User, Shield, XCircle as AlertXCircle, Camera as CameraIcon, ArrowLeft, Upload, Share} from "lucide-react";
import { FiShare2 } from 'react-icons/fi'; // NEU: Share Button Icon
import ImageCropModal from "@/components/ui/ImageCropModal";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import Link from 'next/link';
import {format} from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import type { StricheRecord, FirestorePlayer } from '@/types/jass';
import type { TournamentInstance } from '@/types/tournament';
import ProfileImage from '@/components/ui/ProfileImage';
import AvatarPreloader from '@/components/ui/AvatarPreloader';
import { transformComputedStatsToExtended, type TransformedPlayerStats } from '@/utils/statsTransformer';
import NotableEventsList from "@/components/profile/NotableEventsList";
import type { FrontendPartnerAggregate, FrontendOpponentAggregate } from '@/types/computedStats';
import { FarbePictogram } from '@/components/settings/FarbePictogram';
import { JassColor } from "@/types/jass";
import { useNestedScrollFix } from '@/hooks/useNestedScrollFix';
import { formatMillisecondsDuration } from '@/utils/formatUtils';
import { getSessionWinRateDisplay, getWinRateDisplay } from '@/utils/winRateUtils';
import { CURRENT_PROFILE_THEME, THEME_COLORS, getCurrentProfileTheme } from '@/config/theme';
import { useClickAndScrollHandler } from '@/hooks/useClickAndScrollHandler';
import { StatLink } from '@/components/statistics/StatLink';
import {fetchCompletedSessionsForUser, fetchCompletedSessionsForPlayer, SessionSummary} from '@/services/sessionService';
import { LegalFooter } from '@/components/layout/LegalFooter';
import { PublicViewTopBar } from '@/components/layout/PublicViewTopBar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ThemeColor } from '@/config/theme';
import { generateBlurPlaceholder } from '@/utils/imageOptimization';
// NEU: Jass-Elo Service
import { loadPlayerRatings, type PlayerRatingWithTier } from '@/services/jassElo';
import { db } from '@/services/firebaseInit';
import { doc, getDoc } from 'firebase/firestore';
// NEU: Responsive Layout Hook
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
  // NEU: Chart-Komponenten
  import PowerRatingChart from '@/components/charts/PowerRatingChart';
  import PieChart from '@/components/charts/PieChart';
  import WinRateChart from '@/components/charts/WinRateChart';
  import { getGlobalPlayerRatingTimeSeries } from '@/services/globalRatingHistoryService'; // 🎯 GLOBALE Spieler-Chart-Daten (über alle Gruppen)
import { getGlobalPlayerStricheTimeSeries } from '@/services/globalStricheHistoryService'; // 🎯 STRICH-DIFFERENZ Chart
import { getGlobalPlayerPointsTimeSeries } from '@/services/globalPointsHistoryService'; // 🎯 PUNKT-DIFFERENZ Chart
import { getGlobalPlayerMatschTimeSeries } from '@/services/globalMatschHistoryService'; // 🎯 MATSCH-BILANZ Chart
import { getGlobalPlayerSchneiderTimeSeries } from '@/services/globalSchneiderHistoryService'; // 🎯 SCHNEIDER-BILANZ Chart
  import { getGlobalPlayerKontermatschTimeSeries } from '@/services/globalKontermatschHistoryService'; // 🎯 KONTERMATSCH-BILANZ Chart
  import { getGlobalPlayerWeisTimeSeries } from '@/services/globalWeisHistoryService'; // 🎯 WEIS-PUNKTE Chart (3 Kurven!)
  import { getTrumpfDistributionChartData } from '@/services/chartDataService'; // 🎯 TRUMPFVERTEILUNG CHART
  import { CARD_SYMBOL_MAPPINGS } from '@/config/CardStyles';
  import { toTitleCase } from '@/utils/formatUtils';
  
  // Types
interface ExpectedPlayerStatsWithAggregates {
  [key: string]: any;
  partnerAggregates?: FrontendPartnerAggregate[];
  opponentAggregates?: FrontendOpponentAggregate[];
}

interface ProfilePagePlayerStats extends TransformedPlayerStats {}

type ArchiveItem = (SessionSummary & { type: 'session' }) | (TournamentInstance & { type: 'tournament' });

function isFirestoreTimestamp(value: any): value is Timestamp {
  return value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function';
}

// Hilfsfunktion zum Normalisieren der Trumpffarben-Namen für die JassColor Typ-Kompatibilität
const normalizeJassColor = (farbe: string): JassColor => {
  const mappings: Record<string, JassColor> = {
    "eichel": "Eicheln",
    "unde": "Une",
    "obe": "Obe"
  };
  
  const lowerCaseFarbe = farbe.toLowerCase();
  return (mappings[lowerCaseFarbe] ?? farbe) as JassColor;
};

// PROPS INTERFACE - Alle Props die von Parent-Komponenten kommen (wie in [playerId].tsx verwendet)
interface ProfileViewProps {
  // Core User Data
  user: any; // AuthStore User  
  player?: FirestorePlayer | null;
  isPublicView: boolean;
  
  // Auth & Navigation
  isAuthenticated?: () => boolean;
  router?: any;
  showNotification?: (notification: any) => void;
  
  // States & Loading
  activeMainTab?: string;
  activeStatsSubTab?: string;
  
  // Stats Data
  playerStats?: ProfilePagePlayerStats | null;
  statsLoading: boolean;
  statsError: string | null;
  members?: FirestorePlayer[];
  membersLoading?: boolean;
  
  // Archive Data
  completedSessions?: SessionSummary[];
  userTournaments?: TournamentInstance[];
  sessionsLoading?: boolean;
  sessionsError?: string | null;
  tournamentsLoading?: boolean;
  tournamentsError?: string | null;
  combinedArchiveItems?: ArchiveItem[];
  groupedArchiveByYear?: Record<string, ArchiveItem[]>;
  sortedYears?: string[];
  renderArchiveItem?: (item: ArchiveItem) => React.ReactNode;
  
  // Upload Features (nur für private Profile)
  fileInputRef?: React.RefObject<HTMLInputElement>;
  previewUrl?: string | null;
  isUploading?: boolean;
  cropModalOpen?: boolean;
  cropModalLoading?: boolean; // NEU: Loading-Zustand für Crop Modal
  imageToCrop?: string | null;
  handleFileChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleCropComplete?: (blob: Blob | null) => void;
  handleSelectClick?: () => void;
  inputKey?: number;
  
  // Theme - KORRIGIERT: Nur noch theme und profileTheme nötig
  theme?: any; // THEME_COLORS[groupTheme] 
  profileTheme?: string;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  player,
  isPublicView,
  isAuthenticated,
  router,
  showNotification,
  activeMainTab,
  activeStatsSubTab,
  playerStats,
  statsLoading,
  statsError,
  members,
  membersLoading,
  completedSessions,
  userTournaments,
  sessionsLoading,
  sessionsError,
  tournamentsLoading,
  tournamentsError,
  combinedArchiveItems,
  groupedArchiveByYear,
  sortedYears,
  renderArchiveItem,
  fileInputRef,
  previewUrl,
  isUploading,
  cropModalOpen,
  cropModalLoading,
  imageToCrop,
  handleFileChange,
  handleCropComplete,
  handleSelectClick,
  inputKey,
  theme,
  profileTheme
}) => {
  const trumpfStatistikRef = useRef<HTMLDivElement>(null);
  useNestedScrollFix(trumpfStatistikRef);
  
  // NEU: Responsive Layout Hook
  const layout = useResponsiveLayout();

  // Neu: State für Bildladung
  const [isImageLoading, setIsImageLoading] = useState(true);
  
  // NEU: State für Elo-Rating
  const [playerRating, setPlayerRating] = useState<PlayerRatingWithTier | null>(null);
  // NEU: State für Elo-Delta
  const [playerDelta, setPlayerDelta] = useState<number | null>(null);
  // NEU: State für Chart-Daten
  const [chartData, setChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [chartLoading, setChartLoading] = useState(false);

  // 🆕 NEUE STATES FÜR ALLE CHARTS
  const [stricheChartData, setStricheChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [stricheChartLoading, setStricheChartLoading] = useState(false);

  const [pointsChartData, setPointsChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [pointsChartLoading, setPointsChartLoading] = useState(false);

  const [matschChartData, setMatschChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [matschChartLoading, setMatschChartLoading] = useState(false);

  const [schneiderChartData, setSchneiderChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [schneiderChartLoading, setSchneiderChartLoading] = useState(false);

  const [kontermatschChartData, setKontermatschChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [kontermatschChartLoading, setKontermatschChartLoading] = useState(false);

  const [weisChartData, setWeisChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [weisChartLoading, setWeisChartLoading] = useState(false);

  // NEU: Partner-Chart-Daten (aus aggregated)
  const [partnerStricheChartData, setPartnerStricheChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [partnerPointsChartData, setPartnerPointsChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [partnerMatschChartData, setPartnerMatschChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);

  // NEU: Gegner-Chart-Daten (aus jassGameSummaries)
  const [opponentStricheChartData, setOpponentStricheChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [opponentPointsChartData, setOpponentPointsChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [opponentMatschChartData, setOpponentMatschChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);

  // Memoized color computation - optimiert für Performance
  const accentColor = useMemo(() => {
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
    const theme = profileTheme || 'blue';
    return accentColorMap[theme as ThemeColor] || accentColorMap.yellow;
  }, [profileTheme]);

  // RGB für Tailwind-Klassen
  const rgbValues = useMemo(() => {
    const rgbMap: Record<ThemeColor, string> = {
      'green': '16, 185, 129',
      'blue': '59, 130, 246',
      'purple': '168, 85, 247',
      'pink': '236, 72, 153',
      'yellow': '234, 179, 8',
      'teal': '20, 184, 166',
      'orange': '249, 115, 22',
      'cyan': '6, 182, 212',
    };
    const theme = profileTheme || 'blue';
    return rgbMap[theme as ThemeColor] || rgbMap.yellow;
  }, [profileTheme]);

  // Hex für dynamische Styles
  const hexColor = useMemo(() => {
    const hexMap: Record<ThemeColor, string> = {
      'green': '#10b981',
      'blue': '#3b82f6',
      'purple': '#a855f7',
      'pink': '#ec4899',
      'yellow': '#eab308',
      'teal': '#14b8a6',
      'orange': '#f97316',
      'cyan': '#06b6d4',
    };
    const theme = profileTheme || 'blue';
    return hexMap[theme as ThemeColor] || hexMap.yellow;
  }, [profileTheme]);

  // Glow für Schatten-Effekte
  const glowColor = useMemo(() => {
    const glowMap: Record<ThemeColor, string> = {
      'green': 'rgba(16, 185, 129, 0.2)',
      'blue': 'rgba(59, 130, 246, 0.2)',
      'purple': 'rgba(168, 85, 247, 0.2)',
      'pink': 'rgba(236, 72, 153, 0.2)',
      'yellow': 'rgba(234, 179, 8, 0.2)',
      'teal': 'rgba(20, 184, 166, 0.2)',
      'orange': 'rgba(249, 115, 22, 0.2)',
      'cyan': 'rgba(6, 182, 212, 0.2)',
    };
    const theme = profileTheme || 'blue';
    return glowMap[theme as ThemeColor] || glowMap.yellow;
  }, [profileTheme]);

  // Handler für den Zurück-Button
  const handleGoBack = () => {
    if (isPublicView && player?.groupIds && player.groupIds.length > 0) {
      // 🚨 SMART BACK: Leite zur Hauptgruppe des Spielers weiter
      const primaryGroupId = player.groupIds[0]; // Erste Gruppe als Hauptgruppe
      router.push(`/view/group/${primaryGroupId}`);
      return;
    }

    if (isPublicView) {
      const { returnTo, returnMainTab, returnStatsSubTab } = router.query;

      if (typeof returnTo === 'string' && returnTo === '/start' && typeof returnMainTab === 'string') {
        let path = `/start?mainTab=${returnMainTab}`;
        if (returnMainTab === 'statistics' && typeof returnStatsSubTab === 'string') {
          path += `&statsSubTab=${returnStatsSubTab}`;
        }
        router.push(path);
        return;
      }

      // Generischer Fallback
      if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
        router.back();
      } else {
        router.push('/start'); 
      }
    } else {
      // Private Profile - redirect to home or previous page
      router.push('/start');
    }
  };

  // NEU: Share-Funktion für öffentliche Profile (analog zu privateProfile/index.tsx)
  const handleShareClick = async () => {
    if (!isPublicView || !currentPlayer) return;
    
    const playerId = currentPlayer.id || currentPlayer.userId;
    if (!playerId) return;
    
    try {
      // Eleganter Share-Text erstellen
      const playerName = currentPlayer?.displayName || 'Jass-Spieler';
      const shareText = `Schau dir die Jass-Statistiken von "${playerName}" an! Hier findest du alle Spielergebnisse, Highlights und das komplette Archiv.\n\nhttps://jassguru.ch/profile/${playerId}\n\ngeneriert von:\n👉 jassguru.ch`;

      // Share API verwenden (falls verfügbar)
      if (navigator.share) {
        await navigator.share({
          text: shareText
        });
        console.log("✅ Profil-Link erfolgreich geteilt!");
      } else {
        // Fallback: In Zwischenablage kopieren
        await navigator.clipboard.writeText(shareText);
        console.log("📋 Profil-Link in Zwischenablage kopiert!");
      }
    } catch (error: any) {
      // Benutzer-Abbruch ist kein echter Fehler
      if (error.name === 'AbortError') {
        console.log("ℹ️ Share vom Benutzer abgebrochen");
        return;
      }
      
      console.error("❌ Fehler beim Teilen:", error);
      
      // Letzter Fallback: Versuche trotzdem zu kopieren
      try {
        const fallbackText = `https://jassguru.ch/profile/${playerId}`;
        await navigator.clipboard.writeText(fallbackText);
        console.log("📋 Fallback: Link in Zwischenablage kopiert");
      } catch (clipboardError) {
        console.error("❌ Auch Zwischenablage fehlgeschlagen:", clipboardError);
      }
      }
    };
  
    // NEU: Trumpfverteilung-Daten für PieChart
    const trumpfDistributionData = useMemo(() => {
      if (!playerStats?.trumpfStatistik || !playerStats.totalTrumpfCount || playerStats.totalTrumpfCount === 0) {
        return null;
      }
      return getTrumpfDistributionChartData(playerStats.trumpfStatistik, playerStats.totalTrumpfCount);
    }, [playerStats]);
  
    // NEU: Trumpfstatistik-Array für die Anzeige
  const trumpfStatistikArray = useMemo(() => {
    if (!playerStats?.trumpfStatistik || playerStats.totalTrumpfCount === 0) {
      return [];
    }
    
    // KORREKTUR: Duplikate zusammenfassen (eichel+eicheln, unde+une)
    const consolidatedStats: Record<string, number> = {};
    
    Object.entries(playerStats.trumpfStatistik).forEach(([farbe, anzahl]) => {
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
        anteil: anzahl / playerStats.totalTrumpfCount,
      }))
      .sort((a, b) => b.anzahl - a.anzahl);
  }, [playerStats]);

  // NEU: Siegquote Partie - PieChart Daten
  const sessionWinRateData = useMemo(() => {
    const wins = playerStats?.sessionsWon || 0;
    const losses = playerStats?.sessionsLost || 0;
    const draws = playerStats?.sessionsTied || 0;
    
    const total = wins + losses + draws;
    if (total === 0) return null;
    
    return {
      labels: ['Sieg', 'Niederlage', 'Unentschieden'],
      values: [wins, losses, draws],
      backgroundColor: ['#10b981', '#ef4444', '#94a3b8'], // emerald-500, red-500, slate-400
      percentages: [(wins / total) * 100, (losses / total) * 100, (draws / total) * 100], // Als echte Prozentwerte (0-100)
      pictogramPaths: [null, null, null], // Leer-Array für nur Prozent/Absolute Zahlen
    };
  }, [playerStats?.sessionsWon, playerStats?.sessionsLost, playerStats?.sessionsTied]);

  // NEU: Siegquote Spiel - PieChart Daten
  const gameWinRateData = useMemo(() => {
    const wins = playerStats?.gamesWon || 0;
    const losses = playerStats?.gamesLost || 0;
    
    const total = wins + losses;
    if (total === 0) return null;
    
    return {
      labels: ['Sieg', 'Niederlage'],
      values: [wins, losses],
      backgroundColor: ['#10b981', '#ef4444'], // emerald-500, red-500
      percentages: [(wins / total) * 100, (losses / total) * 100], // Als echte Prozentwerte (0-100)
      pictogramPaths: [null, null], // Leer-Array für Labels
    };
  }, [playerStats?.gamesWon, playerStats?.gamesLost]);

  // Bestimme den aktuellen Player (für Public View aus props, für Private View verwende bevorzugt den Firestore-Player aus props)
  const currentPlayer = useMemo(() => {
    if (isPublicView) {
      return player;
    }
    if (player) return player;
    if (user && typeof user === 'object') {
      const { id, userId, displayName, photoURL, statusMessage, groupIds } = user as any;
      return {
        id,
        userId,
        displayName,
        photoURL,
        statusMessage,
        groupIds,
      };
    }
    return null;
  }, [isPublicView, player, user]);
  const displayName = currentPlayer?.displayName || "Unbekannter Spieler";
  const photoURL = currentPlayer?.photoURL;
  const jassSpruch = currentPlayer?.statusMessage || "Hallo! Ich jasse mit jassguru.ch";

  const profileAvatarPhotoURLs = useMemo(() => {
    const urls: (string | undefined | null)[] = [];

    if (members) {
      urls.push(...members.map((m) => m.photoURL));
    }

    if (currentPlayer?.photoURL) {
      urls.push(currentPlayer.photoURL);
    }

    const pushMemberPhotoById = (id?: string) => {
      if (!id) return;
      const member = members?.find((m) => m.id === id || m.userId === id);
      if (member?.photoURL) {
        urls.push(member.photoURL);
      }
    };

    const pushMemberPhotoByName = (name?: string) => {
      if (!name) return;
      const normalized = name.toLowerCase();
      const member = members?.find((m) => m.displayName?.toLowerCase() === normalized);
      if (member?.photoURL) {
        urls.push(member.photoURL);
      }
    };

    const safeArray = <T extends { partnerId?: string; opponentId?: string; partnerDisplayName?: string; opponentDisplayName?: string; }>(arr?: T[]) => Array.isArray(arr) ? arr : [];

    safeArray(playerStats?.partnerAggregates).forEach((partner) => {
      pushMemberPhotoById(partner.partnerId);
      pushMemberPhotoByName(partner.partnerDisplayName);
    });

    safeArray(playerStats?.opponentAggregates).forEach((opponent) => {
      pushMemberPhotoById(opponent.opponentId);
      pushMemberPhotoByName(opponent.opponentDisplayName);
    });

    return Array.from(new Set(urls.filter((url): url is string => typeof url === 'string' && url.trim() !== '')));
  }, [members, currentPlayer, playerStats?.partnerAggregates, playerStats?.opponentAggregates]);

  // Einheitliche, autoritative Bestimmung der anzuzeigenden Spieler-ID
  const viewPlayerId = useMemo(() => {
    if (isPublicView) {
      const qid = router?.query?.playerId;
      if (typeof qid === 'string' && qid.trim().length > 0) return qid;
    }
    const candidate = (currentPlayer as any)?.id || (currentPlayer as any)?.userId || (user as any)?.playerId || (user as any)?.uid;
    return candidate ? String(candidate) : null;
  }, [isPublicView, router?.query?.playerId, currentPlayer, user]);

  // NEU: Lade Elo-Rating für aktuellen Spieler (einheitlich via loadPlayerRatings)
  React.useEffect(() => {
    if (!viewPlayerId) return;
    (async () => {
      try {
        const map = await loadPlayerRatings([viewPlayerId]);
        const rating = map.get(viewPlayerId);
        if (rating) {
          setPlayerRating(rating);
          // 🆕 SESSION-DELTA: Verwende lastSessionDelta statt lastDelta
          if (typeof rating.lastSessionDelta === 'number') {
            setPlayerDelta(rating.lastSessionDelta);
          } else if (typeof rating.lastDelta === 'number') {
            // Fallback für alte Daten ohne lastSessionDelta
            setPlayerDelta(rating.lastDelta);
          } else {
            setPlayerDelta(null);
          }
        }
      } catch (e) {
        console.warn('Fehler beim Laden des Elo-Ratings via loadPlayerRatings:', e);
      }
    })();
  }, [viewPlayerId]);

  // 🚀 NEU: Lade Chart-Daten für Power-Rating Zeitreihen (GLOBAL über alle Gruppen, verzögert für bessere UX!)
  React.useEffect(() => {
    if (!viewPlayerId) return;
    
    // ✅ Verzögerung um 1-2 Frames nach Tab-Expandieren für smooth Chart-Rendering
    const timer = setTimeout(() => {
      setChartLoading(true);
      getGlobalPlayerRatingTimeSeries(viewPlayerId, 100, profileTheme || 'blue')
        .then((data) => {
          setChartData(data);
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Chart-Daten:', error);
          setChartData(null);
        })
        .finally(() => {
          setChartLoading(false);
        });
    }, 50); // 50ms Verzögerung für bessere UX
    
    return () => clearTimeout(timer);
  }, [viewPlayerId, profileTheme]);

  // 🆕 STRICH-DIFFERENZ CHART
  React.useEffect(() => {
    if (!viewPlayerId) return;
    
    const timer = setTimeout(() => {
      setStricheChartLoading(true);
      getGlobalPlayerStricheTimeSeries(viewPlayerId, 100, profileTheme || 'blue')
        .then((data) => {
          setStricheChartData(data);
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Strich-Chart-Daten:', error);
          setStricheChartData(null);
        })
        .finally(() => {
          setStricheChartLoading(false);
        });
    }, 100);
    
    return () => clearTimeout(timer);
  }, [viewPlayerId, profileTheme]);

  // 🆕 PUNKT-DIFFERENZ CHART
  React.useEffect(() => {
    if (!viewPlayerId) return;
    
    const timer = setTimeout(() => {
      setPointsChartLoading(true);
      getGlobalPlayerPointsTimeSeries(viewPlayerId, 100, profileTheme || 'blue')
        .then((data) => {
          setPointsChartData(data);
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Punkte-Chart-Daten:', error);
          setPointsChartData(null);
        })
        .finally(() => {
          setPointsChartLoading(false);
        });
    }, 150);
    
    return () => clearTimeout(timer);
  }, [viewPlayerId, profileTheme]);

  // 🆕 MATSCH-BILANZ CHART
  React.useEffect(() => {
    if (!viewPlayerId) return;
    
    const timer = setTimeout(() => {
      setMatschChartLoading(true);
      getGlobalPlayerMatschTimeSeries(viewPlayerId, 100, profileTheme || 'blue')
        .then((data) => {
          setMatschChartData(data);
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Matsch-Chart-Daten:', error);
          setMatschChartData(null);
        })
        .finally(() => {
          setMatschChartLoading(false);
        });
    }, 200);
    
    return () => clearTimeout(timer);
  }, [viewPlayerId]);

  // 🆕 SCHNEIDER-BILANZ CHART
  React.useEffect(() => {
    if (!viewPlayerId) return;
    
    const timer = setTimeout(() => {
      setSchneiderChartLoading(true);
      getGlobalPlayerSchneiderTimeSeries(viewPlayerId, 100, profileTheme || 'blue')
        .then((data) => {
          setSchneiderChartData(data);
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Schneider-Chart-Daten:', error);
          setSchneiderChartData(null);
        })
        .finally(() => {
          setSchneiderChartLoading(false);
        });
    }, 250);
    
    return () => clearTimeout(timer);
  }, [viewPlayerId]);

  // 🆕 KONTERMATSCH-BILANZ CHART
  React.useEffect(() => {
    if (!viewPlayerId) return;
    
    const timer = setTimeout(() => {
      setKontermatschChartLoading(true);
      getGlobalPlayerKontermatschTimeSeries(viewPlayerId, 100, profileTheme || 'blue')
        .then((data) => {
          setKontermatschChartData(data);
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Kontermatsch-Chart-Daten:', error);
          setKontermatschChartData(null);
        })
        .finally(() => {
          setKontermatschChartLoading(false);
        });
    }, 300);
    
    return () => clearTimeout(timer);
  }, [viewPlayerId]);

  // 🆕 WEIS-PUNKTE CHART (3 KURVEN!)
  React.useEffect(() => {
    if (!viewPlayerId) return;
    
    const timer = setTimeout(() => {
      setWeisChartLoading(true);
      getGlobalPlayerWeisTimeSeries(viewPlayerId, 100, profileTheme || 'blue')
        .then((data) => {
          setWeisChartData(data);
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Weis-Chart-Daten:', error);
          setWeisChartData(null);
        })
        .finally(() => {
          setWeisChartLoading(false);
        });
    }, 350);
    
    return () => clearTimeout(timer);
  }, [viewPlayerId]);

  // NEU: Lade Partner-Chart-Daten aus jassGameSummaries
  React.useEffect(() => {
    if (!viewPlayerId || !playerStats?.partnerAggregates || playerStats.partnerAggregates.length === 0) {
      return;
    }

    const loadPartnerChartsFromSummaries = async () => {
      try {
        // 1. Ermittle alle Gruppen, in denen dieser Spieler Mitglied ist
        const currentPlayerDoc = await getDoc(doc(db, 'players', viewPlayerId));
        if (!currentPlayerDoc.exists()) return;
        
        const groupIds = currentPlayerDoc.data().groupIds || [];
        if (groupIds.length === 0) return;

        // 2. Lade jassGameSummaries aus ALLEN Gruppen
        const allSummaries: any[] = [];
        
        for (const groupId of groupIds) {
          try {
            const { collection, getDocs } = await import('firebase/firestore');
            const summariesRef = collection(db, `groups/${groupId}/jassGameSummaries`);
            const summariesSnapshot = await getDocs(summariesRef);
            summariesSnapshot.forEach(doc => {
              allSummaries.push({ id: doc.id, ...doc.data() });
            });
          } catch (error) {
            console.warn(`Fehler beim Laden von jassGameSummaries für Gruppe ${groupId}:`, error);
          }
        }

        // 3. Erstelle Partner-spezifische Chart-Daten
        const stricheDataByPartner: Record<string, { labels: string[], data: number[] }> = {};
        const pointsDataByPartner: Record<string, { labels: string[], data: number[] }> = {};
        const matschDataByPartner: Record<string, { labels: string[], data: number[] }> = {};

        // Für jeden Partner
        for (const partner of playerStats.partnerAggregates) {
          const partnerId = partner.partnerId;
          stricheDataByPartner[partnerId] = { labels: [], data: [] };
          pointsDataByPartner[partnerId] = { labels: [], data: [] };
          matschDataByPartner[partnerId] = { labels: [], data: [] };
        }

        // Kumulative Werte pro Partner
        const cumulativeStricheByPartner: Record<string, number> = {};
        const cumulativePointsByPartner: Record<string, number> = {};
        const cumulativeMatschByPartner: Record<string, number> = {};

        // 4. Sortiere Summaries nach Datum (älteste zuerst für kumulative Berechnung)
        allSummaries.sort((a, b) => {
          const dateA = a.completedAt?.toDate?.() || new Date(a.completedAt?._seconds * 1000);
          const dateB = b.completedAt?.toDate?.() || new Date(b.completedAt?._seconds * 1000);
          return dateA.getTime() - dateB.getTime();
        });

        // 5. Iteriere über alle Summaries und filtere nach Partner
        for (const summary of allSummaries) {
          if (!summary.gameResults || !Array.isArray(summary.gameResults)) continue;

          const sessionDate = summary.completedAt?.toDate?.() || new Date(summary.completedAt?._seconds * 1000);
          const label = sessionDate.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' });

          // Tracking: Welche Partner waren in dieser Session aktiv und deren Differenzen
          const partnersInSession = new Map<string, { stricheDiff: number, pointsDiff: number, matschDiff: number }>();

          // Session-level Matsch-Bilanz (nur einmal pro Session, nicht pro Spiel!)
          let sessionMatschDiff = 0;
          let sessionMatschCalculated = false;

          for (const game of summary.gameResults) {
            if (!game.teams?.top?.players || !game.teams?.bottom?.players) continue;

            // Prüfe ob Spieler überhaupt in diesem Spiel war
            const playerInTop = game.teams.top.players.some((p: any) => p.playerId === viewPlayerId);
            const playerInBottom = game.teams.bottom.players.some((p: any) => p.playerId === viewPlayerId);
            if (!playerInTop && !playerInBottom) continue;

            const playerTeam = playerInTop ? 'top' : 'bottom';
            
            // Matsch-Bilanz EINMAL pro Session berechnen (nicht pro Spiel!)
            if (!sessionMatschCalculated && summary.eventCounts) {
              const sessionTeamEvents = playerTeam === 'top' ? summary.eventCounts.top : summary.eventCounts.bottom;
              const sessionOpponentEvents = playerTeam === 'top' ? summary.eventCounts.bottom : summary.eventCounts.top;
              sessionMatschDiff = sessionTeamEvents && sessionOpponentEvents ? 
                ((sessionTeamEvents.matsch || 0) - (sessionOpponentEvents.matsch || 0)) : 0;
              sessionMatschCalculated = true;
            }

            // Für jeden Partner: Prüfe ob Partner war
            for (const partner of playerStats.partnerAggregates) {
              const partnerId = partner.partnerId;
              const partnerInTop = game.teams.top.players.some((p: any) => p.playerId === partnerId);
              const partnerInBottom = game.teams.bottom.players.some((p: any) => p.playerId === partnerId);

              const arePartners = (playerInTop && partnerInTop) || (playerInBottom && partnerInBottom);
              if (!arePartners) continue;

              const playerScore = playerTeam === 'top' ? game.topScore : game.bottomScore;
              const opponentScore = playerTeam === 'top' ? game.bottomScore : game.topScore;
              const pointsDiff = playerScore - opponentScore;

              const playerStriche = playerTeam === 'top' ? game.finalStriche?.top : game.finalStriche?.bottom;
              const opponentStriche = playerTeam === 'top' ? game.finalStriche?.bottom : game.finalStriche?.top;
              const stricheDiff = playerStriche && opponentStriche ? 
                (playerStriche.berg + playerStriche.sieg + playerStriche.matsch + playerStriche.schneider + playerStriche.kontermatsch) -
                (opponentStriche.berg + opponentStriche.sieg + opponentStriche.matsch + opponentStriche.schneider + opponentStriche.kontermatsch) : 0;

              // Initialisiere falls nötig
              if (!partnersInSession.has(partnerId)) {
                partnersInSession.set(partnerId, { stricheDiff: 0, pointsDiff: 0, matschDiff: 0 });
              }

              // Addiere zu Session-Differenzen (Matsch NUR beim ersten Spiel mit diesem Partner)
              const current = partnersInSession.get(partnerId)!;
              current.stricheDiff += stricheDiff;
              current.pointsDiff += pointsDiff;
              // Matsch-Bilanz wird nur einmal pro Partner pro Session gesetzt
              if (current.matschDiff === 0 && sessionMatschCalculated) {
                current.matschDiff = sessionMatschDiff;
              }
            }
          }

          // NACH allen Games in dieser Session: Kumuliere für jeden Partner
          for (const [partnerId, diffs] of partnersInSession) {
            // Initialisiere kumulative Werte falls nötig
            if (cumulativeStricheByPartner[partnerId] === undefined) cumulativeStricheByPartner[partnerId] = 0;
            if (cumulativePointsByPartner[partnerId] === undefined) cumulativePointsByPartner[partnerId] = 0;
            if (cumulativeMatschByPartner[partnerId] === undefined) cumulativeMatschByPartner[partnerId] = 0;

            // Kumuliere Werte
            cumulativeStricheByPartner[partnerId] += diffs.stricheDiff;
            cumulativePointsByPartner[partnerId] += diffs.pointsDiff;
            cumulativeMatschByPartner[partnerId] += diffs.matschDiff;

            // Füge Datenpunkte hinzu
            stricheDataByPartner[partnerId].labels.push(label);
            stricheDataByPartner[partnerId].data.push(cumulativeStricheByPartner[partnerId]);

            pointsDataByPartner[partnerId].labels.push(label);
            pointsDataByPartner[partnerId].data.push(cumulativePointsByPartner[partnerId]);

            matschDataByPartner[partnerId].labels.push(label);
            matschDataByPartner[partnerId].data.push(cumulativeMatschByPartner[partnerId]);
          }
        }

        // 6. Erstelle gemeinsames Label-Array (chronologisch sortiert)
        const allLabelsSet = new Set<string>();
        for (const summary of allSummaries) {
          if (!summary.gameResults || !Array.isArray(summary.gameResults)) continue;
          const sessionDate = summary.completedAt?.toDate?.() || new Date(summary.completedAt?._seconds * 1000);
          const label = sessionDate.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' });
          allLabelsSet.add(label);
        }
        const allLabels = Array.from(allLabelsSet).sort((a, b) => {
          // Parse DD.MM.YY format
          const [dayA, monthA, yearA] = a.split('.');
          const [dayB, monthB, yearB] = b.split('.');
          const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
          const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
          return dateA.getTime() - dateB.getTime();
        });

        // 7. Erstelle Datasets für jeden Partner mit sortierten Labels
        const stricheDatasets: any[] = [];
        const pointsDatasets: any[] = [];
        const matschDatasets: any[] = [];

        for (const partner of playerStats.partnerAggregates) {
          const partnerId = partner.partnerId;
          const stricheData = stricheDataByPartner[partnerId];
          const pointsData = pointsDataByPartner[partnerId];
          const matschData = matschDataByPartner[partnerId];

          // 🎯 NEU: Prüfe ob Partner nur 1 Session hat (für spezielle Behandlung)
          const sessionsWithPartner = partner.sessionsPlayedWith || 0;

          // Erstelle Data-Map: label -> value
          const stricheMap = new Map<string, number>();
          const pointsMap = new Map<string, number>();
          const matschMap = new Map<string, number>();

          if (stricheData && stricheData.labels.length > 0) {
            for (let i = 0; i < stricheData.labels.length; i++) {
              stricheMap.set(stricheData.labels[i], stricheData.data[i]);
            }
          }

          if (pointsData && pointsData.labels.length > 0) {
            for (let i = 0; i < pointsData.labels.length; i++) {
              pointsMap.set(pointsData.labels[i], pointsData.data[i]);
            }
          }

          if (matschData && matschData.labels.length > 0) {
            for (let i = 0; i < matschData.labels.length; i++) {
              matschMap.set(matschData.labels[i], matschData.data[i]);
            }
          }

          // 🎯 NEU: Finde erstes und letztes Datum mit Daten für diesen Partner
          const firstValidLabel = allLabels.find(label => 
            stricheMap.has(label) || pointsMap.has(label) || matschMap.has(label)
          );
          
          if (!firstValidLabel) continue; // Skip wenn keine Daten vorhanden
          
          const firstValidLabelIndex = allLabels.indexOf(firstValidLabel);
          
          // Finde das letzte Datum mit Daten
          let lastValidLabelIndex = firstValidLabelIndex;
          for (let i = allLabels.length - 1; i >= firstValidLabelIndex; i--) {
            const label = allLabels[i];
            if (stricheMap.has(label) || pointsMap.has(label) || matschMap.has(label)) {
              lastValidLabelIndex = i;
              break;
            }
          }
          
          const relevantLabels = allLabels.slice(firstValidLabelIndex, lastValidLabelIndex + 1); // Nur Labels zwischen erstem und letztem Datum
          
          // Erstelle Data-Arrays nur für relevante Labels
          const stricheArray: (number | null)[] = [];
          const pointsArray: (number | null)[] = [];
          const matschArray: (number | null)[] = [];

          for (const label of relevantLabels) {
            stricheArray.push(stricheMap.has(label) ? stricheMap.get(label)! : null);
            pointsArray.push(pointsMap.has(label) ? pointsMap.get(label)! : null);
            matschArray.push(matschMap.has(label) ? matschMap.get(label)! : null);
          }

          // 🎯 NEU: Für Partner mit nur 1 Session: Füge 0-Wert am Anfang hinzu
          if (sessionsWithPartner === 1 && relevantLabels.length > 0) {
            // Finde das letzte Label (Session-Datum)
            const lastLabel = relevantLabels[relevantLabels.length - 1];
            const hasDataAtLastLabel = stricheMap.has(lastLabel) || pointsMap.has(lastLabel) || matschMap.has(lastLabel);
            
            if (hasDataAtLastLabel) {
              // Prüfe ob es ein vorheriges Label gibt (für 0-Wert)
              const lastLabelIndex = relevantLabels.indexOf(lastLabel);
              if (lastLabelIndex > 0) {
                const previousLabel = relevantLabels[lastLabelIndex - 1];
                // Setze 0-Wert nur wenn dort noch kein Wert existiert
                if (!stricheMap.has(previousLabel)) {
                  stricheArray[lastLabelIndex - 1] = 0;
                }
                if (!pointsMap.has(previousLabel)) {
                  pointsArray[lastLabelIndex - 1] = 0;
                }
                if (!matschMap.has(previousLabel)) {
                  matschArray[lastLabelIndex - 1] = 0;
                }
              }
            }
          }

          // Nur hinzufügen wenn mindestens ein Wert existiert
          if (stricheArray.some(v => v !== null)) {
            stricheDatasets.push({
              label: partner.partnerDisplayName,
              displayName: partner.partnerDisplayName,
              data: stricheArray,
              playerId: partnerId,
              labels: relevantLabels, // 🎯 NEU: Eigene Labels für diesen Partner
              borderColor: '',
              backgroundColor: ''
            });
          }

          if (pointsArray.some(v => v !== null)) {
            pointsDatasets.push({
              label: partner.partnerDisplayName,
              displayName: partner.partnerDisplayName,
              data: pointsArray,
              playerId: partnerId,
              labels: relevantLabels, // 🎯 NEU: Eigene Labels für diesen Partner
              borderColor: '',
              backgroundColor: ''
            });
          }

          if (matschArray.some(v => v !== null)) {
            matschDatasets.push({
              label: partner.partnerDisplayName,
              displayName: partner.partnerDisplayName,
              data: matschArray,
              playerId: partnerId,
              labels: relevantLabels, // 🎯 NEU: Eigene Labels für diesen Partner
              borderColor: '',
              backgroundColor: ''
            });
          }
        }

        // 8. Setze Chart-Daten
        if (stricheDatasets.length > 0) {
          // 🎯 NEU: Finde das frühste und späteste Datum über ALLE Datasets
          const allUsedLabels = new Set<string>();
          stricheDatasets.forEach(ds => {
            if (ds.labels) {
              ds.labels.forEach(label => allUsedLabels.add(label));
            }
          });
          
          // Sortiere und erstelle gemeinsames Label-Array
          const sortedLabels = Array.from(allUsedLabels).sort((a, b) => {
            const [dayA, monthA, yearA] = a.split('.');
            const [dayB, monthB, yearB] = b.split('.');
            const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
            const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
            return dateA.getTime() - dateB.getTime();
          });
          
          setPartnerStricheChartData({
            labels: sortedLabels,
            datasets: stricheDatasets
          });
        }

        if (pointsDatasets.length > 0) {
          const allUsedLabels = new Set<string>();
          pointsDatasets.forEach(ds => {
            if (ds.labels) {
              ds.labels.forEach(label => allUsedLabels.add(label));
            }
          });
          
          const sortedLabels = Array.from(allUsedLabels).sort((a, b) => {
            const [dayA, monthA, yearA] = a.split('.');
            const [dayB, monthB, yearB] = b.split('.');
            const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
            const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
            return dateA.getTime() - dateB.getTime();
          });
          
          setPartnerPointsChartData({
            labels: sortedLabels,
            datasets: pointsDatasets
          });
        }

        if (matschDatasets.length > 0) {
          const allUsedLabels = new Set<string>();
          matschDatasets.forEach(ds => {
            if (ds.labels) {
              ds.labels.forEach(label => allUsedLabels.add(label));
            }
          });
          
          const sortedLabels = Array.from(allUsedLabels).sort((a, b) => {
            const [dayA, monthA, yearA] = a.split('.');
            const [dayB, monthB, yearB] = b.split('.');
            const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
            const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
            return dateA.getTime() - dateB.getTime();
          });
          
          setPartnerMatschChartData({
            labels: sortedLabels,
            datasets: matschDatasets
          });
        }

      } catch (error) {
        console.error('Fehler beim Laden der Partner-Chart-Daten aus jassGameSummaries:', error);
      }
    };

    loadPartnerChartsFromSummaries();
  }, [viewPlayerId, playerStats?.partnerAggregates]);

  // NEU: Lade Gegner-Chart-Daten aus jassGameSummaries
  React.useEffect(() => {
    if (!viewPlayerId || !playerStats?.opponentAggregates || playerStats.opponentAggregates.length === 0) {
      return;
    }

    const loadOpponentChartsFromSummaries = async () => {
      try {
        // 1. Ermittle alle Gruppen, in denen dieser Spieler Mitglied ist
        const currentPlayerDoc = await getDoc(doc(db, 'players', viewPlayerId));
        if (!currentPlayerDoc.exists()) return;
        
        const groupIds = currentPlayerDoc.data().groupIds || [];
        if (groupIds.length === 0) return;

        // 2. Lade jassGameSummaries aus ALLEN Gruppen
        const allSummaries: any[] = [];
        
        for (const groupId of groupIds) {
          try {
            const { collection, getDocs } = await import('firebase/firestore');
            const summariesRef = collection(db, `groups/${groupId}/jassGameSummaries`);
            const summariesSnapshot = await getDocs(summariesRef);
            summariesSnapshot.forEach(doc => {
              allSummaries.push({ id: doc.id, ...doc.data() });
            });
          } catch (error) {
            console.warn(`Fehler beim Laden von jassGameSummaries für Gruppe ${groupId}:`, error);
          }
        }

        // 3. Erstelle Gegner-spezifische Chart-Daten
        const stricheDataByOpponent: Record<string, { labels: string[], data: number[] }> = {};
        const pointsDataByOpponent: Record<string, { labels: string[], data: number[] }> = {};
        const matschDataByOpponent: Record<string, { labels: string[], data: number[] }> = {};

        // Für jeden Gegner
        for (const opponent of playerStats.opponentAggregates) {
          const opponentId = opponent.opponentId;
          stricheDataByOpponent[opponentId] = { labels: [], data: [] };
          pointsDataByOpponent[opponentId] = { labels: [], data: [] };
          matschDataByOpponent[opponentId] = { labels: [], data: [] };
        }

        // Kumulative Werte pro Gegner
        const cumulativeStricheByOpponent: Record<string, number> = {};
        const cumulativePointsByOpponent: Record<string, number> = {};
        const cumulativeMatschByOpponent: Record<string, number> = {};

        // 4. Sortiere Summaries nach Datum (älteste zuerst für kumulative Berechnung)
        allSummaries.sort((a, b) => {
          const dateA = a.completedAt?.toDate?.() || new Date(a.completedAt?._seconds * 1000);
          const dateB = b.completedAt?.toDate?.() || new Date(b.completedAt?._seconds * 1000);
          return dateA.getTime() - dateB.getTime();
        });

        // 5. Iteriere über alle Summaries und filtere nach Gegner
        for (const summary of allSummaries) {
          if (!summary.gameResults || !Array.isArray(summary.gameResults)) continue;

          const sessionDate = summary.completedAt?.toDate?.() || new Date(summary.completedAt?._seconds * 1000);
          const label = sessionDate.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' });

          // Tracking: Welche Gegner waren in dieser Session aktiv und deren Differenzen
          const opponentsInSession = new Map<string, { stricheDiff: number, pointsDiff: number, matschDiff: number }>();

          // Session-level Matsch-Bilanz (nur einmal pro Session, nicht pro Spiel!)
          let sessionMatschDiff = 0;
          let sessionMatschCalculated = false;

          for (const game of summary.gameResults) {
            if (!game.teams?.top?.players || !game.teams?.bottom?.players) continue;

            // Prüfe ob Spieler überhaupt in diesem Spiel war
            const playerInTop = game.teams.top.players.some((p: any) => p.playerId === viewPlayerId);
            const playerInBottom = game.teams.bottom.players.some((p: any) => p.playerId === viewPlayerId);
            if (!playerInTop && !playerInBottom) continue;

            const playerTeam = playerInTop ? 'top' : 'bottom';
            
            // Matsch-Bilanz EINMAL pro Session berechnen (nicht pro Spiel!)
            if (!sessionMatschCalculated && summary.eventCounts) {
              const sessionTeamEvents = playerTeam === 'top' ? summary.eventCounts.top : summary.eventCounts.bottom;
              const sessionOpponentEvents = playerTeam === 'top' ? summary.eventCounts.bottom : summary.eventCounts.top;
              sessionMatschDiff = sessionTeamEvents && sessionOpponentEvents ? 
                ((sessionTeamEvents.matsch || 0) - (sessionOpponentEvents.matsch || 0)) : 0;
              sessionMatschCalculated = true;
            }

            // Für jeden Gegner: Prüfe ob Gegner war (GEGNERISCHES Team!)
            for (const opponent of playerStats.opponentAggregates) {
              const opponentId = opponent.opponentId;
              const opponentInTop = game.teams.top.players.some((p: any) => p.playerId === opponentId);
              const opponentInBottom = game.teams.bottom.players.some((p: any) => p.playerId === opponentId);

              // Gegner sind im ANDEREN Team!
              const areOpponents = (playerInTop && opponentInBottom) || (playerInBottom && opponentInTop);
              if (!areOpponents) continue;

              const playerScore = playerTeam === 'top' ? game.topScore : game.bottomScore;
              const opponentScore = playerTeam === 'top' ? game.bottomScore : game.topScore;
              const pointsDiff = playerScore - opponentScore;

              const playerStriche = playerTeam === 'top' ? game.finalStriche?.top : game.finalStriche?.bottom;
              const opponentStriche = playerTeam === 'top' ? game.finalStriche?.bottom : game.finalStriche?.top;
              const stricheDiff = playerStriche && opponentStriche ? 
                (playerStriche.berg + playerStriche.sieg + playerStriche.matsch + playerStriche.schneider + playerStriche.kontermatsch) -
                (opponentStriche.berg + opponentStriche.sieg + opponentStriche.matsch + opponentStriche.schneider + opponentStriche.kontermatsch) : 0;

              // Initialisiere falls nötig
              if (!opponentsInSession.has(opponentId)) {
                opponentsInSession.set(opponentId, { stricheDiff: 0, pointsDiff: 0, matschDiff: 0 });
              }

              // Addiere zu Session-Differenzen (Matsch NUR beim ersten Spiel mit diesem Gegner)
              const current = opponentsInSession.get(opponentId)!;
              current.stricheDiff += stricheDiff;
              current.pointsDiff += pointsDiff;
              // Matsch-Bilanz wird nur einmal pro Gegner pro Session gesetzt
              if (current.matschDiff === 0 && sessionMatschCalculated) {
                current.matschDiff = sessionMatschDiff;
              }
            }
          }

          // NACH allen Games in dieser Session: Kumuliere für jeden Gegner
          for (const [opponentId, diffs] of opponentsInSession) {
            // Initialisiere kumulative Werte falls nötig
            if (cumulativeStricheByOpponent[opponentId] === undefined) cumulativeStricheByOpponent[opponentId] = 0;
            if (cumulativePointsByOpponent[opponentId] === undefined) cumulativePointsByOpponent[opponentId] = 0;
            if (cumulativeMatschByOpponent[opponentId] === undefined) cumulativeMatschByOpponent[opponentId] = 0;

            // Kumuliere Werte
            cumulativeStricheByOpponent[opponentId] += diffs.stricheDiff;
            cumulativePointsByOpponent[opponentId] += diffs.pointsDiff;
            cumulativeMatschByOpponent[opponentId] += diffs.matschDiff;

            // Füge Datenpunkte hinzu
            stricheDataByOpponent[opponentId].labels.push(label);
            stricheDataByOpponent[opponentId].data.push(cumulativeStricheByOpponent[opponentId]);

            pointsDataByOpponent[opponentId].labels.push(label);
            pointsDataByOpponent[opponentId].data.push(cumulativePointsByOpponent[opponentId]);

            matschDataByOpponent[opponentId].labels.push(label);
            matschDataByOpponent[opponentId].data.push(cumulativeMatschByOpponent[opponentId]);
          }
        }

        // 6. Erstelle gemeinsames Label-Array (chronologisch sortiert)
        const allLabelsSet = new Set<string>();
        for (const summary of allSummaries) {
          if (!summary.gameResults || !Array.isArray(summary.gameResults)) continue;
          const sessionDate = summary.completedAt?.toDate?.() || new Date(summary.completedAt?._seconds * 1000);
          const label = sessionDate.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' });
          allLabelsSet.add(label);
        }
        const allLabels = Array.from(allLabelsSet).sort((a, b) => {
          // Parse DD.MM.YY format
          const [dayA, monthA, yearA] = a.split('.');
          const [dayB, monthB, yearB] = b.split('.');
          const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
          const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
          return dateA.getTime() - dateB.getTime();
        });

        // 7. Erstelle Datasets für jeden Gegner mit sortierten Labels
        const stricheDatasets: any[] = [];
        const pointsDatasets: any[] = [];
        const matschDatasets: any[] = [];

        for (const opponent of playerStats.opponentAggregates) {
          const opponentId = opponent.opponentId;
          const stricheData = stricheDataByOpponent[opponentId];
          const pointsData = pointsDataByOpponent[opponentId];
          const matschData = matschDataByOpponent[opponentId];

          // 🎯 NEU: Prüfe ob Gegner nur 1 Session hat (für spezielle Behandlung)
          const sessionsWithOpponent = opponent.sessionsPlayedAgainst || 0;

          // Erstelle Data-Map: label -> value
          const stricheMap = new Map<string, number>();
          const pointsMap = new Map<string, number>();
          const matschMap = new Map<string, number>();

          if (stricheData && stricheData.labels.length > 0) {
            for (let i = 0; i < stricheData.labels.length; i++) {
              stricheMap.set(stricheData.labels[i], stricheData.data[i]);
            }
          }

          if (pointsData && pointsData.labels.length > 0) {
            for (let i = 0; i < pointsData.labels.length; i++) {
              pointsMap.set(pointsData.labels[i], pointsData.data[i]);
            }
          }

          if (matschData && matschData.labels.length > 0) {
            for (let i = 0; i < matschData.labels.length; i++) {
              matschMap.set(matschData.labels[i], matschData.data[i]);
            }
          }

          // 🎯 NEU: Finde erstes und letztes Datum mit Daten für diesen Gegner
          const firstValidLabel = allLabels.find(label => 
            stricheMap.has(label) || pointsMap.has(label) || matschMap.has(label)
          );
          
          if (!firstValidLabel) continue; // Skip wenn keine Daten vorhanden
          
          const firstValidLabelIndex = allLabels.indexOf(firstValidLabel);
          
          // Finde das letzte Datum mit Daten
          let lastValidLabelIndex = firstValidLabelIndex;
          for (let i = allLabels.length - 1; i >= firstValidLabelIndex; i--) {
            const label = allLabels[i];
            if (stricheMap.has(label) || pointsMap.has(label) || matschMap.has(label)) {
              lastValidLabelIndex = i;
              break;
            }
          }
          
          const relevantLabels = allLabels.slice(firstValidLabelIndex, lastValidLabelIndex + 1); // Nur Labels zwischen erstem und letztem Datum
          
          // Erstelle Data-Arrays nur für relevante Labels
          const stricheArray: (number | null)[] = [];
          const pointsArray: (number | null)[] = [];
          const matschArray: (number | null)[] = [];

          for (const label of relevantLabels) {
            stricheArray.push(stricheMap.has(label) ? stricheMap.get(label)! : null);
            pointsArray.push(pointsMap.has(label) ? pointsMap.get(label)! : null);
            matschArray.push(matschMap.has(label) ? matschMap.get(label)! : null);
          }

          // 🎯 NEU: Für Gegner mit nur 1 Session: Füge 0-Wert am Anfang hinzu
          if (sessionsWithOpponent === 1 && relevantLabels.length > 0) {
            // Finde das letzte Label (Session-Datum)
            const lastLabel = relevantLabels[relevantLabels.length - 1];
            const hasDataAtLastLabel = stricheMap.has(lastLabel) || pointsMap.has(lastLabel) || matschMap.has(lastLabel);
            
            if (hasDataAtLastLabel) {
              // Prüfe ob es ein vorheriges Label gibt (für 0-Wert)
              const lastLabelIndex = relevantLabels.indexOf(lastLabel);
              if (lastLabelIndex > 0) {
                const previousLabel = relevantLabels[lastLabelIndex - 1];
                // Setze 0-Wert nur wenn dort noch kein Wert existiert
                if (!stricheMap.has(previousLabel)) {
                  stricheArray[lastLabelIndex - 1] = 0;
                }
                if (!pointsMap.has(previousLabel)) {
                  pointsArray[lastLabelIndex - 1] = 0;
                }
                if (!matschMap.has(previousLabel)) {
                  matschArray[lastLabelIndex - 1] = 0;
                }
              }
            }
          }

          // Nur hinzufügen wenn mindestens ein Wert existiert
          if (stricheArray.some(v => v !== null)) {
            stricheDatasets.push({
              label: opponent.opponentDisplayName,
              displayName: opponent.opponentDisplayName,
              data: stricheArray,
              playerId: opponentId,
              labels: relevantLabels, // 🎯 NEU: Eigene Labels für diesen Gegner
              borderColor: '',
              backgroundColor: ''
            });
          }

          if (pointsArray.some(v => v !== null)) {
            pointsDatasets.push({
              label: opponent.opponentDisplayName,
              displayName: opponent.opponentDisplayName,
              data: pointsArray,
              playerId: opponentId,
              labels: relevantLabels, // 🎯 NEU: Eigene Labels für diesen Gegner
              borderColor: '',
              backgroundColor: ''
            });
          }

          if (matschArray.some(v => v !== null)) {
            matschDatasets.push({
              label: opponent.opponentDisplayName,
              displayName: opponent.opponentDisplayName,
              data: matschArray,
              playerId: opponentId,
              labels: relevantLabels, // 🎯 NEU: Eigene Labels für diesen Gegner
              borderColor: '',
              backgroundColor: ''
            });
          }
        }

        // 8. Setze Chart-Daten
        if (stricheDatasets.length > 0) {
          // 🎯 NEU: Finde das frühste und späteste Datum über ALLE Datasets
          const allUsedLabels = new Set<string>();
          stricheDatasets.forEach(ds => {
            if (ds.labels) {
              ds.labels.forEach(label => allUsedLabels.add(label));
            }
          });
          
          // Sortiere und erstelle gemeinsames Label-Array
          const sortedLabels = Array.from(allUsedLabels).sort((a, b) => {
            const [dayA, monthA, yearA] = a.split('.');
            const [dayB, monthB, yearB] = b.split('.');
            const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
            const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
            return dateA.getTime() - dateB.getTime();
          });
          
          setOpponentStricheChartData({
            labels: sortedLabels,
            datasets: stricheDatasets
          });
        }

        if (pointsDatasets.length > 0) {
          const allUsedLabels = new Set<string>();
          pointsDatasets.forEach(ds => {
            if (ds.labels) {
              ds.labels.forEach(label => allUsedLabels.add(label));
            }
          });
          
          const sortedLabels = Array.from(allUsedLabels).sort((a, b) => {
            const [dayA, monthA, yearA] = a.split('.');
            const [dayB, monthB, yearB] = b.split('.');
            const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
            const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
            return dateA.getTime() - dateB.getTime();
          });
          
          setOpponentPointsChartData({
            labels: sortedLabels,
            datasets: pointsDatasets
          });
        }

        if (matschDatasets.length > 0) {
          const allUsedLabels = new Set<string>();
          matschDatasets.forEach(ds => {
            if (ds.labels) {
              ds.labels.forEach(label => allUsedLabels.add(label));
            }
          });
          
          const sortedLabels = Array.from(allUsedLabels).sort((a, b) => {
            const [dayA, monthA, yearA] = a.split('.');
            const [dayB, monthB, yearB] = b.split('.');
            const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
            const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
            return dateA.getTime() - dateB.getTime();
          });
          
          setOpponentMatschChartData({
            labels: sortedLabels,
            datasets: matschDatasets
          });
        }

      } catch (error) {
        console.error('Fehler beim Laden der Gegner-Chart-Daten aus jassGameSummaries:', error);
      }
    };

    loadOpponentChartsFromSummaries();
  }, [viewPlayerId, playerStats?.opponentAggregates]);

  // ===== LOKALE TAB-COLOR FUNKTION (IDENTISCH ZU GROUPVIEW) =====
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
    return colorMap[themeKey] || '#ca8a04'; // Fallback zu Standard-Gelb (yellow-600)
  };

  // 🎨 NEU: Farbkodierung für Win-Rate Werte (EMERALD-500 für besseren Kontrast)
  const getWinRateColor = (winRate: number): string => {
    // Für Win-Rate: >50% = grün, <50% = rot, =50% = weiß
    if (winRate > 0.5) return 'text-emerald-500'; // ✅ Beste Grün-Farbe
    if (winRate < 0.5) return 'text-red-500'; // ✅ Beste Rot-Farbe
    return 'text-white';
  };

  // 🎨 NEU: Farbkodierung für Differenz-Werte (Strichdifferenz, Punktdifferenz, Bilanz etc.)
  const getDifferenceColor = (value: number): string => {
    // Für Differenzen: >0 = grün, <0 = rot, =0 = weiß
    if (value > 0) return 'text-emerald-500'; // ✅ Beste Grün-Farbe
    if (value < 0) return 'text-red-500'; // ✅ Beste Rot-Farbe
    return 'text-white';
  };

  if (!currentPlayer && !statsLoading) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen text-white">
          <AlertXCircle className="w-16 h-16 text-red-500 mb-4" />
          <h1 className="text-2xl font-bold">Profil nicht gefunden</h1>
          <p className="text-gray-400">Das angeforderte Spielerprofil konnte nicht geladen werden.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <>
      {/* 🚀 NEU: Public View Top-Bar nur bei Mobile */}
      {isPublicView && !layout.isDesktop && <PublicViewTopBar />}
      
      <MainLayout>
      <div className={`flex flex-col items-center justify-start bg-gray-900 text-white ${layout.containerPadding} relative pt-8 pb-20 lg:w-full lg:px-0`}>
        {/* Responsive Container Wrapper */}
        <div className={`w-full ${layout.containerMaxWidth} mx-auto lg:px-12 lg:py-8`}>
          {/* 🚀 AVATAR PRELOADER: Lädt alle Partner/Gegner-Avatare unsichtbar vor */}
          {profileAvatarPhotoURLs.length > 0 && (
            <AvatarPreloader photoURLs={profileAvatarPhotoURLs} />
          )}
          
          {/* NEU: SHARE BUTTON - OBEN RECHTS (nur für öffentliche Profile) */}
          {isPublicView && currentPlayer && (
            <button 
              onClick={handleShareClick}
              className="absolute top-6 right-4 z-10 p-2 text-gray-300 hover:text-white transition-all duration-200 rounded-full bg-gray-700/50 hover:scale-110 safe-area-top"
              style={{
                top: 'calc(1.5rem + env(safe-area-inset-top))',
                backgroundColor: 'rgba(55, 65, 81, 0.5)',
                borderColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                const themeRgb = profileTheme === 'green' ? '5, 150, 105' :
                                profileTheme === 'blue' ? '37, 99, 235' :
                                profileTheme === 'purple' ? '147, 51, 234' :
                                profileTheme === 'yellow' ? '202, 138, 4' :
                                profileTheme === 'pink' ? '236, 72, 153' :
                                profileTheme === 'teal' ? '13, 148, 136' :
                                profileTheme === 'orange' ? '249, 115, 22' :
                                profileTheme === 'cyan' ? '6, 182, 212' : '37, 99, 235';
                e.currentTarget.style.backgroundColor = `rgba(${themeRgb}, 0.2)`;
                e.currentTarget.style.borderColor = `rgba(${themeRgb}, 0.4)`;
                e.currentTarget.style.boxShadow = `0 0 15px rgba(${themeRgb}, 0.3)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.5)';
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
              }}
              aria-label="Profilstatistiken teilen"
            >
              <FiShare2 className="w-5 h-5" />
            </button>
          )}

          {/* Alert System (nur private Profile) */}
          {!isPublicView && user && (
            <div className="text-red-400 text-sm text-center p-4 bg-red-900/30 rounded-md mb-4" style={{display: 'none'}}>
              {/* Placeholder for authError - will be handled by parent */}
            </div>
          )}

          {/* Zurück-Button (nur für Public View) */}
          {isPublicView && (
            <Button 
              variant="ghost" 
              className="absolute top-6 left-4 text-white hover:bg-gray-700 p-3 safe-area-top"
              style={{ top: 'calc(1.5rem + env(safe-area-inset-top))' }}
              aria-label="Zurück"
              onClick={handleGoBack}
            >
              <ArrowLeft size={28} />
            </Button>
          )}

        {/* ✅ HEADER MIT LOGO UND BUTTONS (IDENTISCH ZU GROUPVIEW) */}
        <div className={`relative mb-4 ${isPublicView ? 'mt-16' : 'mt-6'} flex justify-center`}>
          <div 
            className={`relative ${layout.avatarSize} rounded-full overflow-hidden transition-all duration-300 flex items-center justify-center bg-gray-800 shadow-lg hover:shadow-xl hover:scale-105 border-4`}
            style={{
              borderColor: previewUrl ? 'rgba(147, 51, 234, 1)' : hexColor,
              boxShadow: previewUrl 
                ? '0 0 25px rgba(147, 51, 234, 0.3)'
                : `0 0 20px ${glowColor}, 0 4px 20px rgba(0,0,0,0.3)`
            }}
          >
            {statsLoading ? (
              <Skeleton className="w-full h-full rounded-full" />
            ) : previewUrl ? (
              <Image
                src={previewUrl}
                alt="Vorschau Profilbild"
                fill={true}
                className="object-cover"
              />
            ) : photoURL ? (
              <>
                {isImageLoading && (
                  <div className="absolute inset-0 bg-gray-800 animate-pulse rounded-full" />
                )}
                <Image
                  src={photoURL}
                  alt={`Profilbild ${displayName}`}
                  fill={true}
                  className={`object-cover transition-opacity duration-300 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
                  loading="lazy"
                  sizes="128px"
                  placeholder="blur"
                  blurDataURL={generateBlurPlaceholder()}
                  onLoad={() => setIsImageLoading(false)}
                  onError={(e) => {
                    setIsImageLoading(false);
                    (e.target as HTMLImageElement).src = "/placeholder-avatar.png";
                  }}
                />
              </>
            ) : (
              !isPublicView ? (
                <div className="flex flex-col items-center">
                  <CameraIcon size={40} className="text-gray-400 mb-1" />
                  <span className="text-xs text-gray-500 text-center px-2">
                    Profilbild hochladen
                  </span>
                </div>
              ) : (
                <span className="text-4xl font-bold text-gray-500">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )
            )}

            {!isPublicView && handleSelectClick && (
              <button
                onClick={handleSelectClick}
                className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-60 transition-all duration-200"
                disabled={isUploading}
                aria-label="Profilbild ändern"
              >
                <CameraIcon className="text-white opacity-0 hover:opacity-100 transition-opacity duration-200" size={32} />
              </button>
            )}
          </div>
        </div>

        <div className="w-full text-center mb-6 px-4">
          <h1 
            className={`${layout.titleSize} font-bold mb-1 text-white break-words transition-colors duration-300`}
          >
            {statsLoading ? <Skeleton className={`${layout.skeletonTitleHeight} w-48 mx-auto`} /> : displayName}
          </h1>
          
          {/* NEU: Jass-Elo Rating unterhalb des Namens */}
          {playerRating && (
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className={`${layout.bodySize} text-gray-300`}>Jass-Elo:</span>
              <span className={`${layout.headingSize} font-semibold text-white`}>
                {Math.round(playerRating.rating)}
                {playerDelta !== null && (
                  <span className={`ml-1 ${layout.bodySize} ${playerDelta > 0 ? 'text-emerald-500' : playerDelta < 0 ? 'text-red-500' : 'text-white'}`}>
                    ({playerDelta > 0 ? '+' : ''}{Math.round(playerDelta)})
                  </span>
                )}
              </span>
              <span className={layout.headingSize}>{playerRating.tierEmoji}</span>
            </div>
          )}
          
          <div className={`${layout.subtitleSize} text-gray-300 mx-auto max-w-xl break-words mt-3`}>
            <div className="text-center">{statsLoading ? <Skeleton className={`${layout.skeletonTextHeight} w-64 mx-auto`} /> : jassSpruch}</div>
          </div>
        </div>

        {/* Upload Buttons (wenn preview vorhanden) */}
        {previewUrl && (
          <div className="flex gap-2 justify-center mb-4">
            <Button
              onClick={() => {/* handleUpload - wird über props übergeben */}}
              size={layout.buttonSize}
              className="bg-green-600 hover:bg-green-700 flex items-center gap-1"
              disabled={!previewUrl || isUploading}
            >
              {isUploading ? (
                <>
                  <div className={`${layout.spinnerSize} rounded-full border-2 border-white border-t-transparent animate-spin mr-1`}></div>
                  Hochladen...
                </>
              ) : (
                <>
                  <Upload size={layout.buttonIconSize} /> Hochladen
                </>
              )}
            </Button>
            <Button
              onClick={() => {/* handleCancelSelection - wird über props übergeben */}}
              size={layout.buttonSize}
              className="bg-gray-600 hover:bg-gray-700 flex items-center gap-1"
              disabled={isUploading}
            >
              <AlertXCircle size={layout.buttonIconSize} /> Abbrechen
            </Button>
          </div>
        )}

        {/* Navigation Buttons (nur private Profile) */}
        {!isPublicView && (
          <div className="flex justify-center items-center gap-3 mb-6 px-8">
            <Button
              variant="ghost" 
              size={layout.buttonSize}
              onClick={() => router.push("/profile/groups")}
              className={`text-gray-300 hover:text-white transition-all duration-200 hover:scale-105`}
              style={{
                backgroundColor: 'transparent',
                borderColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `rgba(37, 99, 235, 0.1)`;
                e.currentTarget.style.borderColor = `rgba(37, 99, 235, 0.3)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }}
              title="Gruppen"
            >
              <Users size={layout.buttonIconSize} className="mr-1.5" /> Gruppen
            </Button>
            <Button
              variant="ghost" 
              size={layout.buttonSize}
              onClick={() => router.push("/tournaments")}
              className={`text-gray-300 hover:text-white transition-all duration-200 hover:scale-105`}
              style={{
                backgroundColor: 'transparent',
                borderColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `rgba(37, 99, 235, 0.1)`;
                e.currentTarget.style.borderColor = `rgba(37, 99, 235, 0.3)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }}
              title="Turniere"
            >
              <AwardIcon size={layout.buttonIconSize} className="mr-1.5" /> Turniere
            </Button>
            <Button
              variant="ghost" 
              size={layout.buttonSize}
              onClick={() => router.push("/profile/edit")}
              className={`text-gray-300 hover:text-white transition-all duration-200 hover:scale-105`}
              style={{
                backgroundColor: 'transparent',
                borderColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `rgba(37, 99, 235, 0.1)`;
                e.currentTarget.style.borderColor = `rgba(37, 99, 235, 0.3)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }}
              title="Einstellungen"
            >
              <UserCog size={layout.buttonIconSize} className="mr-1.5" /> Einstellungen
            </Button>
          </div>
        )}

        {/* File Input (nur private Profile) */}
        {!isPublicView && fileInputRef && handleFileChange && (
          <input
            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            multiple={false}
            disabled={isUploading}
            key={inputKey || Date.now()} // ✅ Force re-render für iOS Safari
          />
        )}

        {/* Crop Modal (nur private Profile) */}
        {!isPublicView && cropModalOpen && imageToCrop && handleCropComplete && (
          <ImageCropModal
            imageSrc={imageToCrop}
            onCropComplete={handleCropComplete}
            isOpen={cropModalOpen}
            onClose={() => handleCropComplete(null)}
            isLoading={cropModalLoading} // NEU: Loading-Zustand übergeben
          />
        )}

        {/* Main Tabs */}
        <Tabs
          value={activeMainTab}
          onValueChange={(value) => {
            const query: { [key: string]: string | string[] | undefined } = { ...router.query, mainTab: value };
            if (value !== 'stats') {
              delete query.statsSubTab;
            } else {
              query.statsSubTab = 'individual';
            }
            router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
          }}
          className="w-full"
        >
          <TabsList className={`grid w-full grid-cols-2 bg-gray-800 ${layout.mainTabContainerPadding} rounded-xl sticky ${isPublicView ? 'top-[env(safe-area-inset-top,0px)]' : 'top-0'} z-30 backdrop-blur-md shadow-lg`}>
            <TabsTrigger 
              value="stats" 
              className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.mainTabPadding} ${layout.mainTabTextSize} font-semibold min-h-[44px] flex items-center justify-center py-5 relative`}
              style={{
                backgroundColor: activeMainTab === 'stats' ? getTabActiveColor(profileTheme || 'blue') : 'transparent'
              }}
            > 
              <BarChart3 size={18} className="mr-2" /> Statistik 
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-[1px] bg-gray-600/30"></div>
            </TabsTrigger> 
            <TabsTrigger 
              value="archive" 
              className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.mainTabPadding} ${layout.mainTabTextSize} font-semibold min-h-[44px] flex items-center justify-center py-5`}
              style={{
                backgroundColor: activeMainTab === 'archive' ? getTabActiveColor(profileTheme || 'blue') : 'transparent'
              }}
            > 
              <Archive size={18} className="mr-2" /> Archiv 
            </TabsTrigger>
          </TabsList>

          {/* Statistics Tab Content - forceMount für instant Avatar-Loading */}
          <TabsContent 
            value="stats" 
            forceMount
            className={activeMainTab !== 'stats' ? 'hidden' : 'w-full mb-8'}
            style={{ display: activeMainTab !== 'stats' ? 'none' : 'block' }}
          >
            <Tabs
              value={activeStatsSubTab}
              onValueChange={(value) => {
                router.replace({
                  pathname: router.pathname,
                  query: { ...router.query, mainTab: 'stats', statsSubTab: value },
                }, undefined, { shallow: true });
              }}
              className="w-full"
            >
              {/* Sticky Container für Sub-Tabs - mit 3px Abstand */}
              <div className={`sticky ${isPublicView ? (layout.isDesktop ? "top-[calc(env(safe-area-inset-top,0px)+80px)]" : "top-[calc(env(safe-area-inset-top,0px)+64px)]") : (layout.isDesktop ? "top-[80px]" : "top-[64px]")} z-30 bg-gray-900`}>
                <TabsList className={`grid w-full grid-cols-3 bg-gray-800 ${layout.subTabContainerPadding} rounded-xl backdrop-blur-md shadow-lg`}>
                  <TabsTrigger
                    value="individual"
                    className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.98] active:shadow-inner transition-all duration-100 ${layout.subTabPadding} text-sm font-medium flex items-center justify-center py-3 relative`}
                    style={{
                      backgroundColor: activeStatsSubTab === 'individual' ? getTabActiveColor(profileTheme || 'blue') : 'transparent'
                    }}
                  >
                    <User size={16} className="mr-1.5" />
                    Individuell
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-[1px] bg-gray-600/30"></div>
                  </TabsTrigger>
                  <TabsTrigger
                    value="partner"
                    className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.98] active:shadow-inner transition-all duration-100 ${layout.subTabPadding} text-sm font-medium flex items-center justify-center py-3 relative`}
                    style={{
                      backgroundColor: activeStatsSubTab === 'partner' ? getTabActiveColor(profileTheme || 'blue') : 'transparent'
                    }}
                  >
                    <Users size={16} className="mr-1.5" />
                    Partner
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-[1px] bg-gray-600/30"></div>
                  </TabsTrigger>
                  <TabsTrigger
                    value="opponent"
                    className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.subTabPadding} text-sm font-medium flex items-center justify-center py-3`}
                    style={{
                      backgroundColor: activeStatsSubTab === 'opponent' ? getTabActiveColor(profileTheme || 'blue') : 'transparent'
                    }}
                  >
                    <Shield size={16} className="mr-1.5" />
                    Gegner
                  </TabsTrigger>
                </TabsList>
              </div>
              
              {/* Individual Stats Content */}
              <TabsContent 
                value="individual"
                forceMount
                className={activeStatsSubTab !== 'individual' ? 'hidden' : `w-full bg-gray-800/50 rounded-lg ${layout.cardPadding}`}
                style={{ display: activeStatsSubTab !== 'individual' ? 'none' : 'block' }}
              >
                {statsLoading ? (
                  <div className="flex justify-center items-center py-10">
                    <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                    <span className="ml-3 text-gray-300">Lade Statistiken...</span>
                  </div>
                ) : statsError ? (
                  <div className="text-red-400 text-sm text-center p-4 bg-red-900/30 rounded-md mb-4">
                    Fehler beim Laden der Statistiken: {statsError}
                  </div>
                ) : playerStats ? (
                  <div className={`${layout.sectionSpacing} ${layout.bodySize}`}> 
                    {/* Block 1: Power-Rating Zeitreihen Chart - AN OBERSTER STELLE */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>
                          Jass-Elo: <span className={playerRating && playerRating.rating >= 100 ? 'text-emerald-500' : 'text-red-500'}>{playerRating ? Math.round(playerRating.rating) : 'N/A'}</span> {playerRating?.tierEmoji}
                        </h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {chartLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                            <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Chart-Daten...</span>
                          </div>
                        ) : chartData && chartData.datasets.length > 0 ? (
                          <PowerRatingChart 
                            data={chartData}
                            title="Elo-Rating"
                            height={220} // ✅ NEU: Einheitliche Höhe für alle Charts
                            theme={profileTheme || 'blue'}
                            isDarkMode={true}
                            hideLegend={true} // ✅ Legende für ProfileView verstecken
                            showBaseline={true} // ✅ 100er-Linie für Elo-Chart
                            isEloChart={true} // ✅ Explizit als Elo-Chart markieren
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
                            animateImmediately={true} // 🚀 Oberster Chart animiert sofort
                            useThemeColors={true} // 🎨 NEU: Verwende Theme-Farben
                          />
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                            <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                            <p>Noch keine Rating-Daten verfügbar</p>
                            <p className={`${layout.smallTextSize} mt-1`}>Chart wird angezeigt, sobald Spieler Rating-Historie haben</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 🆕 STRICH-DIFFERENZ CHART */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>
                          Strichdifferenz: 
                          <span className={`ml-2 ${(() => {
                            // ✅ Verwende Chart-Daten statt playerStats
                            if (!stricheChartData || !stricheChartData.datasets || stricheChartData.datasets.length === 0) {
                              return 'text-white';
                            }
                            const lastValue = stricheChartData.datasets[0].data[stricheChartData.datasets[0].data.length - 1];
                            const currentValue = Math.trunc(lastValue || 0);
                            return currentValue > 0 ? 'text-emerald-500' : currentValue < 0 ? 'text-red-500' : 'text-white';
                          })()}`}>
                            {(() => {
                              // ✅ Verwende Chart-Daten statt playerStats
                              if (!stricheChartData || !stricheChartData.datasets || stricheChartData.datasets.length === 0) {
                                return '0';
                              }
                              const lastValue = stricheChartData.datasets[0].data[stricheChartData.datasets[0].data.length - 1];
                              const currentValue = Math.trunc(lastValue || 0);
                              return currentValue > 0 ? `+${currentValue}` : `${currentValue}`;
                            })()}
                          </span>
                        </h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {stricheChartLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                            <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Strich-Chart...</span>
                          </div>
                        ) : stricheChartData && stricheChartData.datasets.length > 0 ? (
                          <PowerRatingChart 
                            data={stricheChartData}
                            title="Strichdifferenz"
                            height={220} // ✅ NEU: Einheitliche Höhe für alle Charts
                            theme={profileTheme || 'blue'}
                            isDarkMode={true}
                            hideLegend={true}
                            showBaseline={true} // ✅ 0-Linie für Differenz-Charts
                            isEloChart={false} // ✅ Nicht-ELO-Chart
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            animateImmediately={false} // 🚀 Nur oberster Chart animiert sofort
                            useThemeColors={true} // 🎨 NEU: Verwende Theme-Farben
                          />
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                            <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                            <p>Noch keine Strich-Daten verfügbar</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 🆕 PUNKT-DIFFERENZ CHART */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>
                          Punktdifferenz: 
                          <span className={`ml-2 ${(() => {
                            // ✅ Verwende Chart-Daten statt playerStats
                            if (!pointsChartData || !pointsChartData.datasets || pointsChartData.datasets.length === 0) {
                              return 'text-white';
                            }
                            const lastValue = pointsChartData.datasets[0].data[pointsChartData.datasets[0].data.length - 1];
                            const currentValue = Math.trunc(lastValue || 0);
                            return currentValue > 0 ? 'text-emerald-500' : currentValue < 0 ? 'text-red-500' : 'text-white';
                          })()}`}>
                            {(() => {
                              // ✅ Verwende Chart-Daten statt playerStats
                              if (!pointsChartData || !pointsChartData.datasets || pointsChartData.datasets.length === 0) {
                                return '0';
                              }
                              const lastValue = pointsChartData.datasets[0].data[pointsChartData.datasets[0].data.length - 1];
                              const currentValue = Math.trunc(lastValue || 0);
                              return currentValue > 0 ? `+${currentValue}` : `${currentValue}`;
                            })()}
                          </span>
                        </h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {pointsChartLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                            <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Punkte-Chart...</span>
                          </div>
                        ) : pointsChartData && pointsChartData.datasets.length > 0 ? (
                          <PowerRatingChart 
                            data={pointsChartData}
                            title="Punktdifferenz"
                            height={220} // ✅ NEU: Einheitliche Höhe für alle Charts
                            theme={profileTheme || 'blue'}
                            isDarkMode={true}
                            hideLegend={true}
                            showBaseline={true} // ✅ 0-Linie für Differenz-Charts
                            isEloChart={false} // ✅ Nicht-ELO-Chart
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            animateImmediately={false} // 🚀 Nur oberster Chart animiert sofort
                            useThemeColors={true} // 🎨 NEU: Verwende Theme-Farben
                          />
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                            <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                            <p>Noch keine Punkte-Daten verfügbar</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 🆕 MATSCH-BILANZ CHART (nur wenn Bilanz ≠ 0) */}
                    {playerStats?.matschBilanz !== 0 && (
                      <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                        <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>
                            Matsch-Bilanz: 
                            <span className={`ml-2 ${playerStats?.matschBilanz && playerStats.matschBilanz > 0 ? 'text-emerald-500' : playerStats?.matschBilanz && playerStats.matschBilanz < 0 ? 'text-red-500' : 'text-white'}`}>
                              {playerStats?.matschBilanz && playerStats.matschBilanz > 0 ? '+' : ''}
                              {playerStats?.matschBilanz || 0}
                            </span>
                          </h3>
                        </div>
                        <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                          {matschChartLoading ? (
                            <div className="flex justify-center items-center py-10">
                              <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                              <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Matsch-Chart...</span>
                            </div>
                          ) : matschChartData && matschChartData.datasets.length > 0 ? (
                            <PowerRatingChart 
                              data={matschChartData}
                              title="Matsch-Bilanz"
                              height={220} // ✅ NEU: Einheitliche Höhe für alle Charts
                              theme={profileTheme || 'blue'}
                              isDarkMode={true}
                              hideLegend={true}
                              showBaseline={true} // ✅ 0-Linie für Bilanz-Charts
                              isEloChart={false} // ✅ Nicht-ELO-Chart
                              activeTab={activeMainTab}
                              activeSubTab={activeStatsSubTab}
                              useThemeColors={true} // 🎨 NEU: Verwende Theme-Farben
                            />
                          ) : (
                            <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                              <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                              <p>Noch keine Matsch-Daten verfügbar</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 🆕 SCHNEIDER-BILANZ CHART (nur wenn Bilanz ≠ 0) */}
                    {playerStats?.schneiderBilanz !== 0 && (
                      <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                        <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>
                            Schneider-Bilanz: 
                            <span className={`ml-2 ${playerStats?.schneiderBilanz && playerStats.schneiderBilanz > 0 ? 'text-emerald-500' : playerStats?.schneiderBilanz && playerStats.schneiderBilanz < 0 ? 'text-red-500' : 'text-white'}`}>
                              {playerStats?.schneiderBilanz && playerStats.schneiderBilanz > 0 ? '+' : ''}
                              {playerStats?.schneiderBilanz || 0}
                            </span>
                          </h3>
                        </div>
                        <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                          {schneiderChartLoading ? (
                            <div className="flex justify-center items-center py-10">
                              <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                              <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Schneider-Chart...</span>
                            </div>
                          ) : schneiderChartData && schneiderChartData.datasets.length > 0 ? (
                            <PowerRatingChart 
                              data={schneiderChartData}
                              title="Schneider-Bilanz"
                              height={220} // ✅ NEU: Einheitliche Höhe für alle Charts
                              theme={profileTheme || 'blue'}
                              isDarkMode={true}
                              hideLegend={true}
                              showBaseline={true} // ✅ 0-Linie für Bilanz-Charts
                              isEloChart={false} // ✅ Nicht-ELO-Chart
                              collapseIfSinglePoint={true} // ✅ Einklappen bei nur einem Datenpunkt
                              activeTab={activeMainTab}
                              activeSubTab={activeStatsSubTab}
                              useThemeColors={true} // 🎨 NEU: Verwende Theme-Farben
                            />
                          ) : (
                            <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                              <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                              <p>Noch keine Schneider-Daten verfügbar</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 🆕 KONTERMATSCH-BILANZ CHART (nur wenn Events vorhanden) */}
                    {(playerStats?.totalKontermatschEventsMade && playerStats.totalKontermatschEventsMade > 0) || (playerStats?.totalKontermatschEventsReceived && playerStats.totalKontermatschEventsReceived > 0) ? (
                      <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                        <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>
                            Kontermatsch-Bilanz: 
                            <span className={`ml-2 ${playerStats?.kontermatschBilanz && playerStats.kontermatschBilanz > 0 ? 'text-emerald-500' : playerStats?.kontermatschBilanz && playerStats.kontermatschBilanz < 0 ? 'text-red-500' : 'text-white'}`}>
                              {playerStats?.kontermatschBilanz && playerStats.kontermatschBilanz > 0 ? '+' : ''}
                              {playerStats?.kontermatschBilanz || 0}
                            </span>
                          </h3>
                        </div>
                        <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                          {kontermatschChartLoading ? (
                            <div className="flex justify-center items-center py-10">
                              <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                              <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Kontermatsch-Chart...</span>
                            </div>
                          ) : kontermatschChartData && kontermatschChartData.datasets.length > 0 ? (
                            <PowerRatingChart 
                              data={kontermatschChartData}
                              title="Kontermatsch-Bilanz"
                              height={220} // ✅ NEU: Einheitliche Höhe für alle Charts
                              theme={profileTheme || 'blue'}
                              isDarkMode={true}
                              hideLegend={true}
                              showBaseline={true} // ✅ 0-Linie für Bilanz-Charts
                              isEloChart={false} // ✅ Nicht-ELO-Chart
                              collapseIfSinglePoint={true} // ✅ Einklappen bei nur einem Datenpunkt
                              activeTab={activeMainTab}
                              activeSubTab={activeStatsSubTab}
                              useThemeColors={true} // 🎨 NEU: Verwende Theme-Farben
                            />
                          ) : (
                            <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                              <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                              <p>Noch keine Kontermatsch-Daten verfügbar</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {/* NEU: Siegquote Partie - PieChart */}
                    {sessionWinRateData && (() => {
                      const winRate = sessionWinRateData.percentages[0]; // Win percentage
                      const color = winRate > 50 ? 'text-emerald-500' : winRate < 50 ? 'text-red-500' : 'text-gray-400';
                      return (
                      <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                        <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>
                            Siegquote Partie: <span className={color}>{winRate.toFixed(1)}%</span>
                          </h3>
                        </div>
                        <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                          <PieChart 
                            data={{
                              labels: sessionWinRateData.labels,
                              values: sessionWinRateData.values,
                              backgroundColor: sessionWinRateData.backgroundColor,
                              percentages: sessionWinRateData.percentages
                            }}
                            height={layout.isDesktop ? 300 : 250}
                            isDarkMode={true}
                            centerText={`${sessionWinRateData.values[0] + sessionWinRateData.values[1] + sessionWinRateData.values[2]}`}
                            hideLegend={false}
                            legendPosition="right"
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            animateImmediately={false}
                          />
                        </div>
                      </div>
                      );
                    })()}

                    {/* NEU: Siegquote Spiel - PieChart */}
                    {gameWinRateData && (() => {
                      const winRate = gameWinRateData.percentages[0]; // Win percentage
                      const color = winRate > 50 ? 'text-emerald-500' : winRate < 50 ? 'text-red-500' : 'text-gray-400';
                      return (
                      <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                        <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>
                            Siegquote Spiel: <span className={color}>{winRate.toFixed(1)}%</span>
                          </h3>
                        </div>
                        <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                          <PieChart 
                            data={{
                              labels: gameWinRateData.labels,
                              values: gameWinRateData.values,
                              backgroundColor: gameWinRateData.backgroundColor,
                              percentages: gameWinRateData.percentages
                            }}
                            height={layout.isDesktop ? 300 : 250}
                            isDarkMode={true}
                            centerText={`${gameWinRateData.values[0] + gameWinRateData.values[1]}`}
                            hideLegend={false}
                            legendPosition="right"
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            animateImmediately={false}
                          />
                        </div>
                      </div>
                      );
                    })()}

                     {/* NEU: Trumpfansagen Liste */}
                     {trumpfStatistikArray.length > 0 && (
                       <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                         <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                           <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                           <h3 className={`${layout.headingSize} font-semibold text-white`}>Trumpfansagen Liste</h3>
                         </div>
                         <div ref={trumpfStatistikRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
                           {trumpfStatistikArray.map((item, index) => {
                             // NEU: Logik für dynamische Anzeige
                             const cardStyle = 'DE'; // Standard card style
                             const mappedColorKey = toTitleCase(item.farbe);
                             const displayName = CARD_SYMBOL_MAPPINGS[mappedColorKey as JassColor]?.[cardStyle] ?? mappedColorKey;
                             
                             return (
                               <div key={`trumpf-${item.farbe}`} className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
                                 <div className="flex items-center">
                                   <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                   <FarbePictogram 
                                     farbe={normalizeJassColor(item.farbe)} 
                                     mode="svg" 
                                     cardStyle={cardStyle} // cardStyle übergeben
                                     className={layout.isDesktop ? "h-12 w-12 mr-2" : "h-8 w-8 mr-2"}
                                   />
                                   <span className={`${layout.bodySize} text-gray-300 capitalize`}>{displayName}</span>
                                 </div>
                                 <span className="text-white font-medium mr-2">
                                   <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>({item.anzahl})</span>
                                   <span className={`${layout.valueSize} font-medium`}>{(item.anteil * 100).toFixed(1)}%</span>
                                 </span>
                               </div>
                             );
                           })}
                         </div>
                       </div>
                     )}

                     {/* NEU: Trumpfverteilung - Chart */}
                     {trumpfDistributionData && (
                       <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                         <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                           <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                           <h3 className={`${layout.headingSize} font-semibold text-white`}>📊 Trumpfansagen Total</h3>
                         </div>
                         <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                           <PieChart 
                             data={{
                               labels: trumpfDistributionData.labels,
                               values: trumpfDistributionData.values,
                               backgroundColor: trumpfDistributionData.backgroundColor,
                               pictogramPaths: trumpfDistributionData.pictogramPaths,
                               percentages: trumpfDistributionData.percentages
                             }}
                             height={layout.isDesktop ? 300 : 250}
                             isDarkMode={true}
                             centerText={playerStats?.totalTrumpfCount ? `${playerStats.totalTrumpfCount}` : undefined}
                             hideLegend={false}
                             legendPosition="right"
                             activeTab={activeMainTab}
                             activeSubTab={activeStatsSubTab}
                             animateImmediately={false}
                           />
                         </div>
                       </div>
                     )}

                    {/* 🆕 WEIS-DIFFERENZ CHART */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>
                          Weisdifferenz: 
                          <span className={`ml-2 ${
                            weisChartData && weisChartData.datasets[0]?.data?.length > 0 
                              ? (weisChartData.datasets[0].data[weisChartData.datasets[0].data.length - 1] > 0 
                                  ? 'text-emerald-500' 
                                  : weisChartData.datasets[0].data[weisChartData.datasets[0].data.length - 1] < 0 
                                    ? 'text-red-500' 
                                    : 'text-gray-400')
                              : 'text-gray-400'
                          }`}>
                            {weisChartData && weisChartData.datasets[0]?.data?.length > 0 
                              ? (weisChartData.datasets[0].data[weisChartData.datasets[0].data.length - 1] > 0 ? '+' : '') 
                              : ''}
                            {weisChartData && weisChartData.datasets[0]?.data?.length > 0 
                              ? weisChartData.datasets[0].data[weisChartData.datasets[0].data.length - 1] 
                              : 0}
                          </span>
                        </h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {weisChartLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                            <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Weis-Chart...</span>
                          </div>
                        ) : weisChartData && weisChartData.datasets.length > 0 ? (
                          <PowerRatingChart 
                            data={weisChartData}
                            title="Weisdifferenz"
                            height={220} // ✅ NEU: Einheitliche Höhe für alle Charts
                            theme={profileTheme || 'blue'}
                            isDarkMode={true}
                            hideLegend={true} // ✅ Einfach wie Punktdifferenz
                            showBaseline={true} // ✅ 0-Linie für Differenz-Charts
                            isEloChart={false} // ✅ Nicht-ELO-Chart
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            useThemeColors={true} // 🎨 NEU: Verwende Theme-Farben
                          />
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                            <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                            <p>Noch keine Weis-Daten verfügbar</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Block 2: Spielerübersicht */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Spielerübersicht</h3>
                      </div>
                      <div className={`${layout.cardPadding} space-y-2`}>
                        <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
                          <span className={`${layout.bodySize} font-medium text-gray-300`}>Anzahl Gruppen:</span>
                          <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.groupCount || 0}</span> 
                        </div>
                        <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
                          <span className={`${layout.bodySize} font-medium text-gray-300`}>Anzahl Partien:</span>
                          <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.totalSessions ?? 0}</span>
                        </div>
                        <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
                          <span className={`${layout.bodySize} font-medium text-gray-300`}>Anzahl Turniere:</span>
                          <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.totalTournaments ?? 0}</span>
                        </div>
                        <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
                          <span className={`${layout.bodySize} font-medium text-gray-300`}>Anzahl Spiele:</span>
                          <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.totalGames ?? 0}</span>
                        </div>
                        <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
                          <span className={`${layout.bodySize} font-medium text-gray-300`}>Gesamte Jass-Zeit:</span>
                          <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.totalPlayTime || '-'}</span>
                        </div>
                        <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
                          <span className={`${layout.bodySize} font-medium text-gray-300`}>Erster Jass:</span>
                          <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.firstJassDate || '-'}</span>
                        </div>
                        <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
                          <span className={`${layout.bodySize} font-medium text-gray-300`}>Letzter Jass:</span>
                          <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.lastJassDate || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Block 3: 🏆 Highlights */}
                    {false && (
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Highlights</h3>
                      </div>
                      <div className={`${layout.cardPadding} space-y-2`}>
                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.highestStricheDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.highestStricheDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Höchste Strichdifferenz (Partie):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.highestStricheDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.highestStricheDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.highestStricheDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.highestPointsDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.highestPointsDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Höchste Punktdifferenz (Partie):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.highestPointsDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.highestPointsDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.highestPointsDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.longestWinStreakSessions?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestWinStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Längste Siegesserie (Partien):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.longestWinStreakSessions?.value || '-'}</span>
                          </div>
                          {playerStats?.longestWinStreakSessions?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestWinStreakSessions.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.longestUndefeatedStreakSessions?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestUndefeatedStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Längste Serie ohne Niederlage (Partien):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.longestUndefeatedStreakSessions?.value || '-'}</span>
                          </div>
                          {playerStats?.longestUndefeatedStreakSessions?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestUndefeatedStreakSessions.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.longestWinStreakGames?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestWinStreakGames.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Längste Siegesserie (Spiele):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.longestWinStreakGames?.value || '-'}</span>
                          </div>
                          {playerStats?.longestWinStreakGames?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestWinStreakGames.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.highestMatschDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.highestMatschDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Höchste Matschdifferenz (Partie):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.highestMatschDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.highestMatschDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.highestMatschDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.mostWeisPointsSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.mostWeisPointsSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Meiste Weispunkte (Partie):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.mostWeisPointsSession?.value || '-'}</span>
                          </div>
                          {playerStats?.mostWeisPointsSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.mostWeisPointsSession.date})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Block 6: 👎 Lowlights */}
                    {false && (
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>👎 Lowlights</h3>
                      </div>
                      <div className={`${layout.cardPadding} space-y-2`}>
                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.lowestStricheDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.lowestStricheDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Niedrigste Strichdifferenz (Partie):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.lowestStricheDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.lowestStricheDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.lowestStricheDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.lowestPointsDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.lowestPointsDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Niedrigste Punktdifferenz (Partie):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.lowestPointsDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.lowestPointsDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.lowestPointsDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.longestLossStreakSessions?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestLossStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Längste Niederlagenserie (Partien):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.longestLossStreakSessions?.value || '-'}</span>
                          </div>
                          {playerStats?.longestLossStreakSessions?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestLossStreakSessions.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.longestWinlessStreakSessions?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestWinlessStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Längste Serie ohne Sieg (Partien):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.longestWinlessStreakSessions?.value || '-'}</span>
                          </div>
                          {playerStats?.longestWinlessStreakSessions?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestWinlessStreakSessions.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.longestLossStreakGames?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestLossStreakGames.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Längste Niederlagenserie (Spiele):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.longestLossStreakGames?.value || '-'}</span>
                          </div>
                          {playerStats?.longestLossStreakGames?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestLossStreakGames.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.lowestMatschDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.lowestMatschDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Niedrigste Matschdifferenz (Partie):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.lowestMatschDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.lowestMatschDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.lowestMatschDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className={`${layout.listItemPadding} rounded-md cursor-pointer bg-gray-700/30 hover:bg-gray-600/50 transition-colors`}
                          onClick={() => {
                            if (playerStats?.mostWeisPointsReceivedSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.mostWeisPointsReceivedSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`${layout.bodySize} font-medium text-gray-300`}>Meiste Weispunkte erhalten (Partie):</span>
                            <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{playerStats?.mostWeisPointsReceivedSession?.value || '-'}</span>
                          </div>
                          {playerStats?.mostWeisPointsReceivedSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.mostWeisPointsReceivedSession.date})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-400 text-center py-10">
                    <p>Keine Statistiken verfügbar</p>
                  </div>
                )}
              </TabsContent>

              {/* Partner Stats Content */}
              <TabsContent 
                value="partner"
                forceMount
                className={activeStatsSubTab !== 'partner' ? 'hidden' : 'w-full bg-gray-800/50 rounded-lg p-4 space-y-6'}
                style={{ display: activeStatsSubTab !== 'partner' ? 'none' : 'block' }}
              >
                {(playerStats as any)?.partnerAggregates && (playerStats as any).partnerAggregates.length > 0 ? (
                  <>
                    {/* Strichdifferenz Verlauf */}
                    {partnerStricheChartData && partnerStricheChartData.datasets.some((d: any) => d.data.length > 1) && 
                     (playerStats as any).partnerAggregates?.some((p: any) => (p.sessionsPlayedWith || 0) >= 2) && (
                      <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                        <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>📈 Strichdifferenz Verlauf</h3>
                        </div>
                        <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                          <PowerRatingChart 
                            data={partnerStricheChartData}
                            title="Strichdifferenz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={profileTheme || 'blue'}
                            isDarkMode={true}
                            isEloChart={false}
                            hideLegend={false}
                            showBaseline={true}
                            useThemeColors={false}
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            animateImmediately={false}
                          />
                        </div>
                      </div>
                    )}

                    {/* Strichdifferenz Rangliste */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Strichdifferenz Rangliste</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).partnerAggregates
                          .filter((partner: any) => partner.gamesPlayedWith >= 1)
                          .sort((a: any, b: any) => b.totalStricheDifferenceWith - a.totalStricheDifferenceWith)
                          .slice(0, 10)
                          .map((partner: any, index: number) => {
                            const playerData = members?.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                            return (
                            <StatLink 
                                key={`partner-striche-${partner.partnerId}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{partner.partnerDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      {partner.gamesPlayedWith > 0 && (
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({partner.gamesPlayedWith})
                                        </span>
                                      )}
                                      <span className={`${getDifferenceColor(partner.totalStricheDifferenceWith)}`}>
                                        {partner.totalStricheDifferenceWith > 0 ? '+' : ''}{partner.totalStricheDifferenceWith}
                                      </span>
                                    </span>
                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                  </div>
                </div>

                    {/* Punktedifferenz Verlauf */}
                    {partnerPointsChartData && partnerPointsChartData.datasets.some((d: any) => d.data.length > 1) && 
                     (playerStats as any).partnerAggregates?.some((p: any) => (p.sessionsPlayedWith || 0) >= 2) && (
                      <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                        <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>📈 Punktedifferenz Verlauf</h3>
                        </div>
                        <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                          <PowerRatingChart 
                            data={partnerPointsChartData}
                            title="Punktedifferenz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={profileTheme || 'blue'}
                            isDarkMode={true}
                            isEloChart={false}
                            hideLegend={false}
                            showBaseline={true}
                            useThemeColors={false}
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            animateImmediately={false}
                          />
                        </div>
                      </div>
                    )}

                    {/* Punktdifferenz Rangliste */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Punktdifferenz Rangliste</h3>
                  </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).partnerAggregates
                          .filter((partner: any) => partner.gamesPlayedWith >= 1)
                          .sort((a: any, b: any) => b.totalPointsDifferenceWith - a.totalPointsDifferenceWith)
                          .slice(0, 10)
                          .map((partner: any, index: number) => {
                            const playerData = members?.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                            return (
                            <StatLink 
                                key={`partner-points-${partner.partnerId}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{partner.partnerDisplayName}</span>
                          </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      {partner.gamesPlayedWith > 0 && (
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({partner.gamesPlayedWith})
                            </span>
                                      )}
                                      <span className={`${getDifferenceColor(partner.totalPointsDifferenceWith)}`}>
                                        {partner.totalPointsDifferenceWith > 0 ? '+' : ''}{partner.totalPointsDifferenceWith}
                                      </span>
                            </span>
                      </div>
                                </div>
                              </StatLink>
                            );
                          })}
                  </div>
                </div>

                    {/* Siegquote Partien - CHART */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>📊 Siegquote Partien</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {(() => {
                          if ((playerStats as any)?.partnerAggregates && (playerStats as any).partnerAggregates.length > 0) {
                            const partnersWithSessions = (playerStats as any).partnerAggregates.filter((partner: any) => partner.sessionsPlayedWith >= 1);
                            const chartData = partnersWithSessions.map((partner: any) => ({
                              label: partner.partnerDisplayName,
                              winRate: partner.sessionWinRate || 0,
                              wins: partner.sessionsWonWith || 0,
                              losses: partner.sessionsLostWith || 0,
                              draws: partner.sessionsDrawWith || 0
                            }));

                            if (chartData.length > 0) {
                              return (
                                <WinRateChart 
                                  data={chartData}
                                  title="Siegquote Partien"
                                  height={layout.isDesktop ? 350 : 250}
                                  theme={profileTheme || 'blue'}
                                  isDarkMode={true}
                                  activeTab={activeMainTab}
                                  activeSubTab={activeStatsSubTab}
                                  animateImmediately={false}
                                  hideLegend={true}
                                  minSessions={1}
                                  disableIntelligentFiltering={true}
                                />
                              );
                            }
                          }
                          return (
                            <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                              <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                              <p>Noch keine Siegquote-Daten verfügbar</p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Siegquote Partien - Rangliste */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Siegquote Partien Rangliste</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).partnerAggregates
                          .filter((partner: any) => partner.sessionsPlayedWith >= 1)
                          .sort((a: any, b: any) => (b.sessionWinRate || 0) - (a.sessionWinRate || 0))
                          .slice(0, 10)
                          .map((partner: any, index: number) => {
                            const playerData = members?.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                            return (
                            <StatLink
                                key={`partner-session-${partner.partnerId}`}
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`}
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{partner.partnerDisplayName}</span>
                        </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      {partner.sessionsPlayedWith > 0 && (
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({partner.sessionsWonWith}/{partner.sessionsPlayedWith})
                          </span>
                                      )}
                                      <span className={`${getWinRateColor(partner.sessionWinRate || 0)} ${layout.valueSize} font-medium`}>
                                        {getWinRateDisplay(
                                          partner.sessionWinRateInfo,
                                          partner.sessionsWonWith,
                                          partner.sessionsPlayedWith
                                        )}
                                      </span>
                          </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                        {(playerStats as any).partnerAggregates.filter((p: any) => p.sessionsPlayedWith >= 1).length === 0 && (
                          <div className="text-gray-400 text-center py-2">Keine Partner mit ausreichend Partien</div>
                          )}
                        </div>
                    </div>

                    {/* Siegquote Spiele - CHART */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>📊 Siegquote Spiele</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {(() => {
                          if ((playerStats as any)?.partnerAggregates && (playerStats as any).partnerAggregates.length > 0) {
                            const partnersWithGames = (playerStats as any).partnerAggregates.filter((partner: any) => partner.gamesPlayedWith >= 1);
                            const chartData = partnersWithGames.map((partner: any) => ({
                              label: partner.partnerDisplayName,
                              winRate: partner.gameWinRate || 0,
                              wins: partner.gamesWonWith || 0,
                              losses: partner.gamesLostWith || 0
                            }));

                            if (chartData.length > 0) {
                              return (
                                <WinRateChart 
                                  data={chartData}
                                  title="Siegquote Spiele"
                                  height={layout.isDesktop ? 350 : 250}
                                  theme={profileTheme || 'blue'}
                                  isDarkMode={true}
                                  activeTab={activeMainTab}
                                  activeSubTab={activeStatsSubTab}
                                  animateImmediately={false}
                                  hideLegend={true}
                                  minSessions={1}
                                  isGameWinRate={true}
                                  disableIntelligentFiltering={true}
                                />
                              );
                            }
                          }
                          return (
                            <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                              <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                              <p>Noch keine Siegquote-Daten verfügbar</p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Siegquote Spiele - Rangliste */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Siegquote Spiele Rangliste</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                                                        {(playerStats as any).partnerAggregates
                          .filter((partner: any) => partner.gamesPlayedWith >= 1)
                          .sort((a: any, b: any) => (b.gameWinRate || 0) - (a.gameWinRate || 0))
                          .slice(0, 10)
                          .map((partner: any, index: number) => {
                            const playerData = members?.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                            return (
                            <StatLink 
                                key={`partner-game-${partner.partnerId}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{partner.partnerDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      {partner.gamesPlayedWith > 0 && (
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({partner.gamesWonWith}/{partner.gamesPlayedWith})
                                        </span>
                                      )}
                                      <span className={`${getWinRateColor(partner.gameWinRate || 0)} ${layout.valueSize} font-medium`}>
                                        {getWinRateDisplay(
                                          partner.gameWinRateInfo,
                                          partner.gamesWonWith,
                                          partner.gamesPlayedWith
                                        )}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                        </StatLink>
                            );
                          })}
                        {(playerStats as any).partnerAggregates.filter((p: any) => p.gamesPlayedWith >= 1).length === 0 && (
                          <div className="text-gray-400 text-center py-2">Keine Partner mit ausreichend Spielen</div>
                          )}
                      </div>
                    </div>

                    {/* Matsch-Bilanz Verlauf */}
                    {partnerMatschChartData && partnerMatschChartData.datasets.some((d: any) => d.data.length > 1) && 
                     (playerStats as any).partnerAggregates?.some((p: any) => (p.sessionsPlayedWith || 0) >= 2) && (
                      <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                        <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>📈 Matsch-Bilanz Verlauf</h3>
                        </div>
                        <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                          <PowerRatingChart 
                            data={partnerMatschChartData}
                            title="Matsch Bilanz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={profileTheme || 'blue'}
                            isDarkMode={true}
                            isEloChart={false}
                            hideLegend={false}
                            showBaseline={true}
                            useThemeColors={false}
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            animateImmediately={false}
                          />
                        </div>
                      </div>
                    )}

                    {/* Matsch-Bilanz Rangliste */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Matsch-Bilanz Rangliste</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).partnerAggregates
                          .filter((partner: any) => partner.gamesPlayedWith >= 1 && ((partner.matschEventsMadeWith || 0) > 0 || (partner.matschEventsReceivedWith || 0) > 0))
                          .sort((a: any, b: any) => (b.matschBilanz || 0) - (a.matschBilanz || 0))
                          .slice(0, 10)
                          .map((partner: any, index: number) => {
                            const playerData = members?.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                            return (
                            <StatLink 
                                key={`partner-matsch-${partner.partnerId}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{partner.partnerDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                        ({partner.matschEventsMadeWith || 0}/{(partner.matschEventsReceivedWith || 0)})
                                      </span>
                                      <span className={`${getDifferenceColor(partner.matschBilanz || 0)} ${layout.valueSize} font-medium`}>
                                        {(partner.matschBilanz || 0) > 0 ? '+' : ''}
                                        {partner.matschBilanz || 0}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                            </StatLink>
                            );
                          })}
                        {(playerStats as any).partnerAggregates.filter((p: any) => p.gamesPlayedWith >= 1 && ((p.matschEventsMadeWith || 0) > 0 || (p.matschEventsReceivedWith || 0) > 0)).length === 0 && (
                          <div className="text-gray-400 text-center py-2">Keine Partner mit Matsch-Ereignissen</div>
                        )}
                  </div>
                  </div>

                    {/* Schneider-Bilanz - nur anzeigen wenn Ereignisse vorhanden */}
                    {(playerStats as any).partnerAggregates?.filter((p: any) => p.gamesPlayedWith >= 1 && ((p.schneiderEventsMadeWith || 0) > 0 || (p.schneiderEventsReceivedWith || 0) > 0)).length > 0 && (
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Schneider-Bilanz</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).partnerAggregates
                          .filter((partner: any) => partner.gamesPlayedWith >= 1 && ((partner.schneiderEventsMadeWith || 0) > 0 || (partner.schneiderEventsReceivedWith || 0) > 0))
                          .sort((a: any, b: any) => (b.schneiderBilanz || 0) - (a.schneiderBilanz || 0))
                          .slice(0, 10)
                          .map((partner: any, index: number) => {
                            const playerData = members?.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                            return (
                              <StatLink 
                                key={`partner-schneider-${partner.partnerId}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                              <div className="flex items-center">
                                <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{partner.partnerDisplayName}</span>
                              </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                        ({partner.schneiderEventsMadeWith || 0}/{(partner.schneiderEventsReceivedWith || 0)})
                                      </span>
                                      <span className={`${getDifferenceColor(partner.schneiderBilanz || 0)} ${layout.valueSize} font-medium`}>
                                        {(partner.schneiderBilanz || 0) > 0 ? '+' : ''}
                                        {partner.schneiderBilanz || 0}
                                      </span>
                                    </span>
                            </div>
                                </div>
                              </StatLink>
                            );
                          })}
                        {(playerStats as any).partnerAggregates.filter((p: any) => p.gamesPlayedWith >= 1 && ((p.schneiderEventsMadeWith || 0) > 0 || (p.schneiderEventsReceivedWith || 0) > 0)).length === 0 && (
                          <div className="text-gray-400 text-center py-2">Keine Partner mit Schneider-Ereignissen</div>
                        )}
                      </div>
                    </div>
                    )}

                    {/* Kontermatsch-Bilanz - nur anzeigen wenn Ereignisse vorhanden */}
                    {(playerStats as any).partnerAggregates?.filter((p: any) => p.gamesPlayedWith >= 1 && ((p.kontermatschEventsMadeWith || 0) > 0 || (p.kontermatschEventsReceivedWith || 0) > 0)).length > 0 && (
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Kontermatsch-Bilanz</h3>
                  </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).partnerAggregates
                          .filter((partner: any) => partner.gamesPlayedWith >= 1 && ((partner.kontermatschEventsMadeWith || 0) > 0 || (partner.kontermatschEventsReceivedWith || 0) > 0))
                          .sort((a: any, b: any) => (b.kontermatschBilanz || 0) - (a.kontermatschBilanz || 0))
                          .slice(0, 10)
                          .map((partner: any, index: number) => {
                            const playerData = members?.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                            return (
                              <StatLink 
                                key={`partner-kontermatsch-${partner.partnerId}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{partner.partnerDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                        ({partner.kontermatschEventsMadeWith || 0}/{(partner.kontermatschEventsReceivedWith || 0)})
                                      </span>
                                      <span className={`${getDifferenceColor(partner.kontermatschBilanz || 0)} ${layout.valueSize} font-medium`}>
                                        {(partner.kontermatschBilanz || 0) > 0 ? '+' : ''}
                                        {partner.kontermatschBilanz || 0}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                        {(playerStats as any).partnerAggregates.filter((p: any) => p.gamesPlayedWith >= 1 && ((p.kontermatschEventsMadeWith || 0) > 0 || (p.kontermatschEventsReceivedWith || 0) > 0)).length === 0 && (
                          <div className="text-gray-400 text-center py-2">Keine Partner mit Kontermatsch-Ereignissen</div>
                        )}
                      </div>
                    </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-gray-400 py-10">Keine Partnerstatistiken verfügbar.</div>
                )}
              </TabsContent>

              {/* Opponent Stats Content */}
              <TabsContent 
                value="opponent"
                forceMount
                className={activeStatsSubTab !== 'opponent' ? 'hidden' : 'w-full bg-gray-800/50 rounded-lg p-4 space-y-6'}
                style={{ display: activeStatsSubTab !== 'opponent' ? 'none' : 'block' }}
              >
                {(playerStats as any)?.opponentAggregates && (playerStats as any).opponentAggregates.length > 0 ? (
                  <>
                    {/* Strichdifferenz Verlauf */}
                    {opponentStricheChartData && opponentStricheChartData.datasets.some((d: any) => d.data.length > 1) && 
                     (playerStats as any).opponentAggregates?.some((o: any) => (o.sessionsPlayedAgainst || 0) >= 2) && (
                      <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                        <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>📊 Strichdifferenz Verlauf</h3>
                        </div>
                        <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                          <PowerRatingChart 
                            data={opponentStricheChartData}
                            title="Strichdifferenz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={profileTheme || 'blue'}
                            isDarkMode={true}
                            isEloChart={false}
                            hideLegend={false}
                            showBaseline={true}
                            useThemeColors={false}
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            animateImmediately={false}
                          />
                        </div>
                      </div>
                    )}

                    {/* Strichdifferenz Rangliste */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Strichdifferenz Rangliste</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).opponentAggregates
                          .filter((opponent: any) => opponent.gamesPlayedAgainst >= 1)
                          .sort((a: any, b: any) => b.totalStricheDifferenceAgainst - a.totalStricheDifferenceAgainst)
                          .slice(0, 10)
                          .map((opponent: any, index: number) => {
                            const playerData = members?.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                            return (
                              <StatLink 
                                key={`opponent-striche-${opponent.opponentId}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      {opponent.gamesPlayedAgainst > 0 && (
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({opponent.gamesPlayedAgainst})
                                        </span>
                                      )}
                                      <span className={`${getDifferenceColor(opponent.totalStricheDifferenceAgainst)}`}>
                                        {opponent.totalStricheDifferenceAgainst > 0 ? '+' : ''}{opponent.totalStricheDifferenceAgainst}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                      </div>
                    </div>

                    {/* Punktedifferenz Verlauf */}
                    {opponentPointsChartData && opponentPointsChartData.datasets.some((d: any) => d.data.length > 1) && 
                     (playerStats as any).opponentAggregates?.some((o: any) => (o.sessionsPlayedAgainst || 0) >= 2) && (
                      <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                        <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>📈 Punktedifferenz Verlauf</h3>
                        </div>
                        <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                          <PowerRatingChart 
                            data={opponentPointsChartData}
                            title="Punktedifferenz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={profileTheme || 'blue'}
                            isDarkMode={true}
                            isEloChart={false}
                            hideLegend={false}
                            showBaseline={true}
                            useThemeColors={false}
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            animateImmediately={false}
                          />
                        </div>
                      </div>
                    )}

                    {/* Punktdifferenz Rangliste */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Punktdifferenz Rangliste</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).opponentAggregates
                          .filter((opponent: any) => opponent.gamesPlayedAgainst >= 1)
                          .sort((a: any, b: any) => b.totalPointsDifferenceAgainst - a.totalPointsDifferenceAgainst)
                          .slice(0, 10)
                          .map((opponent: any, index: number) => {
                            const playerData = members?.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                            return (
                              <StatLink 
                                key={`opponent-points-${opponent.opponentId}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      {opponent.gamesPlayedAgainst > 0 && (
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({opponent.gamesPlayedAgainst})
                                        </span>
                                      )}
                                      <span className={`${getDifferenceColor(opponent.totalPointsDifferenceAgainst)}`}>
                                        {opponent.totalPointsDifferenceAgainst > 0 ? '+' : ''}{opponent.totalPointsDifferenceAgainst}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                      </div>
                    </div>

                    {/* Siegquote Partien - CHART */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>📊 Siegquote Partien</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {(() => {
                          if ((playerStats as any)?.opponentAggregates && (playerStats as any).opponentAggregates.length > 0) {
                            const opponentsWithSessions = (playerStats as any).opponentAggregates.filter((opponent: any) => opponent.sessionsPlayedAgainst >= 1);
                            const chartData = opponentsWithSessions.map((opponent: any) => ({
                              label: opponent.opponentDisplayName,
                              winRate: opponent.sessionWinRate || 0,
                              wins: opponent.sessionsWonAgainst || 0,
                              losses: opponent.sessionsLostAgainst || 0,
                              draws: opponent.sessionsDrawAgainst || 0
                            }));

                            if (chartData.length > 0) {
                              return (
                                <WinRateChart 
                                  data={chartData}
                                  title="Siegquote Partien"
                                  height={layout.isDesktop ? 350 : 250}
                                  theme={profileTheme || 'blue'}
                                  isDarkMode={true}
                                  activeTab={activeMainTab}
                                  activeSubTab={activeStatsSubTab}
                                  animateImmediately={false}
                                  hideLegend={true}
                                  minSessions={1}
                                  disableIntelligentFiltering={true}
                                />
                              );
                            }
                          }
                          return (
                            <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                              <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                              <p>Noch keine Siegquote-Daten verfügbar</p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Siegquote Partien - Rangliste */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Siegquote Partien Rangliste</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).opponentAggregates
                          .filter((opponent: any) => opponent.sessionsPlayedAgainst >= 1)
                          .sort((a: any, b: any) => (b.sessionWinRate || 0) - (a.sessionWinRate || 0))
                          .slice(0, 10)
                          .map((opponent: any, index: number) => {
                            const playerData = members?.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                            return (
                              <StatLink 
                                key={`opponent-session-${opponent.opponentId}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      {opponent.sessionsPlayedAgainst > 0 && (
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({opponent.sessionsWonAgainst}/{opponent.sessionsPlayedAgainst})
                                        </span>
                                      )}
                                      <span className={`${getWinRateColor(opponent.sessionWinRate || 0)} ${layout.valueSize} font-medium`}>
                                        {getWinRateDisplay(
                                          opponent.sessionWinRateInfo,
                                          opponent.sessionsWonAgainst,
                                          opponent.sessionsPlayedAgainst
                                        )}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                        {(playerStats as any).opponentAggregates.filter((o: any) => o.sessionsPlayedAgainst >= 1).length === 0 && (
                          <div className="text-gray-400 text-center py-2">Keine Gegner mit ausreichend Partien</div>
                        )}
                      </div>
                    </div>

                    {/* Siegquote Spiele - CHART */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>📊 Siegquote Spiele</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {(() => {
                          if ((playerStats as any)?.opponentAggregates && (playerStats as any).opponentAggregates.length > 0) {
                            const opponentsWithGames = (playerStats as any).opponentAggregates.filter((opponent: any) => opponent.gamesPlayedAgainst >= 1);
                            const chartData = opponentsWithGames.map((opponent: any) => ({
                              label: opponent.opponentDisplayName,
                              winRate: opponent.gameWinRate || 0,
                              wins: opponent.gamesWonAgainst || 0,
                              losses: opponent.gamesLostAgainst || 0
                            }));

                            if (chartData.length > 0) {
                              return (
                                <WinRateChart 
                                  data={chartData}
                                  title="Siegquote Spiele"
                                  height={layout.isDesktop ? 350 : 250}
                                  theme={profileTheme || 'blue'}
                                  isDarkMode={true}
                                  activeTab={activeMainTab}
                                  activeSubTab={activeStatsSubTab}
                                  animateImmediately={false}
                                  hideLegend={true}
                                  minSessions={1}
                                  isGameWinRate={true}
                                  disableIntelligentFiltering={true}
                                />
                              );
                            }
                          }
                          return (
                            <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                              <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                              <p>Noch keine Siegquote-Daten verfügbar</p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Siegquote Spiele - Rangliste */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Siegquote Spiele Rangliste</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).opponentAggregates
                          .filter((opponent: any) => opponent.gamesPlayedAgainst >= 1)
                          .sort((a: any, b: any) => (b.gameWinRate || 0) - (a.gameWinRate || 0))
                          .slice(0, 10)
                          .map((opponent: any, index: number) => {
                            const playerData = members?.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                            return (
                              <StatLink 
                                key={`opponent-game-${opponent.opponentId}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      {opponent.gamesPlayedAgainst > 0 && (
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({opponent.gamesWonAgainst}/{opponent.gamesPlayedAgainst})
                                        </span>
                                      )}
                                      <span className={`${getWinRateColor(opponent.gameWinRate || 0)} ${layout.valueSize} font-medium`}>
                                        {getWinRateDisplay(
                                          opponent.gameWinRateInfo,
                                          opponent.gamesWonAgainst,
                                          opponent.gamesPlayedAgainst
                                        )}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                        {(playerStats as any).opponentAggregates.filter((o: any) => o.gamesPlayedAgainst >= 1).length === 0 && (
                          <div className="text-gray-400 text-center py-2">Keine Gegner mit ausreichend Spielen</div>
                        )}
                      </div>
                    </div>

                    {/* Matsch-Bilanz Verlauf */}
                    {opponentMatschChartData && opponentMatschChartData.datasets.some((d: any) => d.data.length > 1) && 
                     (playerStats as any).opponentAggregates?.some((o: any) => (o.sessionsPlayedAgainst || 0) >= 2) && (
                      <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                        <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>📈 Matsch-Bilanz Verlauf</h3>
                        </div>
                        <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                          <PowerRatingChart 
                            data={opponentMatschChartData}
                            title="Matsch Bilanz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={profileTheme || 'blue'}
                            isDarkMode={true}
                            isEloChart={false}
                            hideLegend={false}
                            showBaseline={true}
                            useThemeColors={false}
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            animateImmediately={false}
                          />
                        </div>
                      </div>
                    )}

                    {/* Matsch-Bilanz Rangliste */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Matsch-Bilanz Rangliste</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).opponentAggregates
                          .filter((opponent: any) => opponent.gamesPlayedAgainst >= 1 && ((opponent.matschEventsMadeAgainst || 0) > 0 || (opponent.matschEventsReceivedAgainst || 0) > 0))
                          .sort((a: any, b: any) => (b.matschBilanz || 0) - (a.matschBilanz || 0))
                          .slice(0, 10)
                          .map((opponent: any, index: number) => {
                            const playerData = members?.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                            return (
                              <StatLink 
                                key={`opponent-matsch-${opponent.opponentId}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                        ({opponent.matschEventsMadeAgainst || 0}/{(opponent.matschEventsReceivedAgainst || 0)})
                                      </span>
                                      <span className={`${getDifferenceColor(opponent.matschBilanz || 0)} ${layout.valueSize} font-medium`}>
                                        {(opponent.matschBilanz || 0) > 0 ? '+' : ''}
                                        {opponent.matschBilanz || 0}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                        {(playerStats as any).opponentAggregates.filter((o: any) => o.gamesPlayedAgainst >= 1 && ((o.matschEventsMadeAgainst || 0) > 0 || (o.matschEventsReceivedAgainst || 0) > 0)).length === 0 && (
                          <div className="text-gray-400 text-center py-2">Keine Gegner mit Matsch-Ereignissen</div>
                        )}
                      </div>
                    </div>

                    {/* Schneider-Bilanz - nur anzeigen wenn Ereignisse vorhanden */}
                    {(playerStats as any).opponentAggregates?.filter((o: any) => o.gamesPlayedAgainst >= 1 && ((o.schneiderEventsMadeAgainst || 0) > 0 || (o.schneiderEventsReceivedAgainst || 0) > 0)).length > 0 && (
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Schneider-Bilanz</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).opponentAggregates
                          .filter((opponent: any) => opponent.gamesPlayedAgainst >= 1 && ((opponent.schneiderEventsMadeAgainst || 0) > 0 || (opponent.schneiderEventsReceivedAgainst || 0) > 0))
                          .sort((a: any, b: any) => (b.schneiderBilanz || 0) - (a.schneiderBilanz || 0))
                          .slice(0, 10)
                          .map((opponent: any, index: number) => {
                            const playerData = members?.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                            return (
                              <StatLink 
                                key={`opponent-schneider-${opponent.opponentId}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                        ({opponent.schneiderEventsMadeAgainst || 0}/{(opponent.schneiderEventsReceivedAgainst || 0)})
                                      </span>
                                      <span className={`${getDifferenceColor(opponent.schneiderBilanz || 0)} ${layout.valueSize} font-medium`}>
                                        {(opponent.schneiderBilanz || 0) > 0 ? '+' : ''}
                                        {opponent.schneiderBilanz || 0}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                        {(playerStats as any).opponentAggregates.filter((o: any) => o.gamesPlayedAgainst >= 1 && ((o.schneiderEventsMadeAgainst || 0) > 0 || (o.schneiderEventsReceivedAgainst || 0) > 0)).length === 0 && (
                          <div className="text-gray-400 text-center py-2">Keine Gegner mit Schneider-Ereignissen</div>
                        )}
                      </div>
                    </div>
                    )}

                    {/* Kontermatsch-Bilanz - nur anzeigen wenn Ereignisse vorhanden */}
                    {(playerStats as any).opponentAggregates?.filter((o: any) => o.gamesPlayedAgainst >= 1 && ((o.kontermatschEventsMadeAgainst || 0) > 0 || (o.kontermatschEventsReceivedAgainst || 0) > 0)).length > 0 && (
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center ${layout.borderWidth} border-b border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} rounded-r-md mr-3`} style={{ backgroundColor: accentColor }}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Kontermatsch-Bilanz</h3>
                      </div>
                      <div className="p-4 space-y-2  pr-2">
                        {(playerStats as any).opponentAggregates
                          .filter((opponent: any) => opponent.gamesPlayedAgainst >= 1 && ((opponent.kontermatschEventsMadeAgainst || 0) > 0 || (opponent.kontermatschEventsReceivedAgainst || 0) > 0))
                          .sort((a: any, b: any) => (b.kontermatschBilanz || 0) - (a.kontermatschBilanz || 0))
                          .slice(0, 10)
                          .map((opponent: any, index: number) => {
                            const playerData = members?.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                            return (
                              <StatLink 
                                key={`opponent-kontermatsch-${opponent.opponentId}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size={layout.profileImageListSize}
                                      className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className={`text-gray-300 ${layout.bodySize}`}>{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                      <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                        ({opponent.kontermatschEventsMadeAgainst || 0}/{(opponent.kontermatschEventsReceivedAgainst || 0)})
                                      </span>
                                      <span className={`${getDifferenceColor(opponent.kontermatschBilanz || 0)} ${layout.valueSize} font-medium`}>
                                        {(opponent.kontermatschBilanz || 0) > 0 ? '+' : ''}
                                        {opponent.kontermatschBilanz || 0}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                        {(playerStats as any).opponentAggregates.filter((o: any) => o.gamesPlayedAgainst >= 1 && ((o.kontermatschEventsMadeAgainst || 0) > 0 || (o.kontermatschEventsReceivedAgainst || 0) > 0)).length === 0 && (
                          <div className="text-gray-400 text-center py-2">Keine Gegner mit Kontermatsch-Ereignissen</div>
                        )}
                      </div>
                    </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-gray-400 py-10">Keine Gegnerstatistiken verfügbar.</div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Archive Tab Content */}
          <TabsContent value="archive" className={`w-full bg-gray-800/50 rounded-lg ${layout.cardPadding} mb-8`}>
            {(sessionsLoading || tournamentsLoading) && (
              <div className="flex justify-center items-center py-10">
                <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                <span className={`ml-3 text-gray-300 ${layout.bodySize}`}>Lade Archiv...</span>
              </div>
            )} 
            {(sessionsError || tournamentsError) && !(sessionsLoading || tournamentsLoading) && (
              <div className={`text-red-400 ${layout.smallTextSize} text-center p-4 bg-red-900/30 rounded-md`}> 
                {sessionsError && `Fehler Partien: ${sessionsError}`}
                {sessionsError && tournamentsError && <br/>}
                {tournamentsError && `Fehler Turniere: ${tournamentsError}`}
              </div> 
            )} 
            {!(sessionsLoading || tournamentsLoading) && !(sessionsError || tournamentsError) && (combinedArchiveItems?.length === 0) && (
               <div className="text-center text-gray-400 py-6 px-4 bg-gray-800/30 rounded-md">
                  <Archive size={32} className="mx-auto mb-3 text-gray-500" />
                  <p className={`font-semibold text-gray-300 ${layout.bodySize}`}>Keine Einträge im Archiv</p>
                  <p className={`${layout.smallTextSize}`}>Abgeschlossene Partien und Turniere werden hier angezeigt.</p>
              </div>
            )} 
            {!(sessionsLoading || tournamentsLoading) && !(sessionsError || tournamentsError) && combinedArchiveItems && combinedArchiveItems.length > 0 && (
              <div className="space-y-4">
                 {sortedYears?.map(year => (
                   <div key={year}>
                     <h3 className={`${layout.headingSize} font-semibold text-white mb-3 text-center`}>{year}</h3>
                    <div className="space-y-2">
                      {groupedArchiveByYear?.[year]?.map(item => (
                        renderArchiveItem?.(item)
                       ))}
                     </div>
                   </div>
                 ))}
              </div> 
            )} 
          </TabsContent>
        </Tabs>
        
        {/* LEGAL FOOTER */}
        <LegalFooter />
        </div> {/* End Responsive Container Wrapper */}
      </div>
    </MainLayout>
    </>
  );
}; 