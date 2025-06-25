import React, { useRef, useMemo } from "react";
import Image from "next/image";
import MainLayout from "@/components/layout/MainLayout";
import { GroupSelector } from "@/components/group/GroupSelector";
import JoinByInviteUI from "@/components/ui/JoinByInviteUI";
import {Button} from "@/components/ui/button";
import {Users, Settings, UserPlus, Camera, Upload, X, BarChart, Archive, BarChart2, CheckCircle, XCircle, MinusCircle, Award as AwardIcon, AlertTriangle, BarChart3} from "lucide-react";
import { FiShare2 } from 'react-icons/fi'; // 🚨 NEU: Share Button Icons
import { FormattedDescription } from "@/components/ui/FormattedDescription";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNestedScrollFix } from '@/hooks/useNestedScrollFix';
import { GroupMemberList } from "@/components/group/GroupMemberList";
import type { FirestorePlayer, JassColor, FarbeSettings, StrokeSettings } from "@/types/jass";
import { GroupStatistics } from "@/services/statisticsService";
import { StatLink } from '@/components/statistics/StatLink';
import { FarbePictogram } from '@/components/settings/FarbePictogram';
import { CARD_SYMBOL_MAPPINGS } from '@/config/CardStyles';
import { toTitleCase } from '@/utils/formatUtils';
import ProfileImage from '@/components/ui/ProfileImage';
import { formatMillisecondsDuration } from '@/utils/formatUtils';
import InviteModal from '@/components/group/InviteModal';
import ImageCropModal from '@/components/ui/ImageCropModal';

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
  // 🚨 SHARE-FUNKTION: Einfacher Text-Share ohne Screenshot
  const handleShareClick = async () => {
    if (!currentGroup) return;
    
    try {
      // Eleganter Share-Text erstellen
      const groupName = currentGroup.name || 'Jass-Gruppe';
      const shareText = `Schau dir die Jass-Statistiken von "${groupName}" an! 🎯🃏

Hier findest du alle Spielergebnisse, Ranglisten und das komplette Archiv.

👉 https://jassguru.ch/view/group/${currentGroup.id}

Generiert von Jassguru - der Schweizer Jass-App`;

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
      'red': '#dc2626',      // red-600 (Standard Tailwind)
      'yellow': '#ca8a04',   // yellow-600 (Standard Tailwind, konsistent mit Theme)
      'indigo': '#4f46e5',   // indigo-600 (Standard Tailwind)
      'teal': '#0d9488'      // teal-600 (Standard Tailwind)
    };
    return colorMap[themeKey] || '#ca8a04'; // Fallback zu Standard-Gelb (yellow-600)
  };
  
  // ===== FRÜHE RETURN STATEMENTS VOM ORIGINAL =====
  
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
  
  // 🚨 KORRIGIERT: Unterscheide zwischen echtem Gastmodus und öffentlicher Ansicht
  if (isGuest && !isPublicView) {
    // NUR für echten Gastmodus (nicht öffentliche Ansicht), zeige Gastmodus-Screen
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
      <div id="group-view-container" className="flex flex-col items-center justify-start min-h-screen bg-gray-900 text-white p-4 relative pt-8 pb-20">
        
        {/* 🚨 NEU: SHARE BUTTON - IMMER SICHTBAR, WENN GRUPPE EXISTIERT */}
        {currentGroup && (
                  <button 
          onClick={handleShareClick}
          className="absolute top-4 right-4 z-10 p-2 text-gray-300 hover:text-white transition-colors duration-200 rounded-full bg-gray-700/50 hover:bg-gray-600/70"
          aria-label="Gruppenstatistiken teilen"
        >
          <FiShare2 className="w-5 h-5" />
        </button>
        )}
        
        {/* ✅ SCHRITT 2: HEADER MIT LOGO UND BUTTONS */}
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
                sizes="(max-width: 768px) 128px, 128px"
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
          <TabsList className="grid w-full grid-cols-3 bg-gray-800 p-1 rounded-lg mb-4 sticky top-0 z-30 backdrop-blur-md">
            <TabsTrigger 
              value="statistics" 
              className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-2.5 text-sm font-medium"
              style={{
                backgroundColor: activeMainTab === 'statistics' ? getTabActiveColor(groupTheme) : 'transparent'
              }}
            >
              <BarChart className="w-4 h-4 mr-2" /> Statistik
            </TabsTrigger>
            <TabsTrigger 
              value="archive"
              className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-2.5 text-sm font-medium"
              style={{
                backgroundColor: activeMainTab === 'archive' ? getTabActiveColor(groupTheme) : 'transparent'
              }}
            >
              <Archive className="w-4 h-4 mr-2" /> Archiv
            </TabsTrigger>
            <TabsTrigger
              value="members" 
              className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-2.5 text-sm font-medium"
              style={{
                backgroundColor: activeMainTab === 'members' ? getTabActiveColor(groupTheme) : 'transparent'
              }}
            >
              <Users className="w-4 h-4 mr-2" /> Mitglieder
            </TabsTrigger>
          </TabsList>

          {/* STATISTIK TAB */}
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
                    <TabsTrigger 
                      value="overview" 
                      className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-1.5 text-sm font-medium"
                      style={{
                        backgroundColor: activeStatsSubTab === 'overview' ? getTabActiveColor(groupTheme) : 'transparent'
                      }}
                    >
                      <BarChart2 className="w-4 h-5 mr-1.5"/> Übersicht
                    </TabsTrigger>
                    <TabsTrigger 
                      value="players" 
                      className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-1.5 text-sm font-medium"
                      style={{
                        backgroundColor: activeStatsSubTab === 'players' ? getTabActiveColor(groupTheme) : 'transparent'
                      }}
                    >
                      <Users className="w-4 h-5 mr-1.5"/> Spieler
                    </TabsTrigger>
                    <TabsTrigger 
                      value="teams" 
                      className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-1.5 text-sm font-medium"
                      style={{
                        backgroundColor: activeStatsSubTab === 'teams' ? getTabActiveColor(groupTheme) : 'transparent'
                      }}
                    >
                      <Users className="w-4 h-5 mr-1.5"/> Teams
                    </TabsTrigger>
                  </TabsList>
                </div>
                
                {/* ÜBERSICHT TAB - MIT ECHTEN INHALTEN UND REFS */}
                <TabsContent value="overview" className="w-full bg-gray-800/50 rounded-lg p-4">
                  <div className="space-y-3 text-sm">
                    {/* ECHTE Gruppenübersicht (aus dem Original) */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Gruppenübersicht</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Mitglieder:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.memberCount || 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Anzahl Partien:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.sessionCount || 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Anzahl Turniere:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.tournamentCount || 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Anzahl Spiele:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.gameCount || 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Gesamte Jass-Zeit:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.totalPlayTime || '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Erster Jass:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.firstJassDate || '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Letzter Jass:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.lastJassDate || '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Hauptspielort:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.hauptspielortName || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* VERGESSENE SEKTION: Durchschnittswerte & Details */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Durchschnittswerte & Details</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Dauer pro Partie:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.avgSessionDuration || '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Dauer pro Spiel:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.avgGameDuration || '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Spiele pro Partie:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.avgGamesPerSession ? groupStats.avgGamesPerSession.toFixed(1) : '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Runden pro Spiel:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.avgRoundsPerGame ? groupStats.avgRoundsPerGame.toFixed(1) : '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Matsch pro Spiel:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.avgMatschPerGame ? groupStats.avgMatschPerGame.toFixed(2) : '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Rundentempo:</span>
                          <span className="text-gray-100 text-lg font-medium">{groupStats?.avgRoundDuration || '-'}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* ECHTE Anzahl Spiele Statistik mit REF */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Anzahl Spiele</h3>
                      </div>
                      <div ref={overviewMostGamesRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {(() => {
                          if (groupStats?.playerWithMostGames && groupStats.playerWithMostGames.length > 0) {
                            // Filter: Nur Spieler mit gespielten Spielen anzeigen
                            const playersWithGames = groupStats.playerWithMostGames.filter(player => 
                              player.value && player.value > 0
                            );
                            return playersWithGames.map((playerStat, index) => {
                              const playerData = findPlayerByName(playerStat.playerName, members);
                              const playerId = playerData?.id || playerData?.userId;
                              return (
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=overview` : '#'} key={`mostGames-${index}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                    <div className="flex items-center">
                                      <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                      <ProfileImage 
                                        src={playerData?.photoURL} 
                                        alt={playerStat.playerName} 
                                        size="sm"
                                        className={`mr-2 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                      />
                                      <span className="text-gray-300">{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="text-white text-lg font-medium mr-2">{playerStat.value}</span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* VERGESSENE SEKTION: Rundentempo mit REF */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Rundentempo</h3>
                      </div>
                      <div ref={playerRoundTimeRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
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
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=overview` : '#'} key={`roundTime-${index}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                    <div className="flex items-center">
                                      <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                      <ProfileImage 
                                        src={playerData?.photoURL} 
                                        alt={playerStat.playerName} 
                                        size="sm"
                                        className={`mr-2 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                      />
                                      <span className="text-gray-300">{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="text-white text-lg font-medium text-right whitespace-nowrap">{formatMillisecondsDuration(playerStat.value)}</span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* ECHTE Trumpfstatistik mit REF */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
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
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
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
                                <span className="text-white text-lg font-medium">{(item.anteil * 100).toFixed(1)}%</span>
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
                
                {/* SPIELER TAB - ALLE 8 ECHTEN STATISTIKEN */}
                <TabsContent value="players" className="w-full bg-gray-800/50 rounded-lg p-4">
                  <div className="space-y-3 text-sm">
                    {/* 1. Strichdifferenz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Strichdifferenz</h3>
                      </div>
                      <div ref={playerStricheDiffRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
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
                               <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`stricheDiff-${index}`} isClickable={!!playerId} className="block rounded-md">
                                <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <ProfileImage 
                                      src={playerData?.photoURL} 
                                      alt={playerStat.playerName} 
                                      size="sm"
                                      className={`mr-2 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                    />
                                    <span className="text-gray-300">{playerStat.playerName}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      <span className="text-gray-400 mr-1 text-sm">
                                        ({playerStat.eventsPlayed || 0})
                                      </span>
                                      <span className="text-lg font-medium">
                                        {playerStat.value > 0 ? '+' : ''}{Math.trunc(playerStat.value)}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </StatLink>
                            );
                          });
                          } else {
                            return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* 2. Punktedifferenz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Punktedifferenz</h3>
                      </div>
                      <div ref={playerPointsDiffRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
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
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`pointsDiff-${index}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                    <div className="flex items-center">
                                      <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                      <ProfileImage 
                                        src={playerData?.photoURL} 
                                        alt={playerStat.playerName} 
                                        size="sm"
                                        className={`mr-2 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                      />
                                      <span className="text-gray-300">{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="text-white font-medium mr-2">
                                        <span className="text-gray-400 mr-1 text-sm">
                                          ({playerStat.eventsPlayed || 0})
                                        </span>
                                        <span className="text-lg font-medium">
                                          {playerStat.value > 0 ? '+' : ''}{Math.trunc(playerStat.value)}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* 3. Siegquote Partie */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Siegquote Partie</h3>
                      </div>
                      <div ref={playerWinRateSessionRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
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
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`winRateSession-${index}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                    <div className="flex items-center">
                                      <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                      <ProfileImage 
                                        src={playerData?.photoURL} 
                                        alt={playerStat.playerName} 
                                        size="sm"
                                        className={`mr-2 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                      />
                                      <span className="text-gray-300">{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      {/* KORREKTUR: Stelle sicher, dass der Wert eine Zahl ist, bevor toFixed aufgerufen wird. Zeige 0.0% für ungültige Werte. */}
                                      <span className="text-white font-medium mr-2">
                                        {(typeof playerStat.value === 'number' && playerStat.eventsPlayed && playerStat.eventsPlayed > 0) && (
                                          <span className="text-gray-400 mr-1 text-sm">
                                            ({Math.round(playerStat.value * playerStat.eventsPlayed)}/{playerStat.eventsPlayed})
                                          </span>
                                        )}
                                        <span className="text-lg font-medium">
                                          {(typeof playerStat.value === 'number' ? playerStat.value * 100 : 0).toFixed(1)}%
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* 4. Siegquote Spiel */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Siegquote Spiel</h3>
                      </div>
                      <div ref={playerWinRateGameRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
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
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`winRateGame-${index}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                    <div className="flex items-center">
                                      <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                      <ProfileImage 
                                        src={playerData?.photoURL} 
                                        alt={playerStat.playerName} 
                                        size="sm"
                                        className={`mr-2 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                      />
                                      <span className="text-gray-300">{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="text-white font-medium mr-2">
                                        {(typeof playerStat.value === 'number' && playerStat.eventsPlayed && playerStat.eventsPlayed > 0) && (
                                          <span className="text-gray-400 mr-1 text-sm">
                                            ({Math.round(playerStat.value * playerStat.eventsPlayed)}/{playerStat.eventsPlayed})
                                          </span>
                                        )}
                                        <span className="text-lg font-medium">
                                          {(typeof playerStat.value === 'number' ? playerStat.value * 100 : 0).toFixed(1)}%
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* 5. Matsch-Bilanz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Matsch-Bilanz</h3>
                      </div>
                      <div ref={playerMatschRateRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
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
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`matschBilanz-${index}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                    <div className="flex items-center">
                                      <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                      <ProfileImage 
                                        src={playerData?.photoURL} 
                                        alt={playerStat.playerName} 
                                        size="sm"
                                        className={`mr-2 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                      />
                                      <span className="text-gray-300">{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="text-white font-medium mr-2">
                                        <span className="text-gray-400 mr-1 text-sm">
                                          ({playerStat.eventsMade || 0}/{playerStat.eventsReceived || 0})
                                        </span>
                                        <span className="text-lg font-medium">
                                          {playerStat.value > 0 ? '+' : ''}{playerStat.value}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* 6. Schneider-Bilanz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Schneider-Bilanz</h3>
                      </div>
                      <div ref={playerSchneiderRateRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
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
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`schneiderBilanz-${index}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                    <div className="flex items-center">
                                      <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                      <ProfileImage 
                                        src={playerData?.photoURL} 
                                        alt={playerStat.playerName} 
                                        size="sm"
                                        className={`mr-2 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                      />
                                      <span className="text-gray-300">{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="text-white font-medium mr-2">
                                        <span className="text-gray-400 mr-1 text-sm">
                                          ({playerStat.eventsMade || 0}/{playerStat.eventsReceived || 0})
                                        </span>
                                        <span className="text-lg font-medium">
                                          {playerStat.value > 0 ? '+' : ''}{playerStat.value}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* 7. Kontermatsch-Bilanz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
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
                                <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <div className="flex -space-x-2 mr-2">
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(team.names[0], members)} 
                                        alt={team.names[0]} 
                                        size="sm"
                                        className={`border-2 border-gray-800 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={team.names[0].charAt(0).toUpperCase()}
                                      />
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(team.names[1], members)} 
                                        alt={team.names[1]} 
                                        size="sm"
                                        className={`border-2 border-gray-800 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                      />
                                    </div>
                                    <span className="text-gray-300">{team.names.join(' & ')}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      <span className="text-gray-400 mr-1 text-sm">
                                        ({team.eventsMade || 0}/{team.eventsReceived || 0})
                                      </span>
                                      <span className="text-lg font-medium">
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
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Weis-Durchschnitt</h3>
                      </div>
                      <div ref={playerWeisAvgRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
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
                                <StatLink href={playerId ? `/profile/${playerId}?returnTo=/start&returnMainTab=statistics&returnStatsSubTab=players` : '#'} key={`weisPoints-${index}`} isClickable={!!playerId} className="block rounded-md">
                                  <div className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                    <div className="flex items-center">
                                      <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                      <ProfileImage 
                                        src={playerData?.photoURL} 
                                        alt={playerStat.playerName} 
                                        size="sm"
                                        className={`mr-2 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={playerStat.playerName ? playerStat.playerName.charAt(0).toUpperCase() : '?'}
                                      />
                                      <span className="text-gray-300">{playerStat.playerName}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <span className="text-white text-lg font-medium mr-2">{Math.round(Number(playerStat.value))}</span>
                                    </div>
                                  </div>
                                </StatLink>
                              );
                            });
                          } else {
                            return <div className="text-gray-400 text-center py-2">Keine aktiven Spieler verfügbar</div>;
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                {/* TEAMS TAB - ALLE 9 ECHTEN STATISTIKEN */}
                <TabsContent value="teams" className="w-full bg-gray-800/50 rounded-lg p-4">
                  <div className="space-y-3 text-sm">
                    {/* 1. Strichdifferenz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Strichdifferenz</h3>
                      </div>
                      <div ref={teamStricheDiffRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.teamWithHighestStricheDiff && groupStats.teamWithHighestStricheDiff.length > 0 ? (
                          groupStats.teamWithHighestStricheDiff
                            .filter(team => 
                              (team.eventsPlayed && team.eventsPlayed > 0) || 
                              (team.value && team.value !== 0)
                            )
                            .map((team, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <div className="flex -space-x-2 mr-2">
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[0], members)} 
                                    alt={team.names[0]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[0].charAt(0).toUpperCase()}
                                  />
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[1], members)} 
                                    alt={team.names[1]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                  />
                                </div>
                                <span className="text-gray-300">{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white font-medium mr-2">
                                <span className="text-gray-400 mr-1 text-sm">
                                  ({team.eventsPlayed || 0})
                                </span>
                                <span className="text-lg font-medium">
                                  {Math.round(Number(team.value)) > 0 ? '+' : ''}{Math.round(Number(team.value))}
                                </span>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 2. Punktedifferenz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Punktedifferenz</h3>
                      </div>
                      <div ref={teamPointsDiffRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.teamWithHighestPointsDiff && groupStats.teamWithHighestPointsDiff.length > 0 ? (
                          groupStats.teamWithHighestPointsDiff
                            .filter(team => 
                              (team.eventsPlayed && team.eventsPlayed > 0) || 
                              (team.value && team.value !== 0)
                            )
                            .map((team, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <div className="flex -space-x-2 mr-2">
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[0], members)} 
                                    alt={team.names[0]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[0].charAt(0).toUpperCase()}
                                  />
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[1], members)} 
                                    alt={team.names[1]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                  />
                                </div>
                                <span className="text-gray-300">{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white font-medium mr-2">
                                <span className="text-gray-400 mr-1 text-sm">
                                  ({team.eventsPlayed || 0})
                                </span>
                                <span className="text-lg font-medium">
                                  {Math.round(Number(team.value)) > 0 ? '+' : ''}{Math.round(Number(team.value))}
                                </span>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 3. Siegquote (Partien) */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Siegquote (Partien)</h3>
                      </div>
                      <div ref={teamWinRateSessionRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.teamWithHighestWinRateSession && groupStats.teamWithHighestWinRateSession.length > 0 ? (
                          groupStats.teamWithHighestWinRateSession
                            .filter(team => 
                              team.eventsPlayed && team.eventsPlayed > 0
                            )
                            .map((team, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <div className="flex -space-x-2 mr-2">
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[0], members)} 
                                    alt={team.names[0]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[0].charAt(0).toUpperCase()}
                                  />
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[1], members)} 
                                    alt={team.names[1]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                  />
                                </div>
                                <span className="text-gray-300">{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white font-medium mr-2">
                                {(typeof team.value === 'number' && team.eventsPlayed && team.eventsPlayed > 0) && (
                                  <span className="text-gray-400 mr-1 text-sm">
                                    ({Math.round(team.value * team.eventsPlayed)}/{team.eventsPlayed})
                                  </span>
                                )}
                                <span className="text-lg font-medium">
                                  {(Number(team.value) * 100).toFixed(1)}%
                                </span>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 4. Siegquote (Spiele) */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Siegquote (Spiele)</h3>
                      </div>
                      <div ref={teamWinRateGameRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.teamWithHighestWinRateGame && groupStats.teamWithHighestWinRateGame.length > 0 ? (
                          groupStats.teamWithHighestWinRateGame
                            .filter(team => 
                              team.eventsPlayed && team.eventsPlayed > 0
                            )
                            .map((team, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <div className="flex -space-x-2 mr-2">
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[0], members)} 
                                    alt={team.names[0]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[0].charAt(0).toUpperCase()}
                                  />
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[1], members)} 
                                    alt={team.names[1]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                  />
                                </div>
                                <span className="text-gray-300">{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white font-medium mr-2">
                                {(typeof team.value === 'number' && team.eventsPlayed && team.eventsPlayed > 0) && (
                                  <span className="text-gray-400 mr-1 text-sm">
                                    ({Math.round(team.value * team.eventsPlayed)}/{team.eventsPlayed})
                                  </span>
                                )}
                                <span className="text-lg font-medium">
                                  {(Number(team.value) * 100).toFixed(1)}%
                                </span>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 5. Matsch-Bilanz */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Matsch-Bilanz</h3>
                      </div>
                      <div ref={teamMatschRateRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
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
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                <div className="flex items-center">
                                  <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                  <div className="flex -space-x-2 mr-2">
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[0], members)} 
                                      alt={team.names[0]} 
                                      size="sm"
                                      className={`border-2 border-gray-800 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    />
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[1], members)} 
                                      alt={team.names[1]} 
                                      size="sm"
                                      className={`border-2 border-gray-800 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    />
                                  </div>
                                  <span className="text-gray-300">{team.names.join(' & ')}</span>
                                </div>
                                <div className="flex items-center">
                                  <span className="text-white font-medium mr-2">
                                    <span className="text-gray-400 mr-1 text-sm">
                                      ({team.eventsMade || 0}/{team.eventsReceived || 0})
                                    </span>
                                    <span className="text-lg font-medium">
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
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Schneider-Bilanz</h3>
                      </div>
                      <div ref={teamSchneiderRateRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
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
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                <div className="flex items-center">
                                  <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                  <div className="flex -space-x-2 mr-2">
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[0], members)} 
                                      alt={team.names[0]} 
                                      size="sm"
                                      className={`border-2 border-gray-800 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[0].charAt(0).toUpperCase()}
                                    />
                                    <ProfileImage 
                                      src={findPlayerPhotoByName(team.names[1], members)} 
                                      alt={team.names[1]} 
                                      size="sm"
                                      className={`border-2 border-gray-800 ${theme.profileImage}`}
                                      fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                      fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                    />
                                  </div>
                                  <span className="text-gray-300">{team.names.join(' & ')}</span>
                                </div>
                                <div className="flex items-center">
                                  <span className="text-white font-medium mr-2">
                                    <span className="text-gray-400 mr-1 text-sm">
                                      ({team.eventsMade || 0}/{team.eventsReceived || 0})
                                    </span>
                                    <span className="text-lg font-medium">
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
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
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
                                <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                    <div className="flex -space-x-2 mr-2">
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(team.names[0], members)} 
                                        alt={team.names[0]} 
                                        size="sm"
                                        className={`border-2 border-gray-800 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={team.names[0].charAt(0).toUpperCase()}
                                      />
                                      <ProfileImage 
                                        src={findPlayerPhotoByName(team.names[1], members)} 
                                        alt={team.names[1]} 
                                        size="sm"
                                        className={`border-2 border-gray-800 ${theme.profileImage}`}
                                        fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                        fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                      />
                                    </div>
                                    <span className="text-gray-300">{team.names.join(' & ')}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="text-white font-medium mr-2">
                                      <span className="text-gray-400 mr-1 text-sm">
                                        ({team.eventsMade || 0}/{team.eventsReceived || 0})
                                      </span>
                                      <span className="text-lg font-medium">
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
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Weis-Durchschnitt</h3>
                      </div>
                      <div ref={teamWeisAvgRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.teamWithMostWeisPointsAvg && groupStats.teamWithMostWeisPointsAvg.length > 0 ? (
                          groupStats.teamWithMostWeisPointsAvg
                            .filter(team => 
                              team.value && team.value > 0
                            )
                            .map((team, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <div className="flex -space-x-2 mr-2">
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[0], members)} 
                                    alt={team.names[0]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[0].charAt(0).toUpperCase()}
                                  />
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[1], members)} 
                                    alt={team.names[1]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                  />
                                </div>
                                <span className="text-gray-300">{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white text-lg font-medium">{Math.round(Number(team.value))}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* 9. Rundentempo */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                        <h3 className="text-base font-semibold text-white">Rundentempo</h3>
                      </div>
                      <div ref={teamRoundTimeRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.teamWithFastestRounds && groupStats.teamWithFastestRounds.length > 0 ? (
                          groupStats.teamWithFastestRounds
                            .filter(team => 
                              team.value && team.value > 0
                            )
                            .map((team, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30 hover:bg-gray-700/60 transition-colors">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <div className="flex -space-x-2 mr-2">
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[0], members)} 
                                    alt={team.names[0]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[0].charAt(0).toUpperCase()}
                                  />
                                  <ProfileImage 
                                    src={findPlayerPhotoByName(team.names[1], members)} 
                                    alt={team.names[1]} 
                                    size="sm"
                                    className={`border-2 border-gray-800 ${theme.profileImage}`}
                                    fallbackClassName="bg-gray-700 text-gray-300 text-sm"
                                    fallbackText={team.names[1] ? team.names[1].charAt(0).toUpperCase() : '?'}
                                  />
                                </div>
                                <span className="text-gray-300">{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white text-lg font-medium text-right whitespace-nowrap">{formatMillisecondsDuration(Number(team.value))}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>
                </Tabs>
            )}
          </TabsContent>

          {/* ARCHIV TAB */}
          <TabsContent value="archive" className="w-full bg-gray-800/50 rounded-lg p-4 mb-8">
            {/* FEHLER CASE: Sessions Error UND leeres Archiv */}
            {sessionsError && !sessionsLoading && !tournamentsLoading && combinedArchiveItems.length === 0 && (
                <div className="text-center text-gray-400 py-6 px-4 bg-gray-800/30 rounded-md">
                    <Archive size={32} className="mx-auto mb-3 text-gray-500" />
                    <p className="font-semibold text-gray-300">Keine Einträge im Archiv</p>
                    <p className="text-sm">Abgeschlossene Partien und Turniere werden hier angezeigt.</p>
                </div>
            )}
            
            {/* LOADING STATE: Sessions oder Tournaments laden noch */}
            {(sessionsLoading || tournamentsLoading) && (!sessionsError && !tournamentsError) && (
              <div className="flex justify-center items-center py-10">
                <div className="h-8 w-8 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                <span className="ml-3 text-gray-300">Lade Archiv...</span>
              </div>
            )}
            
            {/* EMPTY STATE: Keine Einträge, aber kein Fehler */}
            {!sessionsLoading && !tournamentsLoading && combinedArchiveItems.length === 0 && !sessionsError && !tournamentsError && (
                <div className="text-center text-gray-400 py-6 px-4 bg-gray-800/30 rounded-md">
                    <Archive size={32} className="mx-auto mb-3 text-gray-500" />
                    <p className="font-semibold text-gray-300">Keine Einträge im Archiv</p>
                    <p className="text-sm">Abgeschlossene Partien und Turniere werden hier angezeigt.</p>
                </div>
            )}
            
            {/* ERROR STATE: Spezifische Fehler für Sessions/Tournaments */}
            {((sessionsError && completedSessions.length === 0) || (tournamentsError && groupTournaments.length === 0)) && !sessionsLoading && !tournamentsLoading && (
              <div className="text-center text-red-400 py-6 px-4 bg-red-900/20 rounded-md">
                <AlertTriangle size={32} className="mx-auto mb-3 text-red-500" />
                <p className="font-semibold text-red-300">Fehler beim Laden des Archivs</p>
                {sessionsError && <p className="text-sm">Sessions: {sessionsError}</p>}
                {tournamentsError && <p className="text-sm">Turniere: {tournamentsError}</p>}
              </div>
            )}
            
            {/* SUCCESS STATE: Archiv mit Einträgen */}
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

          {/* MITGLIEDER TAB */}
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

        {/* HIDDEN FILE INPUT (ORIGINAL) */}
        {/* 🚨 KORREKTUR: NICHT NUR KOMMENTAR - ECHTES FILE INPUT WIE IM ORIGINAL! */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/jpeg, image/png"
          className="hidden"
          disabled={isUploading}
        />

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

    </MainLayout>
  );
};
