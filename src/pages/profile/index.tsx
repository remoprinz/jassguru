"use client";

import React, {useEffect, useState, useRef, useMemo, useCallback} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";

import {fetchCompletedSessionsForUser, fetchCompletedSessionsForPlayer, SessionSummary} from '@/services/sessionService';
import Link from 'next/link';
import {format} from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import type { StricheRecord, FirestorePlayer } from '@/types/jass';
import {fetchTournamentInstancesForGroup } from '@/services/tournamentService';
import type { TournamentInstance } from '@/types/tournament';
import { usePlayerStatsStore } from '@/store/playerStatsStore';
import { transformComputedStatsToExtended, type TransformedPlayerStats } from '@/utils/statsTransformer';
import { useGroupStore } from "@/store/groupStore";
import type { FrontendPartnerAggregate, FrontendOpponentAggregate } from '@/types/computedStats';
import { JassColor } from "@/types/jass";
import { getGroupMembersSortedByGames, getPlayerByUserId } from '@/services/playerService';
import { getGroupMembersOptimized } from '@/services/groupService';
import { THEME_COLORS, getCurrentProfileTheme } from '@/config/theme';
import { CheckCircle, XCircle, Award as AwardIcon } from "lucide-react";
import { ProfileView } from '@/components/profile/ProfileView';
import MainLayout from '@/components/layout/MainLayout';

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
  const {user, status, isAuthenticated, error: authError, clearError: clearAuthError} = useAuthStore();
  const showNotification = useUIStore((state) => state.showNotification);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputKey, setInputKey] = useState(Date.now()); // ✅ Force re-render für iOS Safari

  const [activeMainTab, setActiveMainTab] = useState("stats");
  const [activeStatsSubTab, setActiveStatsSubTab] = useState("individual");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [originalFileForCrop, setOriginalFileForCrop] = useState<File | null>(null);
  const [cropModalLoading, setCropModalLoading] = useState(false); // NEU: Loading-Zustand für Crop Modal

  const [completedSessions, setCompletedSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [userTournaments, setUserTournaments] = useState<TournamentInstance[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);
  
  // NEU: Members-Liste für Profilbilder in Partner/Gegner-Aggregaten
  const [members, setMembers] = useState<FirestorePlayer[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  
  // 🔧 FIX: Aktuelle Player-Daten aus Firebase laden (für korrekte Theme-Anzeige)
  const [currentPlayerData, setCurrentPlayerData] = useState<FirestorePlayer | null>(null);
  
  const {
    stats: rawPlayerStats,
    isLoading: statsLoading,
    error: statsError,
    subscribeToPlayerStats,
    unsubscribePlayerStats,
  } = usePlayerStatsStore();

  const { userGroups, currentGroup } = useGroupStore();

  // Theme-System: Verwende PERSÖNLICHES Profil-Theme (UNABHÄNGIG vom Gruppen-Theme!)
  // PRIORITÄT: Firebase > localStorage > Default
  // 🔧 FIX: Verwende aktuelle Firebase-Daten für profileTheme
  // 🎯 KRITISCH: Warte auf Firebase-Daten, um Pink-Flackern zu vermeiden
  const profileTheme = useMemo(() => {
    // Wenn Firebase-Daten verfügbar sind, verwende sie
    if (currentPlayerData?.profileTheme) {
      return getCurrentProfileTheme(currentPlayerData.profileTheme);
    }
    // Wenn authStore User-Daten verfügbar sind, verwende sie  
    if (user?.profileTheme) {
      return getCurrentProfileTheme(user.profileTheme);
    }
    // Sonst Standard verwenden (NICHT localStorage um Flackern zu vermeiden)
    return 'cyan'; // User's Firebase default
  }, [currentPlayerData?.profileTheme, user?.profileTheme]);
  
  const theme = THEME_COLORS[profileTheme as keyof typeof THEME_COLORS] || THEME_COLORS.cyan;

  const [playerStats, setPlayerStats] = useState<ProfilePagePlayerStats | null>(null);

  // ===== CURRENT PLAYER für ProfileView =====
  const currentPlayer: FirestorePlayer | null = useMemo(() => {
    if (!user) return null;
    
    // 🔧 FIX: Bevorzuge aktuelle Firebase-Daten, fallback zu authStore.user
    const playerData = currentPlayerData || user;
    
    return {
      id: user.playerId || user.uid,
      userId: user.uid,
      isGuest: false,
      groupIds: userGroups?.map(g => g.id) || [],
      name: user.displayName || user.email || 'Unbekannt',
      displayName: user.displayName || user.email || 'Unbekannt',
      email: user.email || '',
      profilePictureUrl: user.photoURL || '',
      photoURL: user.photoURL || '', // Auch photoURL für Kompatibilität
      createdAt: Timestamp.now(),
      // 🎯 KRITISCH: Verwende profileTheme aus Firebase (currentPlayerData) statt authStore
      profileTheme: currentPlayerData?.profileTheme || user.profileTheme || 'yellow',
      statusMessage: currentPlayerData?.statusMessage || user.statusMessage || 'Hallo! Ich jasse mit jassguru.ch',
      // Übernehme weitere relevante Felder aus Firebase
      ...(currentPlayerData && {
        updatedAt: currentPlayerData.updatedAt,
        metadata: currentPlayerData.metadata
      })
    };
  }, [user, userGroups, currentPlayerData]);

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

  // ✅ NEUE, ROBUSTE LADE-LOGIK FÜR ARCHIV-DATEN
  useEffect(() => {
    const loadArchiveData = async () => {
      // Wir warten auf die aktuellen, aus Firebase geladenen Spielerdaten.
      // Dies löst die Race Condition und stellt sicher, dass wir die korrekte Gruppenliste haben.
      if (currentPlayerData) {
        // 1. Abgeschlossene Sessions laden
        setSessionsLoading(true);
        setSessionsError(null);
        try {
          if (!currentPlayerData?.id) throw new Error("Player ID ist nicht verfügbar.");
          const sessions = await fetchCompletedSessionsForPlayer(currentPlayerData.id);
          setCompletedSessions(sessions);
        } catch (error) {
          console.error("Fehler beim Laden der abgeschlossenen Sessions im Profil:", error);
          const message = error instanceof Error ? error.message : "Abgeschlossene Partien konnten nicht geladen werden.";
          setSessionsError(message);
        } finally {
          setSessionsLoading(false);
        }

        // 2. Turniere laden (jetzt auch basierend auf den aktuellen groupIds)
        setTournamentsLoading(true);
        setTournamentsError(null);
        try {
          const allTournaments: TournamentInstance[] = [];
          const groupIds = currentPlayerData.groupIds || [];

          if (groupIds.length > 0) {
            for (const groupId of groupIds) {
              try {
                const groupTournaments = await fetchTournamentInstancesForGroup(groupId);
                allTournaments.push(...groupTournaments.filter(t => 
                  t.status === 'active' || 
                  t.status === 'upcoming' || 
                  t.status === 'completed'
                ));
              } catch (groupError) {
                console.warn(`Fehler beim Laden der Turniere für Gruppe ${groupId}:`, groupError);
              }
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
      } else if (status === 'unauthenticated') {
          // Wenn der User ausgeloggt ist, alles leeren.
          setSessionsLoading(false);
          setTournamentsLoading(false);
          setCompletedSessions([]);
          setUserTournaments([]);
      }
    };

    loadArchiveData();
  }, [currentPlayerData, status]); // Trigger NUR wenn aktuelle Spielerdaten geladen sind.

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
          // 🚀 PERFORMANCE-OPTIMIERT: Nutze Members-Subcollection statt einzelne Player-Reads
          const groupMembers = await getGroupMembersOptimized(group.id);
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

  // 🔧 FIX: Aktuelle Player-Daten aus Firebase laden (für korrekte Theme-Anzeige)
  useEffect(() => {
    const loadCurrentPlayerData = async () => {
      if (!user?.uid) {
        setCurrentPlayerData(null);
        return;
      }

      try {
        const playerData = await getPlayerByUserId(user.uid);
        setCurrentPlayerData(playerData);
      } catch (error) {
        console.error("Fehler beim Laden der aktuellen Player-Daten:", error);
        setCurrentPlayerData(null);
      }
    };

    loadCurrentPlayerData();
  }, [user?.uid]);

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
        const file = files[0];
        
        // ✅ VERBESSERTE VALIDIERUNG: Unterstützt HEIC/HEIF und andere moderne Formate
        const allowedTypes = [
          'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 
          'image/gif', 'image/heic', 'image/heif', 'image/avif'
        ];
        
        const isValidType = allowedTypes.includes(file.type) || 
                           file.name.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|heic|heif|avif)$/);
        
        if (!isValidType) {
            showNotification({ 
              message: "Bitte wählen Sie eine gültige Bilddatei (JPEG, PNG, WebP, GIF, HEIC, HEIF).", 
              type: "error" 
            });
            return;
        }
        
        // Größenprüfung
        const maxSizeMB = 5;
        if (file.size > maxSizeMB * 1024 * 1024) {
            showNotification({ 
              message: `Die Datei ist zu groß (max. ${maxSizeMB} MB).`, 
              type: "error" 
            });
            return;
        }
        
        const objectUrl = URL.createObjectURL(file);
        setImageToCrop(objectUrl);
        setOriginalFileForCrop(file); // Speichere die Originaldatei
        setCropModalOpen(true);
    }
  };

  const handleCropComplete = async (croppedImageBlob: Blob | null) => {
    if (!croppedImageBlob || !user) {
        setCropModalOpen(false);
        setImageToCrop(null);
        setOriginalFileForCrop(null);
        return;
    }

    try {
        setCropModalLoading(true); // NEU: Loading-Zustand aktivieren
        setIsUploading(true);
        const finalFile = new File([croppedImageBlob], originalFileForCrop?.name || 'profile.jpg', { type: 'image/jpeg' });
        
        // ✅ KRITISCHE ÄNDERUNG: Verwende AuthStore-Funktion anstatt Service direkt
        // Das aktualisiert automatisch das User-Objekt im Store und somit in der UI
        const uploadProfilePicture = useAuthStore.getState().uploadProfilePicture;
        await uploadProfilePicture(finalFile);
        
        // NEU: Erfolgreiche Upload-Nachricht
        showNotification?.({ 
            message: "Profilbild erfolgreich aktualisiert!", 
            type: "success" 
        });
        
        // NEU: Modal erst nach erfolgreichem Upload schließen
        setCropModalOpen(false);
        setImageToCrop(null);
        
    } catch (error) {
        console.error("Fehler beim Hochladen des Profilbilds:", error);
        
        // NEU: Bessere Fehlermeldung über Notification-System
        showNotification?.({ 
            message: error instanceof Error ? error.message : "Profilbild konnte nicht hochgeladen werden.", 
            type: "error" 
        });
        
    } finally {
        setCropModalLoading(false); // NEU: Loading-Zustand deaktivieren
        setIsUploading(false);
        setOriginalFileForCrop(null);
    }
  };

  const handleSelectClick = () => {
    fileInputRef.current?.click();
  };

  const handleCancelSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    // Zurücksetzen des File-Inputs
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  const handleUpload = async () => {
    // Diese Funktion wird nicht mehr direkt benötigt, da der Upload in handleCropComplete stattfindet.
    // Kann als Platzhalter bleiben oder für zukünftige, direkte Uploads ohne Crop verwendet werden.
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
          <Link href={`/view/session/public/${id}?groupId=${session.groupId || session.gruppeId || ''}&returnTo=/profile&returnMainTab=archive`} key={`session-${id}`} passHref>
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
        <div className="flex items-center justify-center bg-gray-900 text-white py-20">
          <div>Laden...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <ProfileView
      user={user}
      player={currentPlayer}
      isPublicView={false}
      isAuthenticated={isAuthenticated}
      router={router}
      showNotification={showNotification}
      activeMainTab={activeMainTab}
      activeStatsSubTab={activeStatsSubTab}
      playerStats={playerStats}
      statsLoading={statsLoading}
      statsError={statsError}
      members={members}
      membersLoading={membersLoading}
      completedSessions={completedSessions}
      userTournaments={userTournaments}
      sessionsLoading={sessionsLoading}
      sessionsError={sessionsError}
      tournamentsLoading={tournamentsLoading}
      tournamentsError={tournamentsError}
      combinedArchiveItems={combinedArchiveItems}
      groupedArchiveByYear={groupedArchiveByYear}
      sortedYears={sortedYears}
      renderArchiveItem={renderArchiveItem}
      fileInputRef={fileInputRef}
      previewUrl={previewUrl}
      isUploading={isUploading}
      cropModalOpen={cropModalOpen}
      cropModalLoading={cropModalLoading}
      imageToCrop={imageToCrop}
      handleFileChange={handleFileChange}
      handleCropComplete={handleCropComplete}
      handleSelectClick={handleSelectClick}
      inputKey={inputKey}
      theme={theme}
      profileTheme={profileTheme}
    />
  );
};

export default ProfilePage;
