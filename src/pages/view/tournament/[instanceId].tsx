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
import { format } from 'date-fns';
import { Timestamp, getFirestore, collection, query, where, orderBy, limit, onSnapshot, Unsubscribe, doc, getDoc } from 'firebase/firestore';
import { firebaseApp } from '@/services/firebaseInit';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import TournamentPlayerProgressView from '@/components/tournament/TournamentPlayerProgressView';
import TournamentInviteModal from '@/components/tournament/TournamentInviteModal';
import TournamentParticipantsList from '@/components/tournament/TournamentParticipantsList';
import TournamentStartScreen from '@/components/tournament/TournamentStartScreen';
import TournamentRankingList from '@/components/tournament/TournamentRankingList';
import TournamentPasseArchive from '@/components/tournament/TournamentPasseArchive';
import imageCompression from "browser-image-compression";
import ImageCropModal from "@/components/ui/ImageCropModal";
import { updateTournamentSettings, uploadTournamentLogoFirebase } from '@/services/tournamentService';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { getGroupMembersSortedByGames } from "@/services/playerService";
import GlobalLoader from '@/components/layout/GlobalLoader';

import type { PlayerNumber, PlayerNames, StrokeSettings, ScoreSettings, FirestorePlayer } from '@/types/jass';
import type { TournamentGame } from '@/types/tournament';

import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';

function isFirestoreTimestamp(value: any): value is Timestamp {
  return value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function';
}

