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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ThemeColor } from '@/config/theme';
import { generateBlurPlaceholder } from '@/utils/imageOptimization';
// NEU: Jass-Elo Service
import { loadPlayerRatings, type PlayerRatingWithTier, getRatingTier } from '@/services/jassElo';
import { db } from '@/services/firebaseInit';
import { doc, getDoc } from 'firebase/firestore';

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

  // Neu: State für Bildladung
  const [isImageLoading, setIsImageLoading] = useState(true);
  
  // NEU: State für Elo-Rating
  const [playerRating, setPlayerRating] = useState<PlayerRatingWithTier | null>(null);

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
    const theme = profileTheme || 'yellow';
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
    const theme = profileTheme || 'yellow';
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
    const theme = profileTheme || 'yellow';
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
    const theme = profileTheme || 'yellow';
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

  // NEU: Trumpfstatistik-Array für die Anzeige
  const trumpfStatistikArray = useMemo(() => {
    if (!playerStats?.trumpfStatistik || !playerStats.totalTrumpfCount || playerStats.totalTrumpfCount === 0) {
      return [];
    }
    
    // Normalisiere und merge ähnliche Trumpffarben
    const normalizedStats: { [key: string]: number } = {};
    
    Object.entries(playerStats.trumpfStatistik).forEach(([farbe, anzahl]) => {
      let normalizedFarbe = farbe;
      
      // Merge "Eicheln" mit "Eichel"
      if (farbe.toLowerCase() === 'eicheln') {
        normalizedFarbe = 'eichel';
      }
      // Merge "Une" mit "Unde"  
      else if (farbe.toLowerCase() === 'une') {
        normalizedFarbe = 'unde';
      }
      
      // Akkumuliere die Werte
      normalizedStats[normalizedFarbe] = (normalizedStats[normalizedFarbe] || 0) + anzahl;
    });
    
    return Object.entries(normalizedStats)
      .map(([farbe, anzahl]) => ({
        farbe,
        anzahl,
        anteil: anzahl / (playerStats.totalTrumpfCount ?? 1),
      }))
      .sort((a, b) => b.anzahl - a.anzahl);
  }, [playerStats]);

  // Bestimme den aktuellen Player (für Public View aus props, für Private View verwende bevorzugt den Firestore-Player aus props)
  const currentPlayer = isPublicView ? player : (player || user);
  const displayName = currentPlayer?.displayName || "Unbekannter Spieler";
  const photoURL = currentPlayer?.photoURL;
  const jassSpruch = currentPlayer?.statusMessage || "Hallo! Ich jasse mit jassguru.ch";

  // NEU: Lade Elo-Rating für aktuellen Spieler
  React.useEffect(() => {
    // Sammle alle möglichen IDs
    const possibleIds = [
      (currentPlayer as any)?.id,
      (currentPlayer as any)?.userId,
      (user as any)?.playerId,
      (user as any)?.uid
    ].filter(Boolean);

    if (possibleIds.length === 0) return;

    (async () => {
      try {
        // console.log('🔍 Suche Elo für IDs:', possibleIds);
        
        // 1) Versuche Root-Collection mit allen IDs
        for (const playerId of possibleIds) {
          const rootRatings = await loadPlayerRatings([playerId]);
          const root = rootRatings.get(playerId);
          if (root) {
            // console.log('✅ Elo gefunden (Root):', root);
            setPlayerRating(root);
            return;
          }
        }

        // 2) Fallback: Gruppenspezifische Subcollections
        const groupIds: string[] = Array.isArray((currentPlayer as any)?.groupIds)
          ? (currentPlayer as any).groupIds
          : (Array.isArray((user as any)?.groupIds) ? (user as any).groupIds : []);

        let best: PlayerRatingWithTier | null = null;
        for (const playerId of possibleIds) {
          for (const gid of groupIds) {
            try {
              const dref = doc(db as any, `groups/${gid}/playerRatings/${playerId}`);
              const dsnap = await getDoc(dref);
              if (dsnap.exists()) {
                const data: any = dsnap.data();
                const tier = getRatingTier(data.rating || 1000);
                const candidate: PlayerRatingWithTier = {
                  id: playerId,
                  rating: data.rating || 1000,
                  gamesPlayed: data.gamesPlayed || 0,
                  lastUpdated: data.lastUpdated || Date.now(),
                  displayName: data.displayName,
                  tier: tier.name,
                  tierEmoji: tier.emoji,
                };
                if (!best || candidate.rating > best.rating) best = candidate;
                // console.log('✅ Elo gefunden (Group):', candidate);
              }
            } catch {}
          }
        }
        if (best) setPlayerRating(best);
      } catch (error) {
        console.warn('Fehler beim Laden des Elo-Ratings:', error);
      }
    })();
  }, [currentPlayer, user]);

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
    <MainLayout>
      <div className="flex flex-col items-center justify-start bg-gray-900 text-white p-4 relative pt-8 pb-20">
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
        <div className={`relative mb-4 ${isPublicView ? 'mt-16' : 'mt-4'}`}>
          <div 
            className={`relative w-32 h-32 rounded-full overflow-hidden transition-all duration-300 flex items-center justify-center bg-gray-800 shadow-lg hover:shadow-xl hover:scale-105 border-4`}
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
            className="text-3xl font-bold mb-3 text-white break-words transition-colors duration-300"
          >
            {statsLoading ? <Skeleton className="h-9 w-48 mx-auto" /> : displayName}
          </h1>
          
          {/* NEU: Jass-Elo Rating unterhalb des Namens */}
          {playerRating && (
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-base text-gray-300">Jass-Elo:</span>
              <span className="text-xl font-semibold text-white">{Math.round(playerRating.rating)}</span>
              <span className="text-lg">{playerRating.tierEmoji}</span>
            </div>
          )}
          
          <div className="text-base text-gray-300 mx-auto max-w-xl break-words">
            <p className="text-center">{statsLoading ? <Skeleton className="h-5 w-64 mx-auto" /> : jassSpruch}</p>
          </div>
        </div>

        {/* Upload Buttons (wenn preview vorhanden) */}
        {previewUrl && (
          <div className="flex gap-2 justify-center mb-4">
            <Button
              onClick={() => {/* handleUpload - wird über props übergeben */}}
              className="bg-green-600 hover:bg-green-700 flex items-center gap-1"
              disabled={!previewUrl || isUploading}
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
              onClick={() => {/* handleCancelSelection - wird über props übergeben */}}
              className="bg-gray-600 hover:bg-gray-700 flex items-center gap-1"
              disabled={isUploading}
            >
              <AlertXCircle size={16} /> Abbrechen
            </Button>
          </div>
        )}

        {/* Navigation Buttons (nur private Profile) - IDENTISCH ZU GROUPVIEW */}
        {!isPublicView && (
          <div className="flex justify-center items-center gap-3 mb-6 px-4">
            <Button
              variant="ghost" 
              size="sm" 
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
              <Users className="h-4 w-4 mr-1.5" /> Gruppen
            </Button>
            <Button
              variant="ghost" 
              size="sm" 
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
              <AwardIcon className="h-4 w-4 mr-1.5" /> Turniere
            </Button>
            <Button
              variant="ghost" 
              size="sm" 
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
              <UserCog className="h-4 w-4 mr-1.5" /> Einstellungen
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
          <TabsList className="grid w-full grid-cols-2 bg-gray-800 p-1 rounded-lg mb-4 sticky top-0 z-30 backdrop-blur-md">
            <TabsTrigger 
              value="stats" 
              className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-2.5 text-sm font-medium"
              style={{
                backgroundColor: activeMainTab === 'stats' ? getTabActiveColor(profileTheme || 'blue') : 'transparent'
              }}
            > 
              <BarChart3 className="w-4 h-4 mr-2" /> Statistik 
            </TabsTrigger> 
            <TabsTrigger 
              value="archive" 
              className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-2.5 text-sm font-medium"
              style={{
                backgroundColor: activeMainTab === 'archive' ? getTabActiveColor(profileTheme || 'blue') : 'transparent'
              }}
            > 
              <Archive className="w-4 h-4 mr-2" /> Archiv 
            </TabsTrigger>
          </TabsList>

          {/* Statistics Tab Content */}
          <TabsContent value="stats" className="w-full mb-8">
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
              <div className="h-2"></div>
              
              <div className="sticky top-[44px] z-20 bg-gray-900 pt-0 pb-4">
                <div className="absolute top-[-44px] left-0 right-0 h-[44px] bg-gray-900"></div>
                
                <TabsList className="grid w-full grid-cols-3 bg-gray-800 p-1 rounded-lg backdrop-blur-md">
                  <TabsTrigger
                    value="individual"
                    className="data-[state=active]:text-white text-gray-400 hover:text-white rounded-md py-1.5 text-sm font-medium"
                    style={{
                      backgroundColor: activeStatsSubTab === 'individual' ? getTabActiveColor(profileTheme || 'blue') : 'transparent'
                    }}
                  >
                    <User className="w-4 h-4 mr-1.5" />
                    Individuell
                  </TabsTrigger>
                  <TabsTrigger
                    value="partner"
                    className="data-[state=active]:text-white text-gray-400 hover:text-white rounded-md py-1.5 text-sm font-medium"
                    style={{
                      backgroundColor: activeStatsSubTab === 'partner' ? getTabActiveColor(profileTheme || 'blue') : 'transparent'
                    }}
                  >
                    <Users className="w-4 h-4 mr-1.5" />
                    Partner
                  </TabsTrigger>
                  <TabsTrigger
                    value="opponent"
                    className="data-[state=active]:text-white text-gray-400 hover:text-white rounded-md py-1.5 text-sm font-medium"
                    style={{
                      backgroundColor: activeStatsSubTab === 'opponent' ? getTabActiveColor(profileTheme || 'blue') : 'transparent'
                    }}
                  >
                    <Shield className="w-4 h-4 mr-1.5" />
                    Gegner
                  </TabsTrigger>
                </TabsList>
              </div>
              
              {/* Individual Stats Content */}
              <TabsContent value="individual" className="w-full bg-gray-800/50 rounded-lg p-4">
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
                  <div className="space-y-3 text-sm"> 
                    {/* Block 1: Spielerübersicht */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Spielerübersicht</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Anzahl Gruppen:</span>
                          <span className="text-gray-100 text-lg font-medium">{playerStats?.groupCount || 0}</span> 
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Anzahl Partien:</span>
                          <span className="text-gray-100 text-lg font-medium">{playerStats?.totalSessions ?? 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Anzahl Turniere:</span>
                          <span className="text-gray-100 text-lg font-medium">{playerStats?.totalTournaments ?? 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Anzahl Spiele:</span>
                          <span className="text-gray-100 text-lg font-medium">{playerStats?.totalGames ?? 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Gesamte Jass-Zeit:</span>
                          <span className="text-gray-100 text-lg font-medium">{playerStats?.totalPlayTime || '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Erster Jass:</span>
                          <span className="text-gray-100 text-lg font-medium">{playerStats?.firstJassDate || '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Letzter Jass:</span>
                          <span className="text-gray-100 text-lg font-medium">{playerStats?.lastJassDate || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Block 2: Bilanzen */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Bilanzen</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Strichdifferenz:</span>
                          <span className="text-gray-100">
                            <span className="text-gray-400 mr-1 text-sm">
                              ({playerStats?.totalStricheMade || 0}/{playerStats?.totalStricheReceived || 0})
                            </span>
                            <span className="text-lg font-medium">
                              {playerStats?.totalStrichesDifference !== undefined && playerStats.totalStrichesDifference > 0 ? '+' : ''}
                              {playerStats?.totalStrichesDifference || 0}
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Punktdifferenz:</span>
                          <span className="text-gray-100">
                            <span className="text-gray-400 mr-1 text-sm">
                              ({(() => {
                                const formatLargeNumber = (num: number): string => {
                                  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
                                  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
                                  return num.toString();
                                };
                                return `${formatLargeNumber(playerStats?.totalPointsMade || 0)}/${formatLargeNumber(playerStats?.totalPointsReceived || 0)}`;
                              })()})
                            </span>
                            <span className="text-lg font-medium">
                              {playerStats?.totalPointsDifference !== undefined && playerStats.totalPointsDifference > 0 ? '+' : ''}
                              {playerStats?.totalPointsDifference || 0}
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Siegquote Partien:</span>
                          <span className="text-gray-100">
                            <span className="text-gray-400 mr-1 text-sm">
                              ({playerStats?.sessionsWon || 0}/{playerStats?.sessionsLost || 0}/{playerStats?.sessionsTied || 0})
                            </span>
                            <span className="text-lg font-medium">
                              {playerStats?.sessionWinRate !== undefined ? `${(playerStats.sessionWinRate * 100).toFixed(1)}%` : '0.0%'}
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Siegquote Spiele:</span>
                          <span className="text-gray-100">
                            <span className="text-gray-400 mr-1 text-sm">
                              ({playerStats?.gamesWon || 0}/{playerStats?.gamesLost || 0})
                            </span>
                            <span className="text-lg font-medium">
                              {playerStats?.gameWinRate !== undefined ? `${(playerStats.gameWinRate * 100).toFixed(1)}%` : '0.0%'}
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Matsch-Bilanz:</span>
                          <span className="text-gray-100">
                            {playerStats?.totalMatschEventsMade !== undefined && playerStats?.totalMatschEventsReceived !== undefined && (
                              <span className="text-gray-400 text-sm mr-1">
                                ({playerStats.totalMatschEventsMade}/{playerStats.totalMatschEventsReceived})
                              </span>
                            )}
                            <span className="text-lg font-medium">
                              {playerStats?.matschBilanz !== undefined && playerStats.matschBilanz > 0 ? '+' : ''}
                              {playerStats?.matschBilanz || 0}
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Schneider-Bilanz:</span>
                          <span className="text-gray-100">
                            {playerStats?.totalSchneiderEventsMade !== undefined && playerStats?.totalSchneiderEventsReceived !== undefined && (
                              <span className="text-gray-400 text-sm mr-1">
                                ({playerStats.totalSchneiderEventsMade}/{playerStats.totalSchneiderEventsReceived})
                              </span>
                            )}
                            <span className="text-lg font-medium">
                              {playerStats?.schneiderBilanz !== undefined && playerStats.schneiderBilanz > 0 ? '+' : ''}
                              {playerStats?.schneiderBilanz || 0}
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Kontermatsch-Bilanz:</span>
                          <span className="text-gray-100">
                            {playerStats?.totalKontermatschEventsMade !== undefined && playerStats?.totalKontermatschEventsReceived !== undefined && (
                              <span className="text-gray-400 text-sm mr-1">
                                ({playerStats.totalKontermatschEventsMade}/{playerStats.totalKontermatschEventsReceived})
                              </span>
                            )}
                            <span className="text-lg font-medium">
                              {playerStats?.kontermatschBilanz !== undefined && playerStats.kontermatschBilanz > 0 ? '+' : ''}
                              {playerStats?.kontermatschBilanz || 0}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Block 3: Trumpfansagen */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Trumpfansagen</h3>
                      </div>
                      <div ref={trumpfStatistikRef} className="p-4 space-y-2  pr-2">
                        {trumpfStatistikArray.length > 0 ? (
                          trumpfStatistikArray.map((item, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <FarbePictogram farbe={normalizeJassColor(item.farbe)} mode="svg" className="h-6 w-6 mr-2" />
                                <span className="text-gray-300 capitalize">{item.farbe}</span>
                              </div>
                              <span className="text-white font-medium mr-2">
                                <span className="text-gray-400 mr-1 text-sm">({item.anzahl})</span>
                                <span className="text-lg font-medium">{(item.anteil * 100).toFixed(1)}%</span>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Trumpfstatistik verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* Block 4: 🏆 Highlights */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">🏆 Highlights</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.highestStricheDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.highestStricheDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Höchste Strichdifferenz (Partie):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.highestStricheDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.highestStricheDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.highestStricheDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.highestPointsDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.highestPointsDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Höchste Punktdifferenz (Partie):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.highestPointsDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.highestPointsDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.highestPointsDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.longestWinStreakSessions?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestWinStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Längste Siegesserie (Partien):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.longestWinStreakSessions?.value || '-'}</span>
                          </div>
                          {playerStats?.longestWinStreakSessions?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestWinStreakSessions.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.longestUndefeatedStreakSessions?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestUndefeatedStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Längste Serie ohne Niederlage (Partien):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.longestUndefeatedStreakSessions?.value || '-'}</span>
                          </div>
                          {playerStats?.longestUndefeatedStreakSessions?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestUndefeatedStreakSessions.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.longestWinStreakGames?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestWinStreakGames.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Längste Siegesserie (Spiele):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.longestWinStreakGames?.value || '-'}</span>
                          </div>
                          {playerStats?.longestWinStreakGames?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestWinStreakGames.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.highestMatschDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.highestMatschDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Höchste Matschdifferenz (Partie):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.highestMatschDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.highestMatschDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.highestMatschDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.mostWeisPointsSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.mostWeisPointsSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Meiste Weispunkte (Partie):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.mostWeisPointsSession?.value || '-'}</span>
                          </div>
                          {playerStats?.mostWeisPointsSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.mostWeisPointsSession.date})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Block 5: 👎 Lowlights */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">👎 Lowlights</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.lowestStricheDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.lowestStricheDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Niedrigste Strichdifferenz (Partie):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.lowestStricheDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.lowestStricheDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.lowestStricheDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.lowestPointsDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.lowestPointsDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Niedrigste Punktdifferenz (Partie):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.lowestPointsDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.lowestPointsDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.lowestPointsDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.longestLossStreakSessions?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestLossStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Längste Niederlagenserie (Partien):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.longestLossStreakSessions?.value || '-'}</span>
                          </div>
                          {playerStats?.longestLossStreakSessions?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestLossStreakSessions.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.longestWinlessStreakSessions?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestWinlessStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Längste Serie ohne Sieg (Partien):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.longestWinlessStreakSessions?.value || '-'}</span>
                          </div>
                          {playerStats?.longestWinlessStreakSessions?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestWinlessStreakSessions.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.longestLossStreakGames?.startSessionId) {
                              router.push(`/view/session/public/${playerStats.longestLossStreakGames.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Längste Niederlagenserie (Spiele):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.longestLossStreakGames?.value || '-'}</span>
                          </div>
                          {playerStats?.longestLossStreakGames?.dateRange && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.longestLossStreakGames.dateRange})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.lowestMatschDifferenceSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.lowestMatschDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Niedrigste Matschdifferenz (Partie):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.lowestMatschDifferenceSession?.value || '-'}</span>
                          </div>
                          {playerStats?.lowestMatschDifferenceSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.lowestMatschDifferenceSession.date})</span>
                            </div>
                          )}
                        </div>

                        <div 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                          onClick={() => {
                            if (playerStats?.mostWeisPointsReceivedSession?.relatedId) {
                              router.push(`/view/session/public/${playerStats.mostWeisPointsReceivedSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-300">Meiste Weispunkte erhalten (Partie):</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.mostWeisPointsReceivedSession?.value || '-'}</span>
                          </div>
                          {playerStats?.mostWeisPointsReceivedSession?.date && (
                            <div className="mt-1">
                              <span className={`text-${theme.accent.replace("bg-", "").replace("-500", "-400")} text-xs`}>({playerStats.mostWeisPointsReceivedSession.date})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-center py-10">
                    <p>Keine Statistiken verfügbar</p>
                  </div>
                )}
              </TabsContent>

              {/* Partner Stats Content */}
              <TabsContent value="partner" className="w-full bg-gray-800/50 rounded-lg p-4 space-y-6">
                {(playerStats as any)?.partnerAggregates && (playerStats as any).partnerAggregates.length > 0 ? (
                  <>
                    {/* Siegquote Partien */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Siegquote Partien</h3>
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
                                key={`partner-session-${index}`}
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`}
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{partner.partnerDisplayName}</span>
                        </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      {partner.sessionsPlayedWith > 0 && (
                                        <span className="text-gray-400 mr-1 text-sm">
                                          ({partner.sessionsWonWith}/{partner.sessionsPlayedWith})
                          </span>
                                      )}
                                      <span className="text-lg font-medium">
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

                    {/* Siegquote Spiele */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Siegquote Spiele</h3>
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
                                key={`partner-game-${index}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
    />
                                    <span className="text-gray-300">{partner.partnerDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      {partner.gamesPlayedWith > 0 && (
                                        <span className="text-gray-400 mr-1 text-sm">
                                          ({partner.gamesWonWith}/{partner.gamesPlayedWith})
                                        </span>
                                      )}
                                      <span className="text-lg font-medium">
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

                    {/* Strichdifferenz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Strichdifferenz</h3>
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
                                key={`partner-striche-${index}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{partner.partnerDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      {partner.gamesPlayedWith > 0 && (
                                        <span className="text-gray-400 mr-1 text-sm">
                                          ({partner.gamesPlayedWith})
                                        </span>
                                      )}
                                      {partner.totalStricheDifferenceWith > 0 ? '+' : ''}{partner.totalStricheDifferenceWith}
                                    </span>
                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                  </div>
                </div>

                    {/* Punktdifferenz */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Punktdifferenz</h3>
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
                                key={`partner-points-${index}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{partner.partnerDisplayName}</span>
                          </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      {partner.gamesPlayedWith > 0 && (
                                        <span className="text-gray-400 mr-1 text-sm">
                                          ({partner.gamesPlayedWith})
                            </span>
                                      )}
                                      {partner.totalPointsDifferenceWith > 0 ? '+' : ''}{partner.totalPointsDifferenceWith}
                            </span>
                      </div>
                                </div>
                              </StatLink>
                            );
                          })}
                      </div>
                    </div>

                    {/* Matsch-Bilanz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Matsch-Bilanz</h3>
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
                                key={`partner-matsch-${index}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{partner.partnerDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      <span className="text-gray-400 mr-1 text-sm">
                                        ({partner.matschEventsMadeWith || 0}/{(partner.matschEventsReceivedWith || 0)})
                                      </span>
                                      <span className="text-lg font-medium">
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

                    {/* Schneider-Bilanz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Schneider-Bilanz</h3>
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
                                key={`partner-schneider-${index}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{partner.partnerDisplayName}</span>
                              </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      <span className="text-gray-400 mr-1 text-sm">
                                        ({partner.schneiderEventsMadeWith || 0}/{(partner.schneiderEventsReceivedWith || 0)})
                                      </span>
                                      <span className="text-lg font-medium">
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

                    {/* Kontermatsch-Bilanz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Kontermatsch-Bilanz</h3>
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
                                key={`partner-kontermatsch-${index}`} 
                                href={`/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner`} 
                                isClickable={!!partner.partnerId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={partner.partnerDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={partner.partnerDisplayName ? partner.partnerDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{partner.partnerDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      <span className="text-gray-400 mr-1 text-sm">
                                        ({partner.kontermatschEventsMadeWith || 0}/{(partner.kontermatschEventsReceivedWith || 0)})
                                      </span>
                                      <span className="text-lg font-medium">
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
                  </>
                ) : (
                  <div className="text-center text-gray-400 py-10">Keine Partnerstatistiken verfügbar.</div>
                )}
              </TabsContent>

              {/* Opponent Stats Content */}
              <TabsContent value="opponent" className="w-full bg-gray-800/50 rounded-lg p-4 space-y-6">
                {(playerStats as any)?.opponentAggregates && (playerStats as any).opponentAggregates.length > 0 ? (
                  <>
                    {/* Siegquote Partien */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Siegquote Partien</h3>
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
                                key={`opponent-session-${index}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      {opponent.sessionsPlayedAgainst > 0 && (
                                        <span className="text-gray-400 mr-1 text-sm">
                                          ({opponent.sessionsWonAgainst}/{opponent.sessionsPlayedAgainst})
                                        </span>
                                      )}
                                      <span className="text-lg font-medium">
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

                    {/* Siegquote Spiele */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Siegquote Spiele</h3>
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
                                key={`opponent-game-${index}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                                                        <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
    />
                                    <span className="text-gray-300">{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      {opponent.gamesPlayedAgainst > 0 && (
                                        <span className="text-gray-400 mr-1 text-sm">
                                          ({opponent.gamesWonAgainst}/{opponent.gamesPlayedAgainst})
                                        </span>
                                      )}
                                      <span className="text-lg font-medium">
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

                    {/* Strichdifferenz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Strichdifferenz</h3>
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
                                key={`opponent-striche-${index}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      {opponent.gamesPlayedAgainst > 0 && (
                                        <span className="text-gray-400 mr-1 text-sm">
                                          ({opponent.gamesPlayedAgainst})
                                        </span>
                                      )}
                                      {opponent.totalStricheDifferenceAgainst > 0 ? '+' : ''}{opponent.totalStricheDifferenceAgainst}
                                    </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                      </div>
                    </div>

                    {/* Punktdifferenz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Punktdifferenz</h3>
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
                                key={`opponent-points-${index}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      {opponent.gamesPlayedAgainst > 0 && (
                                        <span className="text-gray-400 mr-1 text-sm">
                                          ({opponent.gamesPlayedAgainst})
                                        </span>
                                      )}
                                      {opponent.totalPointsDifferenceAgainst > 0 ? '+' : ''}{opponent.totalPointsDifferenceAgainst}
                                    </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          })}
                      </div>
                    </div>

                    {/* Matsch-Bilanz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Matsch-Bilanz</h3>
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
                                key={`opponent-matsch-${index}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      <span className="text-gray-400 mr-1 text-sm">
                                        ({opponent.matschEventsMadeAgainst || 0}/{(opponent.matschEventsReceivedAgainst || 0)})
                                      </span>
                                      <span className="text-lg font-medium">
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

                    {/* Schneider-Bilanz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Schneider-Bilanz</h3>
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
                                key={`opponent-schneider-${index}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      <span className="text-gray-400 mr-1 text-sm">
                                        ({opponent.schneiderEventsMadeAgainst || 0}/{(opponent.schneiderEventsReceivedAgainst || 0)})
                                      </span>
                                      <span className="text-lg font-medium">
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

                    {/* Kontermatsch-Bilanz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 rounded-r-md mr-3" style={{ backgroundColor: accentColor }}></div>
                        <h3 className="text-base font-semibold text-white">Kontermatsch-Bilanz</h3>
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
                                key={`opponent-kontermatsch-${index}`} 
                                href={`/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent`} 
                                isClickable={!!opponent.opponentId}
                                className="block rounded-md"
                              >
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL || undefined} 
                                      alt={opponent.opponentDisplayName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={opponent.opponentDisplayName ? opponent.opponentDisplayName.charAt(0).toUpperCase() : '?'}
                                      context="list"
                                    />
                                    <span className="text-gray-300">{opponent.opponentDisplayName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      <span className="text-gray-400 mr-1 text-sm">
                                        ({opponent.kontermatschEventsMadeAgainst || 0}/{(opponent.kontermatschEventsReceivedAgainst || 0)})
                                      </span>
                                      <span className="text-lg font-medium">
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
                  </>
                ) : (
                  <div className="text-center text-gray-400 py-10">Keine Gegnerstatistiken verfügbar.</div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Archive Tab Content */}
          <TabsContent value="archive" className="w-full bg-gray-800/50 rounded-lg p-4 mb-8">
            {(sessionsLoading || tournamentsLoading) && (
              <div className="flex justify-center items-center py-10">
                <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                <span className="ml-3 text-gray-300">Lade Archiv...</span>
              </div>
            )} 
            {(sessionsError || tournamentsError) && !(sessionsLoading || tournamentsLoading) && (
              <div className="text-red-400 text-sm text-center p-4 bg-red-900/30 rounded-md"> 
                {sessionsError && `Fehler Partien: ${sessionsError}`}
                {sessionsError && tournamentsError && <br/>}
                {tournamentsError && `Fehler Turniere: ${tournamentsError}`}
              </div> 
            )} 
            {!(sessionsLoading || tournamentsLoading) && !(sessionsError || tournamentsError) && (combinedArchiveItems?.length === 0) && (
               <div className="text-center text-gray-400 py-6 px-4 bg-gray-800/30 rounded-md">
                  <Archive size={32} className="mx-auto mb-3 text-gray-500" />
                  <p className="font-semibold text-gray-300">Keine Einträge im Archiv</p>
                  <p className="text-sm">Abgeschlossene Partien und Turniere werden hier angezeigt.</p>
              </div>
            )} 
            {!(sessionsLoading || tournamentsLoading) && !(sessionsError || tournamentsError) && combinedArchiveItems && combinedArchiveItems.length > 0 && (
              <div className="space-y-4">
                 {sortedYears?.map(year => (
                   <div key={year}>
                    <h3 className="text-lg font-semibold text-white mb-3 text-center">{year}</h3>
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
      </div>
    </MainLayout>
  );
}; 