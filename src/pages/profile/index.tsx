"use client";

import React, {useEffect, useState, useRef, useMemo, useCallback} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {Button} from "@/components/ui/button";
import {Alert, AlertDescription} from "@/components/ui/alert";
import Image from "next/image";
import MainLayout from "@/components/layout/MainLayout";
import {useUIStore} from "@/store/uiStore";
import {UserCog, Users, BarChart3, CheckCircle, XCircle, Archive, Award as AwardIcon, User, Shield, XCircle as AlertXCircle, Camera as CameraIcon} from "lucide-react";
import ImageCropModal from "@/components/ui/ImageCropModal";
import {toast} from "sonner";
import {compressImage} from "@/utils/imageUtils";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {fetchCompletedSessionsForUser, SessionSummary} from '@/services/sessionService';
import Link from 'next/link';
import {format} from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import type { StricheRecord } from '@/types/jass';
import { fetchTournamentsForUser } from '@/services/tournamentService';
import type { TournamentInstance } from '@/types/tournament';
import ProfileImage from '@/components/ui/ProfileImage';
import { usePlayerStatsStore } from '@/store/playerStatsStore';
import { transformComputedStatsToExtended, type TransformedPlayerStats } from '@/utils/statsTransformer';
import { useGroupStore } from "@/store/groupStore";
import NotableEventsList from "@/components/profile/NotableEventsList";
import type { FrontendPartnerAggregate, FrontendOpponentAggregate } from '@/types/computedStats';
import { FarbePictogram } from '@/components/settings/FarbePictogram';
import { JassColor } from "@/types/jass";
import { useNestedScrollFix } from '@/hooks/useNestedScrollFix';
import type { FirestorePlayer } from '@/types/jass';
import { getGroupMembersSortedByGames } from '@/services/playerService';
import { formatMillisecondsDuration } from '@/utils/formatUtils';
import { getSessionWinRateDisplay, getWinRateDisplay } from '@/utils/winRateUtils';
import { CURRENT_PROFILE_THEME, THEME_COLORS, getCurrentProfileTheme } from '@/config/theme';
import { fetchTournamentInstancesForGroup } from '@/services/tournamentService';

interface ExpectedPlayerStatsWithAggregates {
  [key: string]: any;
  partnerAggregates?: FrontendPartnerAggregate[];
  opponentAggregates?: FrontendOpponentAggregate[];
}

interface ProfilePagePlayerStats extends TransformedPlayerStats {}

// Hilfsfunktion zum Normalisieren der Trumpffarben-Namen für die JassColor Typ-Kompatibilität
const normalizeJassColor = (farbe: string): JassColor => {
  const mappings: Record<string, JassColor> = {
    "eichel": "Eicheln",
    "unde": "Une",
    "obe": "Obe"
    // Weitere Mappings hier, falls nötig
  };
  
  // Normalisiere den Input zu Kleinbuchstaben für einen zuverlässigen Vergleich
  const lowerCaseFarbe = farbe.toLowerCase();
  
  // Prüfe, ob ein Mapping existiert, andernfalls den Originalstring als JassColor casten
  // (mit der Annahme, dass er bereits kompatibel ist, z.B. "Rosen")
  // Wichtig: Die Gross- und Kleinschreibung im Mapping beachten.
  return (mappings[lowerCaseFarbe] ?? farbe) as JassColor;
};

function isFirestoreTimestamp(value: any): value is Timestamp {
  return value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function';
}

type ArchiveItem = (SessionSummary & { type: 'session' }) | (TournamentInstance & { type: 'tournament' });

