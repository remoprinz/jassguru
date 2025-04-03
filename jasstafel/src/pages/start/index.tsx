"use client";

import React, {useEffect, useState, useRef} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {useGroupStore} from "@/store/groupStore";
import {useGameStore} from "@/store/gameStore";
import {useUIStore} from "@/store/uiStore";
import {Button} from "@/components/ui/button";
import Image from "next/image";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import MainLayout from "@/components/layout/MainLayout";
import {GroupSelector} from "@/components/group/GroupSelector";
import {Users, Settings, UserPlus, Camera, Upload, X} from "lucide-react";
import imageCompression from "browser-image-compression";
import {uploadGroupLogo} from "@/services/groupService";
import ImageCropModal from "@/components/ui/ImageCropModal";
import InviteModal from "@/components/group/InviteModal";
import {getFunctions, httpsCallable} from "firebase/functions";

const StartPage: React.FC = () => {
  const {user, status} = useAuthStore();
  const {currentGroup, userGroups, status: groupStatus, error: groupError, clearError: clearGroupError} = useGroupStore();
  const isGameInProgress = useGameStore((state) => state.isGameStarted && !state.isGameCompleted);
  const router = useRouter();
  const setPageCta = useUIStore((state) => state.setPageCta);
  const resetPageCta = useUIStore((state) => state.resetPageCta);
  const showNotification = useUIStore((state) => state.showNotification);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  // States für das Einladungs-Modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const isAdmin = currentGroup && user && currentGroup.adminIds.includes(user.uid);

  useEffect(() => {
    if (status === "unauthenticated" && process.env.NODE_ENV === "production") {
      console.log("StartPage: Auth status is 'unauthenticated' in production, redirecting to /");
      router.push("/");
    } else if (status === "unauthenticated") {
      console.log("StartPage: Auth status is 'unauthenticated' in non-production environment, redirect skipped.");
    }
    clearGroupError();
    return () => {
      clearGroupError();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [status, router, currentGroup, clearGroupError, previewUrl]);

  const handleGameAction = () => {
    router.push("/jass");
  };

  useEffect(() => {
    if (currentGroup) {
      const ctaText = isGameInProgress ? "Jass fortsetzen" : "Neuen Jass starten";
      const ctaVariant = isGameInProgress ? "info" : "default"; // Grün

      setPageCta({
        isVisible: true,
        text: ctaText,
        onClick: handleGameAction,
        loading: false,
        disabled: false,
        variant: ctaVariant,
      });
    } else if (userGroups.length === 0 && !currentGroup) {
      // Fall: Keine Gruppen vorhanden -> CTA zum Erstellen
      setPageCta({
        isVisible: true,
        text: "Neue Gruppe erstellen",
        onClick: () => router.push("/groups/new"),
        loading: false,
        disabled: false,
        variant: "warning", // Gelb
      });
    } else {
      resetPageCta();
    }

    return () => {
      resetPageCta();
    };
  }, [currentGroup, isGameInProgress, setPageCta, resetPageCta, handleGameAction, userGroups, router]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const originalFile = files[0];
      if (!originalFile.type.startsWith("image/")) {
        showNotification({message: "Bitte wählen Sie eine Bilddatei (JPEG oder PNG)..", type: "error"});
        return;
      }
      const initialMaxSizeInBytes = 10 * 1024 * 1024; // 10 MB
      if (originalFile.size > initialMaxSizeInBytes) {
        showNotification({message: "Die Datei ist zu groß (max. 10 MB).", type: "error"});
        return;
      }

      clearGroupError();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setSelectedFile(null);

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
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsUploading(false);
      return;
    }

    setIsUploading(true);
    console.log(`Zugeschnittenes Gruppenlogo erhalten, Größe: ${(croppedImageBlob.size / 1024).toFixed(2)} KB`);

    const options = {
      maxSizeMB: 0.2,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.8,
    };

    try {
      console.log("Komprimiere zugeschnittenes Gruppenlogo...");
      const compressedBlob = await imageCompression(new File([croppedImageBlob], "cropped_logo.jpg", {type: "image/jpeg"}), options);
      console.log(`Komprimiertes Gruppenlogo, Größe: ${(compressedBlob.size / 1024).toFixed(2)} KB`);

      const finalPreviewUrl = URL.createObjectURL(compressedBlob);
      setPreviewUrl(finalPreviewUrl);
      setSelectedFile(new File([compressedBlob], "group_logo.jpg", {type: "image/jpeg"}));
      setIsUploading(false);
    } catch (compressionError) {
      console.error("Fehler bei der Komprimierung des zugeschnittenen Gruppenlogos:", compressionError);
      showNotification({message: "Fehler bei der Bildkomprimierung.", type: "error"});
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !currentGroup) return;

    setIsUploading(true);
    try {
      await uploadGroupLogo(currentGroup.id, selectedFile);
      showNotification({message: "Gruppenlogo erfolgreich aktualisiert.", type: "success"});
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Fehler beim Hochladen des Gruppenlogos:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectClick = () => {
    if (isAdmin && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleCancelSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleInviteClick = async () => {
    if (!currentGroup) return;

    setIsInviteModalOpen(true); // Modal sofort öffnen (zeigt Ladezustand)
    setIsGeneratingInvite(true);
    setInviteError(null);
    setInviteToken(null);

    try {
      // Firebase Function aufrufen
      const functions = getFunctions(undefined, "europe-west1"); // Region explizit angeben!
      const generateToken = httpsCallable(functions, 'generateGroupInviteToken');
      
      console.log(`Calling generateGroupInviteToken for group ${currentGroup.id} in region europe-west1`);
      const result = await generateToken({ groupId: currentGroup.id });
      console.log("Function result:", result);

      // Typ-Überprüfung des Ergebnisses
      const token = (result.data as { token: string }).token;

      if (!token) {
        throw new Error("Kein Token vom Server erhalten.");
      }

      setInviteToken(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler beim Generieren des Codes.";
      console.error("Error calling generateGroupInviteToken:", error);
      // Versuchen, eine spezifischere Fehlermeldung aus HttpsError zu extrahieren
      setInviteError(message);
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleCloseInviteModal = () => {
    setIsInviteModalOpen(false);
    // Optional: States zurücksetzen, wenn das Modal geschlossen wird
    // setInviteToken(null);
    // setInviteError(null);
  };

  // Funktion, um das erneute Generieren aus dem Modal anzustoßen
  const handleGenerateNewInvite = () => {
    handleInviteClick(); // Ruft die Generierungslogik erneut auf
  };

  if (status === "loading" || groupStatus === "loading") {
    return (
      <MainLayout>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
          <span className="ml-3 text-white">Laden...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex flex-1 flex-col items-center text-white">
        <div className="flex w-full max-w-md flex-col items-center">
          {currentGroup ? (
            <>
              <div className="mt-6 mb-4 flex flex-col items-center">
                <div
                  className={`relative group cursor-pointer ${isAdmin ? "cursor-pointer" : "cursor-default"}`}
                  onClick={handleSelectClick}
                >
                  <Avatar className="h-32 w-32 border-2 border-gray-700 overflow-hidden">
                    {previewUrl ? (
                      <AvatarImage src={previewUrl} alt="Logo Vorschau" className="object-cover h-full w-full" />
                    ) : (
                      <AvatarImage src={currentGroup.logoUrl ?? undefined} alt={currentGroup.name ?? "Gruppe"} className="object-cover h-full w-full" />
                    )}
                    <AvatarFallback className="bg-gray-700 text-gray-200 text-5xl font-bold">
                      {currentGroup.name?.charAt(0).toUpperCase() || "G"}
                    </AvatarFallback>
                  </Avatar>
                  {isAdmin && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-all duration-200 rounded-full">
                      <Camera className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" size={32} />
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-400 mb-1 mt-4">Aktive Gruppe:</p>
                <h1 className="text-3xl font-bold text-center text-white mb-1">{currentGroup.name}</h1>
                {currentGroup.description && (
                  <p className="text-gray-400 text-center mb-4 px-8 max-w-[80%] mx-auto whitespace-nowrap">
                    {currentGroup.description}
                  </p>
                )}

                {selectedFile && (
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

              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg, image/png"
                className="hidden"
                disabled={isUploading}
              />

              <div className="flex justify-evenly mb-6 w-full">
                {/* "Einladen"-Button nur für Admins */}
                {isAdmin && (
                  <div className="flex flex-col items-center">
                    <span className="text-xs text-gray-400 mb-2">Einladen</span>
                    <Button
                      variant="default"
                      className="h-12 w-12 flex items-center justify-center bg-orange-600 border-orange-700 hover:bg-orange-500 text-white active:scale-95 transition-transform duration-100 ease-in-out"
                      onClick={handleInviteClick}
                    >
                      <UserPlus
                        style={{height: "1.5rem", width: "1.5rem"}}
                      />
                    </Button>
                  </div>
                )}

                <div className="flex flex-col items-center">
                  <span className="text-xs text-gray-400 mb-2">Mitglieder</span>
                  <Button
                    variant="default"
                    className="h-12 w-12 flex items-center justify-center bg-yellow-600 border-yellow-700 hover:bg-yellow-500 text-white active:scale-95 transition-transform duration-100 ease-in-out"
                    onClick={() => alert("Mitglieder - TODO")}
                  >
                    <Users
                      style={{height: "1.5rem", width: "1.5rem"}}
                    />
                  </Button>
                </div>

                {isAdmin && (
                  <div className="flex flex-col items-center">
                    <span className="text-xs text-gray-400 mb-2">Admin</span>
                    <Button
                      variant="default"
                      className="h-12 w-12 flex items-center justify-center bg-blue-600 border-blue-700 hover:bg-blue-500 text-white active:scale-95 transition-transform duration-100 ease-in-out"
                      onClick={() => router.push("/groups/settings")}
                    >
                      <Settings
                        style={{height: "1.5rem", width: "1.5rem"}}
                      />
                    </Button>
                  </div>
                )}
              </div>

              {/* --- VOLLSTÄNDIGER STATISTIKBEREICH --- */}
              <div className="w-full bg-gray-800/50 rounded-lg p-4 mb-8">
                <div className="space-y-3 text-sm px-2 pb-2"> {/* Etwas mehr Platz mit space-y-3 */}

                  {/* Block 1: Gruppenübersicht */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">Gruppenübersicht</h3>
                    <div className="space-y-1"> {/* Innerer Abstand für Items */}
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Mitglieder:</span>
                        <span className="text-gray-100">{currentGroup?.playerIds?.length ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Anzahl Jass-Partien:</span>
                        <span className="text-gray-100">0</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Anzahl Spiele:</span>
                        <span className="text-gray-100">0</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Gesamte Jass-Zeit:</span>
                        <span className="text-gray-100">-</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Erster Jass:</span>
                        <span className="text-gray-100">-</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Letzter Jass:</span>
                        <span className="text-gray-100">-</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Ort:</span>
                        <span className="text-gray-100">N/A</span> {/* Placeholder */}
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="pt-2 pb-1">
                    <hr className="border-gray-600/50" /> {/* Etwas dezenterer Divider */}
                  </div>

                  {/* Block 2: Durchschnittswerte & Details */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">Durchschnittswerte & Details</h3>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Ø Dauer pro Partie:</span>
                        <span className="text-gray-100">-</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Ø Dauer pro Spiel:</span>
                        <span className="text-gray-100">-</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Ø Spiele pro Partie:</span>
                        <span className="text-gray-100">-</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Ø Runden pro Spiel:</span>
                        <span className="text-gray-100">-</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Ø Matsch pro Spiel:</span>
                        <span className="text-gray-100">-</span> {/* Placeholder */}
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="pt-2 pb-1">
                    <hr className="border-gray-600/50" />
                  </div>

                  {/* Block 3: Spieler-Highlights */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">Spieler-Highlights</h3>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Meiste Spiele:</span>
                        <span className="text-gray-100">N/A (-)</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Höchste Strichdifferenz:</span>
                        <span className="text-gray-100">N/A (+0)</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Höchste Siegquote (pro Partie):</span>
                        <span className="text-gray-100">N/A (0%)</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Höchste Siegquote (pro Spiel):</span>
                        <span className="text-gray-100">N/A (0%)</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Höchste Matschquote (pro Spiel):</span>
                        <span className="text-gray-100">N/A (0.00)</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Die meisten Weispunkte (pro Spiel):</span>
                        <span className="text-gray-100">N/A (0)</span> {/* Placeholder */}
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="pt-2 pb-1">
                    <hr className="border-gray-600/50" />
                  </div>

                  {/* Block 4: Team-Highlights */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">Team-Highlights</h3>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Höchste Siegquote (pro Partie):</span>
                        <span className="text-gray-100">N/A (0%)</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Höchste Siegquote (pro Spiel):</span>
                        <span className="text-gray-100">N/A (0%)</span> {/* Placeholder */}
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-300">Höchste Matschquote (pro Spiel):</span>
                        <span className="text-gray-100">N/A (0%)</span> {/* Placeholder */}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </>
          ) : userGroups.length > 0 ? (
            <div className="flex flex-col items-center text-center mt-8">
              <Image
                src="/welcome-guru.png"
                alt="Jassguru Maskottchen"
                width={120}
                height={120}
                className="mb-4"
              />
              <h2 className="text-xl font-semibold mb-2">Gruppe auswählen</h2>
              <p className="text-gray-400 mb-4">Wähle eine Gruppe aus, um zu starten, oder erstelle eine neue.</p>
              <div className="w-full mb-4">
                <GroupSelector />
              </div>
              <Button
                onClick={() => router.push("/groups/new")}
                className="w-full bg-yellow-600 hover:bg-yellow-700"
              >
                Neue Gruppe erstellen
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center mt-8">
              <Image
                src="/welcome-guru.png"
                alt="Jassguru Maskottchen"
                width={120}
                height={120}
                className="mb-4"
              />
              <h1 className="text-2xl font-bold mb-2">
                Willkommen, {user?.displayName || "Jasser"}!
              </h1>
              <div className="text-center px-6 mt-6 mb-6">
                <p className="text-gray-400 text-lg leading-loose">
                  Du gehörst noch zu keiner Jassrunde.
                  <br />
                  Erstelle jetzt deine eigene Gruppe und lade deine Freunde ein.
                  <br />
                  Oder suche nach einer bestehenden Gruppe, der du beitreten kannst.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Invite Modal einfügen */}
        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseInviteModal}
          isLoading={isGeneratingInvite}
          error={inviteError}
          inviteToken={inviteToken}
          groupName={currentGroup?.name || "Gruppe"}
          onGenerateNew={handleGenerateNewInvite} // Callback übergeben
        />

        {/* Crop Modal einfügen */}
        <ImageCropModal
          isOpen={cropModalOpen}
          onClose={() => handleCropComplete(null)} // Signalisiert Abbruch
          imageSrc={imageToCrop}
          onCropComplete={handleCropComplete}
        />

      </div>
    </MainLayout>
  );
};

export default StartPage;
