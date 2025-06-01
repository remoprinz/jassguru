"use client";

import React, {useEffect, useState, useRef, useMemo, useCallback} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {Button} from "@/components/ui/button";
import {Alert, AlertDescription} from "@/components/ui/alert";
import Image from "next/image";
import MainLayout from "@/components/layout/MainLayout";
import {useUIStore} from "@/store/uiStore";
import {Camera, Upload, X, UserCog, Users, BarChart3, CheckCircle, XCircle, MinusCircle, Archive, Award as AwardIcon} from "lucide-react"; // AwardIcon hinzugefügt
import ImageCropModal from "@/components/ui/ImageCropModal";
import {toast} from "sonner";
import {compressImage} from "@/utils/imageUtils";
import {XCircle as AlertXCircle, Camera as CameraIcon} from "lucide-react";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {fetchCompletedSessionsForUser, SessionSummary} from '@/services/sessionService';
import Link from 'next/link';
import {format} from 'date-fns';
import { Timestamp } from 'firebase/firestore'; // Timestamp importieren
import type { StricheRecord } from '@/types/jass';
import { fetchTournamentsForUser } from '@/services/tournamentService';
import type { TournamentInstance } from '@/types/tournament';
import { fetchPlayerStatistics, PlayerStatistics } from '@/services/statisticsService';

// NEU: Typ-Guard für Firestore Timestamp (wie in start/index.tsx)
function isFirestoreTimestamp(value: any): value is Timestamp {
  return value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function';
}

// NEU: Typ für kombinierte Archiv-Items
type ArchiveItem = (SessionSummary & { type: 'session' }) | (TournamentInstance & { type: 'tournament' });

