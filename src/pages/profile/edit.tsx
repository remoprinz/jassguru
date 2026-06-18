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
import type { CardStyle, FirestorePlayer, JassColor } from '@/types/jass';
import { sanitizeInput } from "@/utils/sanitize";
import { SeoHead } from '@/components/layout/SeoHead';
import { FarbePictogram } from "@/components/settings/FarbePictogram";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/services/firebaseInit";

const EditProfilePage: React.FC = () => {
  const {user, status, isAuthenticated, updateProfile, logout} = useAuthStore();
  const showNotification = useUIStore((state) => state.showNotification);
  const setPageCta = useUIStore((state) => state.setPageCta);
  const resetPageCta = useUIStore((state) => state.resetPageCta);
  const router = useRouter();

  // Form state
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [statusMessage, setStatusMessage] = useState(user?.statusMessage || "");
  const [selectedCardStyle, setSelectedCardStyle] = useState<CardStyle>("DE");
  const [selectedTheme, setSelectedTheme] = useState<ThemeColor>(CURRENT_PROFILE_THEME);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Account-Löschung (Apple-Pflicht 5.1.1(v) + DSGVO Art. 17)
  const [deleteModalStep, setDeleteModalStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const functions = getFunctions(firebaseApp, "europe-west6");
      const deleteMyAccount = httpsCallable<unknown, { success: boolean; anonymizedAs?: string | null }>(
        functions,
        "deleteMyAccount",
      );
      await deleteMyAccount();
      // Logout im Client (Auth-User existiert serverseitig nicht mehr)
      await logout();
      showNotification({
        type: "info",
        message: "Dein Account wurde gelöscht. Deine Stats bleiben anonymisiert für deine Mitspieler erhalten.",
        duration: 8000,
      });
      router.push("/");
    } catch (err) {
      console.error("[Account-Löschung] Fehler:", err);
      showNotification({
        type: "error",
        message: "Account-Löschung fehlgeschlagen. Bitte später erneut versuchen oder Support kontaktieren.",
        duration: 8000,
      });
      setIsDeleting(false);
    }
  };
  
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

  // Kartenstil aus Firebase/AuthStore laden
  useEffect(() => {
    const style = currentPlayerData?.profileCardStyle || user?.profileCardStyle || "DE";
    setSelectedCardStyle(style === "FR" ? "FR" : "DE");
  }, [currentPlayerData?.profileCardStyle, user?.profileCardStyle]);

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
        profileTheme: selectedTheme,
        profileCardStyle: selectedCardStyle,
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
        <div className="flex min-h-screen items-center justify-center bg-transparent text-white">
          <div>Laden...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <SeoHead noIndex={true} />
      <div className="flex flex-col items-center p-4 text-white relative">
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

            {/* Kartenstil-Auswahl für Profil-Stats */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-200">
                Kartenstil (Profil-Statistiken)
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(["DE", "FR"] as CardStyle[]).map((style) => {
                  const isSelected = selectedCardStyle === style;
                  const farben: JassColor[] = ["Eicheln", "Rosen", "Schellen", "Schilten"];
                  const selectedThemeHex = THEME_COLORS[selectedTheme].accentHex;
                  const selectedBackground = `${selectedThemeHex}22`; // ca. 13% Opacity
                  return (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setSelectedCardStyle(style)}
                      style={isSelected ? { backgroundColor: selectedBackground } : undefined}
                      className={`
                        rounded-lg border-2 px-4 py-3 transition-all duration-200 flex flex-col items-center justify-center text-center
                        ${isSelected
                          ? "border-white text-white shadow-lg"
                          : "border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600"}
                      `}
                    >
                      <div className="text-xs text-center mb-2 font-medium tracking-wide">
                        {style}
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        {farben.map((farbe) => (
                          <FarbePictogram
                            key={`${style}-${farbe}`}
                            farbe={farbe}
                            mode="svg"
                            cardStyle={style}
                            className="h-8 w-8"
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400">
                Diese Einstellung steuert nur die Anzeige in deinem Profil, nicht die gespeicherten Statistik-Daten.
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
                  const selectedBackground = `${theme.accentHex}22`; // ca. 13% Opacity
                  
                  return (
                    <button
                      key={themeKey}
                      type="button"
                      onClick={() => setSelectedTheme(themeKey)}
                      style={isSelected ? { backgroundColor: selectedBackground } : undefined}
                      className={`
                        relative p-3 rounded-lg border-2 transition-all duration-200 text-left
                        ${isSelected 
                          ? "border-white shadow-lg"
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

          {/* Account-Löschung — ganz unten, deutlich abgesetzt (Apple-Pflicht) */}
          <div className="mt-12 pt-8 border-t border-red-900/30">
            <h3 className="text-sm font-semibold text-red-400 mb-2">Konto löschen</h3>
            <p className="text-xs text-gray-400 mb-4">
              Dein Login und alle persönlichen Daten werden unwiderruflich gelöscht.
              Deine Spielstatistiken bleiben anonymisiert (z. B. &laquo;MW-1234&raquo; statt deinem Namen) für deine
              Mitspieler erhalten — sonst wären deren Stats kaputt.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {setDeleteModalStep(1); setDeleteConfirmInput("");}}
              className="border-red-700/50 text-red-400 hover:bg-red-950/40 hover:text-red-300"
              disabled={isDeleting}
            >
              Account löschen
            </Button>
          </div>
        </div>
      </div>

      {/* Step-1-Modal: Aufklärung */}
      {deleteModalStep === 1 && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-red-900/40 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-white">Account wirklich löschen?</h2>
            <div className="text-sm text-gray-300 space-y-2">
              <p><strong className="text-white">Was gelöscht wird:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                <li>Dein Login (Email, Passwort)</li>
                <li>Dein Profilbild</li>
                <li>Dein angezeigter Name + Statusnachricht</li>
                <li>Alle privaten Einstellungen</li>
              </ul>
              <p className="pt-2"><strong className="text-white">Was bleibt:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                <li>Deine Spielstatistiken (anonymisiert, z.B. &laquo;MW-1234&raquo;)</li>
                <li>Aggregat-Daten deiner Mitspieler (sonst wären deren Profile kaputt)</li>
              </ul>
              <p className="pt-2 text-red-400 text-xs">
                Dies kann nicht rückgängig gemacht werden. Du kannst dich danach nicht mehr einloggen.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeleteModalStep(0)} disabled={isDeleting} className="border border-gray-400 bg-transparent text-white hover:bg-gray-700 hover:text-white">
                Abbrechen
              </Button>
              <Button
                onClick={() => setDeleteModalStep(2)}
                className="bg-red-700 hover:bg-red-600 text-white"
                disabled={isDeleting}
              >
                Verstanden, weiter
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step-2-Modal: Bestätigung via Tippen */}
      {deleteModalStep === 2 && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-red-900/40 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-white">Letzte Sicherheitsfrage</h2>
            <p className="text-sm text-gray-300">
              Tippe <strong className="text-red-400 font-mono">LÖSCHEN</strong> um deinen Account endgültig zu löschen.
            </p>
            <Input
              type="text"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder="LÖSCHEN"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="bg-black/40 border-red-900/40 text-white"
              disabled={isDeleting}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeleteModalStep(0)} disabled={isDeleting} className="border border-gray-400 bg-transparent text-white hover:bg-gray-700 hover:text-white">
                Abbrechen
              </Button>
              <Button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmInput !== "LÖSCHEN" || isDeleting}
                className="bg-red-700 hover:bg-red-600 text-white disabled:opacity-40"
              >
                {isDeleting ? "Lösche..." : "Endgültig löschen"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default EditProfilePage;
