"use client";

import React, {useEffect, useState, useRef, useMemo, useCallback} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {Button} from "@/components/ui/button";
import {Alert, AlertDescription} from "@/components/ui/alert";
import Image from "next/image";
import MainLayout from "@/components/layout/MainLayout";
import {useUIStore} from "@/store/uiStore";
import {Camera, Upload, X, UserCog, Users, BarChart3, CheckCircle, XCircle, MinusCircle, Archive, Award as AwardIcon, User, Shield, XCircle as AlertXCircle, Camera as CameraIcon} from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ProfileImage from '@/components/ui/ProfileImage';
import { usePlayerStatsStore } from '@/store/playerStatsStore';
import { transformComputedStatsToExtended, type TransformedPlayerStats } from '@/utils/statsTransformer';
import { useGroupStore } from "@/store/groupStore";
import NotableEventsList from "@/components/profile/NotableEventsList";
import AggregateRankingList, { FrontendPartnerAggregate, FrontendOpponentAggregate } from "@/components/profile/AggregateRankingList";
import { FarbePictogram } from '@/components/settings/FarbePictogram';
import { JassColor } from "@/types/jass";

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
  
  const {
    stats: rawPlayerStats,
    isLoading: statsLoading,
    error: statsError,
    subscribeToPlayerStats,
    unsubscribePlayerStats,
    clearError: clearStatsError
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

        setTournamentsLoading(true);
        setTournamentsError(null);
        try {
          const tournaments = await fetchTournamentsForUser(user.uid);
          setUserTournaments(tournaments);
        } catch (error) {
           console.error("Fehler beim Laden der Turniere im Profil:", error);
           const message = error instanceof Error ? error.message : "Turniere konnten nicht geladen werden.";
           setTournamentsError(message);
        } finally {
           setTournamentsLoading(false);
        }
      } else {
          setSessionsLoading(false);
          setTournamentsLoading(false);
          setCompletedSessions([]);
          setUserTournaments([]);
      }
    };

    loadArchiveData();
  }, [status, user]);

  useEffect(() => {
    console.log("[ProfilePage Effect Sub] Running. Status:", status, "User:", user);
    if (status === 'authenticated' && user?.uid) {
      console.log(`[ProfilePage Effect Sub] Status is authenticated and user.uid is ${user.uid}. Calling subscribeToPlayerStats.`);
      subscribeToPlayerStats(user.uid);
    } else {
      console.warn(`[ProfilePage Effect Sub] Conditions not met OR unsubscribing. Status: ${status}, User UID: ${user?.uid}`);
      unsubscribePlayerStats();
    }
    return () => {
      console.log("[ProfilePage Effect Sub] Cleanup. Calling unsubscribePlayerStats.");
      unsubscribePlayerStats();
    };
  }, [status, user, subscribeToPlayerStats, unsubscribePlayerStats]);

  useEffect(() => {
    if (rawPlayerStats) {
      const groupCount = userGroups.length;
      console.log("[ProfilePage] Raw player stats from store:", JSON.parse(JSON.stringify(rawPlayerStats)));
      const transformed = transformComputedStatsToExtended(rawPlayerStats, groupCount);
      setPlayerStats(transformed as ProfilePagePlayerStats);
    } else {
      setPlayerStats(null);
        }
  }, [rawPlayerStats, userGroups]);

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
    return Object.entries(playerStats.trumpfStatistik)
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
                <div className="flex justify-between items-center text-xs text-gray-400">
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
                <div className="flex justify-between items-center text-xs text-gray-400">
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
                    <span className="text-xs text-gray-400">{formattedDate}</span>
                  )}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>
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
            confirmButtonClassName="bg-green-600 hover:bg-green-700"
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
              <span className="text-xs text-gray-400 mb-2">Gruppen</span>
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
              <span className="text-xs text-gray-400 mb-2">Turniere</span>
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
              <span className="text-xs text-gray-400 mb-2">Settings</span>
              <Button
                variant="default"
                className="h-12 w-12 flex items-center justify-center bg-blue-600 border-blue-700 hover:bg-blue-500 text-white active:scale-95 transition-transform duration-100 ease-in-out"
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
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:bg-blue-700/80 hover:text-white rounded-md py-1.5 text-sm font-medium" 
              > 
                <BarChart3 className="w-4 h-4 mr-2" /> Statistik 
              </TabsTrigger> 
              <TabsTrigger 
                value="archive" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:bg-blue-700/80 hover:text-white rounded-md py-1.5 text-sm font-medium" 
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
                      className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 hover:bg-blue-700/80 hover:text-white rounded-md py-1.5 text-sm font-medium"
                    >
                      <User className="w-4 h-4 mr-1.5" />
                      Individuell
                    </TabsTrigger>
                    <TabsTrigger
                      value="partner"
                      className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 hover:bg-blue-700/80 hover:text-white rounded-md py-1.5 text-sm font-medium"
                    >
                      <Users className="w-4 h-4 mr-1.5" />
                      Partner
                    </TabsTrigger>
                    <TabsTrigger
                      value="opponent"
                      className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 hover:bg-blue-700/80 hover:text-white rounded-md py-1.5 text-sm font-medium"
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
                          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Spielerübersicht</h3>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Anzahl Gruppen:</span>
                            <span className="text-gray-100">{playerStats?.groupCount || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Anzahl Partien:</span>
                            <span className="text-gray-100">{playerStats?.totalSessions || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Anzahl Turniere:</span>
                            <span className="text-gray-100">{playerStats?.totalTournaments || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Anzahl Spiele:</span>
                            <span className="text-gray-100">{playerStats?.totalGames || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Gesamte Jass-Zeit:</span>
                            <span className="text-gray-100">{playerStats?.totalPlayTime || '-'}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Erster Jass:</span>
                            <span className="text-gray-100">{playerStats?.firstJassDate || '-'}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Letzter Jass:</span>
                            <span className="text-gray-100">{playerStats?.lastJassDate || '-'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Turniersiege</h3>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between items-center bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-200">Turniersiege</span>
                            <span className="text-lg font-bold text-white">{playerStats?.tournamentWins || 0}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Durchschnittswerte</h3>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Ø Striche pro Spiel:</span>
                            <span className="text-gray-100">{playerStats?.avgStrichePerGame?.toFixed(1) || '0.0'}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Ø Siegquote Partie:</span>
                            <span className="text-gray-100">
                              {playerStats?.sessionWinRate ? `${(playerStats.sessionWinRate * 100).toFixed(1)}%` : '0.0%'}
                            </span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Ø Siegquote Spiel:</span>
                            <span className="text-gray-100">
                              {playerStats?.gameWinRate ? `${(playerStats.gameWinRate * 100).toFixed(1)}%` : '0.0%'}
                            </span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Ø Punkte pro Spiel:</span>
                            <span className="text-gray-100">{playerStats?.avgPointsPerGame?.toFixed(1) || '0.0'}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Ø Matsch pro Spiel:</span>
                            <span className="text-gray-100">{playerStats?.avgMatschPerGame?.toFixed(2) || '0.00'}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Ø Schneider pro Spiel:</span>
                            <span className="text-gray-100">{playerStats?.avgSchneiderPerGame?.toFixed(2) || '0.00'}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Ø Weispunkte pro Spiel:</span>
                            <span className="text-gray-100">{playerStats?.avgWeisPointsPerGame?.toFixed(1) || '0.0'}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Ø Zeit pro Runde:</span>
                            <span className="text-gray-100">{playerStats?.avgRoundTime || '0m 0s'}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Spieler-Ergebnisse</h3>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Strichdifferenz:</span>
                            <span className="text-gray-100">
                              {playerStats?.totalStrichesDifference !== undefined && playerStats.totalStrichesDifference > 0 ? '+' : ''}
                              {playerStats?.totalStrichesDifference || 0}
                            </span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Punktdifferenz:</span>
                            <span className="text-gray-100">
                              {playerStats?.totalPointsDifference !== undefined && playerStats.totalPointsDifference > 0 ? '+' : ''}
                              {playerStats?.totalPointsDifference || 0}
                            </span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Partien gewonnen:</span>
                            <span className="text-gray-100">{playerStats?.sessionsWon || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Partien unentschieden:</span>
                            <span className="text-gray-100">{playerStats?.sessionsTied || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Partien verloren:</span>
                            <span className="text-gray-100">{playerStats?.sessionsLost || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Spiele gewonnen:</span>
                            <span className="text-gray-100">{playerStats?.gamesWon || 0}</span>
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Spiele verloren:</span>
                            <span className="text-gray-100">{playerStats?.gamesLost || 0}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Highlights Partien</h3>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Höchste Strichdifferenz:</span>
                            {playerStats?.highestStricheSession && typeof playerStats.highestStricheSession.value === 'number' ? (
                              <Link 
                                href={playerStats.highestStricheSession.relatedId && playerStats.highestStricheSession.relatedType === 'session' ? `/view/session/${playerStats.highestStricheSession.relatedId}` : '#'}
                                className={`text-gray-100 ${playerStats.highestStricheSession.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                              >
                                {playerStats.highestStricheSession.value} ({playerStats.highestStricheSession.date || '-'})
                          </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                      </div>

                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Längste Siegesserie:</span>
                            {playerStats?.longestWinStreakSessions?.value ? (
                              <Link 
                                href={'#'}
                                className={`text-gray-100 cursor-default`}
                              >
                                {playerStats.longestWinStreakSessions.value} ({playerStats.longestWinStreakSessions.date || '-'}) 
                          </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>

                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Längste Serie ohne Niederlage:</span>
                            {playerStats?.longestUndefeatedStreakSessions?.value ? (
                              <Link 
                                href={'#'}
                                className={`text-gray-100 cursor-default`}
                              >
                                {playerStats.longestUndefeatedStreakSessions.value} ({playerStats.longestUndefeatedStreakSessions.dateRange || playerStats.longestUndefeatedStreakSessions.date || '-'}) 
                          </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>

                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Höchste Anzahl Matsche:</span>
                            {playerStats?.mostMatschSession && typeof playerStats.mostMatschSession.value === 'number' ? (
                              <Link 
                                href={playerStats.mostMatschSession.relatedId ? `/view/session/${playerStats.mostMatschSession.relatedId}` : '#'}
                                className={`text-gray-100 ${playerStats.mostMatschSession.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                              >
                                {playerStats.mostMatschSession.value} ({playerStats.mostMatschSession.date || '-'}) 
                          </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>

                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Meiste Weispunkte:</span>
                            {playerStats?.mostWeisPointsSession && typeof playerStats.mostWeisPointsSession.value === 'number' ? (
                              <Link 
                                href={playerStats.mostWeisPointsSession.relatedId ? `/view/session/${playerStats.mostWeisPointsSession.relatedId}` : '#'}
                                className={`text-gray-100 ${playerStats.mostWeisPointsSession.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                              >
                                {playerStats.mostWeisPointsSession.value} ({playerStats.mostWeisPointsSession.date || '-'}) 
                          </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* KORREKTE Lowlights Partien */}
                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-red-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Lowlights Partien</h3>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Höchste erhaltene Strichdifferenz:</span>
                            {playerStats?.highestStricheReceivedSession && typeof playerStats.highestStricheReceivedSession.value === 'number' ? (
                              <Link 
                                href={playerStats.highestStricheReceivedSession.relatedId && playerStats.highestStricheReceivedSession.relatedType === 'session' ? `/view/session/${playerStats.highestStricheReceivedSession.relatedId}` : '#'}
                                className={`text-gray-100 ${playerStats.highestStricheReceivedSession.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                              >
                                {playerStats.highestStricheReceivedSession.value} ({playerStats.highestStricheReceivedSession.date || '-'}) 
                          </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Längste Niederlagenserie:</span>
                            {playerStats?.longestLossStreakSessions?.value ? (
                              <span className="text-gray-100 cursor-default">
                                {playerStats.longestLossStreakSessions.value} ({playerStats.longestLossStreakSessions.dateRange || playerStats.longestLossStreakSessions.date || '-'})
                            </span>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Längste Serie ohne Sieg:</span>
                            {playerStats?.longestWinlessStreakSessions?.value ? (
                              <span className="text-gray-100 cursor-default">
                                {playerStats.longestWinlessStreakSessions.value} ({playerStats.longestWinlessStreakSessions.dateRange || playerStats.longestWinlessStreakSessions.date || '-'})
                            </span>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Höchste Anzahl Matsche bekommen:</span>
                            {playerStats?.mostMatschReceivedSession && typeof playerStats.mostMatschReceivedSession.value === 'number' ? (
                              <Link 
                                href={playerStats.mostMatschReceivedSession.relatedId && playerStats.mostMatschReceivedSession.relatedType === 'session' ? `/view/session/${playerStats.mostMatschReceivedSession.relatedId}` : '#'}
                                className={`text-gray-100 ${playerStats.mostMatschReceivedSession.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                              >
                                {playerStats.mostMatschReceivedSession.value} ({playerStats.mostMatschReceivedSession.date || '-'}) 
                          </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Meiste Weispunkte erhalten:</span>
                            {playerStats?.mostWeisPointsReceivedSession && typeof playerStats.mostWeisPointsReceivedSession.value === 'number' ? (
                              <Link 
                                href={playerStats.mostWeisPointsReceivedSession.relatedId && playerStats.mostWeisPointsReceivedSession.relatedType === 'session' ? `/view/session/${playerStats.mostWeisPointsReceivedSession.relatedId}` : '#'} 
                                className={`text-gray-100 ${playerStats.mostWeisPointsReceivedSession.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                              >
                                {playerStats.mostWeisPointsReceivedSession.value} ({playerStats.mostWeisPointsReceivedSession.date || '-'}) 
                          </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Trumpffarben</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {trumpfStatistikArray.length > 0 ? (
                            trumpfStatistikArray.map((item, index) => (
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                <div className="flex items-center">
                                  <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                  <FarbePictogram farbe={normalizeJassColor(item.farbe)} mode="svg" className="h-6 w-6 mr-2" />
                                  <span className="text-gray-300 capitalize">{item.farbe}</span>
                                </div>
                                <span className="text-white font-medium">{(item.anteil * 100).toFixed(1)}%</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 text-center py-2">Keine Trumpfstatistik verfügbar</div>
                          )}
                        </div>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Highlights Spiele</h3>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Höchste Strichdifferenz:</span>
                            {playerStats?.highestStricheGame && typeof playerStats.highestStricheGame.value === 'number' ? (
                              <Link 
                                href={playerStats.highestStricheGame.relatedId && playerStats.highestStricheGame.relatedType === 'game' ? `/view/game/${playerStats.highestStricheGame.relatedId}` : '#'} 
                                className={`text-gray-100 ${playerStats.highestStricheGame.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                              >
                                {playerStats.highestStricheGame.value} ({playerStats.highestStricheGame.date || '-'}) 
                          </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Längste Siegesserie:</span>
                            {playerStats?.longestWinStreakGames?.value ? (
                              <span className="text-gray-100 cursor-default">
                                {playerStats.longestWinStreakGames.value} ({playerStats.longestWinStreakGames.dateRange || playerStats.longestWinStreakGames.date || '-'})
                            </span>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Längste Serie ohne Niederlage:</span>
                            {playerStats?.longestUndefeatedStreakGames?.value ? (
                              <span className="text-gray-100 cursor-default">
                                {playerStats.longestUndefeatedStreakGames.value} ({playerStats.longestUndefeatedStreakGames.dateRange || playerStats.longestUndefeatedStreakGames.date || '-'})
                            </span>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Höchste Anzahl Matsche:</span>
                            {playerStats?.mostMatschGame && typeof playerStats.mostMatschGame.value === 'number' ? (
                              <Link 
                                href={playerStats.mostMatschGame.relatedId && playerStats.mostMatschGame.relatedType === 'game' ? `/view/game/${playerStats.mostMatschGame.relatedId}` : '#'} 
                                className={`text-gray-100 ${playerStats.mostMatschGame.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                              >
                                {playerStats.mostMatschGame.value} ({playerStats.mostMatschGame.date || '-'}) 
                          </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                        </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Meiste Weispunkte:</span>
                            {playerStats?.mostWeisPointsGame && typeof playerStats.mostWeisPointsGame.value === 'number' ? (
                              <Link 
                                href={playerStats.mostWeisPointsGame.relatedId && playerStats.mostWeisPointsGame.relatedType === 'game' ? `/view/game/${playerStats.mostWeisPointsGame.relatedId}` : '#'} 
                                className={`text-gray-100 ${playerStats.mostWeisPointsGame.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                              >
                                {playerStats.mostWeisPointsGame.value} ({playerStats.mostWeisPointsGame.date || '-'}) 
                              </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                    </div>
                    </div>
                  </div>

                      {/* KORREKTE Lowlights Spiele */}
                  <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                    <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-red-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Lowlights Spiele</h3>
                    </div>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Höchste erhaltene Strichdifferenz:</span>
                            {playerStats?.highestStricheReceivedGame && typeof playerStats.highestStricheReceivedGame.value === 'number' ? (
                              <Link 
                                href={playerStats.highestStricheReceivedGame.relatedId && playerStats.highestStricheReceivedGame.relatedType === 'game' ? `/view/game/${playerStats.highestStricheReceivedGame.relatedId}` : '#'} 
                                className={`text-gray-100 ${playerStats.highestStricheReceivedGame.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                              >
                                {playerStats.highestStricheReceivedGame.value} ({playerStats.highestStricheReceivedGame.date || '-'}) 
                              </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                            </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Längste Niederlagen:</span>
                            {playerStats?.longestLossStreakGames?.value ? (
                              <span className="text-gray-100 cursor-default">
                                {playerStats.longestLossStreakGames.value} ({playerStats.longestLossStreakGames.dateRange || playerStats.longestLossStreakGames.date || '-'})
                              </span>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                          </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Längste Serie ohne Sieg:</span>
                            {playerStats?.longestWinlessStreakGames?.value ? (
                              <span className="text-gray-100 cursor-default">
                                {playerStats.longestWinlessStreakGames.value} ({playerStats.longestWinlessStreakGames.dateRange || playerStats.longestWinlessStreakGames.date || '-'})
                              </span>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                        </div>
                          <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                            <span className="font-medium text-gray-300">Höchste Anzahl Matsche bekommen:</span>
                            {playerStats?.mostMatschReceivedGame && typeof playerStats.mostMatschReceivedGame.value === 'number' ? (
                              <Link 
                                href={playerStats.mostMatschReceivedGame.relatedId && playerStats.mostMatschReceivedGame.relatedType === 'game' ? `/view/game/${playerStats.mostMatschReceivedGame.relatedId}` : '#'} 
                                className={`text-gray-100 ${playerStats.mostMatschReceivedGame.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                              >
                                {playerStats.mostMatschReceivedGame.value} ({playerStats.mostMatschReceivedGame.date || '-'}) 
                              </Link>
                            ) : (
                              <span className="text-gray-100">-</span>
                            )}
                  </div>
                    </div>
                  </div>

                      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                          <h3 className="text-base font-semibold text-white">Trumpffarben</h3>
                        </div>
                        <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                          {trumpfStatistikArray.length > 0 ? (
                            trumpfStatistikArray.map((item, index) => (
                              <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                                <div className="flex items-center">
                                  <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                  <FarbePictogram farbe={normalizeJassColor(item.farbe)} mode="svg" className="h-6 w-6 mr-2" />
                                  <span className="text-gray-300 capitalize">{item.farbe}</span>
                                </div>
                                <span className="text-white font-medium">{(item.anteil * 100).toFixed(1)}%</span>
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
                      <AggregateRankingList
                        title="Rangliste: Strichdifferenz"
                        items={typedRawPlayerStats.partnerAggregates}
                        valueSelector={(item) => (item as FrontendPartnerAggregate).totalStricheDifferenceWith}
                        valueFormatter={(val) => {
                            const numVal = Number(val);
                            return `${numVal > 0 ? '+' : ''}${numVal}`;
                        }}
                        identifierKey="partnerId"
                      />
                      <AggregateRankingList
                        title="Rangliste: Siegquote Partien"
                        items={typedRawPlayerStats.partnerAggregates}
                        valueSelector={(item) => {
                          const pa = item as FrontendPartnerAggregate;
                          return pa.sessionsPlayedWith > 0 ? (pa.sessionsWonWith / pa.sessionsPlayedWith) : 0;
                        }}
                        valueFormatter={(val) => `${((val as number) * 100).toFixed(1)}%`}
                        identifierKey="partnerId"
                      />
                      <AggregateRankingList
                        title="Rangliste: Siegquote Spiele"
                        items={typedRawPlayerStats.partnerAggregates}
                        valueSelector={(item) => {
                          const pa = item as FrontendPartnerAggregate;
                          return pa.gamesPlayedWith > 0 ? (pa.gamesWonWith / pa.gamesPlayedWith) : 0;
                        }}
                        valueFormatter={(val) => `${((val as number) * 100).toFixed(1)}%`}
                        identifierKey="partnerId"
                      />
                      <AggregateRankingList
                        title="Rangliste: Punkte"
                        items={typedRawPlayerStats.partnerAggregates}
                        valueSelector={(item) => (item as FrontendPartnerAggregate).totalPointsWith}
                        identifierKey="partnerId"
                      />
                      <AggregateRankingList
                        title="Rangliste: Matsch-Quote Spiel"
                        items={typedRawPlayerStats.partnerAggregates}
                        valueSelector={(item) => {
                          const pa = item as FrontendPartnerAggregate;
                          return pa.gamesPlayedWith > 0 ? (pa.matschGamesWonWith / pa.gamesPlayedWith) : 0;
                        }}
                        valueFormatter={(val) => `${(val as number).toFixed(2)}`}
                        identifierKey="partnerId"
                      />
                      <AggregateRankingList
                        title="Rangliste: Schneider-Quote Spiel"
                        items={typedRawPlayerStats.partnerAggregates}
                        valueSelector={(item) => {
                          const pa = item as FrontendPartnerAggregate;
                          return pa.gamesPlayedWith > 0 ? (pa.schneiderGamesWonWith / pa.gamesPlayedWith) : 0;
                        }}
                        valueFormatter={(val) => `${(val as number).toFixed(2)}`}
                        identifierKey="partnerId"
                      />
                    </>
                  ) : (
                    <div className="text-center text-gray-400 py-10">Keine Partnerstatistiken verfügbar.</div>
                  )}
                </TabsContent>
                <TabsContent value="opponent" className="w-full bg-gray-800/50 rounded-lg p-4 space-y-6">
                  {typedRawPlayerStats?.opponentAggregates && typedRawPlayerStats.opponentAggregates.length > 0 ? (
                    <>
                      <AggregateRankingList
                        title="Rangliste: Strichdifferenz"
                        items={typedRawPlayerStats.opponentAggregates}
                        valueSelector={(item) => (item as FrontendOpponentAggregate).totalStricheDifferenceAgainst}
                        valueFormatter={(val) => {
                            const numVal = Number(val);
                            return `${numVal > 0 ? '+' : ''}${numVal}`;
                        }}
                        identifierKey="opponentId"
                      />
                      <AggregateRankingList
                        title="Rangliste: Siegquote Partien"
                        items={typedRawPlayerStats.opponentAggregates}
                        valueSelector={(item) => {
                          const oa = item as FrontendOpponentAggregate;
                          return oa.sessionsPlayedAgainst > 0 ? (oa.sessionsWonAgainst / oa.sessionsPlayedAgainst) : 0;
                        }}
                        valueFormatter={(val) => `${((val as number) * 100).toFixed(1)}%`}
                        identifierKey="opponentId"
                      />
                      <AggregateRankingList
                        title="Rangliste: Siegquote Spiele"
                        items={typedRawPlayerStats.opponentAggregates}
                        valueSelector={(item) => {
                          const oa = item as FrontendOpponentAggregate;
                          return oa.gamesPlayedAgainst > 0 ? (oa.gamesWonAgainst / oa.gamesPlayedAgainst) : 0;
                        }}
                        valueFormatter={(val) => `${((val as number) * 100).toFixed(1)}%`}
                        identifierKey="opponentId"
                      />
                       <AggregateRankingList
                        title="Rangliste: Punkte erzielt (gegen)"
                        items={typedRawPlayerStats.opponentAggregates}
                        valueSelector={(item) => (item as FrontendOpponentAggregate).totalPointsScoredWhenOpponent}
                        identifierKey="opponentId"
                      />
                      <AggregateRankingList
                        title="Rangliste: Matsch-Siegquote Spiel (gegen)"
                        items={typedRawPlayerStats.opponentAggregates}
                        valueSelector={(item) => {
                          const oa = item as FrontendOpponentAggregate;
                          return oa.gamesPlayedAgainst > 0 ? (oa.matschGamesWonAgainstOpponentTeam / oa.gamesPlayedAgainst) : 0;
                        }}
                        valueFormatter={(val) => `${(val as number).toFixed(2)}`}
                        identifierKey="opponentId"
                      />
                      <AggregateRankingList
                        title="Rangliste: Schneider-Siegquote Spiel (gegen)"
                        items={typedRawPlayerStats.opponentAggregates}
                        valueSelector={(item) => {
                          const oa = item as FrontendOpponentAggregate;
                          return oa.gamesPlayedAgainst > 0 ? (oa.schneiderGamesWonAgainstOpponentTeam / oa.gamesPlayedAgainst) : 0;
                        }}
                        valueFormatter={(val) => `${(val as number).toFixed(2)}`}
                        identifierKey="opponentId"
                      />
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
                      <h3 className="text-lg font-semibold text-white mb-2 sticky top-0 bg-gray-900 py-1 z-10">{year}</h3>
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