const ProfilePage: React.FC = () => {
  const {user, status, isAuthenticated, uploadProfilePicture, error, clearError} = useAuthStore();
  const showNotification = useUIStore((state) => state.showNotification);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State für die Bildauswahl und Vorschau
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // State für das Crop Modal
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [originalFileForCrop, setOriginalFileForCrop] = useState<File | null>(null);

  // State für abgeschlossene Sessions
  const [completedSessions, setCompletedSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // NEU: State für Turniere des Benutzers
  const [userTournaments, setUserTournaments] = useState<TournamentInstance[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);
  
  // Spielerstatistik-State hinzufügen
  const [playerStats, setPlayerStats] = useState<PlayerStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  
  // --- useEffect zum Laden der Archivdaten (Sessions UND Turniere) ---
  useEffect(() => {
    const loadArchiveData = async () => {
      if (status === 'authenticated' && user) {
        // Sessions laden
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

        // NEU: Turniere laden
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
          // Wenn nicht authentifiziert, Ladezustände zurücksetzen
          setSessionsLoading(false);
          setTournamentsLoading(false);
          setCompletedSessions([]);
          setUserTournaments([]);
      }
    };

    loadArchiveData();
  }, [status, user]); // Abhängig von auth status und user

  // useEffect zum Laden der Spielerstatistiken hinzufügen
  useEffect(() => {
    const loadPlayerStats = async () => {
      if (status === 'authenticated' && user) {
        setStatsLoading(true);
        try {
          const stats = await fetchPlayerStatistics(user.uid);
          setPlayerStats(stats);
        } catch (error) {
          console.error("Fehler beim Laden der Spielerstatistiken:", error);
          const message = error instanceof Error ? error.message : "Spielerstatistiken konnten nicht geladen werden.";
          setStatsError(message);
        } finally {
          setStatsLoading(false);
        }
      }
    };
    
    loadPlayerStats();
  }, [status, user]);

  // --- Kombinieren und Sortieren der Archivdaten ---
  const combinedArchiveItems = useMemo(() => {
    const sessionsWithType: ArchiveItem[] = completedSessions.map(s => ({ ...s, type: 'session' }));
    const tournamentsWithType: ArchiveItem[] = userTournaments.map(t => ({ ...t, type: 'tournament' }));

    const combined = [...sessionsWithType, ...tournamentsWithType];

    combined.sort((a, b) => {
      const dateA = a.type === 'session' ? a.startedAt : (a.instanceDate ?? a.createdAt);
      const dateB = b.type === 'session' ? b.startedAt : (b.instanceDate ?? b.createdAt);

      // Konvertiere Timestamp oder number zu Millisekunden für den Vergleich
      const timeA = isFirestoreTimestamp(dateA) ? dateA.toMillis() :
                    (typeof dateA === 'number' ? dateA : 0);
      const timeB = isFirestoreTimestamp(dateB) ? dateB.toMillis() :
                    (typeof dateB === 'number' ? dateB : 0);

      // Fallback für ungültige Daten
      const validTimeA = timeA || 0;
      const validTimeB = timeB || 0;

      return validTimeB - validTimeA; // Neueste zuerst
    });

    return combined;
  }, [completedSessions, userTournaments]);

  // Gruppierung der kombinierten Daten nach Jahr
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

  // Sortiere die Jahre absteigend
  const sortedYears = useMemo(() => {
      return Object.keys(groupedArchiveByYear).sort((a, b) => {
          if (a === 'Unbekannt') return 1; // 'Unbekannt' ans Ende
          if (b === 'Unbekannt') return -1;
          return parseInt(b) - parseInt(a); // Neueste Jahre zuerst
      });
  }, [groupedArchiveByYear]);

  // Gruppierung der Sessions nach Jahr (identisch zu start/index)
  const groupedSessionsByYear = completedSessions.reduce<Record<string, SessionSummary[]>>((acc, session) => {
    const year = session.startedAt ? new Date(session.startedAt).getFullYear().toString() : 'Unbekannt';
    if (!acc[year]) {
      acc[year] = [];
    }
    acc[year].push(session);
    return acc;
  }, {});

  // Sortiere die Jahre absteigend
  const sortedYearsSessions = Object.keys(groupedSessionsByYear).sort((a, b) => parseInt(b) - parseInt(a));

  // Nur für angemeldete Benutzer (keine Gäste)
  useEffect(() => {
    if (!isAuthenticated() || status === "unauthenticated") {
      router.push("/");
    }
    // Error zurücksetzen beim Montieren
    clearError();
  }, [isAuthenticated, status, router, clearError]);

  // Cleanup für die Objekturl bei unmount oder neue Datei
  useEffect(() => {
    return () => {
      // Objekturl freigeben, wenn sie existiert (sowohl preview als auch imageToCrop)
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (imageToCrop) URL.revokeObjectURL(imageToCrop);
    };
  }, [previewUrl, imageToCrop]);

  // Handler für Dateiauswahl
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;

    if (files && files.length > 0) {
      const originalFile = files[0];

      // Prüfen ob es ein Bild ist
      if (!originalFile.type.startsWith("image/")) {
        showNotification({
          message: "Bitte wählen Sie eine Bilddatei aus (JPEG oder PNG).",
          type: "error",
        });
        return;
      }

      // Prüfen der Dateigröße (Initialprüfung, z.B. 10 MB)
      const initialMaxSizeInBytes = 10 * 1024 * 1024; // 10 MB
      if (originalFile.size > initialMaxSizeInBytes) {
        showNotification({
          message: "Die Datei ist zu groß (max. 10 MB).",
          type: "error",
        });
        return;
      }

      clearError();

      // Alte Vorschau/Datei entfernen
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (imageToCrop) URL.revokeObjectURL(imageToCrop);
      setImageToCrop(null);
      setOriginalFileForCrop(null);

      // Originaldatei im State speichern
      setOriginalFileForCrop(originalFile);

      // Erstelle eine temporäre URL für das Originalbild, um es dem Cropper zu übergeben
      const objectUrl = URL.createObjectURL(originalFile);
      setImageToCrop(objectUrl); // Bild für das Modal setzen
      setCropModalOpen(true); // Modal öffnen
    }
  };

  // Neue Funktion: Wird vom Crop-Modal aufgerufen
  const handleCropComplete = async (blob: Blob | null) => {
    setCropModalOpen(false);

    // Alte Objekt-URL vom Cropper freigeben
    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop);
      setImageToCrop(null);
    }

    // Prüfen ob abgebrochen wurde oder die Originaldatei fehlt
    if (!blob || !originalFileForCrop) {
      setOriginalFileForCrop(null);
      setIsUploading(false);
      return;
    }

    try {
      setIsUploading(true);

      // Erstelle ein File-Objekt aus dem Blob
      const croppedFile = new File([blob], originalFileForCrop.name, {
        type: originalFileForCrop.type,
        lastModified: Date.now(),
      });

      // Komprimiere das zugeschnittene File-Objekt
      const compressedBlob = await compressImage(croppedFile, 500, 0.7);
      if (!compressedBlob) {
        throw new Error("Bildkomprimierung fehlgeschlagen");
      }

      // NEU: Erstelle ein File-Objekt aus dem *komprimierten* Blob
      const finalFileToUpload = new File([compressedBlob], originalFileForCrop.name, {
         type: compressedBlob.type, // Typ vom komprimierten Blob nehmen
         lastModified: Date.now(),
      });

      // Automatisch hochladen nach dem Zuschneiden und Komprimieren
      // Übergebe jetzt das neu erstellte File-Objekt
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

  // Handler für Öffnen des Datei-Dialogs
  const handleSelectClick = () => {
    if (isUploading || cropModalOpen) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // NEU: Helper Function für kombinierte Archiv-Items
  const renderArchiveItem = (item: ArchiveItem) => {
    if (item.type === 'session') {
      // Logik aus renderSessionItem übernehmen und anpassen
      const session = item;
      const { id, startedAt, playerNames, finalScores, status, finalStriche, participantUids } = session;
      const userId = user?.uid;
      let outcome: 'win' | 'loss' | 'draw' | 'unknown' = 'unknown';

      // Ergebnis bestimmen
      if (status === 'completed' && finalScores && userId && participantUids.includes(userId)) {
          let userTeam: 'top' | 'bottom' | null = null;
          if (user && user.displayName && (playerNames['1'] === user.displayName || playerNames['3'] === user.displayName)) {
              userTeam = 'bottom';
          } else if (user && user.displayName && (playerNames['2'] === user.displayName || playerNames['4'] === user.displayName)) {
              userTeam = 'top';
          }

          if (userTeam) {
              if (finalScores.top === finalScores.bottom) {
                  outcome = 'draw';
              } else if (userTeam === 'top' && finalScores.top > finalScores.bottom) {
                  outcome = 'win';
              } else if (userTeam === 'bottom' && finalScores.bottom > finalScores.top) {
                  outcome = 'win';
              } else {
                  outcome = 'loss';
              }
          }
      }

      const outcomeIcon = {
          win: <CheckCircle className="w-4 h-4 text-green-500" />, 
          loss: <XCircle className="w-4 h-4 text-red-500" />,    
          draw: <MinusCircle className="w-4 h-4 text-yellow-500" />,
          unknown: null
      }[outcome];

      const title = 'Partie'; // Verwenden wir einen Standardwert

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
                      {outcomeIcon}
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
      // NEU: Rendering für Turnier-Items
      const tournament = item;
      const { id, name, instanceDate, status: tournamentStatus, createdAt } = tournament;
      
      // Bestimme das Datum zum Anzeigen (instanceDate oder createdAt)
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
                          tournamentStatus === 'active' ? 'bg-green-600 text-white' : 'bg-yellow-600 text-black'; // Annahme für 'archived'

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
    return null; // Sollte nicht vorkommen
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
          {error && (
            <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200 mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Modal einfügen und mit State verbinden */}
          <ImageCropModal
            isOpen={cropModalOpen}
            onClose={() => handleCropComplete(null)} // Aufruf mit null bei Abbruch/Schließen
            imageSrc={imageToCrop}
            onCropComplete={handleCropComplete} // Callback für erfolgreiches Cropping
            confirmButtonLabel="Hochladen" // NEU: Button-Text geändert
            confirmButtonClassName="bg-green-600 hover:bg-green-700" // NEU: Grüne Farbe für Button
          />

          <div className="text-center mt-6">
            {/* Profilbild-Container mit Overlay für Upload */}
            <div className="flex justify-center items-center mx-auto">
              <div className="relative h-32 w-32 overflow-hidden rounded-full bg-gray-800 border-2 border-gray-700 group">
                {/* Zeige aktuelles Profilbild oder nur Hintergrund */}
                {user?.photoURL ? (
                  <Image
                    src={user.photoURL}
                    alt="Profilbild"
                    width={128}
                    height={128}
                    className="object-cover h-full w-full"
                    key={user.photoURL}
                    priority
                  />
                ) : (
                  // KEIN Platzhalter-Buchstabe mehr, nur der graue Hintergrund
                  <div className="h-full w-full bg-gray-800"></div>
                )}

                {/* Button für Upload */}
                <button
                  onClick={handleSelectClick}
                  // Kamera-Icon ist über diesem Button, Hover-Effekt bleibt aber erhalten
                  className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity duration-200"
                  disabled={isUploading || cropModalOpen} 
                  aria-label="Profilbild ändern"
                >
                  {/* Kamera-Icon IMMER sichtbar wenn kein Bild da ist */}
                  {!user?.photoURL && (
                    <CameraIcon
                      className="text-white opacity-70" // Nicht mehr nur bei Hover
                      size={32} 
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>
            </div>

            {/* Name und Jasspruch */}
            <h1 className="mt-4 text-3xl font-bold text-center text-white mb-1">
              {user?.displayName || "Kein Name festgelegt"}
            </h1>
            {/* Jasspruch: Zeige Nachricht oder Standard-Text */}
            <p className="text-gray-400 text-center mb-4 px-8 max-w-[90%] mx-auto min-h-[1.5rem]"> {/* min-h hinzugefügt, um Layout-Sprung zu vermeiden */}
              {user?.statusMessage || "Hallo! Ich jasse mit Jassguru."}
              </p>

            {/* Versteckter File-Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg, image/png, image/gif, image/webp"
              className="hidden"
              disabled={isUploading || cropModalOpen}
            />
          </div>

          {/* --- NEUER AKTIONSBUTTON-BEREICH --- */}
          <div className="flex justify-evenly gap-4 mb-6 w-full mt-8">

            {/* 1. Button: Meine Gruppen (Links) - Farbe geändert */}
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

            {/* NEU: 2. Button: Turniere (Mitte) */}
            <div className="flex flex-col items-center">
              <span className="text-xs text-gray-400 mb-2">Turniere</span>
              <Button
                variant="default"
                className="h-12 w-12 flex items-center justify-center bg-purple-600 border-purple-700 hover:bg-purple-500 text-white active:scale-95 transition-transform duration-100 ease-in-out"
                onClick={() => router.push("/tournaments")} // Zielroute für Turniere
              >
                <AwardIcon
                  style={{height: "1.5rem", width: "1.5rem"}}
                />
              </Button>
            </div>

            {/* 3. Button: Profil bearbeiten (Rechts) - Text geändert */}
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

          {/* --- NEU: Tabs für Statistik und Partien --- */}
          <Tabs defaultValue="stats" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-gray-800/50 p-1 rounded-lg mb-4">
              <TabsTrigger 
                value="stats" 
                className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 hover:bg-gray-700/50 rounded-md py-1.5 text-sm font-medium" 
              > 
                <BarChart3 className="w-4 h-4 mr-2" /> Statistik 
              </TabsTrigger> 
              <TabsTrigger 
                value="archive" 
                className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 hover:bg-gray-700/50 rounded-md py-1.5 text-sm font-medium" 
              > 
                <Archive className="w-4 h-4 mr-2" /> Archiv 
              </TabsTrigger> 
            </TabsList> 

            {/* Inhalt für Statistik-Tab (aktueller Inhalt) */} 
            <TabsContent value="stats" className="w-full bg-gray-800/50 rounded-lg p-4 mb-8"> 
              {statsError && !statsLoading && (
                <div className="text-red-400 text-sm text-center p-4 bg-red-900/30 rounded-md mb-4">
                  Fehler beim Laden der Statistiken: {statsError}
                </div>
              )}
              {statsLoading ? (
                <div className="flex justify-center items-center py-10">
                  <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                  <span className="ml-3 text-gray-300">Lade Statistiken...</span>
                </div>
              ) : (
                <div className="space-y-3 text-sm px-2 pb-2"> 
                  {/* Block 1: Spielerübersicht */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">Spielerübersicht</h3>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Anzahl Gruppen:</span>
                        <span className="text-gray-100">{playerStats?.groupCount || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Anzahl Partien:</span>
                        <span className="text-gray-100">{playerStats?.totalSessions || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Anzahl Spiele:</span>
                        <span className="text-gray-100">{playerStats?.totalGames || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Gesamte Jass-Zeit:</span>
                        <span className="text-gray-100">{playerStats?.totalPlayTime || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Erster Jass:</span>
                        <span className="text-gray-100">{playerStats?.firstJassDate || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Letzter Jass:</span>
                        <span className="text-gray-100">{playerStats?.lastJassDate || '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="pt-2 pb-1">
                    <hr className="border-gray-600/50" />
                  </div>

                  {/* Block 2: Persönliche Spiel-Leistung */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">Deine Spielleistung</h3>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Partien gewonnen:</span>
                        <span className="text-gray-100">{playerStats?.sessionsWon || 0} von {playerStats?.totalSessions || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Partien unentschieden:</span>
                        <span className="text-gray-100">{playerStats?.sessionsTied || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Partien verloren:</span>
                        <span className="text-gray-100">{playerStats?.sessionsLost || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Spiele gewonnen:</span>
                        <span className="text-gray-100">{playerStats?.gamesWon || 0} von {playerStats?.totalGames || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Siegquote Partien:</span>
                        <span className="text-gray-100">
                          {playerStats?.sessionWinRate ? `${(playerStats.sessionWinRate * 100).toFixed(1)}%` : '0%'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Siegquote Spiele:</span>
                        <span className="text-gray-100">
                          {playerStats?.gameWinRate ? `${(playerStats.gameWinRate * 100).toFixed(1)}%` : '0%'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="pt-2 pb-1">
                    <hr className="border-gray-600/50" />
                  </div>

                  {/* Block 3: Persönliche Durchschnittswerte */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">Deine Durchschnittswerte</h3>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Ø Punkte pro Spiel:</span>
                        <span className="text-gray-100">{playerStats?.avgPointsPerGame || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Ø Striche pro Spiel:</span>
                        <span className="text-gray-100">{playerStats?.avgStrichePerGame || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Ø Weispunkte pro Spiel:</span>
                        <span className="text-gray-100">{playerStats?.avgWeisPointsPerGame || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Ø Matsch pro Spiel:</span>
                        <span className="text-gray-100">{playerStats?.avgMatschPerGame || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="pt-2 pb-1">
                    <hr className="border-gray-600/50" />
                  </div>

                  {/* Block 4: Persönliche Highlights */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">Deine Highlights</h3>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Höchste Punktzahl (Spiel):</span>
                        <span className="text-gray-100">
                          {playerStats?.highestPoints && playerStats.highestPoints.value > 0 
                            ? `${playerStats.highestPoints.value} (${playerStats.highestPoints.date || '-'})` 
                            : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Höchste Weispunkte (Spiel):</span>
                        <span className="text-gray-100">
                          {playerStats?.highestWeisPoints && playerStats.highestWeisPoints.value > 0 
                            ? `${playerStats.highestWeisPoints.value} (${playerStats.highestWeisPoints.date || '-'})` 
                            : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Höchste Striche (Spiel):</span>
                        <span className="text-gray-100">
                          {playerStats?.highestStriche && playerStats.highestStriche.value > 0 
                            ? `${playerStats.highestStriche.value} (${playerStats.highestStriche.date || '-'})` 
                            : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Längste Partie:</span>
                        <span className="text-gray-100">
                          {playerStats?.longestSession && playerStats.longestSession.value !== '-' 
                            ? `${playerStats.longestSession.value} (${playerStats.longestSession.date || '-'})` 
                            : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent> 

            {/* Aktualisierter Inhalt für den Archiv-Tab */}
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
          {/* --- ENDE Tabs --- */} 

        </div>
      </div>
    </MainLayout>
  );
};

export default ProfilePage;
