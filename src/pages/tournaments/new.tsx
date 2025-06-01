"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';
import { useTournamentStore } from '@/store/tournamentStore';
import { useUIStore } from '@/store/uiStore';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, PlusCircle, Loader2, Camera, X } from 'lucide-react';
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import type { TournamentSettings } from '@/types/tournament';
import type { ScoreSettings, StrokeSettings, FarbeSettings } from '@/types/jass';
import { useImageCorper } from "@/hooks/useImageCorper";
import { updateTournamentSettings } from '@/services/tournamentService';

// Turnier-spezifische Default-Einstellungen
const TOURNAMENT_DEFAULT_SCORE_SETTINGS: ScoreSettings = {
  values: {
    sieg: 1000, // A) Punkteziel: 1000
    berg: 0,
    schneider: 0,
  },
  enabled: {
    sieg: true, // Sieg ist immer enabled
    berg: false,    // B) Berg deaktiviert
    schneider: false, // B) Schneider deaktiviert
  },
  // isFlipped komplett entfernt, da nicht benötigt und Ursache für undefined-Fehler
};

const TOURNAMENT_DEFAULT_STROKE_SETTINGS: StrokeSettings = {
  schneider: 0,
  kontermatsch: 0, // Turniermodus: Kontermatsch auf 0
};

const TOURNAMENT_DEFAULT_FARBE_SETTINGS: FarbeSettings = {
  values: {
    // E) Spezifische Multiplikatoren für Turniere
    misère: 0,
    eicheln: 1,
    rosen: 1,
    schellen: 1,
    schilten: 1,
    obe: 1,
    une: 1,
    dreimal: 0,
    quer: 0,
    slalom: 0,
  },
  cardStyle: "DE", // D) Kartensatz: DE
};

