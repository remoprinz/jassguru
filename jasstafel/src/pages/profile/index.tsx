'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Image from 'next/image';
import MainLayout from '@/components/layout/MainLayout';
import { useUIStore } from '@/store/uiStore';
import { Camera, Upload, X, ArrowLeft } from 'lucide-react'; // Icons für das UI
import Link from 'next/link'; // Importiere Link
import imageCompression from 'browser-image-compression'; // Import hinzugefügt
// Platzhalter für die neue Komponente
import ImageCropModal from '@/components/ui/ImageCropModal';

const ProfilePage: React.FC = () => {
  const { user, status, isAuthenticated, uploadProfilePicture, error, clearError } = useAuthStore();
  const showNotification = useUIStore(state => state.showNotification);
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
    if (!isAuthenticated() || status === 'unauthenticated') {
      router.push('/');
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
      if (!originalFile.type.startsWith('image/')) {
        showNotification({
          message: 'Bitte wählen Sie eine Bilddatei aus (JPEG oder PNG).',
          type: 'error'
        });
        return;
      }
      
      // Prüfen der Dateigröße (Initialprüfung, z.B. 10 MB)
      const initialMaxSizeInBytes = 10 * 1024 * 1024; // 10 MB
      if (originalFile.size > initialMaxSizeInBytes) {
        showNotification({
          message: 'Die Datei ist zu groß (max. 10 MB).',
          type: 'error'
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
      setCropModalOpen(true);   // Modal öffnen

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
        if (fileInputRef.current) fileInputRef.current.value = ''; // Input zurücksetzen
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
      fileType: 'image/jpeg', 
      initialQuality: 0.8 
    };

    try {
      console.log("Komprimiere zugeschnittenes Bild...");
      const compressedBlob = await imageCompression(new File([croppedImageBlob], "cropped_image.jpg", { type: 'image/jpeg' }), options);
      console.log(`Komprimiertes Bild, Größe: ${(compressedBlob.size / 1024).toFixed(2)} KB`);

      // Vorschau mit komprimiertem Bild erstellen und Datei speichern
      const finalPreviewUrl = URL.createObjectURL(compressedBlob);
      setPreviewUrl(finalPreviewUrl);
      setSelectedFile(new File([compressedBlob], "profile_picture.jpg", { type: 'image/jpeg' }));
      // --- Verarbeitung erfolgreich beendet ---
      setIsUploading(false); // Status zurücksetzen, bereit für 'Hochladen' Klick

    } catch (compressionError) {
      console.error('Fehler bei der Komprimierung des zugeschnittenen Bildes:', compressionError);
      showNotification({
        message: 'Fehler bei der Bildkomprimierung.',
        type: 'error'
      });
      // Zurücksetzen
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
        message: 'Profilbild erfolgreich aktualisiert.',
        type: 'success'
      });
      
      setSelectedFile(null);
      setPreviewUrl(null);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (error) {
      console.error('Fehler beim Hochladen des Profilbilds:', error);
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
      fileInputRef.current.value = '';
    }
  };

  if (status === 'loading' && !isUploading) {
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
      <div className="flex min-h-screen flex-col items-center bg-gray-900 p-4 text-white relative">
        {/* Zurück-Button oben links */}
        <Link href="/start" passHref legacyBehavior>
          <Button
            variant="ghost"
            className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3"
            aria-label="Zurück zur Startseite"
          >
            <ArrowLeft size={28} />
          </Button>
        </Link>

        <div className="w-full max-w-md space-y-8 py-8">
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

          <div className="text-center">
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

            {/* Name und Email */}
            <h1 className="mt-4 text-2xl font-bold">
              {user?.displayName || 'Kein Name festgelegt'}
            </h1>
            <p className="mt-2 text-gray-400">
              {user?.email || 'Keine E-Mail-Adresse'}
            </p>

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

          <div className="mt-8 space-y-4">
            <Button
              onClick={() => router.push('/profile/edit')}
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled
            >
              Profil bearbeiten
            </Button>

            <Button
              onClick={() => router.push('/profile/groups')}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              Meine Gruppen
            </Button>

            <Button
              onClick={() => router.push('/profile/statistics')}
              className="w-full bg-gray-700 hover:bg-gray-600"
              variant="outline"
              disabled
            >
              Meine Statistiken
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ProfilePage; 