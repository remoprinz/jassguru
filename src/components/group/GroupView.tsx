import React, { useRef, useMemo, useState, useEffect } from "react";
import Image from "next/image";
import MainLayout from "@/components/layout/MainLayout";
import { GroupSelector } from "@/components/group/GroupSelector";
import JoinByInviteUI from "@/components/ui/JoinByInviteUI";
import {Button} from "@/components/ui/button";
import {Users, Settings, UserPlus, Camera, Upload, X, BarChart, Archive, BarChart2, CheckCircle, XCircle, MinusCircle, Award as AwardIcon, AlertTriangle, BarChart3, Info, User} from "lucide-react";
import { FiShare2 } from 'react-icons/fi'; // 🚨 NEU: Share Button Icons
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
// NEU: PLZ-Service für Hauptspielort-Anzeige
import { getOrtNameByPlz } from '@/utils/locationUtils';
import { generateBlurPlaceholder } from '@/utils/imageOptimization';
import { Skeleton } from '@/components/ui/skeleton';
// NEU: Jass-Elo Service
import { loadPlayerRatings, type PlayerRatingWithTier } from '@/services/jassElo';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebaseInit';
// NEU: Chart-Komponenten
import PowerRatingChart from '@/components/charts/PowerRatingChart';

import { getChartData } from '@/services/chartDataService'; // 🎯 Pre-computed Chart Data
import { getGroupStricheTimeSeries } from '@/services/stricheHistoryService'; // 🎯 Strichdifferenz-Verlauf
import { getGroupPointsTimeSeries } from '@/services/pointsHistoryService'; // 🎯 Punktedifferenz-Verlauf
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
  // NEU: State für Elo-Deltas
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
  
  // ===== TRUMP-STATISTIK ARRAY (IDENTISCH ZUM ORIGINAL) =====
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

  // ===== HILFSFUNKTION FÜR JASS-COLOR NORMALISIERUNG (IDENTISCH ZUM ORIGINAL) =====
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

    safeStatsArray(groupStats?.playerWithHighestKontermatschBilanz).forEach((stat) => {
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
    collectTeamPhotos(groupStats?.teamWithHighestKontermatschBilanz || groupStats?.teamWithHighestKontermatschRate);
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
    
    // ✅ IMMER globale Ratings laden (über alle Gruppen hinweg)
    const playerIds = members.map(m => m.id || m.userId).filter(Boolean);
    loadPlayerRatings(playerIds)
      .then((ratingsMap) => {
        setPlayerRatings(ratingsMap);
        
        // ✅ OPTIMIERT: Delta ist bereits in playerRatings verfügbar!
        const deltaMap = new Map<string, number>();
        ratingsMap.forEach((rating, playerId) => {
          // 🆕 SESSION-DELTA: Verwende lastSessionDelta statt lastDelta
          deltaMap.set(playerId, rating?.lastSessionDelta || rating?.lastDelta || 0);
        });
        setPlayerDeltas(deltaMap);
      })
      .catch(error => console.warn('Fehler beim Laden der Elo-Ratings:', error));
  }, [members, currentGroup?.id]);

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
        
        const deltaMap = new Map<string, number>();
        ratingsMap.forEach((rating, playerId) => {
          // 🆕 SESSION-DELTA: Verwende lastSessionDelta statt lastDelta
          deltaMap.set(playerId, rating?.lastSessionDelta || rating?.lastDelta || 0);
        });
        setPlayerDeltas(deltaMap);
      })
      .catch(e => console.warn('Fehler beim Laden der globalen Elo-Ratings für öffentliche Ansicht:', (e as any)?.message));
  }, [currentGroup?.id, isPublicView, members]);

  // 🚀 NEU: Lade Chart-Daten für Power-Rating Zeitreihen (verzögert für bessere UX)
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    // ✅ Verzögerung um 1-2 Frames nach Tab-Expandieren für smooth Chart-Rendering
    const timer = setTimeout(() => {
      setChartLoading(true);
      getChartData(currentGroup.id) // 🎯 Pre-computed Chart Data für sofortige Performance
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
  }, [currentGroup?.id]);
  
  // 🚀 NEU: Lade Strichdifferenz-Verlauf für alle Spieler (verzögert für bessere UX)
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    // ✅ Verzögerung für smooth Chart-Rendering
    const timer = setTimeout(() => {
      setStricheChartLoading(true);
      getGroupStricheTimeSeries(currentGroup.id, currentGroup.theme || 'yellow')
        .then((data) => {
          setStricheChartData(data);
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
  }, [currentGroup?.id, currentGroup?.theme]);

  // 🚀 NEU: Lade Punktedifferenz-Verlauf für alle Spieler (verzögert für bessere UX)
  React.useEffect(() => {
    if (!currentGroup?.id) return;
    
    // ✅ Verzögerung für smooth Chart-Rendering
    const timer = setTimeout(() => {
      setPointsChartLoading(true);
      getGroupPointsTimeSeries(currentGroup.id, currentGroup.theme || 'yellow')
        .then((data) => {
          setPointsChartData(data);
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
  }, [currentGroup?.id, currentGroup?.theme]);

  if (groupStatus === 'loading' && !currentGroup) {
    return (
      <MainLayout>
        <div className={`flex flex-col items-center justify-start bg-gray-900 text-white ${layout.containerPadding} relative pt-8 pb-20`}>
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
        <div className={`flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white ${layout.containerPadding}`}>
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
        <div className={`flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white ${layout.containerPadding}`}>
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
        <div className={`flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white ${layout.containerPadding}`}>
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
    <MainLayout>
      <div id="group-view-container" className={`flex flex-col items-center justify-start bg-gray-900 text-white ${layout.containerPadding} relative pt-8 pb-20 lg:w-full lg:px-0`}>
        
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
            className={`absolute top-4 right-4 z-10 ${layout.actionButtonPadding} text-gray-300 hover:text-white transition-all duration-200 rounded-full bg-gray-700/50 hover:scale-110`}
            style={{
              backgroundColor: 'rgba(55, 65, 81, 0.5)',
              borderColor: 'transparent'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `rgba(${themeStyles.primaryRgb}, 0.2)`;
              e.currentTarget.style.borderColor = `rgba(${themeStyles.primaryRgb}, 0.4)`;
              e.currentTarget.style.boxShadow = `0 0 15px rgba(${themeStyles.primaryRgb}, 0.3)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.5)';
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.boxShadow = 'none';
            }}
            aria-label="Gruppenstatistiken teilen"
          >
            <FiShare2 size={layout.actionButtonSize} />
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
            {groupStatus === 'loading' ? (
              <Skeleton className="w-full h-full rounded-full" />
            ) : previewUrl ? (
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
                  sizes="128px"
                  placeholder="blur"
                  blurDataURL={generateBlurPlaceholder()}
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
            className={`${layout.titleSize} font-bold mb-1 text-white break-words transition-colors duration-300`}
          >
            {groupStatus === 'loading' ? <Skeleton className={`${layout.skeletonTitleHeight} w-48 mx-auto`} /> : (currentGroup?.name ?? 'Keine Gruppe ausgewählt')}
          </h1>
          <div className={`${layout.subtitleSize} text-gray-300 mx-auto max-w-xl break-words mt-3`}>
            {groupStatus === 'loading' ? <Skeleton className={`${layout.skeletonTextHeight} w-64 mx-auto`} /> : (
              <FormattedDescription 
                description={currentGroup?.description} 
                className="mx-auto" 
              />
            )}
          </div>
          
          {/* ✅ SETUP-HINWEIS: Nur für Admins wenn < 4 Mitglieder */}
          {isAdmin && !membersLoading && members.length < 4 && (
            <div className="mt-4 mx-auto max-w-md">
              <div className={`bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-green-500/50 rounded-lg ${layout.cardPadding} backdrop-blur-sm`}>
                <div className="flex items-center justify-center mb-2">
                  <Settings size={layout.iconSize} className="text-green-400 mr-2" />
                  <span className={`text-green-300 font-medium ${layout.subheadingSize}`}>Gruppe fertig einrichten</span>
                </div>
                <p className={`text-green-200 ${layout.miniTextSize} text-center leading-relaxed`}>
                  Schliesse die Gruppeneinstellungen ab und lade mindestens drei weitere Mitspieler ein!
                </p>
                <div className="mt-2 text-center">
                  <span className={`text-green-400 ${layout.miniTextSize}`}>
                    {members.length}/4 Mitglieder
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
          <TabsList className={`grid w-full grid-cols-3 bg-gray-800 ${layout.mainTabContainerPadding} rounded-lg mb-4 sticky top-0 z-30 backdrop-blur-md`}>
            <TabsTrigger 
              value="statistics" 
              className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md ${layout.mainTabPadding} ${layout.mainTabTextSize} font-medium`}
              style={{
                backgroundColor: activeMainTab === 'statistics' ? getTabActiveColor(groupTheme) : 'transparent'
              }}
            >
              <BarChart size={layout.mainTabIconSize} className="mr-2" /> Statistik
            </TabsTrigger>
            <TabsTrigger 
              value="archive"
              className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md ${layout.mainTabPadding} ${layout.mainTabTextSize} font-medium`}
              style={{
                backgroundColor: activeMainTab === 'archive' ? getTabActiveColor(groupTheme) : 'transparent'
              }}
            >
              <Archive size={layout.mainTabIconSize} className="mr-2" /> Archiv
            </TabsTrigger>
            <TabsTrigger
              value="members" 
              className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md ${layout.mainTabPadding} ${layout.mainTabTextSize} font-medium`}
              style={{
                backgroundColor: activeMainTab === 'members' ? getTabActiveColor(groupTheme) : 'transparent'
              }}
            >
              <Users size={layout.mainTabIconSize} className="mr-2" /> Mitglieder
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
              {/* Responsiver Abstand: Desktop weniger (16px), Mobile weniger (8px) */}
              <div className={layout.isDesktop ? "h-4" : "h-2"}></div>
                
                {/* Sticky Container für Sub-Tabs */}
                <div className={`sticky ${layout.isDesktop ? "top-[60px]" : "top-[44px]"} z-20 bg-gray-900 pt-2 pb-4`}>
                  <TabsList className={`grid w-full grid-cols-3 bg-gray-800 ${layout.subTabContainerPadding} rounded-lg backdrop-blur-md`}>
                    <TabsTrigger 
                      value="overview" 
                      className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md ${layout.subTabPadding} ${layout.subTabTextSize} font-medium`}
                      style={{
                        backgroundColor: activeStatsSubTab === 'overview' ? getTabActiveColor(groupTheme) : 'transparent'
                      }}
                    >
                      <BarChart2 size={layout.subTabIconSize} className="mr-1.5"/> Übersicht
                    </TabsTrigger>
                    <TabsTrigger 
                      value="players" 
                      className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md ${layout.subTabPadding} ${layout.subTabTextSize} font-medium`}
                      style={{
                        backgroundColor: activeStatsSubTab === 'players' ? getTabActiveColor(groupTheme) : 'transparent'
                      }}
                    >
                      <User size={layout.subTabIconSize} className="mr-1.5"/> Spieler
                    </TabsTrigger>
                    <TabsTrigger 
                      value="teams" 
                      className={`data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md ${layout.subTabPadding} ${layout.subTabTextSize} font-medium`}
                      style={{
                        backgroundColor: activeStatsSubTab === 'teams' ? getTabActiveColor(groupTheme) : 'transparent'
                      }}
                    >
                      <Users size={layout.subTabIconSize} className="mr-1.5"/> Teams
                    </TabsTrigger>
                  </TabsList>
                </div>
                
                {/* ÜBERSICHT TAB - MIT ECHTEN INHALTEN UND REFS */}
                <TabsContent 
                  value="overview"
                  className={`w-full bg-gray-800/50 rounded-lg ${layout.cardPadding}`}
                >
                  <div className={`${layout.sectionSpacing} ${layout.bodySize}`}>
                    {/* 1. Elo Verlauf - NEUE REIHENFOLGE */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>📈 Jass-Elo Verlauf</h3>
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
                            showBaseline={true} // 🎯 100er-Linie weiß bei Elo
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
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
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center justify-between border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className="flex items-center">
                          <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Jass-Elo Rangliste</h3>
                        </div>
                        <a 
                          href="https://firebasestorage.googleapis.com/v0/b/jassguru.firebasestorage.app/o/Jass-Elo_%20Ein%20Elo-basiertes%20Bewertungssystem%20fu%CC%88r%20den%20Schieber.pdf?alt=media&token=5db3a7af-1725-4d2d-a7dd-d68a9db9dfbb" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={`flex items-center justify-center rounded-full bg-gray-700/50 hover:bg-gray-600/70 border border-gray-600/40 hover:border-gray-500/60 transition-all duration-200 hover:scale-105 ${layout.actionButtonPadding}`}
                          title="Jass-Elo Whitepaper öffnen"
                        >
                          <Info size={layout.iconSize} className="text-gray-300 hover:text-white" />
                        </a>
                      </div>
                      <div ref={overviewMostGamesRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
                        {(() => {
                          // Erstelle sortierte Liste aus Elo-Ratings
                          const ratingsArray = Array.from(playerRatings.values())
                            .filter(rating => rating.gamesPlayed > 0) // Nur Spieler mit Spielen
                            .sort((a, b) => b.rating - a.rating); // Nach Rating sortiert
                          
                          if (ratingsArray.length > 0) {
                            return ratingsArray.map((rating, index) => {
                              const playerData = members.find(m => (m.id || m.userId) === rating.id);
                              const playerId = rating.id;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=overview` : '#'} key={`eloRating-${rating.id}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                          const delta = playerDeltas.get(rating.id);
                                          if (delta !== undefined) {
                                            return (
                                              <span className={`ml-1 ${layout.smallTextSize} ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                                ({delta > 0 ? '+' : ''}{Math.round(delta)})
                                              </span>
                                            );
                                          }
                                          return null;
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


                    {/* 3. Rundentempo - NEUE REIHENFOLGE */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Rundentempo</h3>
                      </div>
                      <div ref={playerRoundTimeRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
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
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=overview` : '#'} key={`roundTime-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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

                    {/* 4. Trumpfansagen - NEUE REIHENFOLGE */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Trumpfansagen</h3>
                      </div>
                      <div ref={overviewTrumpfRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
                        {trumpfStatistikArray.length > 0 ? (
                          trumpfStatistikArray.map((item, index) => {
                            // NEU: Logik für dynamische Anzeige
                            const cardStyle = currentGroup?.farbeSettings?.cardStyle || 'DE';
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
                          })
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>Keine Trumpfstatistik verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 5. Durchschnittswerte & Details - NEUE REIHENFOLGE */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Durchschnittswerte & Details</h3>
                      </div>
                      <div className={`${layout.cardPadding} space-y-2`}>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Dauer pro Partie:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgSessionDuration || '-'}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Dauer pro Spiel:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgGameDuration || '-'}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Spiele pro Partie:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgGamesPerSession ? groupStats.avgGamesPerSession.toFixed(1) : '-'}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Runden pro Spiel:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgRoundsPerGame ? groupStats.avgRoundsPerGame.toFixed(1) : '-'}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Matsch pro Spiel:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgMatschPerGame ? groupStats.avgMatschPerGame.toFixed(2) : '-'}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Ø Rundentempo:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.avgRoundDuration || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* 6. Gruppenübersicht - NEUE REIHENFOLGE */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Gruppenübersicht</h3>
                      </div>
                      <div className={`${layout.cardPadding} space-y-2`}>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Mitglieder:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.memberCount || 0}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Anzahl Partien:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.sessionCount || 0}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Anzahl Turniere:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.tournamentCount || 0}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Anzahl Spiele:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.gameCount || 0}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Gesamte Jass-Zeit:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.totalPlayTime || '-'}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Erster Jass:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.firstJassDate || '-'}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
                          <span className={`${layout.labelSize} font-medium text-gray-300`}>Letzter Jass:</span>
                          <span className={`${layout.valueSize} text-gray-100 font-medium`}>{groupStats?.lastJassDate || '-'}</span>
                        </div>
                        <div className={`flex justify-between bg-gray-700/30 ${layout.listItemPadding} rounded-md`}>
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
                  className={`w-full bg-gray-800/50 rounded-lg ${layout.cardPadding}`}
                >
                  <div className={`${layout.sectionSpacing} ${layout.bodySize}`}>
                    {/* 1. Strichdifferenz Verlauf - NEUE REIHENFOLGE */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>📈 Strichdifferenz Verlauf</h3>
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
                            showBaseline={false} // 🎯 0er-Linie weiß bei Strichdifferenz
                            hideLegend={false}
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
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
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Strichdifferenz Rangliste</h3>
                      </div>
                      <div ref={playerStricheDiffRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
                        {(() => {
                          if (groupStats?.playerWithHighestStricheDiff && groupStats.playerWithHighestStricheDiff.length > 0) {
                            // Filter: Nur Spieler mit gespielten Spielen anzeigen
                            const playersWithGames = groupStats.playerWithHighestStricheDiff.filter(player => 
                              (player.eventsPlayed && player.eventsPlayed > 0) || 
                              (player.gamesPlayed && player.gamesPlayed > 0) || 
                              (player.sessionCount && player.sessionCount > 0)
                            );
                            return playersWithGames.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              const playerId = playerData?.id || playerData?.userId;
                              return (
                               <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`stricheDiff-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block rounded-md">
                                <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
                                  <div className="flex items-center">
                                    <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL} 
                                      alt={playerStat.playerName} 
                                      size={layout.profileImageListSize}
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                      fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                    />
                                    <span className={`${layout.bodySize} text-gray-300`}>{playerStat.playerName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                        ({playerStat.eventsPlayed || 0})
                                      </span>
                                      <span className={`${layout.valueSize} font-medium`}>
                                        {playerStat.value > 0 ? '+' : ''}{Math.trunc(playerStat.value)}
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

                    {/* 3. Punktedifferenz Verlauf - NEUE REIHENFOLGE */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>📈 Punktedifferenz Verlauf</h3>
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
                            showBaseline={false} // 🎯 0er-Linie weiß bei Punktedifferenz
                            hideLegend={false}
                            activeTab={activeMainTab} // ✅ Tab-Wechsel-Reset für Animationen
                            activeSubTab={activeStatsSubTab} // ✅ Sub-Tab-Wechsel-Reset für Animationen
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
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Punktedifferenz Rangliste</h3>
                      </div>
                      <div ref={playerPointsDiffRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
                        {(() => {
                          if (groupStats?.playerWithHighestPointsDiff && groupStats.playerWithHighestPointsDiff.length > 0) {
                            // Filter: Nur Spieler mit gespielten Spielen anzeigen
                            const playersWithGames = groupStats.playerWithHighestPointsDiff.filter(player => 
                              (player.eventsPlayed && player.eventsPlayed > 0) || 
                              (player.gamesPlayed && player.gamesPlayed > 0) || 
                              (player.sessionCount && player.sessionCount > 0)
                            );
                            return playersWithGames.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              const playerId = playerData?.id || playerStat.playerId;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`pointsDiff-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                      <span className="text-white font-medium mr-2">
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({playerStat.eventsPlayed || 0})
                                        </span>
                                        <span className={`${layout.valueSize} font-medium`}>
                                          {playerStat.value > 0 ? '+' : ''}{Math.trunc(playerStat.value)}
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

                    {/* 5. Siegquote Rangliste - REPARIERT */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Siegquote Rangliste</h3>
                      </div>
                      <div ref={playerWinRateSessionRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
                        {(() => {
                          if (groupStats?.playerWithHighestWinRateSession && groupStats.playerWithHighestWinRateSession.length > 0) {
                            // Filter: Nur Spieler mit gespielten Spielen anzeigen
                            const playersWithGames = groupStats.playerWithHighestWinRateSession.filter(player => 
                              (player.eventsPlayed && player.eventsPlayed > 0) || 
                              (player.gamesPlayed && player.gamesPlayed > 0) || 
                              (player.sessionCount && player.sessionCount > 0)
                            );
                            return playersWithGames.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              const playerId = playerData?.id || playerStat.playerId;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`winRate-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                      <span className="text-white font-medium mr-2">
                                        {(typeof playerStat.value === 'number' && playerStat.eventsPlayed && playerStat.eventsPlayed > 0) && (
                                          <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                            ({Math.round(playerStat.value * playerStat.eventsPlayed)}/{playerStat.eventsPlayed})
                                          </span>
                                        )}
                                        <span className={`${layout.valueSize} font-medium`}>
                                          {(typeof playerStat.value === 'number' ? playerStat.value * 100 : 0).toFixed(1)}%
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return (
                              <div className={`${layout.bodySize} text-gray-400 text-center py-8`}>
                                <Trophy size={32} className="mx-auto mb-3 text-gray-500" />
                                <p>Noch keine Siegquote-Daten verfügbar</p>
                                <p className={`${layout.smallTextSize} mt-1`}>Rangliste wird angezeigt, sobald Spieler Spiele gespielt haben</p>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    </div>

                    {/* 3. Siegquote Partie */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Siegquote Partie</h3>
                      </div>
                      <div ref={playerWinRateSessionRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
                        {(() => {
                          if (groupStats?.playerWithHighestWinRateSession && groupStats.playerWithHighestWinRateSession.length > 0) {
                            // Filter: Nur Spieler mit gespielten Partien anzeigen
                            const playersWithSessions = groupStats.playerWithHighestWinRateSession.filter(player => 
                              player.eventsPlayed && player.eventsPlayed > 0
                            );
                            return playersWithSessions.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              // KORREKTUR: Verwende die playerId aus der Statistik als Fallback
                              const playerId = playerData?.id || playerStat.playerId;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`winRateSession-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                      {/* ✅ KORREKT: Klammerwerte zeigen nur entschiedene Sessions (eventsPlayed wurde im Backend korrigiert) */}
                                      <span className="text-white font-medium mr-2">
                                        {(typeof playerStat.value === 'number' && playerStat.eventsPlayed && playerStat.eventsPlayed > 0) && (
                                          <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                            ({Math.round(playerStat.value * playerStat.eventsPlayed)}/{playerStat.eventsPlayed})
                                          </span>
                                        )}
                                        <span className={`${layout.valueSize} font-medium`}>
                                          {(typeof playerStat.value === 'number' ? playerStat.value * 100 : 0).toFixed(1)}%
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

                    {/* 4. Siegquote Spiel */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Siegquote Spiel</h3>
                      </div>
                      <div ref={playerWinRateGameRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
                        {(() => {
                          if (groupStats?.playerWithHighestWinRateGame && groupStats.playerWithHighestWinRateGame.length > 0) {
                            // Filter: Nur Spieler mit gespielten Spielen anzeigen
                            const playersWithGames = groupStats.playerWithHighestWinRateGame.filter(player => 
                              player.eventsPlayed && player.eventsPlayed > 0
                            );
                            return playersWithGames.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              const playerId = playerData?.id || playerStat.playerId;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`winRateGame-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                      <span className="text-white font-medium mr-2">
                                        {(typeof playerStat.value === 'number' && playerStat.eventsPlayed && playerStat.eventsPlayed > 0) && (
                                          <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                            ({Math.round(playerStat.value * playerStat.eventsPlayed)}/{playerStat.eventsPlayed})
                                          </span>
                                        )}
                                        <span className={`${layout.valueSize} font-medium`}>
                                          {(typeof playerStat.value === 'number' ? playerStat.value * 100 : 0).toFixed(1)}%
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

                    {/* 5. Matsch-Bilanz */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Matsch-Bilanz</h3>
                      </div>
                      <div ref={playerMatschRateRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
                        {(() => {
                          if (groupStats?.playerWithHighestMatschBilanz && groupStats.playerWithHighestMatschBilanz.length > 0) {
                            // Filter: Nur Spieler mit Matsch-Erfahrung anzeigen
                            const playersWithMatschEvents = groupStats.playerWithHighestMatschBilanz.filter(player => 
                              (player.eventsMade && player.eventsMade > 0) || 
                              (player.eventsReceived && player.eventsReceived > 0)
                            );
                            return playersWithMatschEvents.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              const playerId = playerData?.id || playerStat.playerId;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`matschBilanz-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                      <span className="text-white font-medium mr-2">
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({playerStat.eventsMade || 0}/{playerStat.eventsReceived || 0})
                                        </span>
                                        <span className={`${layout.valueSize} font-medium`}>
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

                    {/* 6. Schneider-Bilanz */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Schneider-Bilanz</h3>
                      </div>
                      <div ref={playerSchneiderRateRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
                        {(() => {
                          if (groupStats?.playerWithHighestSchneiderBilanz && groupStats.playerWithHighestSchneiderBilanz.length > 0) {
                            // Filter: Nur Spieler mit Schneider-Erfahrung anzeigen
                            const playersWithSchneiderEvents = groupStats.playerWithHighestSchneiderBilanz.filter(player => 
                              (player.eventsMade && player.eventsMade > 0) || 
                              (player.eventsReceived && player.eventsReceived > 0)
                            );
                            return playersWithSchneiderEvents.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              const playerId = playerData?.id || playerStat.playerId;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`schneiderBilanz-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                      <span className="text-white font-medium mr-2">
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({playerStat.eventsMade || 0}/{playerStat.eventsReceived || 0})
                                        </span>
                                        <span className={`${layout.valueSize} font-medium`}>
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

                    {/* 7. Kontermatsch-Bilanz */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Kontermatsch-Bilanz</h3>
                      </div>
                      <div className={`${layout.cardPadding} space-y-2 pr-2`}>
                        {(() => {
                          if (groupStats?.playerWithHighestKontermatschBilanz && groupStats.playerWithHighestKontermatschBilanz.length > 0) {
                            // Filter: Nur Spieler mit Kontermatsch-Erfahrung anzeigen
                            const playersWithKontermatschEvents = groupStats.playerWithHighestKontermatschBilanz.filter(player =>
                              (player.eventsMade && player.eventsMade > 0) ||
                              (player.eventsReceived && player.eventsReceived > 0)
                            );
                            return playersWithKontermatschEvents.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              const playerId = playerData?.id || playerStat.playerId;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`kontermatschBilanz-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
                                    <div className="flex items-center">
                                      <span className={`${layout.smallTextSize} text-gray-400 min-w-5 mr-2`}>{index + 1}.</span>
                                      <ProfileImage
                                        src={playerData?.photoURL}
                                        alt={playerStat.playerName}
                                        size={layout.profileImageListSize}
                                        className={`mr-2 ${theme.profileImage}`}
                                        fallbackClassName={`bg-gray-700 text-gray-300 ${layout.bodySize}`}
                                        fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                      />
                                      <span className={`${layout.bodySize} text-gray-300`}>{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="text-white font-medium mr-2">
                                        <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                          ({playerStat.eventsMade || 0}/{playerStat.eventsReceived || 0})
                                        </span>
                                        <span className={`${layout.valueSize} font-medium`}>
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

                    {/* 8. Weis-Durchschnitt */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Weis-Durchschnitt</h3>
                      </div>
                      <div ref={playerWeisAvgRef} className={`${layout.cardPadding} space-y-2 pr-2`}>
                        {(() => {
                          if (groupStats?.playerWithMostWeisPointsAvg && groupStats.playerWithMostWeisPointsAvg.length > 0) {
                            // Filter: Nur Spieler mit Weis-Punkten anzeigen
                            const playersWithWeisPoints = groupStats.playerWithMostWeisPointsAvg.filter(player => 
                              player.value && player.value > 0
                            );
                            return playersWithWeisPoints.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              const playerId = playerData?.id || playerStat.playerId;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`weisPoints-${playerStat.playerId || playerStat.playerName}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                      <span className={`text-white ${layout.valueSize} font-medium mr-2`}>{Math.round(Number(playerStat.value))}</span>
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
                  className={`w-full bg-gray-800/50 rounded-lg ${layout.cardPadding}`}
                >
                  <div className={`${layout.sectionSpacing} ${layout.bodySize}`}>
                    {/* 1. Strichdifferenz */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Strichdifferenz Rangliste</h3>
                      </div>
                      <div ref={teamStricheDiffRef} className={`${layout.cardPadding} space-y-2 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {groupStats?.teamWithHighestStricheDiff && groupStats.teamWithHighestStricheDiff.length > 0 ? (
                          groupStats.teamWithHighestStricheDiff
                            .filter(team => 
                              (team.eventsPlayed && team.eventsPlayed > 0) || 
                              (team.value && team.value !== 0)
                            )
                            .map((team, index) => (
                            <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                  ({team.eventsPlayed || 0})
                                </span>
                                <span className={`${layout.valueSize} font-medium`}>
                                  {Math.round(Number(team.value)) > 0 ? '+' : ''}{Math.round(Number(team.value))}
                                </span>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 2. Punktedifferenz */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Punktedifferenz Rangliste</h3>
                      </div>
                      <div ref={teamPointsDiffRef} className={`${layout.cardPadding} space-y-2 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {groupStats?.teamWithHighestPointsDiff && groupStats.teamWithHighestPointsDiff.length > 0 ? (
                          groupStats.teamWithHighestPointsDiff
                            .filter(team => 
                              (team.eventsPlayed && team.eventsPlayed > 0) || 
                              (team.value && team.value !== 0)
                            )
                            .map((team, index) => (
                            <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                <span className={`${layout.smallTextSize} text-gray-400 mr-1`}>
                                  ({team.eventsPlayed || 0})
                                </span>
                                <span className={`${layout.valueSize} font-medium`}>
                                  {Math.round(Number(team.value)) > 0 ? '+' : ''}{Math.round(Number(team.value))}
                                </span>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 3. Siegquote (Partien) - ✅ KORREKT: eventsPlayed zeigt nur entschiedene Sessions */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Siegquote (Partien)</h3>
                      </div>
                      <div ref={teamWinRateSessionRef} className={`${layout.cardPadding} space-y-2 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {groupStats?.teamWithHighestWinRateSession && groupStats.teamWithHighestWinRateSession.length > 0 ? (
                          groupStats.teamWithHighestWinRateSession
                            .filter(team => 
                              team.eventsPlayed && team.eventsPlayed > 0
                            )
                            .map((team, index) => (
                            <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                <span className={`${layout.valueSize} font-medium`}>
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

                    {/* 4. Siegquote (Spiele) */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Siegquote (Spiele)</h3>
                      </div>
                      <div ref={teamWinRateGameRef} className={`${layout.cardPadding} space-y-2 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {groupStats?.teamWithHighestWinRateGame && groupStats.teamWithHighestWinRateGame.length > 0 ? (
                          groupStats.teamWithHighestWinRateGame
                            .filter(team => 
                              team.eventsPlayed && team.eventsPlayed > 0
                            )
                            .map((team, index) => (
                            <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                <span className={`${layout.valueSize} font-medium`}>
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

                    {/* 5. Matsch-Bilanz */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Matsch-Bilanz</h3>
                      </div>
                      <div ref={teamMatschRateRef} className={`${layout.cardPadding} space-y-2 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {(() => {
                          // ✅ KORRIGIERT: Verwende teamWithHighestMatschBilanz statt teamWithHighestMatschRate
                          const teamMatschData = groupStats?.teamWithHighestMatschBilanz || groupStats?.teamWithHighestMatschRate;
                          if (teamMatschData && teamMatschData.length > 0) {
                            // Filter: Nur Teams mit Matsch-Erfahrung anzeigen
                            const teamsWithMatschEvents = teamMatschData.filter(team => 
                              (team.eventsMade && team.eventsMade > 0) || 
                              (team.eventsReceived && team.eventsReceived > 0) ||
                              (team.value && team.value !== 0)
                            );
                            return teamsWithMatschEvents.map((team, index) => (
                              <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                    <span className={`${layout.valueSize} font-medium`}>
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

                    {/* 6. Schneider-Bilanz */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Schneider-Bilanz</h3>
                      </div>
                      <div ref={teamSchneiderRateRef} className={`${layout.cardPadding} space-y-2 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
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
                              <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                    <span className={`${layout.valueSize} font-medium`}>
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

                    {/* 7. Kontermatsch-Bilanz */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Kontermatsch-Bilanz</h3>
                      </div>
                      <div className={`${layout.cardPadding} space-y-2 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
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
                                <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                                      <span className={`${layout.valueSize} font-medium`}>
                                        {team.value > 0 ? '+' : ''}{Math.round(Number(team.value))}
                                      </span>
                                    </span>
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

                    {/* 8. Weis-Durchschnitt */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Weis-Durchschnitt</h3>
                      </div>
                      <div ref={teamWeisAvgRef} className={`${layout.cardPadding} space-y-2 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {groupStats?.teamWithMostWeisPointsAvg && groupStats.teamWithMostWeisPointsAvg.length > 0 ? (
                          groupStats.teamWithMostWeisPointsAvg
                            .filter(team => 
                              team.value && team.value > 0
                            )
                            .map((team, index) => (
                            <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                              <span className={`text-white ${layout.valueSize} font-medium`}>{Math.round(Number(team.value))}</span>
                            </div>
                          ))
                        ) : (
                          <div className={`${layout.bodySize} text-gray-400 text-center py-2`}>Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 9. Rundentempo */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>Rundentempo</h3>
                      </div>
                      <div ref={teamRoundTimeRef} className={`${layout.cardPadding} space-y-2 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {groupStats?.teamWithFastestRounds && groupStats.teamWithFastestRounds.length > 0 ? (
                          groupStats.teamWithFastestRounds
                            .filter(team => 
                              team.value && team.value > 0
                            )
                            .map((team, index) => (
                            <div key={`team-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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

                    {/* 5. Siegquote Rangliste - NEUER CHART */}
                    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${layout.borderWidth} border-gray-700/50`}>
                      <div className={`flex items-center border-b ${layout.borderWidth} border-gray-700/50 ${layout.cardInnerPadding}`}>
                        <div className={`${layout.accentBarWidth} ${layout.accentBarHeight} ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className={`${layout.headingSize} font-semibold text-white`}>🏆 Siegquote Rangliste</h3>
                      </div>
                      <div ref={teamWinRateSessionRef} className={`${layout.cardPadding} space-y-2 max-h-[calc(13.5*2.5rem)] overflow-y-auto pr-2`}>
                        {groupStats?.teamWithHighestWinRateSession && groupStats.teamWithHighestWinRateSession.length > 0 ? (
                          groupStats.teamWithHighestWinRateSession
                            .filter(team => 
                              (team.eventsPlayed && team.eventsPlayed > 0) || 
                              (team.value && team.value !== 0)
                            )
                            .map((team, index) => (
                            <div key={`team-winrate-${team.names.join('-')}`} className={`flex justify-between items-center ${layout.listItemPadding} rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors`}>
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
                              <span className={`text-white ${layout.valueSize} font-medium text-right whitespace-nowrap`}>
                                {team.value ? `${team.value.toFixed(1)}%` : '0.0%'}
                              </span>
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
          <TabsContent value="archive" className={`w-full bg-gray-800/50 rounded-lg ${layout.cardPadding} mb-8`}>
            {/* FEHLER CASE: Sessions Error UND leeres Archiv */}
            {sessionsError && !sessionsLoading && !tournamentsLoading && combinedArchiveItems.length === 0 && (
                <div className="text-center text-gray-400 py-6 px-4 bg-gray-800/30 rounded-md">
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
                <div className="text-center text-gray-400 py-6 px-4 bg-gray-800/30 rounded-md">
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
                    <h3 className={`${layout.headingSize} font-semibold text-white mb-3 text-center`}>{year}</h3>
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
            className={`w-full bg-gray-800/50 rounded-lg ${layout.cardPadding} mb-8`}
          >
            {membersError && !membersLoading && (
                <div className={`text-red-400 ${layout.smallTextSize} text-center p-4 bg-red-900/30 rounded-md`}>
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
  );
};
