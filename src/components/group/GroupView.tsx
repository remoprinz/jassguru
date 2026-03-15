import React, { useRef, useMemo, useState, useEffect } from "react";
import Image from "next/image";
import MainLayout from "@/components/layout/MainLayout";
import { GroupSelector } from "@/components/group/GroupSelector";
import JoinByInviteUI from "@/components/ui/JoinByInviteUI";
import {Button} from "@/components/ui/button";
import {Users, Settings, UserPlus, Camera, Upload, X, BarChart, Archive, BarChart2, CheckCircle, XCircle, MinusCircle, Award as AwardIcon, AlertTriangle, BarChart3, User} from "lucide-react";
import { FaShareAlt, FaInfo } from 'react-icons/fa';
import { FormattedDescription } from "@/components/ui/FormattedDescription";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNestedScrollFix } from '@/hooks/useNestedScrollFix';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { GroupMemberList } from "@/components/group/GroupMemberList";
import type { FirestorePlayer, JassColor, FarbeSettings, StrokeSettings } from "@/types/jass";
import { GroupStatistics } from "@/services/statisticsService";
import { StatLink } from '@/components/statistics/StatLink';
import { FarbePictogram } from '@/components/settings/FarbePictogram';
import { CARD_SYMBOL_MAPPINGS } from '@/config/CardStyles';
import { toTitleCase, formatMillisecondsDuration } from '@/utils/formatUtils';
import ProfileImage from '@/components/ui/ProfileImage';
import AvatarPreloader from '@/components/ui/AvatarPreloader';
import InviteModal from '@/components/group/InviteModal';
import ImageCropModal from '@/components/ui/ImageCropModal';
import { LegalFooter } from '@/components/layout/LegalFooter';
import { PublicViewTopBar } from '@/components/layout/PublicViewTopBar';
// NEU: PLZ-Service für Hauptspielort-Anzeige
import { getOrtNameByPlz } from '@/utils/locationUtils';
import { generateBlurPlaceholder } from '@/utils/imageOptimization';
import { Skeleton } from '@/components/ui/skeleton';
// NEU: Jass-Elo Service
import { loadPlayerRatings, type PlayerRatingWithTier } from '@/services/jassElo';
import { collection, getDocs, query, where, orderBy, limit, getDoc, doc } from 'firebase/firestore';
import { db } from '@/services/firebaseInit';
// NEU: Chart-Komponenten
import PowerRatingChart from '@/components/charts/PowerRatingChart';
import PieChart from '@/components/charts/PieChart';
import WinRateChart from '@/components/charts/WinRateChart';

  // 🚀 OPTIMIERTE CHART-SERVICES: Backfill-Daten mit Fallback
import { 
  getOptimizedRatingChart, 
  getOptimizedStricheChart, 
  getOptimizedPointsChart,
  getOptimizedMatschChart,
  getOptimizedSchneiderChart,
  getOptimizedTeamStricheChart,
  getOptimizedTeamPointsChart,
  getOptimizedTeamMatschChart,
  getTrumpfDistributionChartData,
  getTeamEventCounts,
  getPlayerStrichePointsTotals,
  getTeamStrichePointsTotals,
  getTeamWeisPointsTotals
} from '@/services/chartDataService';
// ✅ NEU: Hilfsfunktion für Ranglisten aus Backfill-Daten
import { getRankingFromChartData, getTeamRankingFromChartData } from '@/utils/chartRankingUtils';
import { Trophy } from 'lucide-react';

// Props für Schritt 4: Komplette Statistik-Inhalte
interface GroupViewProps {
  // Basic States
  currentGroup: any;
  user: any;
  isGuest: boolean;
  userGroups: any[];
  isAuthenticated: () => boolean;
  
  // 🚨 NEU: Unterscheidung zwischen Gastmodus und öffentlicher Ansicht
  isPublicView?: boolean; // Für externe öffentliche Ansicht (Gruppen-URL)
  
  // ✅ UX-VERBESSERUNG: Context-Parameter für personalisierte Willkommensnachricht
  joinedGroupName?: string | null;
  isNewMember?: boolean | null;
  
  // Invite handling
  handleProcessInviteInput: (inputValue: string, inviteUiType: 'group' | 'tournament') => void;
  isProcessingInvite: boolean;
  showNotification: any;
  
  // Group status
  groupStatus: string;
  groupError: string | null;
  
  // SCHRITT 2: Header & Upload Props
  isAdmin: boolean | null;
  selectedFile: File | null;
  previewUrl: string | null;
  isUploading: boolean;
  handleSelectClick: () => void;
  handleUpload: () => void;
  handleCancelSelection: () => void;
  handleInviteClick: () => void;
  router: any;
  
  // 🚨 NEU: FILE INPUT & CROP MODAL UI PROPS (FÜR 1000% PARITÄT)
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  cropModalOpen: boolean;
  imageToCrop: string | null;
  handleCropComplete: (croppedImageBlob: Blob | null) => void;
  
  // SCHRITT 3: Tab-System Props
  activeMainTab: string;
  activeStatsSubTab: string;
  groupTheme: string;
  statsLoading: boolean;
  statsError: string | null;
  members: any[];
  membersLoading: boolean;
  membersError: string | null;
  
  // SCHRITT 3b: Archiv Data Props
  completedSessions: any[];
  groupTournaments: any[];
  combinedArchiveItems: any[];
  groupedArchiveByYear: Record<string, any[]>;
  sortedYears: string[];
  renderArchiveItem: (item: any) => React.ReactNode;
  // NEU: Archiv Loading/Error States
  sessionsLoading: boolean;
  sessionsError: string | null;
  tournamentsLoading: boolean;
  tournamentsError: string | null;
  
  // SCHRITT 4: Statistik-Daten Props
  groupStats: GroupStatistics | null;
  theme: any; // THEME_COLORS[groupTheme]
  findPlayerByName: (playerName: string, membersList: FirestorePlayer[]) => FirestorePlayer | undefined;
  findPlayerPhotoByName: (playerName: string, membersList: FirestorePlayer[]) => string | undefined;
  
  // INVITE MODAL Props
  isInviteModalOpen: boolean;
  onCloseInviteModal: () => void;
  inviteLoading: boolean;
  inviteError: string | null;
  inviteToken: string | null;
  onGenerateNewInvite?: () => void;
  // 🚨 NEUE MODAL HANDLER PROPS (FÜR EXAKTE ORIGINAL-KOMPATIBILITÄT)
  handleCloseInviteModal: () => void;
  isGeneratingInvite: boolean;
  handleGenerateNewInvite: () => void;
}

