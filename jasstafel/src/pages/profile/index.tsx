"use client";

import React, {useEffect, useState, useRef} from "react";
import {useRouter} from "next/router";
import {useAuthStore} from "@/store/authStore";
import {Button} from "@/components/ui/button";
import {Alert, AlertDescription} from "@/components/ui/alert";
import Image from "next/image";
import MainLayout from "@/components/layout/MainLayout";
import {useUIStore} from "@/store/uiStore";
import {Camera, Upload, X, UserCog, Users, BarChart3} from "lucide-react"; // Icons für das UI
import imageCompression from "browser-image-compression"; // Import hinzugefügt
// Platzhalter für die neue Komponente
import ImageCropModal from "@/components/ui/ImageCropModal";

const ProfilePage: React.FC = () => {
  const {user, status, isAuthenticated, uploadProfilePicture, error, clearError} = useAuthStore();
  const showNotification = useUIStore((state) => state.showNotification);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State für die Bildauswahl und Vorschau
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // State für das Crop Modal
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null); // URL des Originalbildes für den Cropper

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
      // Objekturl freigeben, wenn sie existiert
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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

      // --- Anpassung beginnt ---
      // Nicht mehr sofort komprimieren oder hochladen-Status setzen
      // setIsUploading(true); // Wird erst beim finalen Upload gesetzt
      clearError();

      // Alte Vorschau/Datei entfernen
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setSelectedFile(null);

      // Erstelle eine temporäre URL für das Originalbild, um es dem Cropper zu übergeben
      const objectUrl = URL.createObjectURL(originalFile);
      setImageToCrop(objectUrl); // Bild für das Modal setzen
      setCropModalOpen(true); // Modal öffnen

      // Kompressionslogik wird in handleCropComplete verschoben
      /*
      const options = { ... };
      try { ... } catch { ... }
      */
      // --- Anpassung endet ---
    }
  };

  // Neue Funktion: Wird vom Crop-Modal aufgerufen
  const handleCropComplete = async (croppedImageBlob: Blob | null) => {
    // Verhindern, dass die Funktion erneut ausgeführt wird, während sie schon läuft
    if (isUploading && !croppedImageBlob) {
      console.log("Ignoriere Abbruch-Aufruf während Verarbeitung läuft.");
      return;
    }

    setCropModalOpen(false); // Modal schließen
    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop); // Temporäre Original-URL freigeben
      setImageToCrop(null);
    }

    if (!croppedImageBlob) {
      console.log("Cropping abgebrochen oder fehlgeschlagen.");
      if (fileInputRef.current) fileInputRef.current.value = ""; // Input zurücksetzen
      setIsUploading(false); // Sicherstellen, dass Status false ist bei Abbruch
      return;
    }

    // --- Start der Verarbeitung ---
    setIsUploading(true);
    console.log(`Zugeschnittenes Bild erhalten, Größe: ${(croppedImageBlob.size / 1024).toFixed(2)} KB`);

    // Jetzt das zugeschnittene Bild komprimieren
    const options = {
      maxSizeMB: 0.2,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.8,
    };

    try {
      console.log("Komprimiere zugeschnittenes Bild...");
      const compressedBlob = await imageCompression(new File([croppedImageBlob], "cropped_image.jpg", {type: "image/jpeg"}), options);
      console.log(`Komprimiertes Bild, Größe: ${(compressedBlob.size / 1024).toFixed(2)} KB`);

      // Vorschau mit komprimiertem Bild erstellen und Datei speichern
      const finalPreviewUrl = URL.createObjectURL(compressedBlob);
      setPreviewUrl(finalPreviewUrl);
      setSelectedFile(new File([compressedBlob], "profile_picture.jpg", {type: "image/jpeg"}));
      // --- Verarbeitung erfolgreich beendet ---
      setIsUploading(false); // Status zurücksetzen, bereit für 'Hochladen' Klick
    } catch (compressionError) {
      console.error("Fehler bei der Komprimierung des zugeschnittenen Bildes:", compressionError);
      showNotification({
        message: "Fehler bei der Bildkomprimierung.",
        type: "error",
      });
      // Zurücksetzen
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // --- Verarbeitung fehlgeschlagen ---
      setIsUploading(false); // Status zurücksetzen bei Fehler
    }
    // Das finally hier ist nicht mehr nötig, da wir es in try/catch behandeln
  };

  // Handler für Bildupload
  const handleUpload = async () => {
    if (!selectedFile) return; // Jetzt prüfen wir auf selectedFile (komprimierter Blob)

    setIsUploading(true); // Setze Upload-Status hier
    try {
      await uploadProfilePicture(selectedFile);

      showNotification({
        message: "Profilbild erfolgreich aktualisiert.",
        type: "success",
      });

      setSelectedFile(null);
      setPreviewUrl(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Fehler beim Hochladen des Profilbilds:", error);
    } finally {
      setIsUploading(false); // Setze Upload-Status zurück nach Versuch
    }
  };

  // Handler für Öffnen des Datei-Dialogs
  const handleSelectClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Abbrechen der Auswahl
  const handleCancelSelection = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
      <div className="flex min-h-screen flex-col items-center bg-gray-900 text-white pt-4">
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
          />

          <div className="text-center mt-6">
            {/* Profilbild-Container mit Overlay für Upload */}
            <div className="flex justify-center items-center mx-auto">
              <div className="relative h-32 w-32 overflow-hidden rounded-full bg-gray-800 border-2 border-gray-700">
                {/* Zeige Vorschau, falls vorhanden */}
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="Bildvorschau"
                    width={128}
                    height={128}
                    className="object-cover h-full w-full"
                  />
                ) :
                /* Sonst zeige aktuelles Profilbild oder Platzhalter */
                  user?.photoURL ? (
                    <Image
                      src={user.photoURL}
                      alt="Profilbild"
                      width={128}
                      height={128}
                      className="object-cover h-full w-full"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-blue-600 text-4xl font-bold">
                      {user?.displayName?.charAt(0) || user?.email?.charAt(0) || "?"}
                    </div>
                  )}

                {/* Kamera-Icon Overlay für Upload mit Hover-Effekt */}
                <button
                  onClick={handleSelectClick}
                  className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-60 transition-all duration-200"
                  disabled={isUploading}
                >
                  <Camera className="text-white opacity-0 hover:opacity-100 transition-opacity duration-200" size={32} />
                </button>
              </div>
            </div>

            {/* Name und Jasspruch */}
            <h1 className="mt-4 text-3xl font-bold text-center text-white mb-1">
              {user?.displayName || "Kein Name festgelegt"}
            </h1>
            {user?.statusMessage && (
              <p className="text-gray-400 text-center mb-4 px-8 max-w-[90%] mx-auto">
                {user.statusMessage}
              </p>
            )}

            {/* Upload-Bereich nur anzeigen, wenn ein Bild ausgewählt wurde */}
            {selectedFile && (
              <div className="mt-4 flex gap-2 justify-center">
                <Button
                  onClick={handleUpload}
                  className="bg-green-600 hover:bg-green-700 flex items-center gap-1"
                  disabled={!selectedFile || isUploading}
                >
                  {isUploading ? (
                    <>
                      <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-1"></div>
                      Wird hochgeladen...
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

            {/* Versteckter File-Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg, image/png"
              className="hidden"
              disabled={isUploading}
            />
          </div>

          {/* --- NEUER AKTIONSBUTTON-BEREICH --- */}
          <div className="flex justify-around mb-6 w-full mt-8">

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

            {/* 2. Button: Meine Statistik (Mitte) - ENTFERNT */}
            {/* <div className="flex flex-col items-center">
              <span className="text-xs text-gray-400 mb-2">Statistik</span>
              <Button
                variant="default"
                className="h-12 w-12 flex items-center justify-center bg-gray-600 border-gray-700 hover:bg-gray-500 text-white active:scale-95 transition-transform duration-100 ease-in-out"
                onClick={() => alert("Meine Statistik - TODO")}
                disabled // Deaktiviert bis Implementierung
              >
                <BarChart3
                  style={{height: "1.5rem", width: "1.5rem"}}
                />
              </Button>
            </div> */}

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

          {/* --- NEUER STATISTIKBEREICH (basiert auf Gruppenstatistik) --- */}
          <div className="w-full bg-gray-800/50 rounded-lg p-4 mb-8">
            <div className="space-y-3 text-sm px-2 pb-2">

              {/* Block 1: Spielerübersicht */}
              <div>
                <h3 className="text-base font-semibold text-white mb-2">Spielerübersicht</h3>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Anzahl Gruppen:</span>
                    <span className="text-gray-100">0</span> {/* TODO: Aus userGroups laden */}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Anzahl Jass-Partien gespielt:</span>
                    <span className="text-gray-100">0</span> {/* Placeholder */}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Anzahl Spiele gespielt:</span>
                    <span className="text-gray-100">0</span> {/* Placeholder */}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Gesamte Jass-Zeit:</span>
                    <span className="text-gray-100">-</span> {/* Placeholder */}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Mitglied seit:</span>
                    <span className="text-gray-100">-</span> {/* TODO: user.metadata.creationTime */}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Letzte Aktivität:</span>
                    <span className="text-gray-100">-</span> {/* TODO: user.metadata.lastSignInTime */}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="pt-2 pb-1">
                <hr className="border-gray-600/50" />
              </div>

              {/* Block 2: Persönliche Durchschnittswerte */}
              <div>
                <h3 className="text-base font-semibold text-white mb-2">Deine Durchschnittswerte</h3>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Ø Punkte pro Spiel:</span>
                    <span className="text-gray-100">-</span> {/* Placeholder */}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Ø Striche pro Spiel:</span>
                    <span className="text-gray-100">-</span> {/* Placeholder */}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Ø Weispunkte pro Spiel:</span>
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

              {/* Block 3: Persönliche Highlights */}
              <div>
                <h3 className="text-base font-semibold text-white mb-2">Deine Highlights</h3>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Höchste Punktzahl (Spiel):</span>
                    <span className="text-gray-100">N/A (0)</span> {/* Placeholder */}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Höchste Weispunkte (Spiel):</span>
                    <span className="text-gray-100">N/A (0)</span> {/* Placeholder */}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Höchste Siegquote (Partie):</span>
                    <span className="text-gray-100">N/A (0%)</span> {/* Placeholder */}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Höchste Siegquote (Spiel):</span>
                    <span className="text-gray-100">N/A (0%)</span> {/* Placeholder */}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Meiste Matches (Spiel):</span>
                    <span className="text-gray-100">N/A (0)</span> {/* Placeholder */}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ProfilePage;