const ProfilePage: React.FC = () => {
  const {user, status, isAuthenticated, uploadProfilePicture, error: authError, clearError: clearAuthError} = useAuthStore();
  const showNotification = useUIStore((state) => state.showNotification);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trumpfStatistikRef = useRef<HTMLDivElement>(null);

  // Theme-System: Dynamische Farben mit State für Live-Updates
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    // Bevorzuge Theme aus User-Daten, fallback zu localStorage, dann Standard
    if (user?.profileTheme) {
      return user.profileTheme;
    }
    return getCurrentProfileTheme();
  });
  const theme = THEME_COLORS[currentTheme as keyof typeof THEME_COLORS] || THEME_COLORS[CURRENT_PROFILE_THEME];

  // Aktualisiere Theme wenn User-Daten geladen werden
  useEffect(() => {
    if (user?.profileTheme && user.profileTheme !== currentTheme) {
      setCurrentTheme(user.profileTheme);
      // Sync mit localStorage für Konsistenz
      localStorage.setItem('jasstafel-profile-theme', user.profileTheme);
    }
  }, [user?.profileTheme, currentTheme]);

  // Lausche auf Theme-Änderungen
  useEffect(() => {
    const handleStorageChange = () => {
      const newTheme = getCurrentProfileTheme();
      if (newTheme !== currentTheme) {
        setCurrentTheme(newTheme);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [currentTheme]);

  useNestedScrollFix(trumpfStatistikRef);

  const [activeMainTab, setActiveMainTab] = useState("stats");
  const [activeStatsSubTab, setActiveStatsSubTab] = useState("individual");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [originalFileForCrop, setOriginalFileForCrop] = useState<File | null>(null);

  const [completedSessions, setCompletedSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [userTournaments, setUserTournaments] = useState<TournamentInstance[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);
  
  // NEU: Members-Liste für Profilbilder in Partner/Gegner-Aggregaten
  const [members, setMembers] = useState<FirestorePlayer[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  
  const {
    stats: rawPlayerStats,
    isLoading: statsLoading,
    error: statsError,
    subscribeToPlayerStats,
    unsubscribePlayerStats,
  } = usePlayerStatsStore();

  const { userGroups } = useGroupStore();

  const [playerStats, setPlayerStats] = useState<ProfilePagePlayerStats | null>(null);



  useEffect(() => {
    if (router.isReady) {
      const { mainTab, statsSubTab } = router.query;
      
      const newMainTab = (typeof mainTab === 'string' && ['stats', 'archive'].includes(mainTab)) 
        ? mainTab 
        : 'stats';
      setActiveMainTab(newMainTab);
      
      if (newMainTab === 'stats') {
        const newStatsSubTab = (typeof statsSubTab === 'string' && ['individual', 'partner', 'opponent'].includes(statsSubTab)) 
          ? statsSubTab 
          : 'individual';
        setActiveStatsSubTab(newStatsSubTab);
      }
    }
  }, [router.isReady, router.query]);

  const typedRawPlayerStats = rawPlayerStats as ExpectedPlayerStatsWithAggregates | null;

  useEffect(() => {
    const loadArchiveData = async () => {
      if (status === 'authenticated' && user) {
        setSessionsLoading(true);
        setSessionsError(null);
        try {
          const sessions = await fetchCompletedSessionsForUser(user.uid);
          setCompletedSessions(sessions);
        } catch (error) {
          console.error("Fehler beim Laden der abgeschlossenen Sessions im Profil:", error);
          const message = error instanceof Error ? error.message : "Abgeschlossene Partien konnten nicht geladen werden.";
          setSessionsError(message);
        } finally {
          setSessionsLoading(false);
        }

        // Turniere über alle Gruppen des Users laden
        setTournamentsLoading(true);
        setTournamentsError(null);
        try {
          const allTournaments: TournamentInstance[] = [];
          if (userGroups && userGroups.length > 0) {
            // Lade Turniere für alle Gruppen des Users
            for (const group of userGroups) {
              const groupTournaments = await fetchTournamentInstancesForGroup(group.id);
              allTournaments.push(...groupTournaments.filter(t => 
                t.status === 'active' || 
                t.status === 'upcoming' || 
                t.status === 'completed'
              ));
            }
          }
          setUserTournaments(allTournaments);
        } catch (error) {
           console.error("Fehler beim Laden der Turniere im Profil:", error);
           const message = error instanceof Error ? error.message : "Turniere konnten nicht geladen werden.";
           setTournamentsError(message);
        } finally {
           setTournamentsLoading(false);
        }
      } else if (status === 'authenticated' && !user) {
          console.warn("User authenticated but user object not available for archive loading yet.");
      } else {
          setSessionsLoading(false);
          setTournamentsLoading(false);
          setCompletedSessions([]);
          setUserTournaments([]);
      }
    };

    loadArchiveData();
  }, [status, user, userGroups]);

  useEffect(() => {
    if (status === 'authenticated' && user?.playerId) {
      subscribeToPlayerStats(user.playerId);
    }
    
    // Cleanup für Listener
    return () => {
      unsubscribePlayerStats();
    };
  }, [status, user, subscribeToPlayerStats, unsubscribePlayerStats]);

  useEffect(() => {
    if (rawPlayerStats) {
        // groupCount hier aus userGroups ableiten oder default 0 
        const groupCount = userGroups?.length || 0;
      const transformed = transformComputedStatsToExtended(rawPlayerStats, groupCount);
      setPlayerStats(transformed as ProfilePagePlayerStats);
    } else {
      setPlayerStats(null);
        }
  }, [rawPlayerStats, userGroups]);

  // NEU: Members laden für Profilbilder in Partner/Gegner-Aggregaten
  useEffect(() => {
    const loadMembers = async () => {
      if (!userGroups || userGroups.length === 0) {
        setMembers([]);
        setMembersLoading(false);
        return;
      }

      setMembersLoading(true);
      try {
        // Lade Members für alle Gruppen des Users und vereinige sie
        const allMembers: FirestorePlayer[] = [];
        const seenPlayerIds = new Set<string>();

        for (const group of userGroups) {
          const groupMembers = await getGroupMembersSortedByGames(group.id);
          // Verhindere Duplikate (falls User in mehreren Gruppen mit gleichen Spielern ist)
          groupMembers.forEach(member => {
            const playerId = member.id || member.userId;
            if (playerId && !seenPlayerIds.has(playerId)) {
              seenPlayerIds.add(playerId);
              allMembers.push(member);
            }
          });
        }
        
        setMembers(allMembers);
      } catch (error) {
        console.error("Fehler beim Laden der Gruppenmitglieder für Profilbilder:", error);
        setMembers([]);
      } finally {
        setMembersLoading(false);
      }
    };

    loadMembers();
  }, [userGroups]);

  const combinedArchiveItems = useMemo(() => {
    const sessionsWithType: ArchiveItem[] = completedSessions.map(s => ({ ...s, type: 'session' }));
    const tournamentsWithType: ArchiveItem[] = userTournaments.map(t => ({ ...t, type: 'tournament' }));

    const combined = [...sessionsWithType, ...tournamentsWithType];

    combined.sort((a, b) => {
      const dateA = a.type === 'session' ? a.startedAt : (a.instanceDate ?? a.createdAt);
      const dateB = b.type === 'session' ? b.startedAt : (b.instanceDate ?? b.createdAt);

      const timeA = isFirestoreTimestamp(dateA) ? dateA.toMillis() :
                    (typeof dateA === 'number' ? dateA : 0);
      const timeB = isFirestoreTimestamp(dateB) ? dateB.toMillis() :
                    (typeof dateB === 'number' ? dateB : 0);

      const validTimeA = timeA || 0;
      const validTimeB = timeB || 0;

      return validTimeB - validTimeA;
    });

    return combined;
  }, [completedSessions, userTournaments]);

  const groupedArchiveByYear = useMemo(() => {
      return combinedArchiveItems.reduce<Record<string, ArchiveItem[]>>((acc, item) => {
        const dateToSort = item.type === 'session' ? item.startedAt : (item.instanceDate ?? item.createdAt);
        let year = 'Unbekannt';
        if (isFirestoreTimestamp(dateToSort)) {
            year = dateToSort.toDate().getFullYear().toString();
        } else if (typeof dateToSort === 'number' && dateToSort > 0) {
            year = new Date(dateToSort).getFullYear().toString();
        }
        
        if (!acc[year]) {
            acc[year] = [];
        }
        acc[year].push(item);
        return acc;
    }, {});
  }, [combinedArchiveItems]);

  const sortedYears = useMemo(() => {
      return Object.keys(groupedArchiveByYear).sort((a, b) => {
          if (a === 'Unbekannt') return 1;
          if (b === 'Unbekannt') return -1;
          return parseInt(b) - parseInt(a);
      });
  }, [groupedArchiveByYear]);

  const groupedSessionsByYear = completedSessions.reduce<Record<string, SessionSummary[]>>((acc, session) => {
    const year = session.startedAt ? new Date(session.startedAt).getFullYear().toString() : 'Unbekannt';
    if (!acc[year]) {
      acc[year] = [];
    }
    acc[year].push(session);
    return acc;
  }, {});

  const sortedYearsSessions = Object.keys(groupedSessionsByYear).sort((a, b) => parseInt(b) - parseInt(a));

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
        anteil: anzahl / (playerStats.totalTrumpfCount ?? 1), // Fallback für totalTrumpfCount
      }))
      .sort((a, b) => b.anzahl - a.anzahl);
  }, [playerStats]);

  useEffect(() => {
    if (!isAuthenticated() || status === "unauthenticated") {
      router.push("/");
    }
    if (authError) clearAuthError();

  }, [isAuthenticated, status, router, authError, clearAuthError]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (imageToCrop) URL.revokeObjectURL(imageToCrop);
    };
  }, [previewUrl, imageToCrop]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;

    if (files && files.length > 0) {
      const originalFile = files[0];

      if (!originalFile.type.startsWith("image/")) {
        showNotification({
          message: "Bitte wählen Sie eine Bilddatei aus (JPEG oder PNG).",
          type: "error",
        });
        return;
      }

      const initialMaxSizeInBytes = 10 * 1024 * 1024;
      if (originalFile.size > initialMaxSizeInBytes) {
        showNotification({
          message: "Die Datei ist zu groß (max. 10 MB).",
          type: "error",
        });
        return;
      }

      clearAuthError();

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (imageToCrop) URL.revokeObjectURL(imageToCrop);
      setImageToCrop(null);
      setOriginalFileForCrop(null);

      setOriginalFileForCrop(originalFile);

      const objectUrl = URL.createObjectURL(originalFile);
      setImageToCrop(objectUrl);
      setCropModalOpen(true);
    }
  };

  const handleCropComplete = async (blob: Blob | null) => {
    setCropModalOpen(false);

    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop);
      setImageToCrop(null);
    }

    if (!blob || !originalFileForCrop) {
      setOriginalFileForCrop(null);
      setIsUploading(false);
      return;
    }

    try {
      setIsUploading(true);

      const croppedFile = new File([blob], originalFileForCrop.name, {
        type: originalFileForCrop.type,
        lastModified: Date.now(),
      });

      const compressedBlob = await compressImage(croppedFile, 500, 0.7);
      if (!compressedBlob) {
        throw new Error("Bildkomprimierung fehlgeschlagen");
      }

      const finalFileToUpload = new File([compressedBlob], originalFileForCrop.name, {
         type: compressedBlob.type,
         lastModified: Date.now(),
      });

      await uploadProfilePicture(finalFileToUpload);

      toast.success("Profilbild erfolgreich aktualisiert.");
    } catch (error) {
      console.error("Fehler beim Verarbeiten des Bildes:", error);
      toast.error("Fehler beim Hochladen des Profilbilds.");
    } finally {
      setIsUploading(false);
      setOriginalFileForCrop(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSelectClick = () => {
    if (isUploading || cropModalOpen) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const renderArchiveItem = (item: ArchiveItem) => {
    if (item.type === 'session') {
      const session = item;
      const { id, startedAt, playerNames, finalScores, status, finalStriche, participantUids } = session;
      
      const sessionStatusIcon = status === 'completed'
        ? <CheckCircle className="w-4 h-4 text-green-500" />
        : <XCircle className="w-4 h-4 text-red-500" />;

      const title = 'Partie';

      const calculateTotalStriche = (striche: StricheRecord | undefined): number => {
        if (!striche) return 0;
        return (striche.berg || 0) + (striche.sieg || 0) + (striche.matsch || 0) + (striche.schneider || 0) + (striche.kontermatsch || 0);
      };
      const totalStricheBottom = status === 'completed' && finalStriche ? calculateTotalStriche(finalStriche.bottom) : null;
      const totalStricheTop = status === 'completed' && finalStriche ? calculateTotalStriche(finalStriche.top) : null;

      const displayDate = isFirestoreTimestamp(startedAt) ? startedAt.toDate() :
                         (typeof startedAt === 'number' ? new Date(startedAt) : null);
      const formattedDate = displayDate ? format(displayDate, 'dd.MM.yy, HH:mm') : 'Unbekannt';

      return (
          <Link href={`/view/session/${id}?returnTo=/profile&returnMainTab=archive`} key={`session-${id}`} passHref>
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
                     <span className="block">
                        Team 1:&nbsp; 
                        <span className="text-white">{playerNames['1'] || '?'} + {playerNames['3'] || '?'}</span>
                     </span>
                  </div>
                  <span className="text-sm font-semibold text-white pl-2">
                    {totalStricheBottom !== null ? totalStricheBottom : '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm text-gray-400">
                  <div>
                     <span className="block">
                        Team 2:&nbsp; 
                        <span className="text-white">{playerNames['2'] || '?'} + {playerNames['4'] || '?'}</span>
                     </span>
                  </div>
                  <span className="text-sm font-semibold text-white pl-2">
                    {totalStricheTop !== null ? totalStricheTop : '-'}
                  </span>
                </div>
                  </div>
              </div>
          </Link>
      );
    } else if (item.type === 'tournament') {
      const tournament = item;
      const { id, name, instanceDate, status: tournamentStatus, createdAt } = tournament;
      
      const dateToDisplay = instanceDate ?? createdAt;
      let formattedDate: string | null = null;
      if (isFirestoreTimestamp(dateToDisplay)) {
          formattedDate = format(dateToDisplay.toDate(), 'dd.MM.yyyy');
      } else if (typeof dateToDisplay === 'number') {
          formattedDate = format(new Date(dateToDisplay), 'dd.MM.yyyy');
      }

      const statusText = tournamentStatus === 'completed' ? 'Abgeschlossen' :
                         tournamentStatus === 'active' ? 'Aktiv' : 'Archiviert';
      const statusClass = tournamentStatus === 'completed' ? 'bg-gray-600 text-gray-300' :
                          tournamentStatus === 'active' ? 'bg-green-600 text-white' : 'bg-yellow-600 text-black';

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
              <span className={`text-sm px-2 py-0.5 rounded-full ${statusClass}`}>
                {statusText}
              </span>
            </div>
          </div>
        </Link>
      );
    }
    return null;
  };


  if (status === "loading" && !isUploading) {
    return (
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
          <div>Laden...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex min-h-screen flex-col items-center bg-gray-900 text-white pt-4 pb-8">
        <div className="w-full max-w-md space-y-8">
          {authError && (
            <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200 mb-4">
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          )}

          <ImageCropModal
            isOpen={cropModalOpen}
            onClose={() => handleCropComplete(null)}
            imageSrc={imageToCrop}
            onCropComplete={handleCropComplete}
            confirmButtonLabel="Hochladen"
            confirmButtonClassName={`${theme.primary} hover:${theme.primary.replace("-600", "-700")}`}
          />

          <div className="text-center mt-6">
            <div className="flex justify-center items-center mx-auto">
              <div className="relative group">
                <ProfileImage 
                  src={user?.photoURL} 
                  alt="Profilbild" 
                  size="xl"
                  className="border-2 border-gray-700"
                  priority
                  useNextImage
                />
                <button
                  onClick={handleSelectClick}
                  className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity duration-200 rounded-full"
                  disabled={isUploading || cropModalOpen} 
                  aria-label="Profilbild ändern"
                >
                  {!user?.photoURL && (
                    <CameraIcon
                      className="text-white opacity-70"
                      size={32} 
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>
            </div>

            <h1 className="mt-4 text-3xl font-bold text-center text-white mb-1">
              {user?.displayName || "Kein Name festgelegt"}
            </h1>
            <p className="text-gray-400 text-center mb-4 px-8 max-w-[90%] mx-auto min-h-[1.5rem]">
              {user?.statusMessage || "Hallo! Ich jasse mit Jassguru."}
              </p>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg, image/png, image/gif, image/webp"
              className="hidden"
              disabled={isUploading || cropModalOpen}
            />
          </div>

          <div className="flex justify-evenly gap-4 mb-6 w-full mt-8">

            <div className="flex flex-col items-center">
              <span className="text-sm text-gray-400 mb-2">Gruppen</span>
              <Button
                variant="default"
                className="h-12 w-12 flex items-center justify-center bg-yellow-600 border-yellow-700 hover:bg-yellow-500 text-white active:scale-95 transition-transform duration-100 ease-in-out"
                onClick={() => router.push("/profile/groups")}
              >
                <Users
                  style={{height: "1.5rem", width: "1.5rem"}}
                />
              </Button>
            </div>

            <div className="flex flex-col items-center">
              <span className="text-sm text-gray-400 mb-2">Turniere</span>
              <Button
                variant="default"
                className="h-12 w-12 flex items-center justify-center bg-purple-600 border-purple-700 hover:bg-purple-500 text-white active:scale-95 transition-transform duration-100 ease-in-out"
                onClick={() => router.push("/tournaments")}
              >
                <AwardIcon
                  style={{height: "1.5rem", width: "1.5rem"}}
                />
              </Button>
            </div>

            <div className="flex flex-col items-center">
              <span className="text-sm text-gray-400 mb-2">Settings</span>
              <Button
                variant="default"
                className="h-12 w-12 flex items-center justify-center text-white active:scale-95 transition-transform duration-100 ease-in-out"
                style={{
                  backgroundColor: theme.primary.includes('pink') ? '#ec4899' :
                                  theme.primary.includes('green') ? '#059669' :
                                  theme.primary.includes('blue') ? '#2563eb' :
                                  theme.primary.includes('purple') ? '#9333ea' :
                                  theme.primary.includes('red') ? '#dc2626' :
                                  theme.primary.includes('yellow') ? '#d97706' :
                                  theme.primary.includes('indigo') ? '#4f46e5' :
                                  theme.primary.includes('teal') ? '#0d9488' : '#2563eb',
                  borderColor: theme.primary.includes('pink') ? '#be185d' :
                              theme.primary.includes('green') ? '#047857' :
                              theme.primary.includes('blue') ? '#1d4ed8' :
                              theme.primary.includes('purple') ? '#7c3aed' :
                              theme.primary.includes('red') ? '#b91c1c' :
                              theme.primary.includes('yellow') ? '#b45309' :
                              theme.primary.includes('indigo') ? '#3730a3' :
                              theme.primary.includes('teal') ? '#0f766e' : '#1d4ed8'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 
                    theme.primary.includes('pink') ? '#db2777' :
                    theme.primary.includes('green') ? '#047857' :
                    theme.primary.includes('blue') ? '#1d4ed8' :
                    theme.primary.includes('purple') ? '#7c3aed' :
                    theme.primary.includes('red') ? '#b91c1c' :
                    theme.primary.includes('yellow') ? '#b45309' :
                    theme.primary.includes('indigo') ? '#3730a3' :
                    theme.primary.includes('teal') ? '#0f766e' : '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 
                    theme.primary.includes('pink') ? '#ec4899' :
                    theme.primary.includes('green') ? '#059669' :
                    theme.primary.includes('blue') ? '#2563eb' :
                    theme.primary.includes('purple') ? '#9333ea' :
                    theme.primary.includes('red') ? '#dc2626' :
                    theme.primary.includes('yellow') ? '#d97706' :
                    theme.primary.includes('indigo') ? '#4f46e5' :
                    theme.primary.includes('teal') ? '#0d9488' : '#2563eb';
                }}
                onClick={() => router.push("/profile/edit")}
              >
                <UserCog
                  style={{height: "1.5rem", width: "1.5rem"}}
                />
              </Button>
            </div>

          </div>

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
                  backgroundColor: activeMainTab === 'stats' ? (
                    theme.primary.includes('pink') ? '#ec4899' :
                    theme.primary.includes('green') ? '#059669' :
                    theme.primary.includes('blue') ? '#2563eb' :
                    theme.primary.includes('purple') ? '#9333ea' :
                    theme.primary.includes('red') ? '#dc2626' :
                    theme.primary.includes('yellow') ? '#d97706' :
                    theme.primary.includes('indigo') ? '#4f46e5' :
                    theme.primary.includes('teal') ? '#0d9488' : '#2563eb'
                  ) : 'transparent'
                }}
              > 
                <BarChart3 className="w-4 h-4 mr-2" /> Statistik 
              </TabsTrigger> 
              <TabsTrigger 
                value="archive" 
                className="data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-md py-2.5 text-sm font-medium"
                style={{
                  backgroundColor: activeMainTab === 'archive' ? (
                    theme.primary.includes('pink') ? '#ec4899' :
                    theme.primary.includes('green') ? '#059669' :
                    theme.primary.includes('blue') ? '#2563eb' :
                    theme.primary.includes('purple') ? '#9333ea' :
                    theme.primary.includes('red') ? '#dc2626' :
                    theme.primary.includes('yellow') ? '#d97706' :
                    theme.primary.includes('indigo') ? '#4f46e5' :
                    theme.primary.includes('teal') ? '#0d9488' : '#2563eb'
                  ) : 'transparent'
                }}
              > 
                <Archive className="w-4 h-4 mr-2" /> Archiv 
              </TabsTrigger> 
            </TabsList>

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
                        backgroundColor: activeStatsSubTab === 'individual' ? (
                          theme.primary.includes('pink') ? '#ec4899' :
                          theme.primary.includes('green') ? '#059669' :
                          theme.primary.includes('blue') ? '#2563eb' :
                          theme.primary.includes('purple') ? '#9333ea' :
                          theme.primary.includes('red') ? '#dc2626' :
                          theme.primary.includes('yellow') ? '#d97706' :
                          theme.primary.includes('indigo') ? '#4f46e5' :
                          theme.primary.includes('teal') ? '#0d9488' : '#2563eb'
                        ) : 'transparent'
                      }}
                    >
                      <User className="w-4 h-4 mr-1.5" />
                      Individuell
                    </TabsTrigger>
                    <TabsTrigger
                      value="partner"
                      className="data-[state=active]:text-white text-gray-400 hover:text-white rounded-md py-1.5 text-sm font-medium"
                      style={{
                        backgroundColor: activeStatsSubTab === 'partner' ? (
                          theme.primary.includes('pink') ? '#ec4899' :
                          theme.primary.includes('green') ? '#059669' :
                          theme.primary.includes('blue') ? '#2563eb' :
                          theme.primary.includes('purple') ? '#9333ea' :
                          theme.primary.includes('red') ? '#dc2626' :
                          theme.primary.includes('yellow') ? '#d97706' :
                          theme.primary.includes('indigo') ? '#4f46e5' :
                          theme.primary.includes('teal') ? '#0d9488' : '#2563eb'
                        ) : 'transparent'
                      }}
                    >
                      <Users className="w-4 h-4 mr-1.5" />
                      Partner
                    </TabsTrigger>
                    <TabsTrigger
                      value="opponent"
                      className="data-[state=active]:text-white text-gray-400 hover:text-white rounded-md py-1.5 text-sm font-medium"
                      style={{
                        backgroundColor: activeStatsSubTab === 'opponent' ? (
                          theme.primary.includes('pink') ? '#ec4899' :
                          theme.primary.includes('green') ? '#059669' :
                          theme.primary.includes('blue') ? '#2563eb' :
                          theme.primary.includes('purple') ? '#9333ea' :
                          theme.primary.includes('red') ? '#dc2626' :
                          theme.primary.includes('yellow') ? '#d97706' :
                          theme.primary.includes('indigo') ? '#4f46e5' :
                          theme.primary.includes('teal') ? '#0d9488' : '#2563eb'
                        ) : 'transparent'
                      }}
                    >
                      <Shield className="w-4 h-4 mr-1.5" />
                      Gegner
                    </TabsTrigger>
                  </TabsList>
                </div>
                
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
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Spielerübersicht</h3>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Anzahl Gruppen:</span>
                            <span className="text-gray-100 text-lg font-medium">{userGroups?.length || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Anzahl Partien:</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.totalSessions || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Anzahl Turniere:</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.totalTournaments || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Anzahl Spiele:</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.totalGames || 0}</span>
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

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Bilanzen</h3>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Strichdifferenz:</span>
                            <span className="text-gray-100 text-lg font-medium">
                              {playerStats?.totalStrichesDifference !== undefined && playerStats.totalStrichesDifference > 0 ? '+' : ''}
                              {playerStats?.totalStrichesDifference || 0}
                            </span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Punktdifferenz:</span>
                            <span className="text-gray-100 text-lg font-medium">
                              {playerStats?.totalPointsDifference !== undefined && playerStats.totalPointsDifference > 0 ? '+' : ''}
                              {playerStats?.totalPointsDifference || 0}
                            </span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Partien gewonnen:</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.sessionsWon || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Partien unentschieden:</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.sessionsTied || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Partien verloren:</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.sessionsLost || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Spiele gewonnen:</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.gamesWon || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Spiele verloren:</span>
                            <span className="text-gray-100 text-lg font-medium">{playerStats?.gamesLost || 0}</span>
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

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">🏆 Highlights</h3>
                        </div>
                        <div className="p-4 space-y-2">
                          <div 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                            onClick={() => {
                              if (playerStats?.highestStricheDifferenceSession?.relatedId) {
                                router.push(`/view/session/${playerStats.highestStricheDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.highestPointsDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.longestWinStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.longestUndefeatedStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.longestWinStreakGames.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.highestMatschDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.mostWeisPointsSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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

                      {/* Lowlights */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">👎 Lowlights</h3>
                        </div>
                        <div className="p-4 space-y-2">
                          <div 
                            className="bg-gray-700/30 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-600/50 transition-colors"
                            onClick={() => {
                              if (playerStats?.lowestStricheDifferenceSession?.relatedId) {
                                router.push(`/view/session/${playerStats.lowestStricheDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.lowestPointsDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.longestLossStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.longestWinlessStreakSessions.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.longestLossStreakGames.startSessionId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.lowestMatschDifferenceSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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
                                router.push(`/view/session/${playerStats.mostWeisPointsReceivedSession.relatedId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=individual`);
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

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Trumpffarben</h3>
                        </div>
                        <div ref={trumpfStatistikRef} className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {trumpfStatistikArray.length > 0 ? (
                            trumpfStatistikArray.map((item, index) => (
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                <div className="flex items-center">
                                  <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                  <FarbePictogram farbe={normalizeJassColor(item.farbe)} mode="svg" className="h-6 w-6 mr-2" />
                                  <span className="text-gray-300 capitalize">{item.farbe}</span>
                                </div>
                                <span className="text-white font-medium text-lg">{(item.anteil * 100).toFixed(1)}%</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 text-center py-2">Keine Trumpfstatistik verfügbar</div>
                          )}
                        </div>
                      </div>



                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-10">Keine Statistikdaten verfügbar.</div>
                  )}
                </TabsContent>
                <TabsContent value="partner" className="w-full bg-gray-800/50 rounded-lg p-4 space-y-6">
                  {typedRawPlayerStats?.partnerAggregates && typedRawPlayerStats.partnerAggregates.length > 0 ? (
                    <>
                      {/* Siegquote Partien */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Siegquote Partien</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.partnerAggregates
                            .filter(partner => partner.sessionsPlayedWith >= 1)
                            .sort((a, b) => (b.sessionWinRate || 0) - (a.sessionWinRate || 0))
                            .slice(0, 10)
                            .map((partner, index) => {
                              const playerData = members.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                              return (
                              <Link 
                                  href={partner.partnerId ? `/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner` : '#'} 
                                  key={`partner-session-${index}`} 
                                  className={`block rounded-md ${partner.partnerId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                        {partner.sessionsPlayedWith > 0 && (
                                          <span className="text-gray-400 mr-1 text-sm">
                                            ({partner.sessionsWonWith}/{partner.sessionsPlayedWith})
                            </span>
                                        )}
                                        {getWinRateDisplay(
                                          partner.sessionWinRateInfo,
                                          partner.sessionsWonWith,
                                          partner.sessionsPlayedWith
                                        )}
                            </span>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          {typedRawPlayerStats.partnerAggregates.filter(p => p.sessionsPlayedWith >= 1).length === 0 && (
                            <div className="text-gray-400 text-center py-2">Keine Partner mit ausreichend Partien</div>
                            )}
                          </div>
                      </div>

                      {/* Siegquote Spiele */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Siegquote Spiele</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.partnerAggregates
                            .filter(partner => partner.gamesPlayedWith >= 1)
                            .sort((a, b) => (b.gameWinRate || 0) - (a.gameWinRate || 0))
                            .slice(0, 10)
                            .map((partner, index) => {
                              const playerData = members.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                              return (
                              <Link 
                                  href={partner.partnerId ? `/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner` : '#'} 
                                  key={`partner-game-${index}`} 
                                  className={`block rounded-md ${partner.partnerId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                        {getWinRateDisplay(
                                          partner.gameWinRateInfo,
                                          partner.gamesWonWith,
                                          partner.gamesPlayedWith
                                        )}
                                      </span>
                                    </div>
                                  </div>
                          </Link>
                              );
                            })}
                          {typedRawPlayerStats.partnerAggregates.filter(p => p.gamesPlayedWith >= 1).length === 0 && (
                            <div className="text-gray-400 text-center py-2">Keine Partner mit ausreichend Spielen</div>
                            )}
                        </div>
                      </div>

                      {/* Strichdifferenz */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Strichdifferenz</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.partnerAggregates
                            .filter(partner => partner.gamesPlayedWith >= 1)
                            .sort((a, b) => b.totalStricheDifferenceWith - a.totalStricheDifferenceWith)
                            .slice(0, 10)
                            .map((partner, index) => {
                              const playerData = members.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                              return (
                              <Link 
                                  href={partner.partnerId ? `/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner` : '#'} 
                                  key={`partner-striche-${index}`} 
                                  className={`block rounded-md ${partner.partnerId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                            ({partner.gamesPlayedWith})
                                          </span>
                                        )}
                                        {partner.totalStricheDifferenceWith > 0 ? '+' : ''}{partner.totalStricheDifferenceWith}
                                      </span>
                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                    </div>
                  </div>

                      {/* Punktdifferenz */}
                  <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                    <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Punktdifferenz</h3>
                    </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.partnerAggregates
                            .filter(partner => partner.gamesPlayedWith >= 1)
                            .sort((a, b) => b.totalPointsDifferenceWith - a.totalPointsDifferenceWith)
                            .slice(0, 10)
                            .map((partner, index) => {
                              const playerData = members.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                              return (
                              <Link 
                                  href={partner.partnerId ? `/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner` : '#'} 
                                  key={`partner-points-${index}`} 
                                  className={`block rounded-md ${partner.partnerId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                            ({partner.gamesPlayedWith})
                              </span>
                                        )}
                                        {partner.totalPointsDifferenceWith > 0 ? '+' : ''}{partner.totalPointsDifferenceWith}
                              </span>
                        </div>
                                  </div>
                                </Link>
                              );
                            })}
                        </div>
                      </div>

                      {/* Matsch-Bilanz */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Matsch-Bilanz</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.partnerAggregates
                            .filter(partner => partner.gamesPlayedWith >= 1 && ((partner.matschEventsMadeWith || 0) > 0 || (partner.matschEventsReceivedWith || 0) > 0))
                            .sort((a, b) => (b.matschBilanz || 0) - (a.matschBilanz || 0))
                            .slice(0, 10)
                            .map((partner, index) => {
                              const playerData = members.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                              return (
                              <Link 
                                  href={partner.partnerId ? `/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner` : '#'} 
                                  key={`partner-matsch-${index}`} 
                                  className={`block rounded-md ${partner.partnerId ? 'cursor-pointer' : 'cursor-default'}`}
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
                              </Link>
                              );
                            })}
                          {typedRawPlayerStats.partnerAggregates.filter(p => p.gamesPlayedWith >= 1 && ((p.matschEventsMadeWith || 0) > 0 || (p.matschEventsReceivedWith || 0) > 0)).length === 0 && (
                            <div className="text-gray-400 text-center py-2">Keine Partner mit Matsch-Ereignissen</div>
                          )}
                    </div>
                  </div>

                      {/* Schneider-Bilanz */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Schneider-Bilanz</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.partnerAggregates
                            .filter(partner => partner.gamesPlayedWith >= 1 && ((partner.schneiderEventsMadeWith || 0) > 0 || (partner.schneiderEventsReceivedWith || 0) > 0))
                            .sort((a, b) => (b.schneiderBilanz || 0) - (a.schneiderBilanz || 0))
                            .slice(0, 10)
                            .map((partner, index) => {
                              const playerData = members.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                              return (
                                <Link 
                                  href={partner.partnerId ? `/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner` : '#'} 
                                  key={`partner-schneider-${index}`} 
                                  className={`block rounded-md ${partner.partnerId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                </Link>
                              );
                            })}
                          {typedRawPlayerStats.partnerAggregates.filter(p => p.gamesPlayedWith >= 1 && ((p.schneiderEventsMadeWith || 0) > 0 || (p.schneiderEventsReceivedWith || 0) > 0)).length === 0 && (
                            <div className="text-gray-400 text-center py-2">Keine Partner mit Schneider-Ereignissen</div>
                          )}
                        </div>
                      </div>

                      {/* Kontermatsch-Bilanz */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Kontermatsch-Bilanz</h3>
                    </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.partnerAggregates
                            .filter(partner => partner.gamesPlayedWith >= 1 && ((partner.kontermatschEventsMadeWith || 0) > 0 || (partner.kontermatschEventsReceivedWith || 0) > 0))
                            .sort((a, b) => (b.kontermatschBilanz || 0) - (a.kontermatschBilanz || 0))
                            .slice(0, 10)
                            .map((partner, index) => {
                              const playerData = members.find(m => m.id === partner.partnerId || m.userId === partner.partnerId);
                              return (
                                <Link 
                                  href={partner.partnerId ? `/profile/${partner.partnerId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=partner` : '#'} 
                                  key={`partner-kontermatsch-${index}`} 
                                  className={`block rounded-md ${partner.partnerId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                </Link>
                              );
                            })}
                          {typedRawPlayerStats.partnerAggregates.filter(p => p.gamesPlayedWith >= 1 && ((p.kontermatschEventsMadeWith || 0) > 0 || (p.kontermatschEventsReceivedWith || 0) > 0)).length === 0 && (
                            <div className="text-gray-400 text-center py-2">Keine Partner mit Kontermatsch-Ereignissen</div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-gray-400 py-10">Keine Partnerstatistiken verfügbar.</div>
                  )}
                </TabsContent>
                <TabsContent value="opponent" className="w-full bg-gray-800/50 rounded-lg p-4 space-y-6">
                  {typedRawPlayerStats?.opponentAggregates && typedRawPlayerStats.opponentAggregates.length > 0 ? (
                    <>
                      {/* Siegquote Partien */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Siegquote Partien</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.opponentAggregates
                            .filter(opponent => opponent.sessionsPlayedAgainst >= 1)
                            .sort((a, b) => (b.sessionWinRate || 0) - (a.sessionWinRate || 0))
                            .slice(0, 10)
                            .map((opponent, index) => {
                              const playerData = members.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                              return (
                                <Link 
                                  href={opponent.opponentId ? `/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent` : '#'} 
                                  key={`opponent-session-${index}`} 
                                  className={`block rounded-md ${opponent.opponentId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                        {opponent.sessionsPlayedAgainst > 0 && (
                                          <span className="text-gray-400 mr-1 text-sm">
                                            ({opponent.sessionsWonAgainst}/{opponent.sessionsPlayedAgainst})
                                          </span>
                                        )}
                                        {getWinRateDisplay(
                                          opponent.sessionWinRateInfo,
                                          opponent.sessionsWonAgainst,
                                          opponent.sessionsPlayedAgainst
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          {typedRawPlayerStats.opponentAggregates.filter(o => o.sessionsPlayedAgainst >= 1).length === 0 && (
                            <div className="text-gray-400 text-center py-2">Keine Gegner mit ausreichend Partien</div>
                          )}
                        </div>
                      </div>

                      {/* Siegquote Spiele */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Siegquote Spiele</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.opponentAggregates
                            .filter(opponent => opponent.gamesPlayedAgainst >= 1)
                            .sort((a, b) => (b.gameWinRate || 0) - (a.gameWinRate || 0))
                            .slice(0, 10)
                            .map((opponent, index) => {
                              const playerData = members.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                              return (
                                <Link 
                                  href={opponent.opponentId ? `/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent` : '#'} 
                                  key={`opponent-game-${index}`} 
                                  className={`block rounded-md ${opponent.opponentId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                        {getWinRateDisplay(
                                          opponent.gameWinRateInfo,
                                          opponent.gamesWonAgainst,
                                          opponent.gamesPlayedAgainst
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          {typedRawPlayerStats.opponentAggregates.filter(o => o.gamesPlayedAgainst >= 1).length === 0 && (
                            <div className="text-gray-400 text-center py-2">Keine Gegner mit ausreichend Spielen</div>
                          )}
                        </div>
                      </div>

                      {/* Strichdifferenz */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Strichdifferenz</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.opponentAggregates
                            .filter(opponent => opponent.gamesPlayedAgainst >= 1)
                            .sort((a, b) => b.totalStricheDifferenceAgainst - a.totalStricheDifferenceAgainst)
                            .slice(0, 10)
                            .map((opponent, index) => {
                              const playerData = members.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                              return (
                                <Link 
                                  href={opponent.opponentId ? `/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent` : '#'} 
                                  key={`opponent-striche-${index}`} 
                                  className={`block rounded-md ${opponent.opponentId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                            ({opponent.gamesPlayedAgainst})
                                          </span>
                                        )}
                                        {opponent.totalStricheDifferenceAgainst > 0 ? '+' : ''}{opponent.totalStricheDifferenceAgainst}
                                      </span>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                        </div>
                      </div>

                      {/* Punktdifferenz */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Punktdifferenz</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.opponentAggregates
                            .filter(opponent => opponent.gamesPlayedAgainst >= 1)
                            .sort((a, b) => b.totalPointsDifferenceAgainst - a.totalPointsDifferenceAgainst)
                            .slice(0, 10)
                            .map((opponent, index) => {
                              const playerData = members.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                              return (
                                <Link 
                                  href={opponent.opponentId ? `/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent` : '#'} 
                                  key={`opponent-points-${index}`} 
                                  className={`block rounded-md ${opponent.opponentId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                            ({opponent.gamesPlayedAgainst})
                                          </span>
                                        )}
                                        {opponent.totalPointsDifferenceAgainst > 0 ? '+' : ''}{opponent.totalPointsDifferenceAgainst}
                                      </span>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                        </div>
                      </div>

                      {/* Matsch-Bilanz */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Matsch-Bilanz</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.opponentAggregates
                            .filter(opponent => opponent.gamesPlayedAgainst >= 1 && ((opponent.matschEventsMadeAgainst || 0) > 0 || (opponent.matschEventsReceivedAgainst || 0) > 0))
                            .sort((a, b) => (b.matschBilanz || 0) - (a.matschBilanz || 0))
                            .slice(0, 10)
                            .map((opponent, index) => {
                              const playerData = members.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                              return (
                                <Link 
                                  href={opponent.opponentId ? `/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent` : '#'} 
                                  key={`opponent-matsch-${index}`} 
                                  className={`block rounded-md ${opponent.opponentId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                </Link>
                              );
                            })}
                          {typedRawPlayerStats.opponentAggregates.filter(o => o.gamesPlayedAgainst >= 1 && ((o.matschEventsMadeAgainst || 0) > 0 || (o.matschEventsReceivedAgainst || 0) > 0)).length === 0 && (
                            <div className="text-gray-400 text-center py-2">Keine Gegner mit Matsch-Ereignissen</div>
                          )}
                        </div>
                      </div>

                      {/* Schneider-Bilanz */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Schneider-Bilanz</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.opponentAggregates
                            .filter(opponent => opponent.gamesPlayedAgainst >= 1 && ((opponent.schneiderEventsMadeAgainst || 0) > 0 || (opponent.schneiderEventsReceivedAgainst || 0) > 0))
                            .sort((a, b) => (b.schneiderBilanz || 0) - (a.schneiderBilanz || 0))
                            .slice(0, 10)
                            .map((opponent, index) => {
                              const playerData = members.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                              return (
                                <Link 
                                  href={opponent.opponentId ? `/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent` : '#'} 
                                  key={`opponent-schneider-${index}`} 
                                  className={`block rounded-md ${opponent.opponentId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                </Link>
                              );
                            })}
                          {typedRawPlayerStats.opponentAggregates.filter(o => o.gamesPlayedAgainst >= 1 && ((o.schneiderEventsMadeAgainst || 0) > 0 || (o.schneiderEventsReceivedAgainst || 0) > 0)).length === 0 && (
                            <div className="text-gray-400 text-center py-2">Keine Gegner mit Schneider-Ereignissen</div>
                          )}
                        </div>
                      </div>

                      {/* Kontermatsch-Bilanz */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className={`w-1 h-6 ${theme.accent} rounded-r-md mr-3`}></div>
                          <h3 className="text-base font-semibold text-white">Kontermatsch-Bilanz</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {typedRawPlayerStats.opponentAggregates
                            .filter(opponent => opponent.gamesPlayedAgainst >= 1 && ((opponent.kontermatschEventsMadeAgainst || 0) > 0 || (opponent.kontermatschEventsReceivedAgainst || 0) > 0))
                            .sort((a, b) => (b.kontermatschBilanz || 0) - (a.kontermatschBilanz || 0))
                            .slice(0, 10)
                            .map((opponent, index) => {
                              const playerData = members.find(m => m.id === opponent.opponentId || m.userId === opponent.opponentId);
                              return (
                                <Link 
                                  href={opponent.opponentId ? `/profile/${opponent.opponentId}?returnTo=/profile&returnMainTab=stats&returnStatsSubTab=opponent` : '#'} 
                                  key={`opponent-kontermatsch-${index}`} 
                                  className={`block rounded-md ${opponent.opponentId ? 'cursor-pointer' : 'cursor-default'}`}
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
                                </Link>
                              );
                            })}
                          {typedRawPlayerStats.opponentAggregates.filter(o => o.gamesPlayedAgainst >= 1 && ((o.kontermatschEventsMadeAgainst || 0) > 0 || (o.kontermatschEventsReceivedAgainst || 0) > 0)).length === 0 && (
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
              {!(sessionsLoading || tournamentsLoading) && !(sessionsError || tournamentsError) && combinedArchiveItems.length === 0 && (
                 <div className="text-center text-gray-400 py-6 px-4 bg-gray-800/30 rounded-md">
                    <Archive size={32} className="mx-auto mb-3 text-gray-500" />
                    <p className="font-semibold text-gray-300">Keine Einträge im Archiv</p>
                    <p className="text-sm">Abgeschlossene Partien und Turniere werden hier angezeigt.</p>
                </div>
              )} 
              {!(sessionsLoading || tournamentsLoading) && !(sessionsError || tournamentsError) && combinedArchiveItems.length > 0 && (
                <div className="space-y-4">
                   {sortedYears.map(year => (
                     <div key={year}>
                      <h3 className="text-lg font-semibold text-white mb-3 text-center">{year}</h3>
                      <div className="space-y-2">
                        {groupedArchiveByYear[year].map(item => (
                          renderArchiveItem(item)
                         ))}
                       </div>
                     </div>
                   ))}
                </div> 
              )} 
            </TabsContent> 

          </Tabs> 

        </div>
      </div>
    </MainLayout>
  );
};

export default ProfilePage;
