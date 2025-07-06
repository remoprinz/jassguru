"use client";

import React, {useEffect, useState, useRef, useMemo, useCallback} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import {toast} from "sonner";
import {compressImage} from "@/utils/imageUtils";
import {fetchCompletedSessionsForUser, SessionSummary} from '@/services/sessionService';
import Link from 'next/link';
import {format} from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import type { StricheRecord } from '@/types/jass';
import { fetchTournamentsForUser } from '@/services/tournamentService';
import type { TournamentInstance } from '@/types/tournament';
import { usePlayerStatsStore } from '@/store/playerStatsStore';
import { transformComputedStatsToExtended, type TransformedPlayerStats } from '@/utils/statsTransformer';
import { useGroupStore } from "@/store/groupStore";
import type { FrontendPartnerAggregate, FrontendOpponentAggregate } from '@/types/computedStats';
import { JassColor } from "@/types/jass";
import type { FirestorePlayer } from '@/types/jass';
import { getGroupMembersSortedByGames } from '@/services/playerService';
import { THEME_COLORS, getCurrentProfileTheme } from '@/config/theme';
import { fetchTournamentInstancesForGroup } from '@/services/tournamentService';
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
  const {user, status, isAuthenticated, uploadProfilePicture, error: authError, clearError: clearAuthError} = useAuthStore();
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

  const { userGroups, currentGroup } = useGroupStore();

  // Theme-System: Verwende PERSÖNLICHES Profil-Theme (UNABHÄNGIG vom Gruppen-Theme!)
  // PRIORITÄT: Firebase > localStorage > Default
  const profileTheme = getCurrentProfileTheme(user?.profileTheme); // Theme aus Firebase oder localStorage
  const theme = THEME_COLORS[profileTheme as keyof typeof THEME_COLORS] || THEME_COLORS.yellow;

  const [playerStats, setPlayerStats] = useState<ProfilePagePlayerStats | null>(null);

  // ===== CURRENT PLAYER für ProfileView =====
  const currentPlayer: FirestorePlayer | null = useMemo(() => {
    if (!user) return null;
    
    return {
      id: user.playerId || user.uid,
      userId: user.uid,
      isGuest: false,
      groupIds: userGroups?.map(g => g.id) || [],
      name: user.displayName || user.email || 'Unbekannt',
      displayName: user.displayName || user.email || 'Unbekannt',
      email: user.email || '',
      profilePictureUrl: user.photoURL || '',
      createdAt: Timestamp.now(),
      profileTheme: user.profileTheme || 'yellow'
    };
  }, [user, userGroups]);

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

      // ✅ Erweiterte Bild-Validierung
      if (!originalFile.type.startsWith("image/")) {
        showNotification({
          message: "Bitte wählen Sie eine Bilddatei aus (JPEG, PNG, WebP oder GIF).",
          type: "error",
        });
        return;
      }

      // ✅ Spezifische Bildformat-Prüfung (inkl. iOS HEIC/HEIF)
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
      const fileExtension = originalFile.name.toLowerCase().split('.').pop();
      const isValidType = allowedTypes.includes(originalFile.type.toLowerCase()) || 
                         ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(fileExtension || '');
      
      if (!isValidType) {
        showNotification({
          message: "Unterstützte Formate: JPEG, PNG, WebP, GIF, HEIC",
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

      // ✅ Minimale Dateigröße prüfen (verhindert korrupte Dateien)
      if (originalFile.size < 100) {
        showNotification({
          message: "Die Bilddatei ist zu klein oder beschädigt.",
          type: "error",
        });
        return;
      }

      clearAuthError();

      // ✅ Cleanup von vorherigen URLs
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      if (imageToCrop) {
        URL.revokeObjectURL(imageToCrop);
        setImageToCrop(null);
      }
      setOriginalFileForCrop(null);

      try {
        // ✅ Debug-Logging für Entwicklung
        if (process.env.NODE_ENV === 'development') {
          console.log('[ProfileUpload] Validiere Bild:', {
            name: originalFile.name,
            type: originalFile.type,
            size: `${(originalFile.size / 1024).toFixed(2)} KB`,
            lastModified: new Date(originalFile.lastModified).toISOString(),
            isHEIC: originalFile.type.includes('heic') || originalFile.name.toLowerCase().includes('.heic'),
            userAgent: navigator.userAgent
          });
        }

        // ✅ Spezielle Behandlung für iOS HEIC/HEIF Dateien
        const isAppleFormat = originalFile.type.includes('heic') || originalFile.type.includes('heif') || 
                             originalFile.name.toLowerCase().includes('.heic') || originalFile.name.toLowerCase().includes('.heif');
        
        if (isAppleFormat) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ProfileUpload] Apple HEIC/HEIF Format erkannt, verwende erweiterte Validierung');
          }
          
          // Für HEIC-Dateien weniger strenge Validierung, da Browser-Support variiert
          showNotification({
            message: "HEIC-Format erkannt. Falls Probleme auftreten, versuchen Sie es mit einem JPEG-Format.",
            type: "info",
          });
        }

        // ✅ Versuche das Bild zu laden und zu validieren
        const imageValidation = await new Promise<boolean>((resolve, reject) => {
          const img = new Image();
          const tempUrl = URL.createObjectURL(originalFile);
          
          img.onload = () => {
            if (process.env.NODE_ENV === 'development') {
              console.log('[ProfileUpload] Bild erfolgreich geladen:', {
                width: img.width,
                height: img.height,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight
              });
            }
            
            URL.revokeObjectURL(tempUrl);
            // ✅ Prüfe Mindestabmessungen
            if (img.width < 50 || img.height < 50) {
              reject(new Error("Das Bild ist zu klein (mindestens 50x50 Pixel erforderlich)."));
              return;
            }
            // ✅ Prüfe maximale Abmessungen
            if (img.width > 10000 || img.height > 10000) {
              reject(new Error("Das Bild ist zu groß (maximal 10000x10000 Pixel)."));
              return;
            }
            resolve(true);
          };
          
          img.onerror = (error) => {
            if (process.env.NODE_ENV === 'development') {
              console.error('[ProfileUpload] Fehler beim Laden des Bildes:', error);
            }
            URL.revokeObjectURL(tempUrl);
            reject(new Error("Das Bild konnte nicht geladen werden. Möglicherweise ist die Datei beschädigt."));
          };
          
          // ✅ Timeout für das Laden
          setTimeout(() => {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[ProfileUpload] Timeout beim Laden des Bildes nach 10s');
            }
            URL.revokeObjectURL(tempUrl);
            reject(new Error("Timeout beim Laden des Bildes."));
          }, 10000);
          
          img.src = tempUrl;
        });

        if (imageValidation) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ProfileUpload] Bild-Validierung erfolgreich, öffne Crop-Modal');
          }
          
          setOriginalFileForCrop(originalFile);

          // ✅ Erstelle Object URL erst nach erfolgreicher Validierung
          const objectUrl = URL.createObjectURL(originalFile);
          setImageToCrop(objectUrl);
          
          // ✅ Verzögerung für bessere UX (besonders auf Mobile)
          setTimeout(() => {
            if (process.env.NODE_ENV === 'development') {
              console.log('[ProfileUpload] Öffne Crop-Modal mit URL:', objectUrl.substring(0, 50) + '...');
            }
            setCropModalOpen(true);
          }, 100);
        }
      } catch (error) {
        console.error("Fehler bei der Bildvalidierung:", error);
        showNotification({
          message: error instanceof Error ? error.message : "Fehler beim Verarbeiten des Bildes.",
          type: "error",
        });
        
        // ✅ Reset bei Fehler
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
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

  // ✅ iOS Safari Workaround: Alternative Input-Erstellung
  const createFreshInputElement = () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ProfileUpload] Erstelle neues Input-Element für iOS Safari');
    }
    
    const newInput = document.createElement('input');
    newInput.type = 'file';
    newInput.accept = 'image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif';
    newInput.capture = 'environment';
    newInput.style.display = 'none';
    newInput.multiple = false;
    
    // Event-Listener für das neue Element
    newInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[ProfileUpload] ✅ iOS Safari Alternative: Datei ausgewählt');
        }
        // Simuliere das normale onChange-Event
        const syntheticEvent = {
          target: { files: target.files }
        } as React.ChangeEvent<HTMLInputElement>;
        handleFileChange(syntheticEvent);
      }
      // Cleanup
      document.body.removeChild(newInput);
    });
    
    // Füge temporär zum DOM hinzu
    document.body.appendChild(newInput);
    
    // Trigger nach kurzer Verzögerung
    setTimeout(() => {
      newInput.click();
    }, 100);
    
    // Cleanup-Timeout falls nichts passiert
    setTimeout(() => {
      if (document.body.contains(newInput)) {
        document.body.removeChild(newInput);
      }
    }, 30000);
  };

  const handleSelectClick = () => {
    if (isUploading || cropModalOpen) return;
    
    // ✅ iOS Safari Workaround: Reset input value vor dem Klick
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      
      // ✅ iOS-spezifische Event-Listener hinzufügen
      const input = fileInputRef.current;
      
      // Fokus-Event für iOS Safari
      const handleFocus = () => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[ProfileUpload] Input fokussiert - iOS Safari Workaround aktiv');
        }
      };
      
      // Cancel-Event für iOS Safari (wenn User "Abbrechen" klickt)
      const handleCancel = () => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[ProfileUpload] Foto-Picker abgebrochen');
        }
        input.removeEventListener('focus', handleFocus);
        input.removeEventListener('cancel', handleCancel);
      };
      
      input.addEventListener('focus', handleFocus, { once: true });
      input.addEventListener('cancel', handleCancel, { once: true });
      
      // ✅ Trigger mit Verzögerung für iOS Safari
      setTimeout(() => {
        input.click();
      }, 50);
      
      // ✅ Nach 3 Sekunden Input-Key erneuern falls kein Event kommt
      setTimeout(() => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[ProfileUpload] iOS Safari Fallback: Erneuere Input-Element');
        }
        setInputKey(Date.now());
      }, 3000);
      
      // ✅ Nach 5 Sekunden alternative Methode versuchen (nur auf iOS)
      setTimeout(() => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        if (isIOS) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ProfileUpload] iOS Safari Ultimate Fallback: Alternative Input-Erstellung');
          }
          createFreshInputElement();
        }
      }, 5000);
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
