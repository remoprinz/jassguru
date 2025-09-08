"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import MainLayout from "@/components/layout/MainLayout";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Alert, AlertDescription} from "@/components/ui/alert";
import { CURRENT_PROFILE_THEME, THEME_COLORS, type ThemeColor, getCurrentProfileTheme } from '@/config/theme';
import { getPlayerByUserId } from '@/services/playerService';
import type { FirestorePlayer } from '@/types/jass';
import { sanitizeInput } from "@/utils/sanitize";

const EditProfilePage: React.FC = () => {
  const {user, status, isAuthenticated, updateProfile} = useAuthStore();
  const showNotification = useUIStore((state) => state.showNotification);
  const setPageCta = useUIStore((state) => state.setPageCta);
  const resetPageCta = useUIStore((state) => state.resetPageCta);
  const router = useRouter();

  // Form state
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [statusMessage, setStatusMessage] = useState(user?.statusMessage || "");
  const [selectedTheme, setSelectedTheme] = useState<ThemeColor>(CURRENT_PROFILE_THEME);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 🔧 FIX: Aktuelle Player-Daten aus Firebase laden (für korrekte Theme-Anzeige)
  const [currentPlayerData, setCurrentPlayerData] = useState<FirestorePlayer | null>(null);

  // Deutsche Farbnamen und Beschreibungen
  const themeLabels: Record<ThemeColor, { name: string; description: string }> = {
    green: { name: "Grün", description: "" },
    blue: { name: "Blau", description: "" },
    purple: { name: "Lila", description: "" },
    pink: { name: "Pink", description: "" },
    yellow: { name: "Gelb", description: "" },
    teal: { name: "Türkis", description: "" },
    orange: { name: "Orange", description: "" },
    cyan: { name: "Cyan", description: "" },
  };

  // 🔧 FIX: Aktuelle Player-Daten aus Firebase laden
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

  // Theme aus Firebase/localStorage laden
  useEffect(() => {
    // 🎯 KRITISCH: Verwende Firebase-Daten (currentPlayerData) statt authStore
    // 🔧 FIX: Vermeide localStorage-Fallback um Pink-Flackern zu verhindern
    if (currentPlayerData?.profileTheme) {
      setSelectedTheme(getCurrentProfileTheme(currentPlayerData.profileTheme));
    } else if (user?.profileTheme) {
      setSelectedTheme(getCurrentProfileTheme(user.profileTheme));
    } else {
      // Fallback zu 'cyan' (User's Firebase default) statt localStorage
      setSelectedTheme('cyan');
    }
  }, [currentPlayerData?.profileTheme, user?.profileTheme]);

  // Redirect wenn nicht eingeloggt
  useEffect(() => {
    if (status === "authenticated" || status === "unauthenticated") {
      if (!isAuthenticated()) {
        router.push("/");
      }
    }
  }, [status, isAuthenticated, router]);

  // Form-Daten aktualisieren wenn User-Daten geladen werden  
  useEffect(() => {
    // 🔧 FIX: Bevorzuge Firebase-Daten (currentPlayerData) über authStore (user)
    const playerData = currentPlayerData || user;
    if (playerData) {
      setDisplayName(playerData.displayName || "");
      setStatusMessage(playerData.statusMessage || "");
    }
  }, [currentPlayerData, user]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // --- SECURITY AUDIT: VALIDATION & SANITIZATION ---
    if (displayName.trim().length < 2 || displayName.trim().length > 30) {
      setError("Name muss zwischen 2 und 30 Zeichen lang sein.");
      return;
    }
    if (statusMessage.length > 150) {
      setError("Jasspruch darf maximal 150 Zeichen lang sein.");
      return;
    }

    const sanitizedDisplayName = sanitizeInput(displayName.trim());
    const sanitizedStatusMessage = sanitizeInput(statusMessage);
    // --- END SECURITY AUDIT FIX ---

    setIsSubmitting(true);
    setError(null);

    try {
      await updateProfile({
        displayName: sanitizedDisplayName, 
        statusMessage: sanitizedStatusMessage, 
        profileTheme: selectedTheme
      });

      showNotification({
        message: `Profil und Farbe "${themeLabels[selectedTheme].name}" erfolgreich gespeichert.`,
        type: "success",
      });

      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
      setIsSubmitting(false);
    }
  };

  // CTA Button Setup
  useEffect(() => {
    setPageCta({
      isVisible: true,
      text: "Speichern",
      onClick: () => {
        const form = document.getElementById("profile-form") as HTMLFormElement;
        form?.requestSubmit();
      },
      loading: isSubmitting,
      disabled: isSubmitting,
      variant: "info",
    });

    return () => {
      resetPageCta();
    };
  }, [setPageCta, resetPageCta, isSubmitting]);

  // Zeige Ladescreen während Auth-Status geprüft wird
  if (status === "loading") {
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
      <div className="flex flex-col items-center bg-gray-900 p-4 text-white relative">
        {/* Back Button */}
        <Link href="/profile" passHref legacyBehavior>
          <Button
            variant="ghost"
            className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3"
            aria-label="Zurück zum Profil"
          >
            <ArrowLeft size={28} />
          </Button>
        </Link>

        <div className="w-full max-w-md space-y-6 py-16">
          <h1 className="text-center text-2xl font-bold text-white">
            Profil bearbeiten
          </h1>

          {error && (
            <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" id="profile-form">
            <div className="space-y-2">
              <label htmlFor="displayName" className="text-sm font-medium text-gray-200">
                Name
              </label>
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="Dein Name"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="statusMessage" className="text-sm font-medium text-gray-200">
                Jasspruch
              </label>
              <Textarea
                id="statusMessage"
                value={statusMessage}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setStatusMessage(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                placeholder="Dein persönlicher Jasspruch (optional)"
                maxLength={150}
              />
              <p className="text-xs text-gray-400">
                Der Jasspruch wird in deinem Profil angezeigt. Maximal 150 Zeichen.
              </p>
            </div>

            {/* Farbauswahl */}
            <div className="space-y-4">
              <label className="text-sm font-medium text-gray-200">
                Profilfarbe
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(THEME_COLORS) as ThemeColor[]).map((themeKey) => {
                  const theme = THEME_COLORS[themeKey];
                  const label = themeLabels[themeKey];
                  const isSelected = selectedTheme === themeKey;
                  
                  // Farbkreis-Mapping für CSS
                  const colorClass = theme.primary.replace('bg-', '');
                  
                  return (
                    <button
                      key={themeKey}
                      type="button"
                      onClick={() => setSelectedTheme(themeKey)}
                      className={`
                        relative p-3 rounded-lg border-2 transition-all duration-200 text-left
                        ${isSelected 
                          ? `border-${colorClass} bg-${colorClass}/10 shadow-lg` 
                          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                        }
                      `}
                    >
                      <div className="flex items-center space-x-3">
                        {/* Farbkreis */}
                        <div 
                          className={`
                            w-8 h-8 rounded-full border-2 transition-all duration-200
                            ${theme.primary} border-gray-600
                            ${isSelected ? 'scale-110 shadow-md' : ''}
                          `}
                        >
                          {/* Aktiv-Indikator */}
                          {isSelected && (
                            <div className="w-full h-full rounded-full border-2 border-white/20 flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            </div>
                          )}
                        </div>
                        
                        {/* Farbname und Beschreibung */}
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-sm ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                            {label.name}
                          </div>
                        </div>
                      </div>
                      
                      {/* Aktiv-Badge */}
                      {isSelected && (
                        <div className={`absolute -top-1 -right-1 w-5 h-5 ${theme.primary} rounded-full border-2 border-gray-900 flex items-center justify-center`}>
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400">
                Deine Profilfarbe wird sofort in der Navigation und den Statistiken angezeigt.
              </p>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default EditProfilePage;