export const GroupView: React.FC<GroupViewProps> = ({
  currentGroup,
  user,
  isGuest,
  userGroups,
  isAuthenticated,
  isPublicView = false,
  joinedGroupName,
  isNewMember,
  handleProcessInviteInput,
  isProcessingInvite,
  showNotification,
  groupStatus,
  groupError,
  // SCHRITT 2: Header Props
  isAdmin,
  selectedFile,
  previewUrl,
  isUploading,
  handleSelectClick,
  handleUpload,
  handleCancelSelection,
  handleInviteClick,
  router,
  // 🚨 NEU: FILE INPUT & CROP MODAL UI PROPS (FÜR 1000% PARITÄT)
  fileInputRef,
  handleFileChange,
  cropModalOpen,
  imageToCrop,
  handleCropComplete,
  // SCHRITT 3: Tab-System Props
  activeMainTab,
  activeStatsSubTab,
  groupTheme,
  statsLoading,
  statsError,
  members,
  membersLoading,
  membersError,
  // SCHRITT 3b: Archiv Props
  completedSessions,
  groupTournaments,
  combinedArchiveItems,
  groupedArchiveByYear,
  sortedYears,
  renderArchiveItem,
  sessionsLoading,
  sessionsError,
  tournamentsLoading,
  tournamentsError,
  // SCHRITT 4: Statistik-Daten Props
  groupStats,
  theme,
  findPlayerByName,
  findPlayerPhotoByName,
  // INVITE MODAL Props
  isInviteModalOpen,
  onCloseInviteModal,
  inviteLoading,
  inviteError,
  inviteToken,
  onGenerateNewInvite,
  // 🚨 NEUE MODAL HANDLER PROPS (FÜR EXAKTE ORIGINAL-KOMPATIBILITÄT)
  handleCloseInviteModal,
  isGeneratingInvite,
  handleGenerateNewInvite,
}) => {
  // 🎨 RESPONSIVE LAYOUT HOOK - Desktop/Tablet/Mobile Optimierung
  const layout = useResponsiveLayout();
  
  // ✅ NEU: Notification für neue Nutzer, die über Einladungslink beigetreten sind
  useEffect(() => {
    if (isNewMember && joinedGroupName && showNotification) {
      // Kleiner Delay, damit die Seite vollständig geladen ist
      const timer = setTimeout(() => {
        showNotification({
          type: "info",
          image: "/welcome-guru.png",
          message: (
            <span>
              Willkommen bei jassguru.ch! 🎉<br />
              <br />
              Schön, dass du dabei bist! Unten rechts in der Navigation findest du alles, was du wissen musst.
            </span>
          ),
          duration: 8000, // 8 Sekunden
          actions: [
            {
              label: "Verstanden",
              onClick: () => {}
            }
          ]
        });
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isNewMember, joinedGroupName, showNotification]);

  // ✅ NEU: Notification für neue registrierte Nutzer (ohne Gruppe) - einmalig beim ersten Login
  useEffect(() => {
    if (!user || userGroups.length > 0 || joinedGroupName || isGuest || !showNotification) {
      return; // Nur für neue registrierte Nutzer ohne Gruppe
    }

    // Prüfe, ob wir diese Notification bereits für diesen Nutzer angezeigt haben
    const notificationKey = `welcome-notification-shown-${user.uid}`;
    const alreadyShown = typeof window !== 'undefined' && localStorage.getItem(notificationKey) === 'true';
    
    if (alreadyShown) {
      return; // Bereits angezeigt, nicht nochmal zeigen
    }

    // Zeige die Notification beim ersten Login
    const timer = setTimeout(() => {
      showNotification({
        type: "info",
        image: "/welcome-guru.png",
        message: (
          <span>
            Willkommen bei jassguru.ch! 🎉<br />
            <br />
            Schön, dass du dabei bist! Unten rechts unter "Hilfe" findest du alles, was du wissen musst.
          </span>
        ),
        actions: [
          {
            label: "Verstanden",
            onClick: () => {
              // Markiere als angezeigt, wenn Nutzer auf "Verstanden" klickt
              if (typeof window !== 'undefined') {
                localStorage.setItem(notificationKey, 'true');
              }
            }
          }
        ]
      });
      
      // Markiere auch automatisch als angezeigt (falls Nutzer die Notification schließt ohne Button)
      if (typeof window !== 'undefined') {
        localStorage.setItem(notificationKey, 'true');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [user, userGroups.length, joinedGroupName, isGuest, showNotification]);
  
  // 🚨 SHARE-FUNKTION: Einfacher Text-Share ohne Screenshot
  const handleShareClick = async () => {
    if (!currentGroup) return;
    
    try {
      // Eleganter Share-Text erstellen
      const groupName = currentGroup.name || 'Jass-Gruppe';
      const shareText = `Schau dir die Jass-Statistiken von "${groupName}" an! Hier findest du alle Spielergebnisse, Ranglisten und das komplette Archiv.\n\nhttps://jassguru.ch/view/group/${currentGroup.id}\n\ngeneriert von:\n👉 jassguru.ch`;

      // Share API verwenden (falls verfügbar)
      if (navigator.share) {
        await navigator.share({
          text: shareText
        });
        console.log("✅ Gruppen-Link erfolgreich geteilt!");
      } else {
        // Fallback: In Zwischenablage kopieren
        await navigator.clipboard.writeText(shareText);
        console.log("📋 Gruppen-Link in Zwischenablage kopiert!");
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
        const fallbackText = `https://jassguru.ch/view/group/${currentGroup.id}`;
        await navigator.clipboard.writeText(fallbackText);
        console.log("📋 Fallback: Link in Zwischenablage kopiert");
      } catch (clipboardError) {
        console.error("❌ Auch Zwischenablage fehlgeschlagen:", clipboardError);
      }
    }
  };
  
  // Neu: State für Bildladung
  const [isImageLoading, setIsImageLoading] = useState(true);
  
  // NEU: State für Elo-Ratings
  const [playerRatings, setPlayerRatings] = useState<Map<string, PlayerRatingWithTier>>(new Map());
  const [eloRatingsLoading, setEloRatingsLoading] = useState(false); // ✅ NEU: Loading-State für Elo-Ratings
  // NEU: State für Elo-Deltas (aus jassGameSummaries)
  const [playerDeltas, setPlayerDeltas] = useState<Map<string, number>>(new Map());
  // NEU: State für Chart-Daten
  const [chartData, setChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  
  // NEU: State für Strichdifferenz-Chart
  const [stricheChartData, setStricheChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [stricheChartLoading, setStricheChartLoading] = useState(false);

  // NEU: State für Punktedifferenz-Chart
  const [pointsChartData, setPointsChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [pointsChartLoading, setPointsChartLoading] = useState(false);

  // NEU: State für Matsch-Chart
  const [matschChartData, setMatschChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [matschChartLoading, setMatschChartLoading] = useState(false);

  // NEU: State für Schneider-Chart
  const [schneiderChartData, setSchneiderChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [schneiderChartLoading, setSchneiderChartLoading] = useState(false);

  // NEU: State für Team-Strichdifferenz-Chart
  const [teamStricheChartData, setTeamStricheChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [teamStricheChartLoading, setTeamStricheChartLoading] = useState(false);

  // NEU: State für Team-Punktedifferenz-Chart
  const [teamPointsChartData, setTeamPointsChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [teamPointsChartLoading, setTeamPointsChartLoading] = useState(false);

  // NEU: State für Team-Matsch-Bilanz-Chart
  const [teamMatschChartData, setTeamMatschChartData] = useState<{
    labels: string[];
    datasets: any[];
  } | null>(null);
  const [teamMatschChartLoading, setTeamMatschChartLoading] = useState(false);
  
  // ✅ NEU: State für Team Event-Counts (Made/Received)
  const [teamEventCountsMap, setTeamEventCountsMap] = useState<Map<string, { eventsMade: number; eventsReceived: number }>>(new Map());

  // NEU: Trumpfverteilung-Daten aus groupStats
  const trumpfDistributionData = useMemo(() => {
    if (!groupStats?.trumpfStatistik || groupStats.totalTrumpfCount === 0) {
      return null;
    }
    return getTrumpfDistributionChartData(groupStats.trumpfStatistik, groupStats.totalTrumpfCount);
  }, [groupStats]);

  // ===== REFS FÜR SCROLLBARE STATISTIK-CONTAINER (IDENTISCH ZUM ORIGINAL) =====
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

  // ===== WENDE DEN SCROLL-FIX-HOOK AUF ALLE REFS AN (IDENTISCH ZUM ORIGINAL) =====
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
  
  const canonicalTrumpfKey = (farbe: string): string => {
    const normalized = farbe
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (["eicheln", "eichel", "eichle", "schaufel", "gras"].includes(normalized)) return "eichel";
    if (["rosen", "rose", "kreuz"].includes(normalized)) return "rosen";
    if (["schellen", "schelle", "schalle", "herz"].includes(normalized)) return "schellen";
    if (["schilten", "schilte", "ecke"].includes(normalized)) return "schilten";
    if (normalized === "une" || normalized === "unde") return "unde";
    if (normalized === "misere" || normalized === "miserefr") return "misere";
    if (normalized === "trumpf") return "obe";

    return normalized;
  };

  // ===== TRUMP-STATISTIK ARRAY (IDENTISCH ZUM ORIGINAL) =====
  const trumpfStatistikArray = useMemo(() => {
    if (!groupStats?.trumpfStatistik || groupStats.totalTrumpfCount === 0) {
      return [];
    }
    
    // KORREKTUR: Alle Varianten auf kanonische Keys zusammenführen (DE/FR/Altformen)
    const consolidatedStats: Record<string, number> = {};
    
    Object.entries(groupStats.trumpfStatistik).forEach(([farbe, anzahl]) => {
      const mappedFarbe = canonicalTrumpfKey(farbe);
      
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

  // ===== HILFSFUNKTION FÜR JASS-COLOR NORMALISIERUNG (IDENTISCH ZUM ORIGINAL) =====
  const normalizeJassColor = (farbe: string): JassColor => {
    const mappings: Record<string, JassColor> = {
      "eichel": "Eicheln",
      "eicheln": "Eicheln",
      "eichle": "Eicheln",
      "schaufel": "Eicheln",
      "gras": "Eicheln",
      "rosen": "Rosen",
      "rose": "Rosen",
      "kreuz": "Rosen",
      "schilten": "Schilten",
      "schilte": "Schilten",
      "ecke": "Schilten",
      "schellen": "Schellen",
      "schelle": "Schellen",
      "schalle": "Schellen",
      "herz": "Schellen",
      "unde": "Une",
      "une": "Une",
      "obe": "Obe",
      "misere": "Misère",
      "misère": "Misère",
      "quer": "Quer",
      "slalom": "Slalom",
      "3x3": "3x3",
    };
    
    const normalized = farbe
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return (mappings[normalized] ?? farbe) as JassColor;
  };
  
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
    return colorMap[themeKey] || '#ca8a04'; // Fallback zu Standard-Gelb (yellow-600)
  };

  // Hilfsfunktion für Hex-Farben
  const getHexColor = (themeKey: string): string => {
    const hexColorMap: Record<string, string> = {
      'green': '#10b981',
      'blue': '#3b82f6',
      'purple': '#a855f7',
      'pink': '#ec4899',
      'yellow': '#eab308',
      'teal': '#14b8a6',
      'orange': '#f97316',
      'cyan': '#06b6d4',
    };
    
    return hexColorMap[themeKey] || hexColorMap.blue;
  };

  // Hilfsfunktion für Glow-Farben
  const getGlowColor = (themeKey: string): string => {
    const glowColorMap: Record<string, string> = {
      'green': 'rgba(16, 185, 129, 0.2)',
      'blue': 'rgba(59, 130, 246, 0.2)',
      'purple': 'rgba(168, 85, 247, 0.2)',
      'pink': 'rgba(236, 72, 153, 0.2)',
      'yellow': 'rgba(234, 179, 8, 0.2)',
      'teal': 'rgba(20, 184, 166, 0.2)',
      'orange': 'rgba(249, 115, 22, 0.2)',
      'cyan': 'rgba(6, 182, 212, 0.2)',
    };
    
    return glowColorMap[themeKey] || glowColorMap.blue;
  };

  // 🎨 NEU: Theme-basierte Styling-Utilities
  const getThemeStyles = (themeKey: string) => {
    const themeColorMap: Record<string, { 
      primary: string, 
      primaryRgb: string, 
      border: string, 
      glow: string,
      text: string,
      accent: string 
    }> = {
      green: { 
        primary: '#059669', 
        primaryRgb: '5, 150, 105', 
        border: 'border-emerald-500/60', 
        glow: 'shadow-emerald-500/20',
        text: 'text-emerald-400',
        accent: 'bg-emerald-500/10'
      },
      blue: { 
        primary: '#2563eb', 
        primaryRgb: '37, 99, 235', 
        border: 'border-blue-500/60', 
        glow: 'shadow-blue-500/20',
        text: 'text-blue-400',
        accent: 'bg-blue-500/10'
      },
      purple: { 
        primary: '#9333ea', 
        primaryRgb: '147, 51, 234', 
        border: 'border-purple-500/60', 
        glow: 'shadow-purple-500/20',
        text: 'text-purple-400',
        accent: 'bg-purple-500/10'
      },
      yellow: { 
        primary: '#ca8a04', 
        primaryRgb: '202, 138, 4', 
        border: 'border-yellow-500/60', 
        glow: 'shadow-yellow-500/20',
        text: 'text-yellow-400',
        accent: 'bg-yellow-500/10'
      },
      orange: { 
        primary: '#f97316', 
        primaryRgb: '249, 115, 22', 
        border: 'border-orange-500/60', 
        glow: 'shadow-orange-500/20',
        text: 'text-orange-400',
        accent: 'bg-orange-500/10'
      },
      cyan: { 
        primary: '#06b6d4', 
        primaryRgb: '6, 182, 212', 
        border: 'border-cyan-500/60', 
        glow: 'shadow-cyan-500/20',
        text: 'text-cyan-400',
        accent: 'bg-cyan-500/10'
      },
      pink: { 
        primary: '#ec4899', 
        primaryRgb: '236, 72, 153', 
        border: 'border-pink-500/60', 
        glow: 'shadow-pink-500/20',
        text: 'text-pink-400',
        accent: 'bg-pink-500/10'
      },
      teal: { 
        primary: '#0d9488', 
        primaryRgb: '13, 148, 136', 
        border: 'border-teal-500/60', 
        glow: 'shadow-teal-500/20',
        text: 'text-teal-400',
        accent: 'bg-teal-500/10'
      }
    };
    
    return themeColorMap[themeKey] || themeColorMap.blue; // Fallback zu Blau
  };

  const themeStyles = useMemo(() => getThemeStyles(groupTheme), [groupTheme]);

  // ✅ NEU: Lade playerStats für Ranglisten
  const [playerStats, setPlayerStats] = React.useState<any>({});
  const [playerStatsLoading, setPlayerStatsLoading] = React.useState(false); // ✅ NEU: Loading-State
  
  // ✅ NEU: Spielezahl pro Spieler aus normalen Sessions (ohne Turniere) für diese Gruppe
  const [playerGamesInGroup, setPlayerGamesInGroup] = React.useState<Map<string, number>>(new Map());
  
  // ✅ NEU: Event-Counts (Matsch, Schneider) pro Spieler
  const [playerMatschCounts, setPlayerMatschCounts] = React.useState<Map<string, { eventsMade: number; eventsReceived: number }>>(new Map());
  const [playerSchneiderCounts, setPlayerSchneiderCounts] = React.useState<Map<string, { eventsMade: number; eventsReceived: number }>>(new Map());
  
  // ✅ NEU: Striche/Punkte-Totals für Spieler und Teams
  const [playerStricheTotals, setPlayerStricheTotals] = React.useState<Map<string, { made: number; received: number }>>(new Map());
  const [playerPointsTotals, setPlayerPointsTotals] = React.useState<Map<string, { made: number; received: number }>>(new Map());
  const [teamStricheTotals, setTeamStricheTotals] = React.useState<Map<string, { made: number; received: number }>>(new Map());
  const [teamPointsTotals, setTeamPointsTotals] = React.useState<Map<string, { made: number; received: number }>>(new Map());
  const [teamWeisPointsTotals, setTeamWeisPointsTotals] = React.useState<Map<string, { made: number; received: number }>>(new Map());
  
  // ✅ REFACTORED: Lade ALLE gruppenspezifischen Stats aus jassGameSummaries dieser Gruppe
  // Dies ersetzt den alten globalStats-Ansatz und stellt sicher, dass Stats pro Gruppe korrekt sind
  React.useEffect(() => {
    if (!currentGroup?.id || !members || members.length === 0) return;

    const loadGroupSpecificStats = async () => {
      setPlayerStatsLoading(true);
      
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const { db } = await import('@/services/firebaseInit');
        
        // Lade jassGameSummaries aus dieser Gruppe
        const summariesRef = collection(db, `groups/${currentGroup.id}/jassGameSummaries`);
        const summariesSnapshot = await getDocs(summariesRef);
        
        const playerIdSet = new Set(members.map(m => m.id || m.userId).filter(Boolean));
        
        // Initialisiere Stats für jeden Spieler
        const gamesByPlayer = new Map<string, number>();
        const sessionStatsByPlayer = new Map<string, { wins: number; losses: number; draws: number }>();
        const gameStatsByPlayer = new Map<string, { wins: number; losses: number }>();
        
        // Initialisiere alle Spieler mit 0
        playerIdSet.forEach(playerId => {
          gamesByPlayer.set(playerId, 0);
          sessionStatsByPlayer.set(playerId, { wins: 0, losses: 0, draws: 0 });
          gameStatsByPlayer.set(playerId, { wins: 0, losses: 0 });
        });
        
        summariesSnapshot.forEach(docSnap => {
          const summary = docSnap.data();
          
          // Nur abgeschlossene Sessions
          if (summary.status !== 'completed' && summary.status !== 'completed_empty') return;
          
          const isTournament = summary.isTournamentSession || summary.tournamentId;
          const winnerTeamKey = summary.winnerTeamKey; // 'top' oder 'bottom'
          
          if (isTournament && summary.gameResults && Array.isArray(summary.gameResults)) {
            // ✅ TURNIER: Zähle pro Spieler, in wie vielen Spielen er war + Wins/Losses
            summary.gameResults.forEach((game: any) => {
              const topPlayers = game.teams?.top?.players || [];
              const bottomPlayers = game.teams?.bottom?.players || [];
              const gameWinner = game.winnerTeamKey; // 'top' oder 'bottom'
              
              // Top-Team Spieler
              topPlayers.forEach((player: any) => {
                const playerId = player.playerId;
                if (playerId && playerIdSet.has(playerId)) {
                  gamesByPlayer.set(playerId, (gamesByPlayer.get(playerId) || 0) + 1);
                  const gs = gameStatsByPlayer.get(playerId) || { wins: 0, losses: 0 };
                  if (gameWinner === 'top') {
                    gs.wins++;
                  } else if (gameWinner === 'bottom') {
                    gs.losses++;
                  }
                  gameStatsByPlayer.set(playerId, gs);
                }
              });
              
              // Bottom-Team Spieler
              bottomPlayers.forEach((player: any) => {
                const playerId = player.playerId;
                if (playerId && playerIdSet.has(playerId)) {
                  gamesByPlayer.set(playerId, (gamesByPlayer.get(playerId) || 0) + 1);
                  const gs = gameStatsByPlayer.get(playerId) || { wins: 0, losses: 0 };
                  if (gameWinner === 'bottom') {
                    gs.wins++;
                  } else if (gameWinner === 'top') {
                    gs.losses++;
                  }
                  gameStatsByPlayer.set(playerId, gs);
                }
              });
            });
            
            // Turnier-Session-Win/Loss für Teilnehmer (basierend auf Session-Gewinner)
            // Bei Turnieren ist die Session-Auswertung komplexer, hier vereinfacht
            
          } else {
            // ✅ NORMALE SESSION: Verwende gamesPlayed und winnerTeamKey
            const gamesPlayed = summary.gamesPlayed || 0;
            const participantIds = summary.participantPlayerIds || [];
            const topPlayers = summary.teams?.top?.players?.map((p: any) => p.playerId) || [];
            const bottomPlayers = summary.teams?.bottom?.players?.map((p: any) => p.playerId) || [];
            
            // Session Wins/Losses berechnen
            participantIds.forEach((playerId: string) => {
              if (!playerIdSet.has(playerId)) return;
              
              // Spielezahl
              gamesByPlayer.set(playerId, (gamesByPlayer.get(playerId) || 0) + gamesPlayed);
              
              // Session Win/Loss
              const ss = sessionStatsByPlayer.get(playerId) || { wins: 0, losses: 0, draws: 0 };
              
              if (!winnerTeamKey) {
                ss.draws++;
              } else if (winnerTeamKey === 'top' && topPlayers.includes(playerId)) {
                ss.wins++;
              } else if (winnerTeamKey === 'bottom' && bottomPlayers.includes(playerId)) {
                ss.wins++;
              } else if (winnerTeamKey === 'top' && bottomPlayers.includes(playerId)) {
                ss.losses++;
              } else if (winnerTeamKey === 'bottom' && topPlayers.includes(playerId)) {
                ss.losses++;
              }
              
              sessionStatsByPlayer.set(playerId, ss);
            });
            
            // Game Wins/Losses aus finalStriche berechnen (vereinfacht)
            const topSiege = summary.finalStriche?.top?.sieg || 0;
            const bottomSiege = summary.finalStriche?.bottom?.sieg || 0;
            
            topPlayers.forEach((playerId: string) => {
              if (!playerIdSet.has(playerId)) return;
              const gs = gameStatsByPlayer.get(playerId) || { wins: 0, losses: 0 };
              gs.wins += topSiege;
              gs.losses += bottomSiege;
              gameStatsByPlayer.set(playerId, gs);
            });
            
            bottomPlayers.forEach((playerId: string) => {
              if (!playerIdSet.has(playerId)) return;
              const gs = gameStatsByPlayer.get(playerId) || { wins: 0, losses: 0 };
              gs.wins += bottomSiege;
              gs.losses += topSiege;
              gameStatsByPlayer.set(playerId, gs);
            });
          }
        });
        
        // Speichere gruppenspezifische Spielezahlen
        setPlayerGamesInGroup(gamesByPlayer);
        
        // Baue playerStats-Object für Kompatibilität mit bestehendem Code
        const stats: any = {};
        playerIdSet.forEach(playerId => {
          const sessionStats = sessionStatsByPlayer.get(playerId) || { wins: 0, losses: 0, draws: 0 };
          const gameStats = gameStatsByPlayer.get(playerId) || { wins: 0, losses: 0 };
          const gamesPlayed = gamesByPlayer.get(playerId) || 0;
          
          stats[playerId] = {
            gamesPlayed,
            sessionStats,
            gameStats
          };
        });
        
        setPlayerStats(stats);
        setPlayerStatsLoading(false);
        
      } catch (error) {
        console.error('[GroupView] Fehler beim Laden der gruppenspezifischen Stats:', error);
        setPlayerGamesInGroup(new Map());
        setPlayerStats({});
        setPlayerStatsLoading(false);
      }
    };
    
    loadGroupSpecificStats();
  }, [currentGroup?.id, members]);
  

  // ✅ NEU: Session Win Rate Ranking aus playerStats (globalStats.current)
  const sessionWinRateRanking = useMemo(() => {
    if (Object.keys(playerStats || {}).length === 0 || !members) {
      return [];
    }

    const ranking = members
      .filter(m => {
        const playerId = m.id || m.userId;
        return playerStats[playerId] && playerStats[playerId].sessionStats;
      })
      .map(m => {
        const playerId = m.id || m.userId;
        const stats = playerStats[playerId].sessionStats;
        const totalSessions = stats.wins + stats.losses;
        
        return {
          playerId,
          playerName: m.displayName,
          playerData: m,
          wins: stats.wins,
          losses: stats.losses,
          draws: stats.draws,
          totalSessions,
          winRate: totalSessions > 0 ? stats.wins / totalSessions : 0
        };
      })
      .sort((a, b) => b.winRate - a.winRate); // Sort by win rate descending

    return ranking;
  }, [members, playerStats]);

  // ✅ NEU: Game Win Rate Ranking aus globalStats.current (gamesWon/gamesLost)
  const gameWinRateRanking = useMemo(() => {
    if (Object.keys(playerStats || {}).length === 0 || !members) {
      return [];
    }

    const ranking = members
      .filter(m => {
        const playerId = m.id || m.userId;
        return playerStats[playerId] && playerStats[playerId].gameStats;
      })
      .map(m => {
        const playerId = m.id || m.userId;
        const stats = playerStats[playerId].gameStats;
        const totalGames = stats.wins + stats.losses; // Nur entschiedene Spiele
        
        return {
          playerId,
          playerName: m.displayName,
          playerData: m,
          wins: stats.wins,
          losses: stats.losses,
          totalGames,
          winRate: totalGames > 0 ? stats.wins / totalGames : 0
        };
      })
      .filter(Boolean) // Remove null entries
      .sort((a, b) => b.winRate - a.winRate); // Sort by win rate descending

    return ranking;
  }, [members, playerStats]);

  // ✅ NEU: Ranglisten aus Backfill-Daten (statt groupStats)
  const stricheRanking = useMemo(() => {
    // ✅ ROBUST: Zeige Ranking auch wenn playerStats noch lädt oder leer ist
    return getRankingFromChartData(stricheChartData, members, playerStats);
  }, [stricheChartData, members, playerStats]);
  
  const pointsRanking = useMemo(() => {
    // ✅ ROBUST: Zeige Ranking auch wenn playerStats noch lädt oder leer ist
    return getRankingFromChartData(pointsChartData, members, playerStats);
  }, [pointsChartData, members, playerStats]);
  
  const eloRanking = useMemo(() => {
    // ✅ ROBUST: Zeige Ranking auch wenn playerStats noch lädt oder leer ist
    return getRankingFromChartData(chartData, members, playerStats);
  }, [chartData, members, playerStats]);
  
  const matschRanking = useMemo(() => {
    return getRankingFromChartData(matschChartData, members, playerStats);
  }, [matschChartData, members, playerStats]);

  const schneiderRanking = useMemo(() => {
    return getRankingFromChartData(schneiderChartData, members, playerStats);
  }, [schneiderChartData, members, playerStats]);
  
  // ✅ TEAM-RANKINGS: Direkt aus Totals-Maps (ALLE Teams, nicht nur Top 15!)
  const teamStricheRanking = useMemo(() => {
    // ✅ DIREKT aus teamStricheTotals: Zeigt ALLE Teams, nicht nur Top 15!
    return Array.from(teamStricheTotals.entries())
      .map(([teamName, totals]) => ({
        teamName,
        bilanz: totals.made - totals.received,
        made: totals.made,
        received: totals.received
      }))
      .filter(team => team.made > 0 || team.received > 0)
      .sort((a, b) => b.bilanz - a.bilanz);
  }, [teamStricheTotals]);
  
  const teamPointsRanking = useMemo(() => {
    // ✅ DIREKT aus teamPointsTotals: Zeigt ALLE Teams, nicht nur Top 15!
    return Array.from(teamPointsTotals.entries())
      .map(([teamName, totals]) => ({
        teamName,
        bilanz: totals.made - totals.received,
        made: totals.made,
        received: totals.received
      }))
      .filter(team => team.made > 0 || team.received > 0)
      .sort((a, b) => b.bilanz - a.bilanz);
  }, [teamPointsTotals]);
  
  const teamMatschRanking = useMemo(() => {
    // ✅ Bereits korrekt: Direkt aus teamEventCountsMap (ALLE Teams!)
    return Array.from(teamEventCountsMap.entries())
      .map(([teamName, counts]) => ({
        teamName,
        bilanz: counts.eventsMade - counts.eventsReceived,
        eventsMade: counts.eventsMade,
        eventsReceived: counts.eventsReceived
      }))
      .filter(team => team.eventsMade > 0 || team.eventsReceived > 0)
      .sort((a, b) => b.bilanz - a.bilanz);
  }, [teamEventCountsMap]);

  // ✅ NEU: Hilfsfunktion um aktuellen Wert aus Chart-Daten zu holen
  const getCurrentValueFromChart = (chartData: any, playerId: string): number => {
    if (!chartData || !chartData.datasets) return 0;
    const dataset = chartData.datasets.find((ds: any) => ds.playerId === playerId);
    if (!dataset || !dataset.data) return 0;
    const lastValue = dataset.data[dataset.data.length - 1];
    return Math.trunc(lastValue || 0);
  };

  // 🔥 Sammle alle Photo-URLs, die im UI auftauchen, damit der Preloader sie dekodieren kann
  const groupAvatarPhotoURLs = useMemo(() => {
    const urls: (string | undefined | null)[] = [];

    // Mitglieder
    if (members) {
      urls.push(...members.map((m) => m.photoURL));
    }

    // Statistiken: Elo (playerRatings)
    playerRatings.forEach((rating) => {
      if (!rating?.id) return;
      const member = members?.find((m) => (m.id || m.userId) === rating.id);
      if (member?.photoURL) {
        urls.push(member.photoURL);
      }
    });

    const pushMemberPhotoByName = (playerName?: string, fallbackId?: string) => {
      if (!playerName && !fallbackId) return;
      const normalizedName = playerName?.toLowerCase();
      const member = members?.find((m) => {
        const matchById = fallbackId && (m.id === fallbackId || m.userId === fallbackId);
        if (matchById) return true;
        const displayName = m.displayName?.toLowerCase();
        return normalizedName && displayName === normalizedName;
      });
      if (member?.photoURL) {
        urls.push(member.photoURL);
      }
    };

    const safeStatsArray = <T extends { playerName?: string; playerId?: string; names?: string[]; }>(arr?: T[]) => Array.isArray(arr) ? arr : [];

    safeStatsArray(groupStats?.playerAllRoundTimes).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestStricheDiff).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestPointsDiff).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestWinRateSession).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestWinRateGame).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestMatschBilanz).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestSchneiderBilanz).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithMostWeisPointsAvg).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    const collectTeamPhotos = (teams?: { names: string[] }[]) => {
      safeStatsArray(teams).forEach((team) => {
        team.names?.forEach((name) => pushMemberPhotoByName(name));
      });
    };

    collectTeamPhotos(groupStats?.teamWithHighestStricheDiff);
    collectTeamPhotos(groupStats?.teamWithHighestPointsDiff);
    collectTeamPhotos(groupStats?.teamWithHighestWinRateSession);
    collectTeamPhotos(groupStats?.teamWithHighestWinRateGame);
    collectTeamPhotos(groupStats?.teamWithHighestMatschBilanz || groupStats?.teamWithHighestMatschRate);
    collectTeamPhotos(groupStats?.teamWithHighestSchneiderBilanz || groupStats?.teamWithHighestSchneiderRate);
    collectTeamPhotos(groupStats?.teamWithMostWeisPointsAvg);
    collectTeamPhotos(groupStats?.teamWithFastestRounds);

    return Array.from(new Set(urls.filter((url): url is string => typeof url === 'string' && url.trim() !== '')));
  }, [members, playerRatings, groupStats]);

  // 🎨 Utility für Theme-basierte ProfileImage-Styles
  const getProfileImageThemeStyles = () => ({
    className: `border border-gray-600/50 hover:scale-105 transition-all duration-200`,
    style: {
      borderColor: `rgba(${themeStyles.primaryRgb}, 0.3)`,
      boxShadow: `0 0 8px rgba(${themeStyles.primaryRgb}, 0.1)`
    },
    fallbackStyle: {
      backgroundColor: `rgba(${themeStyles.primaryRgb}, 0.1)`,
      borderColor: `rgba(${themeStyles.primaryRgb}, 0.3)`
    }
  });

  // 🎨 Berechne Titel-Farbe: Weiß mit 4% Theme-Farbe gemischt
  const getTitleColor = () => {
    const [r, g, b] = themeStyles.primaryRgb.split(', ').map(Number);
    const mixPercent = 0.04; // 4% Theme-Farbe
    const whitePercent = 1 - mixPercent;
    
    const mixedR = Math.round(255 * whitePercent + r * mixPercent);
    const mixedG = Math.round(255 * whitePercent + g * mixPercent);
    const mixedB = Math.round(255 * whitePercent + b * mixPercent);
    
    return `rgb(${mixedR}, ${mixedG}, ${mixedB})`;
  };

  // 🎨 NEU: Hilfsfunktion für Farbkodierung von Werten (EMERALD-500 für besseren Kontrast)
  const getValueColor = (value: number, isPercentage: boolean = false): string => {
    if (isPercentage) {
      // Für Prozentwerte: >50% = grün, <50% = rot, =50% = weiß
      if (value > 50) return 'text-emerald-500'; // ✅ Beste Grün-Farbe
      if (value < 50) return 'text-red-500'; // ✅ Beste Rot-Farbe
      return 'text-white';
    } else {
      // Für Differenzen/Bilanzen: >0 = grün, <0 = rot, =0 = weiß
      if (value > 0) return 'text-emerald-500'; // ✅ Beste Grün-Farbe
      if (value < 0) return 'text-red-500'; // ✅ Beste Rot-Farbe
      return 'text-white';
    }
  };

  // 🎨 NEU: Spezielle Farbkodierung für Weisdifferenz (höher = besser)
  const getWeisDifferenceColor = (value: number): string => {
    // Für Weisdifferenz: >0 = grün, <0 = rot, =0 = weiß
    if (value > 0) return 'text-emerald-500'; // ✅ Beste Grün-Farbe
    if (value < 0) return 'text-red-500'; // ✅ Beste Rot-Farbe
    return 'text-white';
  };

  // 🎨 NEU: Formatierung für Punkte mit k-Suffix (nur in Klammern!)
  const formatPointsWithK = (points: number): string => {
    if (points >= 1000) {
      return `${(points / 1000).toFixed(0)}k`;
    }
    return points.toString();
  };
  
  // 🚨 WATCHDOG: Automatischer Reset wenn GroupView zu lange lädt
  React.useEffect(() => {
    if (groupStatus === 'loading' && !currentGroup) {
      const watchdog = setTimeout(() => {
        console.warn('[Watchdog] GroupView hängt beim Laden der Gruppendaten - prüfe Recovery-Status...');
        
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
          window.location.href = '/kill-sw.html?auto=true&source=groupview';
        } catch (error) {
          console.error('[Watchdog] Fehler beim Session-Check, führe einfachen Reload durch:', error);
          window.location.reload();
        }
      }, 20000); // 20 Sekunden Timeout
      
      return () => clearTimeout(watchdog);
    }
  }, [groupStatus, currentGroup]);

  // 🌍 GLOBAL ELO: Lade globale Elo-Ratings für Gruppenmitglieder
  React.useEffect(() => {
    if (!currentGroup?.id || !members || members.length === 0) return;
    
    // ✅ NEU: Setze Loading-State auf true
    setEloRatingsLoading(true);
    
    // ✅ IMMER globale Ratings laden (über alle Gruppen hinweg)
    const playerIds = members.map(m => m.id || m.userId).filter(Boolean);
    loadPlayerRatings(playerIds)
      .then((ratingsMap) => {
        setPlayerRatings(ratingsMap);
      })
      .catch(error => console.warn('Fehler beim Laden der Elo-Ratings:', error))
      .finally(() => {
        setEloRatingsLoading(false); // ✅ Loading-State auf false setzen
      });
  }, [members, currentGroup?.id]);

  // 🆕 NEU: Lade letzte Session-Deltas für JEDEN Spieler aus jassGameSummaries
  React.useEffect(() => {
    if (!currentGroup?.id || !members || members.length === 0) return;
    
    const loadLastDeltasForAllPlayers = async () => {
      try {
        // Hole ALLE Sessions aus jassGameSummaries, sortiert nach Datum
        const summariesRef = collection(db, `groups/${currentGroup.id}/jassGameSummaries`);
        const summariesQuery = query(
          summariesRef,
          where('status', '==', 'completed'),
          orderBy('completedAt', 'desc')
        );
        
        const summariesSnap = await getDocs(summariesQuery);
        
        // Map für die letzten Deltas jedes Spielers
        const lastDeltaMap = new Map<string, number>();
        
        // Durchsuche alle Sessions chronologisch und sammle die letzten Deltas
        for (const summaryDoc of summariesSnap.docs) {
          const summaryData = summaryDoc.data();
          const playerFinalRatings = summaryData.playerFinalRatings;
          
          if (playerFinalRatings && Object.keys(playerFinalRatings).length > 0) {
            // Für jeden Spieler in dieser Session
            Object.entries(playerFinalRatings).forEach(([playerId, ratingData]: [string, any]) => {
              if (ratingData?.ratingDelta !== undefined) {
                // Finde den entsprechenden Member
                const member = members.find(m => 
                  (m.id === playerId || m.userId === playerId) ||
                  (ratingData.displayName && m.displayName?.toLowerCase() === ratingData.displayName.toLowerCase())
                );
                
                if (member) {
                  const memberId = member.id || member.userId;
                  
                  // Nur hinzufügen, wenn wir noch kein Delta für diesen Spieler haben
                  // (da Sessions nach Datum sortiert sind, ist das erste gefundene Delta das neueste)
                  if (!lastDeltaMap.has(memberId)) {
                    lastDeltaMap.set(memberId, ratingData.ratingDelta);
                    
                    // Zusätzlich mit der ursprünglichen playerId als Schlüssel
                    lastDeltaMap.set(playerId, ratingData.ratingDelta);
                  }
                }
              }
            });
          }
        }
        
        setPlayerDeltas(lastDeltaMap);
      } catch (error) {
        console.warn('Fehler beim Laden der letzten Session-Deltas:', error);
      }
    };
    
    loadLastDeltasForAllPlayers();
  }, [currentGroup?.id, members]);

  // 🌍 GLOBAL ELO: Öffentliche Gruppenansicht - lade globale Ratings
  React.useEffect(() => {
    const groupId = currentGroup?.id;
    if (!groupId) return;
    
    // ✅ NUR für öffentliche Ansicht oder wenn members leer ist!
    if (!isPublicView && members && members.length > 0) return;
    
    // 🌍 Für öffentliche Ansicht: Lade Mitglieder und dann globale Ratings
    getDocs(collection(db, `groups/${groupId}/members`))
      .then((membersSnap) => {
        const playerIds = membersSnap.docs.map(doc => doc.id);
        return loadPlayerRatings(playerIds);
      })
      .then((ratingsMap) => {
        setPlayerRatings(ratingsMap);
        // Session-Deltas werden separat geladen (siehe useEffect oben)
      })
      .catch(e => console.warn('Fehler beim Laden der globalen Elo-Ratings für öffentliche Ansicht:', (e as any)?.message));
  }, [currentGroup?.id, isPublicView, members]);

  // 🚀 OPTIMIERT: Lade Elo-Rating-Chart-Daten mit Backfill-Priorität
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    // ✅ Verzögerung um 1-2 Frames nach Tab-Expandieren für smooth Chart-Rendering
    const timer = setTimeout(() => {
      setChartLoading(true);
      getOptimizedRatingChart(currentGroup.id)
        .then((result) => {
          setChartData({
            labels: result.labels,
            datasets: result.datasets
          });
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Elo-Rating-Chart-Daten:', error);
          setChartData(null);
        })
        .finally(() => {
          setChartLoading(false);
        });
    }, 50); // 50ms Verzögerung für bessere UX
    
    return () => clearTimeout(timer);
  }, [currentGroup?.id]);
  
  // 🚀 OPTIMIERT: Lade Strichdifferenz-Verlauf mit Backfill-Priorität
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    // ✅ Verzögerung für smooth Chart-Rendering
    const timer = setTimeout(() => {
      setStricheChartLoading(true);
      getOptimizedStricheChart(currentGroup.id)
        .then((result) => {
          setStricheChartData({
            labels: result.labels,
            datasets: result.datasets
          });
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Strichdifferenz-Chart-Daten:', error);
          setStricheChartData(null);
        })
        .finally(() => {
          setStricheChartLoading(false);
        });
    }, 50);
    
    return () => clearTimeout(timer);
  }, [currentGroup?.id]);

  // 🚀 OPTIMIERT: Lade Punktedifferenz-Verlauf mit Backfill-Priorität
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    // ✅ Verzögerung für smooth Chart-Rendering
    const timer = setTimeout(() => {
      setPointsChartLoading(true);
      getOptimizedPointsChart(currentGroup.id)
        .then((result) => {
          setPointsChartData({
            labels: result.labels,
            datasets: result.datasets
          });
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Punktedifferenz-Chart-Daten:', error);
          setPointsChartData(null);
        })
        .finally(() => {
          setPointsChartLoading(false);
        });
    }, 50);
    
    return () => clearTimeout(timer);
  }, [currentGroup?.id]);

  // 🚀 OPTIMIERT: Lade Matsch-Verlauf mit Backfill-Priorität
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    // ✅ Verzögerung für smooth Chart-Rendering
    const timer = setTimeout(() => {
      setMatschChartLoading(true);
      getOptimizedMatschChart(currentGroup.id)
        .then((result) => {
          setMatschChartData({
            labels: result.labels,
            datasets: result.datasets
          });
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Matsch-Chart-Daten:', error);
          setMatschChartData(null);
        })
        .finally(() => {
          setMatschChartLoading(false);
        });
    }, 50);
    
    return () => clearTimeout(timer);
  }, [currentGroup?.id]);

  // 🚀 OPTIMIERT: Lade Schneider-Verlauf mit Backfill-Priorität
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    // ✅ Verzögerung für smooth Chart-Rendering
    const timer = setTimeout(() => {
      setSchneiderChartLoading(true);
      getOptimizedSchneiderChart(currentGroup.id)
        .then((result) => {
          setSchneiderChartData({
            labels: result.labels,
            datasets: result.datasets
          });
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Schneider-Chart-Daten:', error);
          setSchneiderChartData(null);
        })
        .finally(() => {
          setSchneiderChartLoading(false);
        });
    }, 50);
    
    return () => clearTimeout(timer);
  }, [currentGroup?.id]);

  // 🚀 OPTIMIERT: Lade Team-Strichdifferenz-Verlauf
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    const timer = setTimeout(() => {
      setTeamStricheChartLoading(true);
      getOptimizedTeamStricheChart(currentGroup.id)
        .then((result) => {
          setTeamStricheChartData({
            labels: result.labels,
            datasets: result.datasets
          });
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Team-Strichdifferenz-Chart-Daten:', error);
          setTeamStricheChartData(null);
        })
        .finally(() => {
          setTeamStricheChartLoading(false);
        });
    }, 50);
    
    return () => clearTimeout(timer);
  }, [currentGroup?.id]);

  // 🚀 OPTIMIERT: Lade Team-Punktedifferenz-Verlauf
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    const timer = setTimeout(() => {
      setTeamPointsChartLoading(true);
      getOptimizedTeamPointsChart(currentGroup.id)
        .then((result) => {
          setTeamPointsChartData({
            labels: result.labels,
            datasets: result.datasets
          });
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Team-Punktedifferenz-Chart-Daten:', error);
          setTeamPointsChartData(null);
        })
        .finally(() => {
          setTeamPointsChartLoading(false);
        });
    }, 50);
    
    return () => clearTimeout(timer);
  }, [currentGroup?.id]);

  // 🚀 OPTIMIERT: Lade Team-Matsch-Bilanz-Verlauf
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    const timer = setTimeout(() => {
      setTeamMatschChartLoading(true);
      getOptimizedTeamMatschChart(currentGroup.id)
        .then((result) => {
          setTeamMatschChartData({
            labels: result.labels,
            datasets: result.datasets
          });
        })
        .catch(error => {
          console.warn('Fehler beim Laden der Team-Matsch-Bilanz-Chart-Daten:', error);
          setTeamMatschChartData(null);
        })
        .finally(() => {
          setTeamMatschChartLoading(false);
        });
    }, 50);
    
    return () => clearTimeout(timer);
  }, [currentGroup?.id]);
  
  // ✅ NEU: Lade Team Event-Counts (Made/Received) direkt aus jassGameSummaries
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    getTeamEventCounts(currentGroup.id)
      .then((map) => {
        setTeamEventCountsMap(map);
      })
      .catch(error => {
        console.warn('Fehler beim Laden der Team Event-Counts:', error);
        setTeamEventCountsMap(new Map());
      });
  }, [currentGroup?.id]);

  // ✅ NEU: Lade Spieler-Event-Counts (Matsch, Schneider) direkt aus jassGameSummaries
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    Promise.all([
      import('@/services/chartDataService').then(m => m.getPlayerEventCounts(currentGroup.id, 'matsch')),
      import('@/services/chartDataService').then(m => m.getPlayerEventCounts(currentGroup.id, 'schneider'))
    ])
      .then(([matschMap, schneiderMap]) => {
        setPlayerMatschCounts(matschMap);
        setPlayerSchneiderCounts(schneiderMap);
      })
      .catch(error => {
        console.warn('Fehler beim Laden der Spieler Event-Counts:', error);
        setPlayerMatschCounts(new Map());
        setPlayerSchneiderCounts(new Map());
      });
  }, [currentGroup?.id]);

  // ✅ NEU: Lade Spieler-Striche/Punkte-Totals
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    Promise.all([
      getPlayerStrichePointsTotals(currentGroup.id, 'striche'),
      getPlayerStrichePointsTotals(currentGroup.id, 'points')
    ])
      .then(([stricheMap, pointsMap]) => {
        setPlayerStricheTotals(stricheMap);
        setPlayerPointsTotals(pointsMap);
      })
      .catch(error => {
        console.warn('Fehler beim Laden der Spieler Striche/Punkte-Totals:', error);
        setPlayerStricheTotals(new Map());
        setPlayerPointsTotals(new Map());
      });
  }, [currentGroup?.id]);

  // ✅ NEU: Lade Team-Striche/Punkte-Totals
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    Promise.all([
      getTeamStrichePointsTotals(currentGroup.id, 'striche'),
      getTeamStrichePointsTotals(currentGroup.id, 'points')
    ])
      .then(([stricheMap, pointsMap]) => {
        setTeamStricheTotals(stricheMap);
        setTeamPointsTotals(pointsMap);
      })
      .catch(error => {
        console.warn('Fehler beim Laden der Team Striche/Punkte-Totals:', error);
        setTeamStricheTotals(new Map());
        setTeamPointsTotals(new Map());
      });
  }, [currentGroup?.id]);

  // ✅ NEU: Lade Team-Weis-Punkte-Totals
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    getTeamWeisPointsTotals(currentGroup.id)
      .then((weisMap) => {
        setTeamWeisPointsTotals(weisMap);
      })
      .catch(error => {
        console.warn('Fehler beim Laden der Team Weis-Punkte-Totals:', error);
        setTeamWeisPointsTotals(new Map());
      });
  }, [currentGroup?.id]);

  if (groupStatus === 'loading' && !currentGroup) {
    return (
      <MainLayout>
        <div className={`flex flex-col items-center justify-start text-white ${layout.containerPadding} relative pt-8 pb-20`}>
          <div className={`w-full ${layout.containerMaxWidth} mx-auto`}>
            <div className="relative mb-4 mt-6 flex justify-center">
              <Skeleton className={`${layout.avatarSize} rounded-full border-4 border-gray-700`} />
            </div>
            <div className="w-full text-center mb-6 px-4">
              <Skeleton className={`${layout.skeletonTitleHeight} w-48 mx-auto mb-3`} />
              <Skeleton className={`${layout.skeletonTextHeight} w-64 mx-auto`} />
            </div>
            <div className="w-full">
              <Skeleton className="h-12 w-full rounded-lg mb-4" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }
  
  // ===== FRÜHE RETURN STATEMENTS VOM ORIGINAL =====
  
  if (isAuthenticated() && !isGuest && userGroups.length === 0 && !currentGroup) {
    return (
      <MainLayout>
        <div className={`flex flex-col items-center justify-center min-h-screen text-white ${layout.containerPadding}`}>
          <Image src="/welcome-guru.png" alt="Jassguru Logo" width={layout.isDesktop ? 200 : 150} height={layout.isDesktop ? 200 : 150} className="mb-8"/>
          
          {/* ✅ UX-VERBESSERUNG: Context-aware Willkommensnachricht */}
          {joinedGroupName ? (
            <>
              <h1 className={`${layout.titleSize} font-bold mb-3 text-center`}>
                {isNewMember ? '🎉 Willkommen bei jassguru.ch!' : '👋 Zurück bei jassguru.ch!'}
              </h1>
              <p className={`${layout.subtitleSize} text-gray-400 mb-6 text-center max-w-md`}>
                {isNewMember 
                  ? `Du bist erfolgreich der Gruppe "${joinedGroupName}" beigetreten. Jetzt kann das Jassen beginnen!`
                  : `Du bist bereits Mitglied der Gruppe "${joinedGroupName}". Schön, dass du wieder da bist!`
                }
              </p>
            </>
          ) : (
            <>
              <h1 className={`${layout.titleSize} font-bold mb-3 text-center`}>Willkommen bei jassguru.ch!</h1>
              <p className={`${layout.subtitleSize} text-gray-400 mb-6 text-center max-w-md`}>
                Du bist noch keiner Gruppe beigetreten. Erstelle eine neue Gruppe oder gib hier einen Einladungscode ein, um loszulegen.
              </p>
              <p className={`text-sm text-gray-500 mb-6 text-center max-w-md`}>
                Tipp: Klicke unten rechts in der Navigation auf "Hilfe", um alles über die App zu erfahren.
              </p>
                         </>
           )}
          
          {/* ✅ UX-VERBESSERUNG: Eingabefeld nur zeigen, wenn nicht bereits beigetreten */}
          {!joinedGroupName && (
            <div className="w-full max-w-sm">
              <JoinByInviteUI 
                inviteType="group" 
                onProcessInput={(inputValue) => handleProcessInviteInput(inputValue, "group")} 
                isLoading={isProcessingInvite} 
                showNotification={showNotification}
              />
            </div>
          )}
        </div>
      </MainLayout>
    );
  }

  if (isAuthenticated() && !isGuest && userGroups.length > 0 && !currentGroup) {
    return (
      <MainLayout>
        <div className={`flex flex-col items-center justify-center min-h-screen text-white ${layout.containerPadding}`}>
          <Image src="/welcome-guru.png" alt="Jassguru Logo" width={layout.isDesktop ? 200 : 150} height={layout.isDesktop ? 200 : 150} className="mb-8"/>
          <h1 className={`${layout.titleSize} font-bold mb-4`}>Wähle deine Jassgruppe</h1>
          <p className={`${layout.subtitleSize} text-gray-400 mb-6`}>Du bist Mitglied in mehreren Gruppen. Wähle eine aus oder tritt einer neuen bei.</p>
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
  
  // 🚨 KORRIGIERT: Unterscheide zwischen echtem Gastmodus und öffentlicher Ansicht
  if (isGuest && !isPublicView) {
    // NUR für echten Gastmodus (nicht öffentliche Ansicht), zeige Gastmodus-Screen
    return (
      <MainLayout>
        <div className={`flex flex-col items-center justify-center min-h-screen text-white ${layout.containerPadding}`}>
          <h1 className={`${layout.titleSize} font-bold mb-4 text-center`}>Gastmodus</h1>
          <p className={`${layout.subtitleSize} text-gray-400 mb-6 text-center max-w-sm`}>
            Im Gastmodus kannst du die App erkunden. Für vollen Funktionsumfang bitte anmelden.
          </p>
          {/* Ggf. CTA zum Anmelden/Registrieren */}
        </div>
      </MainLayout>
    );
  }
  
  // Fehlerbehandlung (getrennt von Gastmodus)
  if (groupStatus === 'error' && !currentGroup) {
    return (
      <MainLayout>
        <div className="text-center py-10">
          <p className="text-red-500">Fehler beim Laden der Gruppe: {groupError}</p>
        </div>
      </MainLayout>
    );
  }

  // ===== HAUPT-UI MIT KOMPLETTEM TAB-SYSTEM =====
  return (
    <>
      {/* 🚀 NEU: Public View Top-Bar nur bei Mobile */}
      {isPublicView && !layout.isDesktop && <PublicViewTopBar />}
      
      <MainLayout>
      <div id="group-view-container" className={`flex flex-col items-center justify-start text-white ${layout.containerPadding} relative pt-8 pb-20 lg:w-full lg:px-0`}>
        
        {/* 🎨 RESPONSIVE CONTAINER WRAPPER */}
        <div className={`w-full ${layout.containerMaxWidth} mx-auto lg:px-12 lg:py-8`}>
        
        {/* 🚀 AVATAR PRELOADER: Lädt alle relevanten Avatare unsichtbar vor */}
        {groupAvatarPhotoURLs.length > 0 && (
          <AvatarPreloader photoURLs={groupAvatarPhotoURLs} />
        )}
        
        {/* 🚨 NEU: SHARE BUTTON - IMMER SICHTBAR, WENN GRUPPE EXISTIERT */}
        {currentGroup && (
          <button 
            onClick={handleShareClick}
            className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center text-white/80 hover:text-white transition-all duration-200 rounded-full backdrop-blur-sm border hover:scale-105"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderColor: 'rgba(255, 255, 255, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `rgba(${themeStyles.primaryRgb}, 0.2)`;
              e.currentTarget.style.borderColor = `rgba(${themeStyles.primaryRgb}, 0.4)`;
              e.currentTarget.style.boxShadow = `0 0 15px rgba(${themeStyles.primaryRgb}, 0.3)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            aria-label="Gruppenstatistiken teilen"
          >
            <FaShareAlt size={16} />
          </button>
        )}
        
        {/* ✅ SCHRITT 2: HEADER MIT LOGO UND BUTTONS */}
        <div className="relative mb-4 mt-6 flex justify-center">
          <div 
            className={`relative ${layout.avatarSize} rounded-full overflow-hidden transition-all duration-300 flex items-center justify-center bg-gray-800 shadow-lg hover:shadow-xl hover:scale-105 border-4`}
            style={{
              borderColor: previewUrl ? 'rgba(147, 51, 234, 1)' : getHexColor(groupTheme),
              boxShadow: previewUrl 
                ? `0 0 25px rgba(147, 51, 234, 0.3)`
                : `0 0 20px ${getGlowColor(groupTheme)}, 0 4px 20px rgba(0,0,0,0.3)`
            }}
          >
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt="Vorschau Gruppenlogo"
                fill={true}
                className="object-cover"
              />
            ) : currentGroup?.logoUrl ? (
              <>
                {isImageLoading && (
                  <div className="absolute inset-0 bg-gray-800 animate-pulse" />
                )}
                <Image
                  src={currentGroup.logoUrl}
                  alt={`Logo ${currentGroup?.name ?? 'Gruppe'}`}
                  fill={true}
                  className={`object-cover transition-opacity duration-300 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
                  priority={true}
                  loading="eager"
                  sizes="128px"
                  onLoad={() => setIsImageLoading(false)}
                  onError={(e) => {
                    setIsImageLoading(false);
                    (e.target as HTMLImageElement).src = "/placeholder-logo.png";
                  }}
                />
              </>
            ) : (
              <div className="flex flex-col items-center">
                <Camera size={layout.isDesktop ? 60 : 40} className="text-gray-400 mb-1" />
                <span className={`${layout.miniTextSize} text-gray-500 text-center px-2`}>
                  {isAdmin ? "Gruppenbild hochladen" : "Kein Logo"}
                </span>
              </div>
            )}

            {isAdmin && (
              <button
                onClick={handleSelectClick}
                className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-60 transition-all duration-200"
                disabled={isUploading}
                aria-label="Gruppenlogo ändern"
              >
                <Camera className="text-white opacity-0 hover:opacity-100 transition-opacity duration-200" size={layout.isDesktop ? 48 : 32} />
              </button>
            )}
          </div>
        </div>

        <div className="w-full text-center mb-6 px-4">
          <h1 
            className={`${layout.titleSize} font-bold font-headline mb-1 text-white break-words transition-colors duration-300`}
          >
            {currentGroup?.name ?? (groupStatus === 'loading' ? <Skeleton className={`${layout.skeletonTitleHeight} w-48 mx-auto`} /> : 'Keine Gruppe ausgewählt')}
          </h1>
          <div className={`${layout.subtitleSize} text-gray-300 mx-auto max-w-xl break-words mt-3`}>
            {currentGroup ? (
              <FormattedDescription 
                description={currentGroup.description} 
                className="mx-auto" 
              />
            ) : groupStatus === 'loading' ? (
              <Skeleton className={`${layout.skeletonTextHeight} w-64 mx-auto`} />
            ) : null}
          </div>
          
          {/* ✅ SETUP-HINWEIS: Nur für Admins wenn < 4 Mitglieder */}
          {isAdmin && !membersLoading && members.length < 4 && (
            <div className="mt-4 mx-auto max-w-md">
              <div className={`bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-green-500/50 rounded-lg ${layout.cardPadding} backdrop-blur-sm`}>
                <h3 className={`text-green-300 font-medium ${layout.subheadingSize} text-center mb-3`}>
                  Willkommen! Lass uns deine Gruppe einrichten
                </h3>
                <p className={`text-green-200 ${layout.miniTextSize} text-center leading-relaxed mb-4`}>
                  Bevor du dein erstes Spiel startest, richte deine Gruppe nach deinen Präferenzen ein:
                </p>
                <ol className={`text-green-200 ${layout.miniTextSize} text-left space-y-2.5 mb-4 list-decimal pl-5`}>
                  <li>Klicke unten rechts auf <span className="font-semibold text-green-300">"Einstellungen"</span>, um deine Gruppeneinstellungen nach deinen Präferenzen anzupassen (Punkte, Striche, etc.)</li>
                  <li>Lade mindestens drei weitere Mitspieler ein, indem du unten auf <span className="font-semibold text-green-300">"Einladen"</span> klickst</li>
                </ol>
                <div className="mt-4 text-center pt-3 border-t border-green-500/30">
                  <span className={`text-green-400 ${layout.miniTextSize} font-medium`}>
                    Aktuell: {members.length}/4 Mitglieder
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedFile && previewUrl && (
          <div className="flex gap-2 justify-center mb-4">
            <Button
              onClick={handleUpload}
              size={layout.buttonSize}
              className="bg-green-600 hover:bg-green-700 flex items-center gap-1"
              disabled={!selectedFile || isUploading}
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
              onClick={handleCancelSelection}
              size={layout.buttonSize}
              className="bg-gray-600 hover:bg-gray-700 flex items-center gap-1"
              disabled={isUploading}
            >
              <X size={layout.buttonIconSize} /> Abbrechen
            </Button>
          </div>
        )}

        <div className="flex justify-center items-center gap-3 mb-6 px-4">
          {isAdmin && (
            <Button
              variant="ghost" 
              size={layout.buttonSize}
              onClick={handleInviteClick}
              className={`transition-all duration-200 hover:scale-105 ${
                members.length < 4 
                  ? 'text-white hover:text-white bg-gray-700/50 hover:bg-gray-600/70 border border-gray-500/40 animate-pulse [animation-duration:2s] drop-shadow-[0_0_6px_rgba(255,255,255,0.3)]' 
                  : 'text-gray-300 hover:text-white'
              }`}
              style={members.length >= 4 ? {
                backgroundColor: 'transparent',
                borderColor: 'transparent'
              } : {}}
              onMouseEnter={members.length >= 4 ? (e) => {
                e.currentTarget.style.backgroundColor = `rgba(${themeStyles.primaryRgb}, 0.1)`;
                e.currentTarget.style.borderColor = `rgba(${themeStyles.primaryRgb}, 0.3)`;
              } : undefined}
              onMouseLeave={members.length >= 4 ? (e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              } : undefined}
              title="Teilnehmer einladen"
            >
              <UserPlus size={layout.buttonIconSize} className="mr-1.5" /> Einladen
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="ghost" 
              size={layout.buttonSize}
              onClick={() => router.push("/groups/settings")}
              className={`transition-all duration-200 hover:scale-105 ${
                members.length < 4 
                  ? 'text-white hover:text-white bg-gray-700/50 hover:bg-gray-600/70 border border-gray-500/40 animate-pulse [animation-duration:2s] drop-shadow-[0_0_6px_rgba(255,255,255,0.3)]' 
                  : 'text-gray-300 hover:text-white'
              }`}
              style={members.length >= 4 ? {
                backgroundColor: 'transparent',
                borderColor: 'transparent'
              } : {}}
              onMouseEnter={members.length >= 4 ? (e) => {
                e.currentTarget.style.backgroundColor = `rgba(${themeStyles.primaryRgb}, 0.1)`;
                e.currentTarget.style.borderColor = `rgba(${themeStyles.primaryRgb}, 0.3)`;
              } : undefined}
              onMouseLeave={members.length >= 4 ? (e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              } : undefined}
              title="Einstellungen"
            >
              <Settings size={layout.buttonIconSize} className="mr-1.5" /> Einstellungen
            </Button>
          )}
        </div>
        
        {/* ✅ SCHRITT 3: KOMPLETTES TAB-SYSTEM */}
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
          <TabsList className={`grid w-full grid-cols-3 bg-gray-800/60 ${layout.mainTabContainerPadding} rounded-2xl sticky top-0 z-30 backdrop-blur-md shadow-lg`}>
            <TabsTrigger 
              value="statistics" 
              className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.mainTabPadding} ${layout.mainTabTextSize} font-semibold min-h-[44px] flex items-center justify-center py-5 relative`}
              style={{
                backgroundColor: activeMainTab === 'statistics' ? getTabActiveColor(groupTheme) : 'transparent'
              }}
            >
              <BarChart size={18} className="mr-2" /> Statistik
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-[1px] bg-gray-600/30"></div>
            </TabsTrigger>
            <TabsTrigger 
              value="archive"
              className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.mainTabPadding} ${layout.mainTabTextSize} font-semibold min-h-[44px] flex items-center justify-center py-5 relative`}
              style={{
                backgroundColor: activeMainTab === 'archive' ? getTabActiveColor(groupTheme) : 'transparent'
              }}
            >
              <Archive size={18} className="mr-2" /> Archiv
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-[1px] bg-gray-600/30"></div>
            </TabsTrigger>
            <TabsTrigger
              value="members" 
              className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.mainTabPadding} ${layout.mainTabTextSize} font-semibold min-h-[44px] flex items-center justify-center py-5`}
              style={{
                backgroundColor: activeMainTab === 'members' ? getTabActiveColor(groupTheme) : 'transparent'
              }}
            >
              <Users size={18} className="mr-2" /> Mitglieder
            </TabsTrigger>
          </TabsList>

          {/* STATISTIK TAB - forceMount für Data-Preloading */}
          <TabsContent 
            value="statistics" 
            forceMount
            className={activeMainTab !== 'statistics' ? 'hidden' : 'w-full mb-8'}
          >
            {statsError && !statsLoading && (
              <div className={`text-red-400 ${layout.bodySize} text-center ${layout.cardPadding} bg-red-900/30 rounded-md mb-4`}>
                Fehler beim Laden der Statistiken: {statsError}
              </div>
            )}
            {statsLoading ? (
              <div className="flex justify-center items-center py-10">
                <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Statistiken...</span>
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
                {/* Sticky Container für Sub-Tabs - mit 3px Abstand */}
                <div className={`sticky ${layout.isDesktop ? "top-[80px]" : "top-[64px]"} z-30 bg-transparent`}>
                  <TabsList className={`grid w-full grid-cols-3 bg-gray-800/60 ${layout.subTabContainerPadding} rounded-2xl backdrop-blur-md shadow-lg`}>
                    <TabsTrigger 
                      value="overview" 
                      className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.subTabPadding} text-sm font-medium flex items-center justify-center py-3 relative`}
                      style={{
                        backgroundColor: activeStatsSubTab === 'overview' ? getTabActiveColor(groupTheme) : 'transparent'
                      }}
                    >
                      <BarChart2 size={16} className="mr-1.5"/> Übersicht
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-[1px] bg-gray-600/30"></div>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="players" 
                      className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.subTabPadding} text-sm font-medium flex items-center justify-center py-3 relative`}
                      style={{
                        backgroundColor: activeStatsSubTab === 'players' ? getTabActiveColor(groupTheme) : 'transparent'
                      }}
                    >
                      <User size={16} className="mr-1.5"/> Spieler
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-[1px] bg-gray-600/30"></div>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="teams" 
                      className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-xl active:scale-[0.96] active:shadow-inner transition-all duration-100 ${layout.subTabPadding} text-sm font-medium flex items-center justify-center py-3`}
                      style={{
                        backgroundColor: activeStatsSubTab === 'teams' ? getTabActiveColor(groupTheme) : 'transparent'
                      }}
                    >
                      <Users size={16} className="mr-1.5"/> Teams
                    </TabsTrigger>
                  </TabsList>
                </div>
                
                {/* ÜBERSICHT TAB - MIT ECHTEN INHALTEN UND REFS */}
                <TabsContent 
                  value="overview"
                  className={`w-full rounded-lg ${layout.cardPadding}`}
                >
                  <div className={`${layout.sectionSpacing} ${layout.bodySize}`}>
                    {/* 1. Elo Verlauf - NEUE REIHENFOLGE */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center justify-between border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className="flex items-center">
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📈 Jass-Elo Verlauf</h3>
                        </div>
                        <a 
                          href="https://firebasestorage.googleapis.com/v0/b/jassguru.firebasestorage.app/o/Elo%20Ranking%20System.pdf?alt=media&token=eb789b69-9438-450f-b3a6-f7e2902a64f5" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-8 h-8 flex items-center justify-center rounded-full backdrop-blur-sm border transition-all duration-200 hover:scale-105"
                          style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' }}
                          title="Elo Ranking System öffnen"
                        >
                          <FaInfo size={12} className="text-white/80 hover:text-white" />
                        </a>
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
                            height={layout.isDesktop ? 400 : 300}
                            theme={groupTheme}
                            isDarkMode={true}
                            isEloChart={true} // 🎯 100er-Linie weiß bei Elo
                            showBaseline={true} // ✅ NEU: 100er-Linie für Elo-Chart
                            useThemeColors={false} // ✅ Ranking-Farben für verschiedene Spieler
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
                            animateImmediately={true} // 🚀 Oberster Chart animiert sofort
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

                    {/* 2. Elo Rangliste - NEUE REIHENFOLGE */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center justify-between border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className="flex items-center">
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Jass-Elo Rangliste</h3>
                        </div>
                        <a 
                          href="https://firebasestorage.googleapis.com/v0/b/jassguru.firebasestorage.app/o/Jass-Elo_Elo-basiertes%20Bewertungssystem%20fu%CC%88r%20den%20Schieber.pdf?alt=media&token=1e876a8c-180d-47a3-b0f8-ae893e44a5bd" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-8 h-8 flex items-center justify-center rounded-full backdrop-blur-sm border transition-all duration-200 hover:scale-105"
                          style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' }}
                          title="Jass-Elo Whitepaper öffnen"
                        >
                          <FaInfo size={12} className="text-white/80 hover:text-white" />
                        </a>
                      </div>
                      <div ref={overviewMostGamesRef} className={`${layout.cardPadding} space-y-0 pr-2`}>
                        {(() => {
                          // ✅ NEU: Zeige Ladebalken während Elo-Ratings geladen werden
                          if (eloRatingsLoading) {
                            return (
                              <div className="flex flex-col items-center justify-center py-8">
                                <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin mb-3`}></div>
                                <p className={`${layout.bodySize} text-gray-400`}>Lade Jass-Elo Ratings...</p>
                              </div>
                            );
                          }
                          
                          // Erstelle sortierte Liste aus Elo-Ratings
                          const ratingsArray = Array.from(playerRatings.values())
                            .filter(rating => rating && rating.rating > 0) // Nur Spieler mit Rating > 0
                            .sort((a, b) => b.rating - a.rating); // Nach Rating sortiert
                          
                          if (ratingsArray.length > 0) {
                            return ratingsArray.map((rating, index) => {
                              const playerData = members.find(m => (m.id || m.userId) === rating.id);
                              const playerId = rating.id;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=overview` : '#'} key={`eloRating-${rating.id}`} isClickable={!!playerId} className="block border-b border-gray-500/40 last:border-b-0">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} hover:bg-white/10 transition-colors`}>
                                    <div className="flex items-center">
                                      <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                      <ProfileImage 
                                        src={playerData?.photoURL} 
                                        alt={rating.displayName || 'Spieler'} 
                                        size={layout.profileImageListSize}
                                        className={`mr-2 ${theme.profileImage}`}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                        fallbackText={rating.displayName ? rating.displayName.charAt(0).toUpperCase() : '?'}
                                        context="list"
                                      />
                                      <span className={`${layout.bodySize} text-gray-300`}>{rating.displayName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className={`text-white ${layout.valueSize} font-medium mr-2`}>
                                        {Math.round(rating.rating)}
                                        {(() => {
                                          // 🚨 KORREKTUR: Versuche verschiedene Schlüssel für die Delta-Zuordnung
                                          let delta = playerDeltas.get(rating.id);
                                          
                                          // Fallback 1: Suche über Member-ID
                                          if (delta === undefined) {
                                            const member = members.find(m => (m.id || m.userId) === rating.id);
                                            if (member) {
                                              delta = playerDeltas.get(member.id || member.userId);
                                            }
                                          }
                                          
                                          // Fallback 2: Suche über displayName
                                          if (delta === undefined && rating.displayName) {
                                            const member = members.find(m => 
                                              m.displayName?.toLowerCase() === rating.displayName.toLowerCase()
                                            );
                                            if (member) {
                                              delta = playerDeltas.get(member.id || member.userId);
                                            }
                                          }
                                          
                                          if (delta !== undefined) {
                                            // 🛡️ FIX: Robuste Konvertierung - delta kann String, Objekt oder NaN sein
                                            const numericDelta = typeof delta === 'number' && !isNaN(delta) 
                                              ? delta 
                                              : (typeof delta === 'string' ? parseFloat(delta) : NaN);
                                            
                                            // Wenn keine gültige Zahl, zeige (0)
                                            if (isNaN(numericDelta)) {
                                              return (
                                                <span className={`ml-1 ${layout.smallTextSize} text-gray-400`}>
                                                  (0)
                                                </span>
                                              );
                                            }
                                            
                                            const roundedDelta = Math.round(numericDelta);
                                            // ✅ Wenn gerundetes Delta 0 ist, immer grau ohne Vorzeichen
                                            if (roundedDelta === 0) {
                                              return (
                                                <span className={`ml-1 ${layout.smallTextSize} text-gray-400`}>
                                                  (0)
                                                </span>
                                              );
                                            }
                                            return (
                                              <span className={`ml-1 ${layout.smallTextSize} ${numericDelta > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                ({numericDelta > 0 ? '+' : ''}{roundedDelta})
                                              </span>
                                            );
                                          }
                                          
                                          // 🚨 NEU: Zeige (0) in grau für Spieler ohne Delta
                                          return (
                                            <span className={`ml-1 ${layout.smallTextSize} text-gray-400`}>
                                              (0)
                                            </span>
                                          );
                                        })()}
                                      </span>
                                      <span className={`${layout.eloEmojiSize}`}>{rating.tierEmoji}</span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>Noch keine Elo-Ratings verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>


                    {/* 3. Trumpfansagen - NEUE REIHENFOLGE */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>Trumpfansagen Liste</h3>
                      </div>
                      <div ref={overviewTrumpfRef} className={`${layout.cardPadding} space-y-0 pr-2`}>
                        {trumpfStatistikArray.length > 0 ? (
                          trumpfStatistikArray.map((item, index) => {
                            // NEU: Logik für dynamische Anzeige
                            const cardStyle = currentGroup?.farbeSettings?.cardStyle || 'DE';
                            const mappedColorKey = toTitleCase(item.farbe);
                            const displayName = CARD_SYMBOL_MAPPINGS[mappedColorKey as JassColor]?.[cardStyle] ?? mappedColorKey;
                            
                            return (
                              <div key={`trumpf-${item.farbe}`} className={`flex justify-between items-center ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0 hover:bg-white/10 transition-colors`}>
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
                          })
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>Keine Trumpfstatistik verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 2.5. Trumpfverteilung - Chart */}
                    {trumpfDistributionData && (
                      <div className={`overflow-hidden`}>
                        <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📊 Trumpfansagen Total</h3>
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
                            centerText={groupStats?.totalTrumpfCount ? `${groupStats.totalTrumpfCount}` : undefined}
                            hideLegend={false}
                            legendPosition="right"
                            activeTab={activeMainTab}
                            activeSubTab={activeStatsSubTab}
                            animateImmediately={false} // ✅ Animation erst beim Scrollen
                          />
                        </div>
                      </div>
                    )}

                    {/* 4. Rundentempo - NEUE REIHENFOLGE */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>Rundentempo</h3>
                      </div>
                      <div ref={playerRoundTimeRef} className={`${layout.cardPadding} space-y-0 pr-2`}>
                        {(() => {
                          if (groupStats?.playerAllRoundTimes && groupStats.playerAllRoundTimes.length > 0) {
                            // Filter: Nur Spieler mit gültigen Rundendaten anzeigen
                            const playersWithRoundTimes = groupStats.playerAllRoundTimes.filter(player => 
                              player.value && player.value > 0
                            );
                            return playersWithRoundTimes.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              const playerId = playerData?.id || playerStat.playerId;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=overview` : '#'} key={`roundTime-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block border-b border-gray-500/40 last:border-b-0">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} hover:bg-white/10 transition-colors`}>
                                    <div className="flex items-center">
                                      <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                      <ProfileImage 
                                        src={playerData?.photoURL} 
                                        alt={playerStat.playerName} 
                                        size={layout.profileImageListSize}
                                        className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                        fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                        context="list"
                                      />
                                      <span className={`${layout.bodySize} text-gray-300`}>{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{formatMillisecondsDuration(playerStat.value)}</span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>Keine aktiven Spieler verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* 5. Durchschnittswerte & Details - NEUE REIHENFOLGE */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>Durchschnittswerte & Details</h3>
                      </div>
                      <div className={`${layout.cardPadding} space-y-0`}>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Dauer pro Partie:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgSessionDuration || '-'}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Dauer pro Spiel:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgGameDuration || '-'}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Spiele pro Partie:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgGamesPerSession ? groupStats.avgGamesPerSession.toFixed(1) : '-'}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Runden pro Spiel:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgRoundsPerGame ? groupStats.avgRoundsPerGame.toFixed(1) : '-'}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Matsch pro Spiel:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgMatschPerGame ? groupStats.avgMatschPerGame.toFixed(2) : '-'}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Rundentempo:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgRoundDuration || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* 6. Gruppenübersicht - NEUE REIHENFOLGE */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>Gruppenübersicht</h3>
                      </div>
                      <div className={`${layout.cardPadding} space-y-0`}>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Mitglieder:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.memberCount || 0}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Anzahl Partien:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.sessionCount || 0}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Anzahl Turniere:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.tournamentCount || 0}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Anzahl Spiele:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.gameCount || 0}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Gesamte Jass-Zeit:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.totalPlayTime || '-'}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Erster Jass:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.firstJassDate || '-'}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Letzter Jass:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.lastJassDate || '-'}</span>
                        </div>
                        <div className={`flex justify-between ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Hauptspielort:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>
                            {(() => {
                              const plz = (currentGroup as any)?.mainLocationZip;
                              if (!plz) return 'Nicht angegeben';
                              
                              const cityName = getOrtNameByPlz(plz);
                              return cityName ? `${plz} ${cityName}` : `PLZ ${plz}`;
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                {/* SPIELER TAB - ALLE 8 ECHTEN STATISTIKEN */}
                <TabsContent 
                  value="players"
                  className={`w-full rounded-lg ${layout.cardPadding}`}
                >
                  <div className={`${layout.sectionSpacing} ${layout.bodySize}`}>
                    {/* 1. Strichdifferenz Verlauf - NEUE REIHENFOLGE */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📈 Strichdifferenz Verlauf</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {stricheChartLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                            <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Chart-Daten...</span>
                          </div>
                        ) : stricheChartData && stricheChartData.datasets.length > 0 ? (
                          <PowerRatingChart 
                            data={stricheChartData}
                            title="Strichdifferenz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={groupTheme}
                            isDarkMode={true}
                            isEloChart={false} // 🎯 0er-Linie weiß bei Strichdifferenz
                            hideLegend={false}
                            showBaseline={true} // ✅ NEU: 0er-Linie für Differenz-Charts
                            useThemeColors={false} // ✅ Ranking-Farben für verschiedene Spieler
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
                            animateImmediately={false} // 🚀 Nur oberster Chart animiert sofort (with Intersection Observer)
                          />
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                            <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                            <p>Noch keine Strichdifferenz-Daten verfügbar</p>
                            <p className={`${layout.smallTextSize} mt-1`}>Chart wird angezeigt, sobald Spieler mindestens 2 Sessions haben</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 2. Strichdifferenz Rangliste - NEUE REIHENFOLGE */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Strichdifferenz Rangliste</h3>
                      </div>
                      <div ref={playerStricheDiffRef} className={`${layout.cardPadding} space-y-0 pr-2`}>
                        {playerStatsLoading ? (
                          <div className="flex flex-col items-center justify-center py-8">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin mb-3`}></div>
                            <p className={`${layout.bodySize} text-gray-400`}>Lade Rangliste...</p>
                          </div>
                        ) : stricheRanking.length > 0 ? (
                          stricheRanking.map((player) => {
                            const stricheTotals = playerStricheTotals.get(player.playerId) || { made: 0, received: 0 };
                            return (
                            <StatLink href={player.playerId ? `/profile/${player.playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`stricheDiff-${player.playerId}`} isClickable={!!player.playerId} className="block border-b border-gray-500/40 last:border-b-0">
                              <div className={`flex justify-between items-center ${layout.listItemPadding} hover:bg-white/10 transition-colors`}>
                                <div className="flex items-center">
                                  <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{player.rank}.</span>
                                  <ProfileImage 
                                    src={player.playerData?.photoURL} 
                                    alt={player.playerName} 
                                    size={layout.profileImageListSize}
                                    className={`mr-2 ${theme.profileImage}`}
                                    fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                    fallbackText={player.playerName ? player.playerName.charAt(0).toUpperCase() : '?'}
                                  />
                                  <span className={`${layout.bodySize} text-gray-300`}>{player.playerName}</span>
                                </div>
                                <div className="flex items-center">
                                  <span className="font-medium mr-2">
                                    <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                        ({stricheTotals.made}/{stricheTotals.received})
                                    </span>
                                    <span className={`${getValueColor(player.currentValue, false)} ${layout.valueSize} font-medium`}>
                                      {player.currentValue > 0 ? '+' : ''}{player.currentValue}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </StatLink>
                            );
                          })
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>
                            {playerStatsLoading ? 'Lade Daten...' : 'Keine Strichdifferenz-Daten verfügbar'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3. Punktedifferenz Verlauf - NEUE REIHENFOLGE */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📈 Punktedifferenz Verlauf</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {pointsChartLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                            <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Chart-Daten...</span>
                          </div>
                        ) : pointsChartData && pointsChartData.datasets.length > 0 ? (
                          <PowerRatingChart 
                            data={pointsChartData}
                            title="Punktedifferenz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={groupTheme}
                            isDarkMode={true}
                            isEloChart={false} // 🎯 0er-Linie weiß bei Punktedifferenz
                            hideLegend={false}
                            showBaseline={true} // ✅ NEU: 0er-Linie für Differenz-Charts
                            useThemeColors={false} // ✅ Ranking-Farben für verschiedene Spieler
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
                            animateImmediately={false} // 🚀 Nur oberster Chart animiert sofort
                            animationThreshold={0.7} // 🎯 Animation erst bei 70% sichtbar (viel später!)
                          />
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                            <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                            <p>Noch keine Punktedifferenz-Daten verfügbar</p>
                            <p className={`${layout.smallTextSize} mt-1`}>Chart wird angezeigt, sobald Spieler mindestens 2 Sessions haben</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 4. Punktedifferenz Rangliste - KORREKTE REIHENFOLGE */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Punktedifferenz Rangliste</h3>
                      </div>
                      <div ref={playerPointsDiffRef} className={`${layout.cardPadding} space-y-0 pr-2`}>
                        {playerStatsLoading ? (
                          <div className="flex flex-col items-center justify-center py-8">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin mb-3`}></div>
                            <p className={`${layout.bodySize} text-gray-400`}>Lade Rangliste...</p>
                          </div>
                        ) : pointsRanking.length > 0 ? (
                          pointsRanking.map((player) => {
                            const pointsTotals = playerPointsTotals.get(player.playerId) || { made: 0, received: 0 };
                            return (
                            <StatLink href={player.playerId ? `/profile/${player.playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`pointsDiff-${player.playerId}`} isClickable={!!player.playerId} className="block border-b border-gray-500/40 last:border-b-0">
                              <div className={`flex justify-between items-center ${layout.listItemPadding} hover:bg-white/10 transition-colors`}>
                                <div className="flex items-center">
                                  <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{player.rank}.</span>
                                  <ProfileImage 
                                    src={player.playerData?.photoURL} 
                                    alt={player.playerName} 
                                    size={layout.profileImageListSize}
                                    className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                    fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                    fallbackText={player.playerName ? player.playerName.charAt(0).toUpperCase() : '?'}
                                    context="list"
                                  />
                                  <span className={`${layout.bodySize} text-gray-300`}>{player.playerName}</span>
                                </div>
                                <div className="flex items-center">
                                  <span className="font-medium mr-2">
                                    <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                        ({formatPointsWithK(pointsTotals.made)}/{formatPointsWithK(pointsTotals.received)})
                                    </span>
                                    <span className={`${getValueColor(player.currentValue, false)} ${layout.valueSize} font-medium`}>
                                      {player.currentValue > 0 ? '+' : ''}{player.currentValue}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </StatLink>
                            );
                          })
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>
                            {playerStatsLoading ? 'Lade Daten...' : 'Keine Punktedifferenz-Daten verfügbar'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 5. Siegquote Partien - CHART */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📊 Siegquote Partien</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {(() => {
                          if (sessionWinRateRanking && sessionWinRateRanking.length > 0) {
                            const playersWithSessions = sessionWinRateRanking.filter(player => player.totalSessions > 0);
                            const chartData = playersWithSessions.map(player => ({
                              label: player.playerName,
                              winRate: player.winRate,
                              wins: player.wins,
                              losses: player.losses,
                              draws: player.draws
                            }));

                            if (chartData.length > 0) {
                              return (
                                <WinRateChart 
                                  data={chartData}
                                  title="Siegquote Partien"
                                  height={layout.isDesktop ? 350 : 250}
                                  theme={groupTheme}
                                  isDarkMode={true}
                                  activeTab={activeMainTab}
                                  activeSubTab={activeStatsSubTab}
                                  animateImmediately={false}
                                  hideLegend={true}
                                  minSessions={2}
                                  totalSessionsInGroup={groupStats?.sessionCount}
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

                    {/* 5.1 Siegquote Partien - Rangliste */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Siegquote Partien Rangliste</h3>
                      </div>
                      <div ref={playerWinRateSessionRef} className={`${layout.cardPadding} space-y-0 pr-2`}>
                        {playerStatsLoading ? (
                          <div className="flex flex-col items-center justify-center py-8">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin mb-3`}></div>
                            <p className={`${layout.bodySize} text-gray-400`}>Lade Rangliste...</p>
                          </div>
                        ) : (() => {
                          if (sessionWinRateRanking && sessionWinRateRanking.length > 0) {
                            // Filter: Nur Spieler mit Sessions anzeigen
                            const playersWithSessions = sessionWinRateRanking.filter(player => 
                              player.totalSessions > 0
                            );
                            return playersWithSessions.map((player, index) => {
                              return (
                                <StatLink href={player.playerId ? `/profile/${player.playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`winRateSession-${player.playerId}`} isClickable={!!player.playerId} className="block border-b border-gray-500/40 last:border-b-0">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} hover:bg-white/10 transition-colors`}>
                                    <div className="flex items-center">
                                      <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                      <ProfileImage 
                                        src={player.playerData?.photoURL} 
                                        alt={player.playerName} 
                                        size={layout.profileImageListSize}
                                        className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                        fallbackText={player.playerName ? player.playerName.charAt(0).toUpperCase() : '?'}
                                        context="list"
                                      />
                                      <span className={`${layout.bodySize} text-gray-300`}>{player.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      {/* ✅ KORREKT: Format (wins/losses/draws) z.B. (14/7/1) */}
                                      <span className="font-medium mr-2">
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({player.wins}/{player.losses}/{player.draws})
                                        </span>
                                        <span className={`${getValueColor((player.winRate * 100), true)} ${layout.valueSize} font-medium`}>
                                          {(player.winRate * 100).toFixed(1)}%
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>
                              {playerStatsLoading ? 'Lade Daten...' : 'Keine aktiven Spieler verfügbar'}
                            </div>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* 6. Siegquote Spiele - CHART */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📊 Siegquote Spiele</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {(() => {
                          if (gameWinRateRanking && gameWinRateRanking.length > 0) {
                            const playersWithGames = gameWinRateRanking.filter(player => player.totalGames > 0);
                            const chartData = playersWithGames.map(player => ({
                              label: player.playerName,
                              winRate: player.winRate,
                              wins: player.wins,
                              losses: player.losses
                            }));

                            if (chartData.length > 0) {
                              return (
                                <WinRateChart 
                                  data={chartData}
                                  title="Siegquote Spiele"
                                  height={layout.isDesktop ? 350 : 250}
                                  theme={groupTheme}
                                  isDarkMode={true}
                                  activeTab={activeMainTab}
                                  activeSubTab={activeStatsSubTab}
                                  animateImmediately={false}
                                  hideLegend={true}
                                  minSessions={2}
                                  totalSessionsInGroup={groupStats?.sessionCount}
                                  isGameWinRate={true}
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

                    {/* 6.1 Siegquote Spiele - Rangliste */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Siegquote Spiele Rangliste</h3>
                      </div>
                      <div ref={playerWinRateGameRef} className={`${layout.cardPadding} space-y-0 pr-2`}>
                        {playerStatsLoading ? (
                          <div className="flex flex-col items-center justify-center py-8">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin mb-3`}></div>
                            <p className={`${layout.bodySize} text-gray-400`}>Lade Rangliste...</p>
                          </div>
                        ) : (() => {
                          if (gameWinRateRanking && gameWinRateRanking.length > 0) {
                            // Filter: Nur Spieler mit Spielen anzeigen
                            const playersWithGames = gameWinRateRanking.filter(player => 
                              player.totalGames > 0
                            );
                            return playersWithGames.map((player, index) => {
                              return (
                                <StatLink href={player.playerId ? `/profile/${player.playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`winRateGame-${player.playerId}`} isClickable={!!player.playerId} className="block border-b border-gray-500/40 last:border-b-0">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} hover:bg-white/10 transition-colors`}>
                                    <div className="flex items-center">
                                      <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                      <ProfileImage 
                                        src={player.playerData?.photoURL} 
                                        alt={player.playerName} 
                                        size={layout.profileImageListSize}
                                        className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                        fallbackText={player.playerName ? player.playerName.charAt(0).toUpperCase() : '?'}
                                        context="list"
                                      />
                                      <span className={`${layout.bodySize} text-gray-300`}>{player.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      {/* ✅ KORREKT: Format (wins/losses) z.B. (47/40) */}
                                      <span className="font-medium mr-2">
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({player.wins}/{player.losses})
                                        </span>
                                        <span className={`${getValueColor((player.winRate * 100), true)} ${layout.valueSize} font-medium`}>
                                          {(player.winRate * 100).toFixed(1)}%
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>
                              {playerStatsLoading ? 'Lade Daten...' : 'Keine aktiven Spieler verfügbar'}
                            </div>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* 7. Matsch-Chart */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📈 Matsch-Bilanz-Verlauf</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {matschChartLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                            <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Chart-Daten...</span>
                          </div>
                        ) : matschChartData && matschChartData.datasets.length > 0 ? (
                          <PowerRatingChart 
                            data={matschChartData}
                            title="Matsch Bilanz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={groupTheme}
                            isDarkMode={true}
                            isEloChart={false} // 🎯 0er-Linie weiß bei Matsch Bilanz
                            hideLegend={false}
                            showBaseline={true} // ✅ NEU: 0er-Linie für Bilanz-Charts
                            useThemeColors={false} // ✅ Ranking-Farben für verschiedene Spieler
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
                            animateImmediately={false} // 🚀 Nur oberster Chart animiert sofort
                          />
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                            <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                            <p>Noch keine Matsch-Bilanz-Daten verfügbar</p>
                            <p className={`${layout.smallTextSize} mt-1`}>Chart wird angezeigt, sobald Spieler mindestens 2 Sessions haben</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Matsch-Bilanz Rangliste */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Matsch-Bilanz Rangliste</h3>
                      </div>
                      <div ref={playerMatschRateRef} className={`${layout.cardPadding} space-y-0 pr-2`}>
                        {matschRanking.length > 0 ? (
                          matschRanking.map((player) => {
                            const eventCounts = playerMatschCounts.get(player.playerId) || { eventsMade: 0, eventsReceived: 0 };
                              return (
                              <StatLink href={player.playerId ? `/profile/${player.playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`matschBilanz-${player.playerId}`} isClickable={!!player.playerId} className="block border-b border-gray-500/40 last:border-b-0">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} hover:bg-white/10 transition-colors`}>
                                    <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{player.rank}.</span>
                                      <ProfileImage 
                                      src={player.playerData?.photoURL} 
                                      alt={player.playerName} 
                                        size={layout.profileImageListSize}
                                        className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={player.playerName ? player.playerName.charAt(0).toUpperCase() : '?'}
                                        context="list"
                                      />
                                    <span className={`${layout.bodySize} text-gray-300`}>{player.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="font-medium mr-2">
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                        ({eventCounts.eventsMade}/{eventCounts.eventsReceived})
                                        </span>
                                      <span className={`${getValueColor(player.currentValue, false)} ${layout.valueSize} font-medium`}>
                                        {player.currentValue > 0 ? '+' : ''}{player.currentValue}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                          })
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>
                            {matschChartLoading ? 'Lade Daten...' : 'Keine Matsch-Bilanz-Daten verfügbar'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 8. Schneider-Chart */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📈 Schneider Bilanz Verlauf</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {schneiderChartLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                            <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Chart-Daten...</span>
                          </div>
                        ) : schneiderChartData && schneiderChartData.datasets.length > 0 ? (
                          <PowerRatingChart 
                            data={schneiderChartData}
                            title="Schneider Bilanz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={groupTheme}
                            isDarkMode={true}
                            isEloChart={false} // 🎯 0er-Linie weiß bei Schneider Bilanz
                            hideLegend={false}
                            showBaseline={true} // ✅ NEU: 0er-Linie für Bilanz-Charts
                            useThemeColors={false} // ✅ Ranking-Farben für verschiedene Spieler
                            collapseIfSinglePoint={true} // ✅ NEU: Einklappen bei nur einem Datenpunkt
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
                            animateImmediately={false} // 🚀 Nur oberster Chart animiert sofort
                          />
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                            <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                            <p>Noch keine Schneider-Bilanz-Daten verfügbar</p>
                            <p className={`${layout.smallTextSize} mt-1`}>Chart wird angezeigt, sobald Spieler mindestens 2 Sessions haben</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Schneider-Bilanz Rangliste */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Schneider-Bilanz Rangliste</h3>
                      </div>
                      <div ref={playerSchneiderRateRef} className={`${layout.cardPadding} space-y-0 pr-2`}>
                        {schneiderRanking.length > 0 ? (
                          schneiderRanking.map((player) => {
                            const eventCounts = playerSchneiderCounts.get(player.playerId) || { eventsMade: 0, eventsReceived: 0 };
                              return (
                              <StatLink href={player.playerId ? `/profile/${player.playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`schneiderBilanz-${player.playerId}`} isClickable={!!player.playerId} className="block border-b border-gray-500/40 last:border-b-0">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} hover:bg-white/10 transition-colors`}>
                                    <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{player.rank}.</span>
                                      <ProfileImage 
                                      src={player.playerData?.photoURL} 
                                      alt={player.playerName} 
                                        size={layout.profileImageListSize}
                                        className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={player.playerName ? player.playerName.charAt(0).toUpperCase() : '?'}
                                        context="list"
                                      />
                                    <span className={`${layout.bodySize} text-gray-300`}>{player.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="font-medium mr-2">
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                        ({eventCounts.eventsMade}/{eventCounts.eventsReceived})
                                        </span>
                                      <span className={`${getValueColor(player.currentValue, false)} ${layout.valueSize} font-medium`}>
                                        {player.currentValue > 0 ? '+' : ''}{player.currentValue}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                          })
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>
                            {schneiderChartLoading ? 'Lade Daten...' : 'Keine Schneider-Bilanz-Daten verfügbar'}
                          </div>
                        )}
                      </div>
                    </div>

                     {/* 7. Weisdifferenz */}
                     <div className={`overflow-hidden`}>
                       <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                         <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                         <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>Weisdifferenz</h3>
                       </div>
                       <div ref={playerWeisAvgRef} className={`${layout.cardPadding} space-y-0 pr-2`}>
                        {(() => {
                          if (groupStats?.playerWithHighestWeisDifference && groupStats.playerWithHighestWeisDifference.length > 0) {
                            // Filter: Nur Spieler mit Weis-Erfahrung anzeigen
                            const playersWithWeisExperience = groupStats.playerWithHighestWeisDifference.filter(player => 
                              (player.eventsMade && player.eventsMade > 0) || 
                              (player.eventsReceived && player.eventsReceived > 0)
                            );
                            return playersWithWeisExperience.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              const playerId = playerData?.id || playerStat.playerId;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`weisDifference-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block border-b border-gray-500/40 last:border-b-0">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} hover:bg-white/10 transition-colors`}>
                                    <div className="flex items-center">
                                      <span className={`${layout.smallTextSize} text-gray-400 min-w-6 ${layout.listItemNumberSpacing}`}>{index + 1}.</span>
                                      <ProfileImage 
                                        src={playerData?.photoURL} 
                                        alt={playerStat.playerName} 
                                        size={layout.profileImageListSize}
                                        className={`${layout.listItemImageSpacing} ${theme.profileImage}`}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                        fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                        context="list"
                                      />
                                      <span className={`${layout.bodySize} text-gray-300`}>{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="font-medium mr-2">
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({playerStat.eventsMade || 0}/{playerStat.eventsReceived || 0})
                                        </span>
                                        <span className={`${getValueColor(playerStat.value, false)} ${layout.valueSize} font-medium`}>
                                          {playerStat.value > 0 ? '+' : ''}{playerStat.value}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>Keine aktiven Spieler verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                {/* TEAMS TAB - ALLE 9 ECHTEN STATISTIKEN */}
                <TabsContent 
                  value="teams"
                  className={`w-full rounded-lg ${layout.cardPadding}`}
                >
                  <div className={`${layout.sectionSpacing} ${layout.bodySize}`}>
                    {/* 1. Team-Strichdifferenz Chart */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📈 Strichdifferenz Verlauf</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {teamStricheChartLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                            <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Chart-Daten...</span>
                          </div>
                        ) : teamStricheChartData && teamStricheChartData.datasets.length > 0 ? (
                          <PowerRatingChart 
                            data={teamStricheChartData}
                            title="Strichdifferenz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={groupTheme}
                            isDarkMode={true}
                            isEloChart={false} // 🎯 0er-Linie weiß bei Strichdifferenz
                            hideLegend={false}
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
                            animateImmediately={false} // ✅ Animation beim Tab-Wechsel
                          />
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                            <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                            <p>Noch keine Team-Strichdifferenz-Daten verfügbar</p>
                            <p className={`${layout.smallTextSize} mt-1`}>Chart wird angezeigt, sobald Teams mindestens 2 Sessions haben</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Team-Strichdifferenz Rangliste */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Strichdifferenz Rangliste</h3>
                      </div>
                      <div ref={teamStricheDiffRef} className={`${layout.cardPadding} space-y-0 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {teamStricheRanking.length > 0 ? (
                          teamStricheRanking.map((team, index) => {
                              // Extrahiere Spieler-Namen aus Team-Namen
                              const names = team.teamName.split(' & ');
                              return (
                              <div key={`team-${team.teamName}`} className={`flex justify-between items-center ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0 hover:bg-white/10 transition-colors`}>
                                  <div className="flex items-center">
                                  <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                    <div className="flex mr-2">
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(names[0], members)} 
                                        alt={names[0]} 
                                        size={layout.profileImageListSize}
                                        className={`border-2 border-gray-800 ${theme.profileImage}`}
                                        style={{ zIndex: 1 }}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                        fallbackText={names[0].charAt(0).toUpperCase()}
                                        context="list"
                                      />
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(names[1], members)} 
                                        alt={names[1]} 
                                        size={layout.profileImageListSize}
                                        className={`border-2 border-gray-800 ${theme.profileImage}`}
                                        style={{ marginLeft: layout.teamAvatarOverlap, zIndex: 0 }}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                        fallbackText={names[1] ? names[1].charAt(0).toUpperCase() : '?'}
                                        context="list"
                                      />
                                    </div>
                                    <span className={`${layout.bodySize} text-gray-300`}>{team.teamName}</span>
                                  </div>
                                  <span className="font-medium mr-2">
                                    <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                    ({team.made}/{team.received})
                                    </span>
                                  <span className={`${getValueColor(team.bilanz, false)} ${layout.valueSize} font-medium`}>
                                    {team.bilanz > 0 ? '+' : ''}{team.bilanz}
                                    </span>
                                  </span>
                                </div>
                              );
                            })
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>
                            {teamStricheChartLoading ? 'Lade Daten...' : 'Keine Strichdifferenz-Daten verfügbar'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 2. Team-Punktedifferenz Chart */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📈 Punktedifferenz Verlauf</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {teamPointsChartLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                            <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Chart-Daten...</span>
                          </div>
                        ) : teamPointsChartData && teamPointsChartData.datasets.length > 0 ? (
                          <PowerRatingChart 
                            data={teamPointsChartData}
                            title="Punktedifferenz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={groupTheme}
                            isDarkMode={true}
                            isEloChart={false} // 🎯 0er-Linie weiß bei Punktedifferenz
                            hideLegend={false}
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
                            animateImmediately={false} // ✅ Animation beim Tab-Wechsel
                          />
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                            <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                            <p>Noch keine Team-Punktedifferenz-Daten verfügbar</p>
                            <p className={`${layout.smallTextSize} mt-1`}>Chart wird angezeigt, sobald Teams mindestens 2 Sessions haben</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Team-Punktedifferenz Rangliste */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Punktedifferenz Rangliste</h3>
                      </div>
                      <div ref={teamPointsDiffRef} className={`${layout.cardPadding} space-y-0 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {teamPointsRanking.length > 0 ? (
                          teamPointsRanking.map((team, index) => {
                              // Extrahiere Spieler-Namen aus Team-Namen
                              const names = team.teamName.split(' & ');
                              return (
                              <div key={`team-${team.teamName}`} className={`flex justify-between items-center ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0 hover:bg-white/10 transition-colors`}>
                                  <div className="flex items-center">
                                  <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                    <div className="flex mr-2">
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(names[0], members)} 
                                        alt={names[0]} 
                                        size={layout.profileImageListSize}
                                        className={`border-2 border-gray-800 ${theme.profileImage}`}
                                        style={{ zIndex: 1 }}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                        fallbackText={names[0].charAt(0).toUpperCase()}
                                        context="list"
                                      />
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(names[1], members)} 
                                        alt={names[1]} 
                                        size={layout.profileImageListSize}
                                        className={`border-2 border-gray-800 ${theme.profileImage}`}
                                        style={{ marginLeft: layout.teamAvatarOverlap, zIndex: 0 }}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                        fallbackText={names[1] ? names[1].charAt(0).toUpperCase() : '?'}
                                        context="list"
                                      />
                                    </div>
                                    <span className={`${layout.bodySize} text-gray-300`}>{team.teamName}</span>
                                  </div>
                                  <span className="font-medium mr-2">
                                    <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                    ({formatPointsWithK(team.made)}/{formatPointsWithK(team.received)})
                                    </span>
                                  <span className={`${getValueColor(team.bilanz, false)} ${layout.valueSize} font-medium`}>
                                    {team.bilanz > 0 ? '+' : ''}{team.bilanz}
                                    </span>
                                  </span>
                                </div>
                              );
                            })
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>
                            {teamPointsChartLoading ? 'Lade Daten...' : 'Keine Punktedifferenz-Daten verfügbar'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3. Siegquote (Partien) - CHART */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📊 Siegquote Partien</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {(() => {
                          if (groupStats?.teamWithHighestWinRateSession && groupStats.teamWithHighestWinRateSession.length > 0) {
                            const teamsWithSessions = groupStats.teamWithHighestWinRateSession.filter(team => team.eventsPlayed && team.eventsPlayed > 0);
                            const chartData = teamsWithSessions.map(team => ({
                              label: team.names.join(' & '),
                              winRate: Number(team.value),
                              wins: Math.round(Number(team.value) * team.eventsPlayed),
                              losses: team.eventsPlayed - Math.round(Number(team.value) * team.eventsPlayed)
                            }));

                            if (chartData.length > 0) {
                              return (
                                <WinRateChart 
                                  data={chartData}
                                  title="Siegquote Partien"
                                  height={layout.isDesktop ? 350 : 250}
                                  theme={groupTheme}
                                  isDarkMode={true}
                                  activeTab={activeMainTab}
                                  activeSubTab={activeStatsSubTab}
                                  animateImmediately={false}
                                  hideLegend={true}
                                  minSessions={2}
                                  totalSessionsInGroup={groupStats?.sessionCount}
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

                    {/* 3.1 Siegquote (Partien) - Rangliste - ✅ KORREKT: eventsPlayed zeigt nur entschiedene Sessions */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Siegquote Partien Rangliste</h3>
                      </div>
                      <div ref={teamWinRateSessionRef} className={`${layout.cardPadding} space-y-0 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {groupStats?.teamWithHighestWinRateSession && groupStats.teamWithHighestWinRateSession.length > 0 ? (
                          groupStats.teamWithHighestWinRateSession
                            .filter(team => 
                              team.eventsPlayed && team.eventsPlayed > 0
                            )
                            .map((team, index) => (
                            <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0 hover:bg-white/10 transition-colors`}>
                              <div className="flex items-center">
                                <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                <div className="flex mr-2">
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[0], members)} 
                                    alt={team.names[0]} 
                                    size={layout.profileImageListSize}
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    style={{ zIndex: 1 }}
                                    fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                    fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    context="list"
                                  />
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[1], members)} 
                                    alt={team.names[1]} 
                                    size={layout.profileImageListSize}
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    style={{ marginLeft: layout.teamAvatarOverlap, zIndex: 0 }}
                                    fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                    fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    context="list"
                                  />
                                </div>
                                <span className={`${layout.bodySize} text-gray-300`}>{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white font-medium mr-2">
                                {(typeof team.value === 'number' && team.eventsPlayed && team.eventsPlayed > 0) && (
                                  <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                    ({Math.round(team.value * team.eventsPlayed)}/{team.eventsPlayed})
                                  </span>
                                )}
                                <span className={`${getValueColor((Number(team.value) * 100), true)} ${layout.valueSize} font-medium`}>
                                  {(Number(team.value) * 100).toFixed(1)}%
                                </span>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 4. Siegquote (Spiele) - CHART */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📊 Siegquote Spiele</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {(() => {
                          if (groupStats?.teamWithHighestWinRateGame && groupStats.teamWithHighestWinRateGame.length > 0) {
                            const teamsWithGames = groupStats.teamWithHighestWinRateGame.filter(team => team.eventsPlayed && team.eventsPlayed > 0);
                            const chartData = teamsWithGames.map(team => ({
                              label: team.names.join(' & '),
                              winRate: Number(team.value),
                              wins: Math.round(Number(team.value) * team.eventsPlayed),
                              losses: team.eventsPlayed - Math.round(Number(team.value) * team.eventsPlayed)
                            }));

                            if (chartData.length > 0) {
                              return (
                                <WinRateChart 
                                  data={chartData}
                                  title="Siegquote Spiele"
                                  height={layout.isDesktop ? 350 : 250}
                                  theme={groupTheme}
                                  isDarkMode={true}
                                  activeTab={activeMainTab}
                                  activeSubTab={activeStatsSubTab}
                                  animateImmediately={false}
                                  hideLegend={true}
                                  minSessions={2}
                                  totalSessionsInGroup={groupStats?.sessionCount}
                                  isGameWinRate={true}
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

                    {/* 4.1 Siegquote (Spiele) - Rangliste */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Siegquote Spiele Rangliste</h3>
                      </div>
                      <div ref={teamWinRateGameRef} className={`${layout.cardPadding} space-y-0 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {groupStats?.teamWithHighestWinRateGame && groupStats.teamWithHighestWinRateGame.length > 0 ? (
                          groupStats.teamWithHighestWinRateGame
                            .filter(team => 
                              team.eventsPlayed && team.eventsPlayed > 0
                            )
                            .map((team, index) => (
                            <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0 hover:bg-white/10 transition-colors`}>
                              <div className="flex items-center">
                                <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                <div className="flex mr-2">
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[0], members)} 
                                    alt={team.names[0]} 
                                    size={layout.profileImageListSize}
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    style={{ zIndex: 1 }}
                                    fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                    fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    context="list"
                                  />
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[1], members)} 
                                    alt={team.names[1]} 
                                    size={layout.profileImageListSize}
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    style={{ marginLeft: layout.teamAvatarOverlap, zIndex: 0 }}
                                    fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                    fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    context="list"
                                  />
                                </div>
                                <span className={`${layout.bodySize} text-gray-300`}>{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white font-medium mr-2">
                                {(typeof team.value === 'number' && team.eventsPlayed && team.eventsPlayed > 0) && (
                                  <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                    ({Math.round(team.value * team.eventsPlayed)}/{team.eventsPlayed})
                                  </span>
                                )}
                                <span className={`${getValueColor((Number(team.value) * 100), true)} ${layout.valueSize} font-medium`}>
                                  {(Number(team.value) * 100).toFixed(1)}%
                                </span>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 5. Team-Matsch-Bilanz Chart */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>📈 Matsch-Bilanz-Verlauf</h3>
                      </div>
                      <div className={`${layout.isDesktop ? 'px-2 py-4' : 'px-1 py-3'}`}>
                        {teamMatschChartLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <div className={`${layout.spinnerSize} rounded-full border-2 border-t-transparent border-white animate-spin`}></div>
                            <span className={`ml-3 ${layout.bodySize} text-gray-300`}>Lade Chart-Daten...</span>
                          </div>
                        ) : teamMatschChartData && teamMatschChartData.datasets.length > 0 ? (
                          <PowerRatingChart 
                            data={teamMatschChartData}
                            title="Matsch-Bilanz"
                            height={layout.isDesktop ? 400 : 300}
                            theme={groupTheme}
                            isDarkMode={true}
                            isEloChart={false} // 🎯 0er-Linie weiß bei Matsch Bilanz
                            hideLegend={false}
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
                            animateImmediately={false} // ✅ Animation beim Tab-Wechsel
                          />
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                            <BarChart3 size={32} className="mx-auto mb-3 text-gray-500" />
                            <p>Noch keine Team-Matsch-Bilanz-Daten verfügbar</p>
                            <p className={`${layout.smallTextSize} mt-1`}>Chart wird angezeigt, sobald Teams mindestens 2 Sessions haben</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Team-Matsch-Bilanz Rangliste */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>🏆 Matsch-Bilanz Rangliste</h3>
                      </div>
                      <div ref={teamMatschRateRef} className={`${layout.cardPadding} space-y-0 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {(() => {
                          // ✅ DIREKT aus teamEventCountsMap: Zeigt ALLE Teams, nicht nur Top 15!
                          const allTeamsRanking = Array.from(teamEventCountsMap.entries())
                            .map(([teamName, counts]) => ({
                              teamName,
                              bilanz: counts.eventsMade - counts.eventsReceived,
                              eventsMade: counts.eventsMade,
                              eventsReceived: counts.eventsReceived
                            }))
                            .filter(team => team.eventsMade > 0 || team.eventsReceived > 0)
                            .sort((a, b) => b.bilanz - a.bilanz);
                          
                          if (allTeamsRanking.length === 0) {
                            return (
                              <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>
                                {teamMatschChartLoading ? 'Lade Daten...' : 'Keine Matsch-Bilanz-Daten verfügbar'}
                              </div>
                            );
                          }
                          
                          return allTeamsRanking.map((team, index) => {
                            const names = team.teamName.split(' & ');
                                return (
                              <div key={`team-${team.teamName}`} className={`flex justify-between items-center ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0 hover:bg-white/10 transition-colors`}>
                                    <div className="flex items-center">
                                  <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                      <div className="flex mr-2">
                                        <ProfileImage 
                                          src={findPlayerPhotoByName(names[0], members)} 
                                          alt={names[0]} 
                                          size={layout.profileImageListSize}
                                          className={`border-2 border-gray-800 ${theme.profileImage}`}
                                          style={{ zIndex: 1 }}
                                          fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                          fallbackText={names[0].charAt(0).toUpperCase()}
                                          context="list"
                                        />
                                        <ProfileImage 
                                          src={findPlayerPhotoByName(names[1], members)} 
                                          alt={names[1]} 
                                          size={layout.profileImageListSize}
                                          className={`border-2 border-gray-800 ${theme.profileImage}`}
                                          style={{ marginLeft: layout.teamAvatarOverlap, zIndex: 0 }}
                                          fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                          fallbackText={names[1] ? names[1].charAt(0).toUpperCase() : '?'}
                                          context="list"
                                        />
                                      </div>
                                      <span className={`${layout.bodySize} text-gray-300`}>{team.teamName}</span>
                                    </div>
                                    <div className="flex items-center">
                                  <span className="font-medium mr-2">
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                      ({team.eventsMade}/{team.eventsReceived})
                                        </span>
                                    <span className={`${getValueColor(team.bilanz, false)} ${layout.valueSize} font-medium`}>
                                      {team.bilanz > 0 ? '+' : ''}{team.bilanz}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                );
                              });
                        })()}
                      </div>
                    </div>

                    {/* 6. Schneider-Bilanz */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>Schneider-Bilanz</h3>
                      </div>
                      <div ref={teamSchneiderRateRef} className={`${layout.cardPadding} space-y-0 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {(() => {
                          // ✅ KORRIGIERT: Verwende teamWithHighestSchneiderBilanz statt teamWithHighestSchneiderRate
                          const teamSchneiderData = groupStats?.teamWithHighestSchneiderBilanz || groupStats?.teamWithHighestSchneiderRate;
                          if (teamSchneiderData && teamSchneiderData.length > 0) {
                            // Filter: Nur Teams mit Schneider-Erfahrung anzeigen
                            const teamsWithSchneiderEvents = teamSchneiderData.filter(team => 
                              (team.eventsMade && team.eventsMade > 0) || 
                              (team.eventsReceived && team.eventsReceived > 0) ||
                              (team.value && team.value !== 0)
                            );
                            return teamsWithSchneiderEvents.map((team, index) => (
                              <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0 hover:bg-white/10 transition-colors`}>
                                <div className="flex items-center">
                                  <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                  <div className="flex mr-2">
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[0], members)} 
                                      alt={team.names[0]} 
                                      size={layout.profileImageListSize}
                                      className={`border-2 border-gray-800 ${theme.profileImage}`}
                                      style={{ zIndex: 1 }}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    />
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[1], members)} 
                                      alt={team.names[1]} 
                                      size={layout.profileImageListSize}
                                      className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    style={{ marginLeft: layout.teamAvatarOverlap, zIndex: 0 }}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    />
                                  </div>
                                  <span className={`${layout.bodySize} text-gray-300`}>{team.names.join(' & ')}</span>
                                </div>
                                <div className="flex items-center">
                                  <span className="text-white font-medium mr-2">
                                    <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                      ({team.eventsMade || 0}/{team.eventsReceived || 0})
                                    </span>
                                    <span className={`${getValueColor(Math.round(Number(team.value)), false)} ${layout.valueSize} font-medium`}>
                                      {team.value > 0 ? '+' : ''}{Math.round(Number(team.value))}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            ));
                          } else {
                            return <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>

                     {/* 7. Weisdifferenz */}
                     <div className={`overflow-hidden`}>
                       <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                         <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                         <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>Weisdifferenz</h3>
                       </div>
                       <div ref={teamWeisAvgRef} className={`${layout.cardPadding} space-y-0 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {(() => {
                          // ✅ DIREKT aus teamWeisPointsTotals: Zeigt ALLE Teams, nicht nur 12!
                          const allTeamsRanking = Array.from(teamWeisPointsTotals.entries())
                            .map(([teamName, totals]) => ({
                              teamName,
                              differenz: totals.made - totals.received,
                              made: totals.made,
                              received: totals.received
                            }))
                            .filter(team => team.made > 0 || team.received > 0)
                            .sort((a, b) => b.differenz - a.differenz);
                          
                          if (allTeamsRanking.length === 0) {
                            return (
                              <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>
                                Keine Weis-Daten verfügbar
                              </div>
                            );
                          }
                          
                          return allTeamsRanking.map((team, index) => {
                            const names = team.teamName.split(' & ');
                            return (
                              <div key={`team-${team.teamName}`} className={`flex justify-between items-center ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0 hover:bg-white/10 transition-colors`}>
                                <div className="flex items-center">
                                  <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                  <div className="flex mr-2">
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(names[0], members)} 
                                      alt={names[0]} 
                                      size={layout.profileImageListSize}
                                      className={`border-2 border-gray-800 ${theme.profileImage}`}
                                      style={{ zIndex: 1 }}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={names[0].charAt(0).toUpperCase()}
                                      context="list"
                                    />
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(names[1], members)} 
                                      alt={names[1]} 
                                      size={layout.profileImageListSize}
                                      className={`border-2 border-gray-800 ${theme.profileImage}`}
                                      style={{ marginLeft: layout.teamAvatarOverlap, zIndex: 0 }}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={names[1] ? names[1].charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                  </div>
                                  <span className={`${layout.bodySize} text-gray-300`}>{team.teamName}</span>
                                </div>
                                <div className="flex items-center">
                                  <span className="font-medium mr-2">
                                    <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                      ({team.made}/{team.received})
                                    </span>
                                    <span className={`${getWeisDifferenceColor(team.differenz)} ${layout.valueSize} font-medium`}>
                                      {team.differenz > 0 ? '+' : ''}{team.differenz}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* 9. Rundentempo */}
                    <div className={`overflow-hidden`}>
                      <div className={`flex items-center border-b-2 border-gray-500/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-bold font-headline text-white`}>Rundentempo</h3>
                      </div>
                      <div ref={teamRoundTimeRef} className={`${layout.cardPadding} space-y-0 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {groupStats?.teamWithFastestRounds && groupStats.teamWithFastestRounds.length > 0 ? (
                          groupStats.teamWithFastestRounds
                            .filter(team => 
                              team.value && team.value > 0
                            )
                            .map((team, index) => (
                            <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} border-b border-gray-500/40 last:border-b-0 hover:bg-white/10 transition-colors`}>
                              <div className="flex items-center">
                                <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                <div className="flex mr-2">
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[0], members)} 
                                    alt={team.names[0]} 
                                    size={layout.profileImageListSize}
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    style={{ zIndex: 1 }}
                                    fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                    fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    context="list"
                                  />
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[1], members)} 
                                    alt={team.names[1]} 
                                    size={layout.profileImageListSize}
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    style={{ marginLeft: layout.teamAvatarOverlap, zIndex: 0 }}
                                    fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                    fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    context="list"
                                  />
                                </div>
                                <span className={`${layout.bodySize} text-gray-300`}>{team.names.join(' & ')}</span>
                              </div>
                              <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>{formatMillisecondsDuration(Number(team.value))}</span>
                            </div>
                          ))
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>
                </Tabs>
            )}
          </TabsContent>

          {/* ARCHIV TAB */}
          <TabsContent value="archive" className={`w-full rounded-lg ${layout.cardPadding} mb-8`}>
            {/* FEHLER CASE: Sessions Error UND leeres Archiv */}
            {sessionsError && !sessionsLoading && !tournamentsLoading && combinedArchiveItems.length === 0 && (
                <div className="text-center text-gray-400 py-6 px-4">
                    <Archive size={32} className="mx-auto mb-3 text-gray-500" />
                    <p className={`font-semibold text-gray-300 ${layout.bodySize}`}>Keine Einträge im Archiv</p>
                    <p className={`${layout.smallTextSize}`}>Abgeschlossene Partien und Turniere werden hier angezeigt.</p>
                </div>
            )}
            
            {/* LOADING STATE: Sessions oder Tournaments laden noch */}
            {(sessionsLoading || tournamentsLoading) && (!sessionsError && !tournamentsError) && (
              <div className="flex justify-center items-center py-10">
                <div className="h-8 w-8 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                <span className={`ml-3 text-gray-300 ${layout.bodySize}`}>Lade Archiv...</span>
              </div>
            )}
            
            {/* EMPTY STATE: Keine Einträge, aber kein Fehler */}
            {!sessionsLoading && !tournamentsLoading && combinedArchiveItems.length === 0 && !sessionsError && !tournamentsError && (
                <div className="text-center text-gray-400 py-6 px-4">
                    <Archive size={32} className="mx-auto mb-3 text-gray-500" />
                    <p className={`font-semibold text-gray-300 ${layout.bodySize}`}>Keine Einträge im Archiv</p>
                    <p className={`${layout.smallTextSize}`}>Abgeschlossene Partien und Turniere werden hier angezeigt.</p>
                </div>
            )}
            
            {/* ERROR STATE: Spezifische Fehler für Sessions/Tournaments */}
            {((sessionsError && completedSessions.length === 0) || (tournamentsError && groupTournaments.length === 0)) && !sessionsLoading && !tournamentsLoading && (
              <div className="text-center text-red-400 py-6 px-4 bg-red-900/20 rounded-md">
                <AlertTriangle size={32} className="mx-auto mb-3 text-red-500" />
                <p className={`font-semibold text-red-300 ${layout.bodySize}`}>Fehler beim Laden des Archivs</p>
                {sessionsError && <p className={`${layout.smallTextSize}`}>Sessions: {sessionsError}</p>}
                {tournamentsError && <p className={`${layout.smallTextSize}`}>Turniere: {tournamentsError}</p>}
              </div>
            )}
            
            {/* SUCCESS STATE: Archiv mit Einträgen */}
            {!sessionsLoading && !tournamentsLoading && combinedArchiveItems.length > 0 && (
              <div className="space-y-4">
                {sortedYears.map(year => (
                  <div key={year}>
                    <h3 className="text-xl font-bold text-white text-center mb-3">{year}</h3>
                    <p className={`${layout.smallTextSize} text-gray-400 mb-3 italic text-center`}>
                      Ergebnis auswählen für Details:
                    </p>
                    <div className="space-y-2">
                      {groupedArchiveByYear[year].map(renderArchiveItem)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* MITGLIEDER TAB */}
          <TabsContent 
            value="members" 
            className={`w-full rounded-lg ${layout.cardPadding} mb-8`}
          >
            {membersError && !membersLoading && (
                <div className={`text-red-400 ${layout.smallTextSize} text-center p-4 bg-red-900/30 rounded-md`}>
                    Fehler: {membersError}
                </div>
            )}
            <GroupMemberList 
              members={members.map(member => {
                // ✅ KORRIGIERT: Verwende Spielezahl aus normalen Sessions (ohne Turniere) dieser Gruppe
                const playerId = member.id || member.userId;
                const gamesInGroup = playerId ? playerGamesInGroup.get(playerId) || 0 : 0;
                
                  return {
                    ...member,
                    stats: {
                      ...(member.stats || {}),
                    gamesPlayed: gamesInGroup
                    }
                  } as FirestorePlayer;
              }).sort((a, b) => (b.stats?.gamesPlayed || 0) - (a.stats?.gamesPlayed || 0))} 
              isLoading={membersLoading} 
            />
          </TabsContent>

        </Tabs>

        {/* HIDDEN FILE INPUT (ORIGINAL) */}
        {/* 🚨 KORREKTUR: NICHT NUR KOMMENTAR - ECHTES FILE INPUT WIE IM ORIGINAL! */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
                            accept="image/jpeg, image/jpg, image/png, image/webp, image/gif, image/heic, image/heif"
          className="hidden"
          disabled={isUploading}
        />

        {/* 🎨 RESPONSIVE CONTAINER WRAPPER CLOSING TAG */}
        </div>

      </div>

      {/* MODALS */}
      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={handleCloseInviteModal}
        isLoading={isGeneratingInvite}
        error={inviteError}
        inviteToken={inviteToken}
        groupName={currentGroup?.name || "Gruppe"}
        onGenerateNew={handleGenerateNewInvite}
      />

      {/* 🚨 KORREKTUR: ECHTES IMAGE CROP MODAL WIE IM ORIGINAL! */}
      <ImageCropModal
        isOpen={cropModalOpen}
        onClose={() => handleCropComplete(null)}
        imageSrc={imageToCrop}
        onCropComplete={handleCropComplete}
      />

      {/* LEGAL FOOTER */}
      <LegalFooter />

    </MainLayout>
    </>
  );
};