const NewTournamentPage: React.FC = () => {
  const router = useRouter();
  const { user, status: authStatus, isAuthenticated } = useAuthStore();
  const { currentGroup, status: groupStatus } = useGroupStore();
  const {
    createTournament,
    status: tournamentCreateStatus,
  } = useTournamentStore();
  const setHeaderConfig = useUIStore((state) => state.setHeaderConfig);
  const setPageCta = useUIStore((state) => state.setPageCta);
  const resetPageCta = useUIStore((state) => state.resetPageCta);
  const showNotification = useUIStore((state) => state.showNotification);

  const [tournamentName, setTournamentName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const {
    croppedImage,
    isProcessing: isImageProcessing,
    error: imageError,
    cropImage,
    uploadCroppedImage,
    resetImage,
  } = useImageCorper({ aspectRatio: 1, maxWidth: 500, maxHeight: 500, outputFormat: 'jpeg' });
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setHeaderConfig({
      title: '',
      showBackButton: false,
      showProfileButton: true,
    });
    return () => {
      setHeaderConfig(null);
      resetPageCta();
    };
  }, [setHeaderConfig, resetPageCta]);

  useEffect(() => {
    const isLoading = tournamentCreateStatus === 'loading-list' || isImageProcessing;
    
    setPageCta({
      isVisible: true,
      text: isLoading ? (isImageProcessing ? 'Logo wird verarbeitet...' : 'Wird erstellt...') : 'Turnier erstellen',
      onClick: () => {
        const form = document.getElementById('create-tournament-form') as HTMLFormElement | null;
        form?.requestSubmit();
      },
      variant: 'success',
      disabled: isLoading || !tournamentName.trim() || !currentGroup,
      loading: isLoading,
    });
  }, [tournamentName, currentGroup, tournamentCreateStatus, isImageProcessing, setPageCta]);

  useEffect(() => {
    if (authStatus === 'unauthenticated' && !isAuthenticated()) {
      router.push('/');
    } else if (authStatus === 'authenticated' && !currentGroup && groupStatus === 'success') {
      console.warn('[NewTournamentPage] No active group selected, redirecting to profile.');
      router.push('/profile');
    }
  }, [authStatus, isAuthenticated, currentGroup, groupStatus, router]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
      resetImage();
    };
  }, [logoPreviewUrl, resetImage]);

  useEffect(() => {
    if (croppedImage) {
      setLogoPreviewUrl(croppedImage);
    }
  }, [croppedImage]);

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTournamentName(event.target.value);
    setError(null);
  };

  const handleLogoFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (!file.type.startsWith("image/")) {
        showNotification({message: "Bitte Bilddatei wählen (JPEG, PNG, WebP).", type: "error"});
        return;
      }
      const maxSizeInBytes = 5 * 1024 * 1024; // 5MB Limit
      if (file.size > maxSizeInBytes) {
        showNotification({message: "Bild ist zu groß (max. 5 MB).", type: "error"});
        return;
      }
      try {
        await cropImage(file);
        setError(null); 
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Fehler bei Bildverarbeitung";
        showNotification({ message: msg, type: "error" });
        setError(msg);
      }
    }
  }, [cropImage, showNotification]);

  const handleLogoSelectClick = () => {
    logoFileInputRef.current?.click();
  };

  const handleCancelLogoSelection = () => {
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }
    setLogoPreviewUrl(null);
    resetImage();
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tournamentName.trim() || !currentGroup || !user) {
      setError('Turniername darf nicht leer sein und eine Gruppe muss ausgewählt sein.');
      showNotification({ message: 'Turniername darf nicht leer sein und eine Gruppe muss ausgewählt sein.', type: 'error' });
      return;
    }

    setError(null);

    try {
      // Verwende IMMER die Turnier-Defaults als Basis - ohne Überschreibung durch Gruppeneinstellungen
      const effectiveScoreSettings: ScoreSettings = TOURNAMENT_DEFAULT_SCORE_SETTINGS;
      const effectiveStrokeSettings: StrokeSettings = TOURNAMENT_DEFAULT_STROKE_SETTINGS;
      const effectiveFarbeSettings: FarbeSettings = TOURNAMENT_DEFAULT_FARBE_SETTINGS;

      const tournamentSpecificSettings: TournamentSettings = {
        rankingMode: 'total_points' as const,
        scoreSettings: effectiveScoreSettings,
        strokeSettings: effectiveStrokeSettings,
        farbeSettings: effectiveFarbeSettings,
        // scheduledStartTime entfernt
      };

      const newTournamentId = await createTournament(
        currentGroup.id,
        user.uid,
        tournamentName.trim(),
        [user.uid],
        tournamentSpecificSettings
      );
      
      let finalLogoUrl: string | null = null;
      if (croppedImage && newTournamentId) {
        showNotification({ message: "Lade Turnier-Logo hoch...", type: "info" });
        try {
          const logoPath = `tournamentLogos/${newTournamentId}`;
          finalLogoUrl = await uploadCroppedImage(logoPath);
          await updateTournamentSettings(newTournamentId, { logoUrl: finalLogoUrl });
          showNotification({ message: "Turnier-Logo erfolgreich hochgeladen!", type: "success" });
        } catch (uploadError) {
          console.error("Fehler beim Hochladen des Turnier-Logos:", uploadError);
          const msg = uploadError instanceof Error ? uploadError.message : "Logo-Upload fehlgeschlagen.";
          showNotification({ message: `Turnier erstellt, aber Logo-Upload fehlgeschlagen: ${msg}`, type: "warning" });
        }
      }
      
      showNotification({ message: `Turnier "${tournamentName.trim()}" erfolgreich erstellt!`, type: 'success'});
      router.push(`/tournaments/${newTournamentId}/settings`);

    } catch (err) {
      console.error("Error creating tournament:", err);
      const errorMsg = err instanceof Error ? err.message : "Ein unbekannter Fehler ist aufgetreten.";
      setError(errorMsg);
      showNotification({ message: errorMsg, type: 'error' });
    }
  };

  const handleGoBack = () => {
    router.push('/tournaments');
  };

  if (authStatus === 'loading' || (authStatus === 'authenticated' && groupStatus === 'loading')) {
     return (
      <MainLayout>
        <div className="flex flex-1 flex-col items-center justify-center min-h-[calc(100vh-112px)]">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          <span className="ml-3 text-white">Prüfe Berechtigungen...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex min-h-screen flex-col items-center bg-gray-900 p-4 text-white relative">
        <Button
          variant="ghost"
          onClick={handleGoBack}
          className="absolute top-5 left-4 text-white hover:bg-gray-700 p-2 sm:p-3 z-20"
          aria-label="Zurück"
        >
          <ArrowLeft size={24} />
          </Button>

        <div className="w-full max-w-md space-y-6 mt-16 sm:mt-12 pt-6 pb-24">
          <h1 className="text-center text-2xl font-bold text-white mb-6">
            Neues Turnier erstellen
          </h1>
          {error && (
            <div className="rounded-md border border-red-900 bg-red-900/20 p-3 text-center text-red-200">
              {error}
        </div>
          )}

          <form id="create-tournament-form" onSubmit={handleSubmit} className="space-y-4">
          {currentGroup && (
            <div className="mb-4 text-sm text-gray-400 border-b border-gray-700 pb-3">
              Turnier wird für Gruppe <span className="font-semibold text-purple-300">{currentGroup.name}</span> erstellt.
            </div>
          )}

          <div className="flex flex-col items-center space-y-2">
              <Label className="text-gray-300 self-start">Turnier-Profilbild</Label>
            <div className="relative">
              <Avatar
                className="h-24 w-24 cursor-pointer border-2 border-gray-600 hover:border-gray-500 transition-colors"
                onClick={handleLogoSelectClick}
              >
                <AvatarImage src={logoPreviewUrl ?? undefined} alt="Turnier Profilbild Vorschau" className="object-cover" />
                <AvatarFallback className="bg-gray-700 text-gray-400">
                  <Camera size={32} />
                </AvatarFallback>
              </Avatar>
              {logoPreviewUrl && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={handleCancelLogoSelection}
                  className="absolute -top-1 -right-1 z-10 rounded-full bg-red-600/80 hover:bg-red-700 w-7 h-7 min-w-0 p-1"
                  aria-label="Bildauswahl aufheben"
                  disabled={isImageProcessing}
                >
                  <X size={16} />
                </Button>
              )}
            </div>
            <input
              type="file"
              ref={logoFileInputRef}
              onChange={handleLogoFileChange}
              accept="image/jpeg, image/png, image/webp"
              className="hidden"
              disabled={isImageProcessing}
            />
            {imageError && <p className="text-sm text-red-400">{imageError}</p>}
              <p className="text-xs text-gray-500 text-center">Du kannst das Bild später ändern oder bearbeiten auf der Turnierseite, max 5MB</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tournamentName" className="text-white">Turniername</Label>
            <Input
              id="tournamentName"
              type="text"
              value={tournamentName}
              onChange={handleNameChange}
              placeholder="z.B. Jassreise Krakau 2025"
              required
              className="bg-gray-700 border-gray-600 text-white focus:border-purple-500 focus:ring-purple-500"
              disabled={isImageProcessing}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/40 p-3 rounded-md">{error}</p>
          )}
        </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default NewTournamentPage; 