// NEUE HILFSFUNKTION
const getGermanTournamentStatus = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'active':
      return 'Aktiv';
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
  
  const fetchTournamentInstanceDetails = useTournamentStore((state) => state.fetchTournamentInstanceDetails);
  const setupTournamentListener = useTournamentStore((state) => state.setupTournamentListener);
  const clearTournamentListener = useTournamentStore((state) => state.clearTournamentListener);
  const tournament = useTournamentStore((state) => state.currentTournamentInstance);
  const tournamentError = useTournamentStore((state) => state.error);
  const detailsStatus = useTournamentStore(selectDetailsStatus);
  const loadingInstanceIdFromStore = useTournamentStore(selectLoadingInstanceId);
  const showNotification = useUIStore((state) => state.showNotification);

  const [showStartPasseScreen, setShowStartPasseScreen] = useState(false);
  const [activeTab, setActiveTab] = useState("ranking");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  
  // NEU: States für Spielerfortschritt-Modal
  const [showPlayerProgressModal, setShowPlayerProgressModal] = useState(false);
  const [selectedPlayerForProgressView, setSelectedPlayerForProgressView] = useState<ParticipantWithProgress | null>(null);

  const currentTournamentGames = useTournamentStore((state) => state.currentTournamentGames);
  const loadTournamentGames = useTournamentStore((state) => state.loadTournamentGames);
  const gamesStatus = useTournamentStore(selectGamesStatus);

  const loadTournamentParticipants = useTournamentStore((state) => state.loadTournamentParticipants);
  const tournamentParticipants = useTournamentStore(selectTournamentParticipants);
  const participantsStatus = useTournamentStore(selectParticipantsStatus);

  // Debug-Ausgaben für participantsStatus
  if (isDebugMode) {
    console.log(`[TournamentViewPage] participantsStatus: ${participantsStatus}`);
    console.log(`[TournamentViewPage] tournamentParticipants: ${tournamentParticipants ? tournamentParticipants.length : 'undefined'}`);
  }

  const [resumablePasseId, setResumablePasseId] = useState<string | null>(null);
  const [isCheckingForResumablePasse, setIsCheckingForResumablePasse] = useState<boolean>(true);
  const activePasseListener = useRef<Unsubscribe | null>(null);

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

  useEffect(() => {
    if (!memoizedInstanceId || typeof memoizedInstanceId !== 'string') return;

    const isAlreadyLoadedAndCorrect = detailsStatus === 'success' && tournament?.id === memoizedInstanceId;
    const isLoadingThisInstance = detailsStatus === 'loading' && loadingInstanceIdFromStore === memoizedInstanceId;

    if (!isAlreadyLoadedAndCorrect && !isLoadingThisInstance) {
      if (isDebugMode) console.log(`[TournamentViewPage] Requesting tournament details for instance: ${memoizedInstanceId}`);
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
      if (isDebugMode) console.log(`[TournamentViewPage] Requesting tournament games for instance: ${memoizedInstanceId}`);
      loadTournamentGames(memoizedInstanceId);
    }
  }, [memoizedInstanceId, tournament?.id, detailsStatus, gamesStatus, loadTournamentGames, isDebugMode]);

  useEffect(() => {
    if (!memoizedInstanceId || typeof memoizedInstanceId !== 'string') {
      if (isDebugMode) console.log('[TournamentViewPage] Participants NOT loaded: memoizedInstanceId invalid', memoizedInstanceId);
      return;
    }
    if (tournament?.id === memoizedInstanceId && (participantsStatus === 'success' || participantsStatus === 'loading')) {
        if (isDebugMode) console.log(`[TournamentViewPage] Participants for ${memoizedInstanceId} already loaded or loading. Status: ${participantsStatus}. Skipping.`);
        return;
    }

    if (tournament?.id === memoizedInstanceId && detailsStatus === 'success') {
      if (isDebugMode) {
        console.log(`[TournamentViewPage] Requesting tournament participants for instance: ${memoizedInstanceId}`);
        console.log(`[TournamentViewPage] Teilnehmer-Ladekriterien erfüllt:`, {
          tournamentId_match: tournament?.id === memoizedInstanceId,
          detailsStatus_is_success: detailsStatus === 'success',
          current_participantsStatus: participantsStatus,
          tournament_status_in_store: tournament?.status
        });
      }
      loadTournamentParticipants(memoizedInstanceId);
    } else {
      if (isDebugMode) {
        console.log(`[TournamentViewPage] Participants NOT loaded. Conditions not met or mismatch:`, {
          memoizedInstanceId,
          tournament_id_from_store: tournament?.id,
          detailsStatus_check: detailsStatus === 'success',
          participantsStatus_check: participantsStatus,
        });
      }
    }
  }, [memoizedInstanceId, tournament?.id, detailsStatus, participantsStatus, loadTournamentParticipants, isDebugMode, tournament?.status]);

  // ✅ NEU: Real-time Listener für Tournament-Details (Profilbild, Beschreibung, etc.)
  useEffect(() => {
    if (!memoizedInstanceId || typeof memoizedInstanceId !== 'string') return;
    
    // Aktiviere Real-time Listener sobald Tournament erfolgreich geladen wurde
    if (detailsStatus === 'success' && tournament?.id === memoizedInstanceId) {
      if (isDebugMode) console.log(`[TournamentViewPage] Setting up real-time listener for tournament: ${memoizedInstanceId}`);
      setupTournamentListener(memoizedInstanceId);
    }

    // Cleanup-Funktion wird automatisch beim nächsten Effect-Run oder Unmount aufgerufen
    return () => {
      if (isDebugMode) console.log(`[TournamentViewPage] Cleaning up real-time listener for tournament: ${memoizedInstanceId}`);
      // Der TournamentStore verwaltet bereits das Cleanup im clearCurrentTournamentInstance
    };
  }, [memoizedInstanceId, detailsStatus, tournament?.id, setupTournamentListener, isDebugMode]);

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
      if (isDebugMode) console.log("[TournamentViewPage] Cleaning up active passe listener (outer useEffect).");
      unsubscribeListener();
      if (activePasseListener.current) {
        activePasseListener.current();
        activePasseListener.current = null;
      }
    };
  }, [memoizedInstanceId, user?.uid, detailsStatus, tournament?.status, resumablePasseId, isDebugMode]);

  // Angepasster Cleanup-Effekt: Nur beim Unmounten
  useEffect(() => {
    // Store the current URLs in variables accessible by the cleanup function closure
    const currentImageToCropUrl = imageToCrop;
    const currentLogoPreviewUrlValue = logoPreviewUrl;

    return () => {
      if (isDebugMode) console.log("[TournamentView] Unmounting cleanup: Revoking URLs.");
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
        console.log("[TournamentViewPage] Loading participants before starting passe...");
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
  
  // 🆕 Berechne nächste Passe-Nummer UND Label
  const { nextPasseNumber, nextPasseLabel } = useMemo(() => {
    if (!tournamentParticipants || tournamentParticipants.length === 0 || !tournament) {
      return { nextPasseNumber: 1, nextPasseLabel: '1A' };
    }
    
    // ROBUSTER ALGORITHMUS für alle Szenarien:
    // 1. Ermittle die maximale Anzahl abgeschlossener Passen aller Spieler
    const completedPassesCounts = tournamentParticipants.map(p => p.completedPassesCount || 0);
    const maxCompletedPasses = Math.max(...completedPassesCounts);
    
    // 2. Zusätzliche Sicherheitsprüfung für Edge Cases:
    // - Ungerade Spielerzahlen (9, 10, 11 Spieler)
    // - Spieler, die Runden aussetzen
    // - Unregelmäßige Spielabfolgen
    
    // Wenn alle Spieler die gleiche Anzahl haben, ist das die aktuelle Runde
    const allHaveSamePasses = completedPassesCounts.every(count => count === maxCompletedPasses);
    
    const nextNumber = allHaveSamePasses ? maxCompletedPasses + 1 : maxCompletedPasses + 1;
    
    // 🔧 KORREKTUR: Berechne Passe-Label basierend auf DEM SPIELER
    // Jeder Spieler durchläuft: 1A → 2A → 3A → 4A...
    // Der Buchstabe zeigt nur, welche parallele Gruppe gerade spielt
    
    // Ermittle die nächste Runde für diesen Spieler
    const nextRound = maxCompletedPasses + 1;
    
    // Ermittle, wie viele PARALLELE Gruppen bereits diese Runde spielen
    const parallelGroupsInNextRound = currentTournamentGames?.filter(game => 
      game.tournamentRound === nextRound
    ).length || 0;
    
    // Berechne Buchstaben basierend auf parallelen Gruppen
    const nextLetter = String.fromCharCode(65 + parallelGroupsInNextRound); // 65 = 'A'
    const nextLabel = `${nextRound}${nextLetter}`;
    
    console.log(`[TournamentViewPage] 🎯 Button Label Calculation (PER PLAYER):`, {
      maxCompletedPasses,
      nextRound,
      parallelGroupsInNextRound,
      nextLabel,
      currentUserUid: user?.uid,
      allGamesInNextRound: currentTournamentGames?.filter(g => g.tournamentRound === nextRound).map(g => g.passeLabel)
    });
    
    return { 
      nextPasseNumber: nextNumber, 
      nextPasseLabel: nextLabel 
    };
  }, [tournamentParticipants, tournament, currentTournamentGames, user]);
  const activeStrokeSettings: StrokeSettings = tournament?.settings?.strokeSettings || DEFAULT_STROKE_SETTINGS;
  const activeScoreSettings: ScoreSettings = {
    ...DEFAULT_SCORE_SETTINGS,
    ...(tournament?.settings?.scoreSettings || {}),
  };

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
      console.log("Cropping abgebrochen oder fehlgeschlagen.");
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
      setIsUploadingLogo(false);
      return;
    }

    setIsUploadingLogo(true);
    console.log(`[TournamentView] Zugeschnittenes Bild erhalten, Größe: ${(croppedImageBlob.size / 1024).toFixed(2)} KB`);

    const options = {
      maxSizeMB: 0.2,
      maxWidthOrHeight: 500,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.8,
    };

    try {
      console.log("[TournamentView] Komprimiere zugeschnittenes Bild...");
      const compressedBlob = await imageCompression(new File([croppedImageBlob], "tournament_logo.jpg", {type: "image/jpeg"}), options);
      console.log(`[TournamentView] Komprimiertes Bild, Größe: ${(compressedBlob.size / 1024).toFixed(2)} KB`);

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
    // console.log(`[TournamentView DEBUG] handlePasseSuccessfullyStarted called with activeGameId: ${activeGameId}`);
    // console.log(`[TournamentView DEBUG] Navigating to /game/${activeGameId} after passe successfully started.`);
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
    console.log("[TournamentViewPage] User requested new invite token.");
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
    setSelectedPlayerForProgressView(player);
    setShowPlayerProgressModal(true);
  }, []);

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
      <div className="flex flex-col min-h-screen bg-gray-900 text-white pt-8 pb-32">
        {tournament && (
          <div className="flex flex-col items-center mb-4 mt-12">
            <div 
              className="relative w-32 h-32 rounded-full overflow-hidden transition-all duration-300 flex items-center justify-center bg-gray-800 shadow-lg hover:shadow-xl hover:scale-105 border-4"
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
              {isCurrentUserAdmin && (
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
            {selectedLogoFile && logoPreviewUrl && (
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
        
        <div className="w-full text-center mb-6 px-4">
          <h1 className="text-3xl font-bold mb-1 text-white break-words">{tournament?.name ?? 'Turnier laden...'}</h1>
          <p className="text-sm text-gray-400 mx-auto max-w-xl break-words">
            {tournament?.description ?? (isLoading ? '' : 'Keine Beschreibung vorhanden.')}
          </p>
        </div>

        <div className="flex justify-center items-center gap-3 mb-6 px-4">
          {isCurrentUserAdmin && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleOpenInviteModal} 
              className="hover:bg-gray-700/30 text-gray-300 hover:text-white"
              title="Teilnehmer einladen"
            >
              <UserPlusIcon className="h-4 w-4 mr-1.5" /> Einladen
            </Button>
          )}
          {isCurrentUserAdmin && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => router.push(`/tournaments/${memoizedInstanceId}/settings`)} 
              className="hover:bg-gray-700/30 text-gray-300 hover:text-white"
              title="Einstellungen"
            >
              <SettingsIcon className="h-4 w-4 mr-1.5" /> Einstellungen
            </Button>
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
                {getGermanTournamentStatus(tournament.status)}
              </span>
            </span>
            {tournament.instanceDate && isFirestoreTimestamp(tournament.instanceDate) && (
              <span className="ml-3">{format(tournament.instanceDate.toDate(), 'dd.MM.yyyy')}</span>
            )}
            {tournament.status === 'completed' && tournament.completedAt && isFirestoreTimestamp(tournament.completedAt) && (
                <span className="ml-1">{`(Abgeschlossen am ${format(tournament.completedAt.toDate(), 'dd.MM.yyyy')})`}</span>
            )}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col w-full max-w-2xl mx-auto">
          <TabsList className="grid w-full grid-cols-3 bg-gray-800 sticky top-0 z-10 rounded-md mb-4">
            <TabsTrigger value="ranking" className="py-2.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-l-md">
              <Award className="w-4 h-4 mr-1.5"/> Rangliste
            </TabsTrigger>
            <TabsTrigger value="archive" className="py-2.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white">
              <ArchiveIcon className="w-4 h-4 mr-1.5"/> Passen
            </TabsTrigger>
            <TabsTrigger value="participants" className="py-2.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-r-md">
              <UsersIcon className="w-4 h-4 mr-1.5"/> Teilnehmer
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
                <TournamentRankingList 
                  instanceId={memoizedInstanceId} 
                  settings={tournament.settings}
                  participants={tournamentParticipants}
                  games={currentTournamentGames}
                  onParticipantClick={handleOpenPlayerProgress}
                />
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
            {isCurrentUserAdmin && (
              <Button onClick={() => router.push(`/tournaments/${memoizedInstanceId}/settings`)} size="sm" variant="link" className="mt-1 text-purple-400 hover:text-purple-300">
                Turnierdetails bearbeiten / Starten
              </Button>
            )}
          </div>
        )}


        {showStartPasseScreen && memoizedInstanceId && (
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

        {isCurrentUserAdmin && memoizedInstanceId && tournament && (
          <TournamentInviteModal
            isOpen={isInviteModalOpen}
            onClose={() => setIsInviteModalOpen(false)}
            tournamentId={memoizedInstanceId}
            tournamentName={tournament?.name}
            onGenerateNew={handleGenerateNewInvite}
          />
        )}

        <ImageCropModal
          isOpen={cropModalOpen}
          onClose={() => handleCropComplete(null)}
          imageSrc={imageToCrop}
          onCropComplete={handleCropComplete}
        />

        <input
          type="file"
          ref={logoFileInputRef}
          onChange={handleLogoFileChange}
                            accept="image/jpeg, image/jpg, image/png, image/webp, image/gif, image/heic, image/heif"
          className="hidden"
          disabled={isUploadingLogo}
        />

        {/* NEU: Spielerfortschritt-Modal */} 
        {selectedPlayerForProgressView && tournament && (
          <Dialog open={showPlayerProgressModal} onOpenChange={setShowPlayerProgressModal}>
            <DialogContent className="max-w-3xl bg-gray-850 border-gray-700 text-white">
              <DialogHeader className="mb-0 pb-2">
                <DialogTitle className="text-xl text-purple-300">Spielerfortschritt: {selectedPlayerForProgressView.displayName}</DialogTitle>
                <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Schliessen</span>
                </DialogClose>
              </DialogHeader>
              <div className="max-h-[80vh] overflow-y-auto p-1 pr-2">
                <TournamentPlayerProgressView 
                  tournamentGames={currentTournamentGames}
                  playerUid={selectedPlayerForProgressView.uid}
                  playerName={selectedPlayerForProgressView.displayName}
                  playerPhotoUrl={selectedPlayerForProgressView.photoURL ?? undefined}
                  strokeSettings={tournament.settings?.strokeSettings || DEFAULT_STROKE_SETTINGS}
                  scoreSettings={{
                    ...DEFAULT_SCORE_SETTINGS,
                    ...(tournament.settings?.scoreSettings || {}),
                  }}
                  cardStyle={tournament.settings?.farbeSettings?.cardStyle || DEFAULT_FARBE_SETTINGS.cardStyle}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
      
      {/* BUTTON AUSSERHALB DES MAINLAYOUT FÜR VOLLE BREITE */}
      {tournament?.status === 'active' && (
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
                      <Button 
                          onClick={handleStartNextPasse}
                          className="w-full h-14 text-lg font-bold rounded-xl shadow-lg bg-blue-600 hover:bg-blue-700 border-b-4 border-blue-900 text-white active:scale-95 transition duration-100 ease-in-out"
                          disabled={participantsStatus === 'loading' || tournamentParticipants.length < 1 || isLoadingDetails}
                      >
                          {(participantsStatus === 'loading' || isLoadingDetails) && <Loader2 className="animate-spin h-5 w-5 mr-2" />}
                          {/* 🆕 Zeige Passe-Label (z.B. "1A") statt nur Nummer */}
                          Passe {nextPasseLabel} starten
                          {(participantsStatus !== 'loading' && !isLoadingDetails && tournamentParticipants.length < 1) && " (Benötigt Teilnehmer)"}
                      </Button>
                  )}
              </div>
          </div>
      )}
    </MainLayout>
  );
};

export default TournamentViewPage;