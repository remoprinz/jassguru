"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import Link from "next/link";
import {ArrowLeft, Users, Globe, Settings, Crown, Loader2, ShieldCheck, AlertTriangle, Wrench, X, Palette, Share2, UserPlus, UserCog, Award, Trash2} from "lucide-react";
import {useAuthStore} from "@/store/authStore";
import {useGroupStore} from "@/store/groupStore";
import {useUIStore} from "@/store/uiStore";
import MainLayout from "@/components/layout/MainLayout";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Switch} from "@/components/ui/switch";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {getFunctions, httpsCallable} from "firebase/functions";
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger} from "@/components/ui/alert-dialog";
import {getPlayerDocument, ensurePlayersExist} from "@/services/playerService";
import {FirestorePlayer, STROKE_MODES } from "@/types/jass";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {Badge} from "@/components/ui/badge";
import {db} from "@/services/firebaseInit";
import ProfileImage from '@/components/ui/ProfileImage';
import {doc, getDoc, updateDoc, arrayRemove, arrayUnion, Timestamp} from "firebase/firestore";
import { FarbePictogram } from '@/components/settings/FarbePictogram';

// Füge korrekte Imports hinzu
import { DEFAULT_FARBE_SETTINGS, FARBE_MODES } from '@/config/FarbeSettings';
import { DEFAULT_SCORE_SETTINGS, SCORE_MODES } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';

// NEUE IMPORTE FÜR KARTENSYMBOL-MAPPING
import { CARD_SYMBOL_MAPPINGS } from '@/config/CardStyles';
import { toTitleCase } from '@/utils/formatUtils';
// ENDE NEUE IMPORTE

import type { ScoreSettings, StrokeSettings, FarbeSettings, ScoreMode, StrokeMode, FarbeModeKey, JassColor, CardStyle } from '@/types/jass';
 

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

// Typ für FirestorePlayer mit _isPlaceholder Eigenschaft
type PlayerWithPlaceholder = FirestorePlayer & { _isPlaceholder?: boolean };

// --- Hinzufügen von SCORE_RANGES Konstante, falls noch nicht global vorhanden ---
const SCORE_RANGES = {
  sieg: { min: 1000, max: 10000, default: 2000 },
  berg: { min: 0, max: 5000, default: 1000 },
  schneider: { min: 0, max: 5000, default: 1000 },
} as const;

// --- App Base URL KORRIGIERT --- 
const APP_BASE_URL = "https://jassguru.ch";

const GroupSettingsPage = () => {
  const {user, status, isAuthenticated} = useAuthStore();
  const {currentGroup, updateGroup, updateMemberRole, updateCurrentGroupScoreSettings, updateCurrentGroupStrokeSettings, updateCurrentGroupFarbeSettings, updateCurrentGroupJassSettings} = useGroupStore();
  
  // Selektiere jede Funktion einzeln
  const showNotification = useUIStore((state) => state.showNotification);
  const setPageCta = useUIStore((state) => state.setPageCta);
  const resetPageCta = useUIStore((state) => state.resetPageCta);

  const router = useRouter();
  const { groupId: routeGroupId } = router.query;

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState(""); // Init leer, Default kommt im Effect
  const [mainLocationZip, setMainLocationZip] = useState<string>(""); // Neuer State für PLZ
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInvalidating, setIsInvalidating] = useState(false);

  // Member list state
  const [members, setMembers] = useState<FirestorePlayer[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [roleChangeLoading, setRoleChangeLoading] = useState<Record<string, boolean>>({});
  const [repairingData, setRepairingData] = useState(false);
  const [hasInconsistentData, setHasInconsistentData] = useState(false);

  // === STATE für Jass-Einstellungen (mit Defaults initialisiert) ===
  const [tempScoreSettings, setTempScoreSettings] = useState<ScoreSettings>(DEFAULT_SCORE_SETTINGS);
  const [tempStrokeSettings, setTempStrokeSettings] = useState<StrokeSettings>(DEFAULT_STROKE_SETTINGS);
  const [tempFarbeSettings, setTempFarbeSettings] = useState<FarbeSettings>(DEFAULT_FARBE_SETTINGS);

  // === STATE für Input Buffer ===
  const [tempInput, setTempInput] = useState<{[key in ScoreMode]?: string}>({});
  const [tempStrokeInput, setTempStrokeInput] = useState<{[key in StrokeMode]?: string}>({});
  const [tempFarbeInput, setTempFarbeInput] = useState<{[key in FarbeModeKey]?: string}>({});

  // === STATE für direktes Einladen ===
  const [isGeneratingDirectInvite, setIsGeneratingDirectInvite] = useState(false);
  const [directInviteError, setDirectInviteError] = useState<string | null>(null);

  // Check if current user is admin (using userId/uid, not playerId)
  const isCurrentUserAdmin = !!user?.uid && !!currentGroup?.adminIds.includes(user.uid);

  // Redirect wenn nicht eingeloggt oder keine aktive Gruppe oder kein Admin
  useEffect(() => {
    if (status === "authenticated" || status === "unauthenticated") {
      if (!isAuthenticated()) {
        router.push("/");
      } else if (!currentGroup && routeGroupId) {
         // Wenn keine currentGroup aber routeGroupId -> Ladezustand, warte bis Gruppe geladen
      } else if (!currentGroup && !routeGroupId) {
          router.push("/start"); // Keine Gruppe aktiv und keine ID in URL
      } else if (currentGroup && !isCurrentUserAdmin) {
        showNotification({ message: "Nur Admins können die Gruppeneinstellungen bearbeiten.", type: "error" });
        router.push("/start");
      }
    }
  }, [status, isAuthenticated, router, currentGroup, isCurrentUserAdmin, showNotification, routeGroupId]);

  // Fetch member details
  useEffect(() => {
    const fetchMembers = async () => {
      if (!currentGroup || !currentGroup.playerIds || currentGroup.playerIds.length === 0) {
        setMembers([]);
        setMembersLoading(false);
        return;
      }
      setMembersLoading(true);
      
      let dataWasHealed = false;
      
      try {
        const validPlayerIds = currentGroup.playerIds.filter((id: string | unknown): id is string => 
          typeof id === 'string' && id.trim() !== ''
        );
        
        const memberPromises = validPlayerIds.map(async (idToCheck: string) => {
          try {
            const playerDoc = await getPlayerDocument(idToCheck);
            if (playerDoc) return playerDoc; 
            
            const userRef = doc(db, "users", idToCheck);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists() && userSnap.data()?.playerId) {
              const correctPlayerId = userSnap.data()?.playerId;
              const correctedPlayerDoc = await getPlayerDocument(correctPlayerId);
              
              if (correctedPlayerDoc) {
                try {
                  const groupRef = doc(db, "groups", currentGroup.id);
                  await updateDoc(groupRef, { playerIds: arrayRemove(idToCheck) });
                  await updateDoc(groupRef, { playerIds: arrayUnion(correctPlayerId) });
                  dataWasHealed = true;
                } catch (updateError) {}
                return correctedPlayerDoc;
              }
            }
            
            return {
              id: idToCheck,
              displayName: `Unbekannter Spieler ${idToCheck.slice(0, 4)}...`,
              userId: null, isGuest: false, createdAt: Timestamp.fromDate(new Date()),
              updatedAt: Timestamp.fromDate(new Date()), groupIds: [currentGroup.id],
              stats: { gamesPlayed: 0, wins: 0, totalScore: 0 }, _isPlaceholder: true
            } as FirestorePlayer;
          } catch (error) {
 return null;
}
        });
        
        const memberResults = await Promise.all(memberPromises);
        const validMembers = memberResults.filter((member: FirestorePlayer | null): member is FirestorePlayer => member !== null);
        
        setHasInconsistentData(validMembers.some((m: FirestorePlayer) => (m as PlayerWithPlaceholder)._isPlaceholder));
        
        if (dataWasHealed) {
          showNotification({ message: "Gruppen-Daten wurden automatisch korrigiert.", type: "success" });
        }
        
        setMembers(validMembers.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "")));
      } catch (err) {
        console.error("Fehler beim Laden der Mitgliederdetails:", err);
        setError("Mitgliederdetails konnten nicht geladen werden.");
      } finally {
        setMembersLoading(false);
      }
    };

    if (currentGroup) { // Stelle sicher, dass currentGroup vorhanden ist
    fetchMembers();
    } else {
        setMembers([]);
        setMembersLoading(false);
    }
  }, [currentGroup, showNotification]);

  // Effekt zum Synchronisieren des temporären Zustands, wenn sich die aktuelle Gruppe ändert oder initial geladen wird
  useEffect(() => {
    // NUR ausführen, wenn currentGroup tatsächlich geladen ist!
    if (currentGroup) {
       // Lade die Basis-Einstellungen aus der aktuellen Gruppe
       setName(currentGroup.name || "");
       // NEU: Setze Default-Beschreibung, falls keine vorhanden
       setDescription(currentGroup.description || "Willkommen bei unserer Jassgruppe!");
       setMainLocationZip((currentGroup as any).mainLocationZip || ""); // PLZ laden
       setIsPublic(currentGroup.isPublic ?? true);
 
       // Lade die Jass-Einstellungen aus der aktuellen Gruppe ODER Defaults
       const scoreSettings = currentGroup.scoreSettings ?? DEFAULT_SCORE_SETTINGS;
       const strokeSettings = currentGroup.strokeSettings ?? DEFAULT_STROKE_SETTINGS;
       const farbeSettings = currentGroup.farbeSettings ?? DEFAULT_FARBE_SETTINGS;
       setTempScoreSettings(scoreSettings);
       setTempStrokeSettings(strokeSettings);
       setTempFarbeSettings(farbeSettings);
 
       // Reset Input-Buffer
      setTempInput({}); 
       setTempStrokeInput({});
       setTempFarbeInput({});
     } else {
       // Optional: Reset auf leere/default Werte, WENN currentGroup explizit null wird (z.B. Gruppenwechsel)
       setName("");
       // Setze auch hier den Default-Spruch, falls die Gruppe mal entfernt wird
       setDescription("Willkommen bei unserer Jassgruppe!");
       setMainLocationZip(""); // PLZ zurücksetzen
       setIsPublic(true);
       setTempScoreSettings(DEFAULT_SCORE_SETTINGS);
       setTempStrokeSettings(DEFAULT_STROKE_SETTINGS);
       setTempFarbeSettings(DEFAULT_FARBE_SETTINGS);
     }
  }, [currentGroup]);

  // === HELPER: Wende ausstehende Input-Änderungen auf temporären State an ===
  const applyPendingInputChanges = () => {
    // Arbeite mit Kopien des aktuellen States, um sie zu modifizieren
    let updatedScoreSettings = JSON.parse(JSON.stringify(tempScoreSettings));
    let updatedStrokeSettings = JSON.parse(JSON.stringify(tempStrokeSettings));
    let updatedFarbeSettings = JSON.parse(JSON.stringify(tempFarbeSettings));

    // Wende Score-Änderungen an
    Object.entries(tempInput).forEach(([mode, inputValue]) => {
      // Logik aus handleScoreChange direkt hier anwenden auf updatedScoreSettings
      if (inputValue !== undefined && inputValue !== null) {
          const value = parseInt(inputValue, 10);
          if (!isNaN(value)) {
            const modeKey = mode as ScoreMode;
            const cleanValue = value < 0 ? 0 : value;
            const newScores = { ...updatedScoreSettings.values };
            const newEnabled = { ...updatedScoreSettings.enabled };

             if (modeKey === 'sieg') {
               const validatedValue = Math.max(SCORE_RANGES.sieg.min, Math.min(cleanValue, SCORE_RANGES.sieg.max));
               newScores.sieg = validatedValue;
               const halfValue = Math.floor(validatedValue / 2);
               if (newEnabled.berg) newScores.berg = Math.min(halfValue, SCORE_RANGES.berg.max);
               if (newEnabled.schneider) newScores.schneider = Math.min(halfValue, SCORE_RANGES.schneider.max);
             } else if (modeKey === 'berg') {
               const maxBergValue = Math.floor(newScores.sieg / 2);
               const validatedBergValue = Math.max(0, Math.min(cleanValue, maxBergValue, SCORE_RANGES.berg.max));
               newScores.berg = validatedBergValue;
               if (newEnabled.schneider) newScores.schneider = Math.min(validatedBergValue, SCORE_RANGES.schneider.max);
             } else if (modeKey === 'schneider') {
               const maxSchneiderValueBasedOnBerg = newEnabled.berg ? newScores.berg : Math.floor(newScores.sieg / 2);
               const maxSchneiderValue = Math.min(maxSchneiderValueBasedOnBerg, SCORE_RANGES.schneider.max);
               newScores.schneider = Math.max(0, Math.min(cleanValue, maxSchneiderValue));
             }
             updatedScoreSettings = { ...updatedScoreSettings, values: newScores, enabled: newEnabled };
          }
        }
    });
    // Wende Stroke-Änderungen an
    Object.entries(tempStrokeInput).forEach(([mode, inputValue]) => {
      // Logik aus handleStrokeBlur direkt hier anwenden auf updatedStrokeSettings
      if (inputValue !== undefined && inputValue !== null) {
          let value = parseInt(inputValue, 10);
          if (!isNaN(value)) {
              value = Math.max(0, Math.min(value, 2)); // Klemmen 0-2
              if (value > 0 && value !== 1 && value !== 2) value = 2; // Korrigieren
              updatedStrokeSettings = { ...updatedStrokeSettings, [mode as StrokeMode]: value as 0 | 1 | 2 };
          }
      }
    });
    // Wende Farbe-Änderungen an
    Object.entries(tempFarbeInput).forEach(([modeId, inputValue]) => {
      // Logik aus handleFarbeBlur direkt hier anwenden auf updatedFarbeSettings
      if (inputValue !== undefined && inputValue !== null) {
          let value = parseInt(inputValue, 10);
          if (!isNaN(value)) {
              value = Math.max(0, Math.min(value, 12)); // Klemmen 0-12
              updatedFarbeSettings = {
                ...updatedFarbeSettings,
                values: { ...updatedFarbeSettings.values, [modeId as FarbeModeKey]: value }
              };
          }
      }
    });

    // Input Buffers leeren, da die Werte verarbeitet wurden
    setTempInput({});
    setTempStrokeInput({});
    setTempFarbeInput({});

    // Aktualisiere den React State mit den final berechneten Werten
    setTempScoreSettings(updatedScoreSettings);
    setTempStrokeSettings(updatedStrokeSettings);
    setTempFarbeSettings(updatedFarbeSettings);

    // Gib die final berechneten Werte zurück
    return {
        finalScoreSettings: updatedScoreSettings,
        finalStrokeSettings: updatedStrokeSettings,
        finalFarbeSettings: updatedFarbeSettings
    };
  };

  // === NEUE ZENTRALE SPEICHERFUNKTION ===
  const handleSaveAllSettings = async () => {
    if (!currentGroup || isSubmitting) return; // Verhindere doppeltes Speichern

    setIsSubmitting(true);
    setError(null);
    const groupId = typeof routeGroupId === 'string' ? routeGroupId : currentGroup.id;

    // 1. Wende alle ausstehenden Änderungen an UND erhalte die finalen Werte
    const { finalScoreSettings, finalStrokeSettings, finalFarbeSettings } = applyPendingInputChanges();

    // 2. Prüfe auf Änderungen gegenüber dem Originalzustand in currentGroup
    const baseInfoChanged = name !== (currentGroup.name || "") ||
                            description !== (currentGroup.description || "") ||
                            mainLocationZip !== ((currentGroup as any).mainLocationZip || "") || // PLZ Änderung prüfen
                            isPublic !== (currentGroup.isPublic ?? true);

    const currentScoreSettings = currentGroup.scoreSettings ?? DEFAULT_SCORE_SETTINGS;
    const currentStrokeSettings = currentGroup.strokeSettings ?? DEFAULT_STROKE_SETTINGS;
    const currentFarbeValues = currentGroup.farbeSettings?.values ?? DEFAULT_FARBE_SETTINGS.values;
    const currentCardStyle = currentGroup.farbeSettings?.cardStyle ?? DEFAULT_FARBE_SETTINGS.cardStyle;
    
    const jassSettingsChanged = JSON.stringify(finalScoreSettings) !== JSON.stringify(currentScoreSettings) ||
                                JSON.stringify(finalStrokeSettings) !== JSON.stringify(currentStrokeSettings) ||
                                JSON.stringify(finalFarbeSettings.values) !== JSON.stringify(currentFarbeValues) ||
                                finalFarbeSettings.cardStyle !== currentCardStyle;

    let success = true;
    let errorMsg = "";

    if (!baseInfoChanged && !jassSettingsChanged) {
        console.log("Keine Änderungen zum Speichern.");
        setIsSubmitting(false);
        showNotification({ message: "Keine Änderungen vorgenommen.", type: "info" });
        return;
    }

    try {
      // 3. Speichere Basis-Infos, falls geändert
      if (baseInfoChanged) {
        console.log("Speichere Basis-Infos...");
        await updateGroup(groupId, { name, description, mainLocationZip, isPublic }); // PLZ mitspeichern
      }

      // 4. Speichere Jass-Einstellungen, falls geändert
      if (jassSettingsChanged) {
        console.log("Speichere Jass-Einstellungen...");
        const jassSettingsUpdates = {
          scoreSettings: JSON.parse(JSON.stringify(finalScoreSettings)),
          strokeSettings: JSON.parse(JSON.stringify(finalStrokeSettings)),
          farbeSettingsValues: JSON.parse(JSON.stringify(finalFarbeSettings.values)),
          cardStyle: finalFarbeSettings.cardStyle,
        };
        await updateCurrentGroupJassSettings(groupId, jassSettingsUpdates);
      }

      // 5. Erfolgsmeldung
      showNotification({
        message: "Einstellungen erfolgreich gespeichert.",
        type: "success",
      });
      // Optional: Zurück zur Startseite navigieren
      // router.push("/start");

    } catch (err) {
      success = false;
      errorMsg = err instanceof Error ? err.message : "Ein unbekannter Fehler ist aufgetreten";
      setError(errorMsg);
      showNotification({
        message: `Fehler beim Speichern: ${errorMsg}`,
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // === Angepasster CTA Button Setup ===
  useEffect(() => {
    // Stelle sicher, dass currentGroup existiert bevor der Button angezeigt wird
    if (!currentGroup) {
      resetPageCta(); // Verstecke Button, wenn keine Gruppe geladen ist
      return;
    }

    // Prüfe auf Änderungen (Basis-Infos)
    const hasBasicChanges =
          (name !== (currentGroup.name || "")) ||
          (description !== (currentGroup.description || "")) ||
          (mainLocationZip !== ((currentGroup as any).mainLocationZip || "")) || // PLZ Änderung prüfen
          (isPublic !== (currentGroup.isPublic ?? true));

    // Prüfe auf Änderungen (Jass-Settings - Vergleich mit Original)
    const currentScoreSettings = currentGroup.scoreSettings ?? DEFAULT_SCORE_SETTINGS;
    const currentStrokeSettings = currentGroup.strokeSettings ?? DEFAULT_STROKE_SETTINGS;
    const currentFarbeValues = currentGroup.farbeSettings?.values ?? DEFAULT_FARBE_SETTINGS.values;
    const currentCardStyle = currentGroup.farbeSettings?.cardStyle ?? DEFAULT_FARBE_SETTINGS.cardStyle;
    
    const hasJassChanges =
       JSON.stringify(tempScoreSettings) !== JSON.stringify(currentScoreSettings) ||
       JSON.stringify(tempStrokeSettings) !== JSON.stringify(currentStrokeSettings) ||
       JSON.stringify(tempFarbeSettings.values) !== JSON.stringify(currentFarbeValues) ||
       tempFarbeSettings.cardStyle !== currentCardStyle;

    // NEU: Prüfe, ob Änderungen in den Input Buffers vorliegen
    const hasBufferedChanges = Object.keys(tempInput).length > 0 ||
                               Object.keys(tempStrokeInput).length > 0 ||
                               Object.keys(tempFarbeInput).length > 0;

    // Kombinierte Prüfung: Basis ODER Jass ODER Buffer geändert
    const hasAnyChanges = hasBasicChanges || hasJassChanges || hasBufferedChanges;

    setPageCta({
      isVisible: true,
      text: "Speichern",
      onClick: handleSaveAllSettings,
      loading: isSubmitting,
      // Button deaktivieren nur, wenn gespeichert wird ODER absolut keine Änderungen (auch nicht im Buffer)
      disabled: isSubmitting || !hasAnyChanges,
      variant: "info",
    });

    return () => {
      resetPageCta();
    };
  }, [
      setPageCta, resetPageCta, isSubmitting, name, description, mainLocationZip, isPublic, currentGroup, // PLZ als Abhängigkeit
      tempScoreSettings, tempStrokeSettings, tempFarbeSettings,
      tempInput, tempStrokeInput, tempFarbeInput
  ]);

  // Funktion zum Aufruf der invalidateActiveGroupInvites Function
  const handleInvalidateInvites = async () => {
    if (!currentGroup) return;
    setIsInvalidating(true);
    try {
      const functions = getFunctions(undefined, 'europe-west1');
      const invalidateFn = httpsCallable(functions, "invalidateActiveGroupInvites");
      const result = await invalidateFn({groupId: currentGroup.id});
      const data = result.data as { success: boolean; invalidatedCount?: number; message?: string };
      if (data.success) {
        const count = data.invalidatedCount ?? 0;
        showNotification({ message: count > 0 ? `${count} Einladungslink(s) erfolgreich zurückgesetzt.` : "Keine aktiven Links gefunden.", type: "success" });
      } else {
        throw new Error(data.message || "Fehler beim Zurücksetzen der Links vom Server.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler beim Zurücksetzen der Links.";
      showNotification({ message: message, type: "error" });
    } finally {
      setIsInvalidating(false);
    }
  };

  // Funktion zum Reparieren inkonsistenter Daten
  const handleRepairData = async () => {
    if (!currentGroup) return;
    try {
      setRepairingData(true);
      showNotification({ message: "Datenkonsistenz wird überprüft...", type: "info" });
      const repairedPlayers = await ensurePlayersExist(currentGroup.playerIds, currentGroup.id);
      setMembers(repairedPlayers);
      setHasInconsistentData(false);
      showNotification({ message: `Datenreparatur erfolgreich. ${repairedPlayers.length} Spieler-Datensätze überprüft.`, type: "success" });
    } catch (error) {
      showNotification({ message: "Fehler bei der Datenreparatur.", type: "error" });
    } finally {
      setRepairingData(false);
    }
  };

  // Handle role change
  const handleRoleChange = async (targetPlayerId: string, newRole: 'admin' | 'member') => {
    setRoleChangeLoading(prev => ({ ...prev, [targetPlayerId]: true }));
    try {
      await updateMemberRole(targetPlayerId, newRole);
      showNotification({ message: `Rolle erfolgreich auf ${newRole === 'admin' ? 'Admin' : 'Mitglied'} geändert.`, type: "success" });
    } catch (err) {
      showNotification({ message: err instanceof Error ? err.message : "Rollenänderung fehlgeschlagen.", type: "error" });
    } finally {
      setRoleChangeLoading(prev => ({ ...prev, [targetPlayerId]: false }));
    }
  };

  // === Handler für direktes Einladen/Teilen ===
  const handleDirectInviteShare = async () => {
    if (!currentGroup || !user) return;
    setError(null);
    setDirectInviteError(null);
    setIsGeneratingDirectInvite(true);
    const functions = getFunctions(undefined, "europe-west1");
    const generateInviteToken = httpsCallable(functions, 'generateGroupInviteToken');

    try {
      const result = await generateInviteToken({ groupId: currentGroup.id });
      const token = (result.data as { token: string }).token;
      if (!token) throw new Error("Kein Token vom Server erhalten.");
      const inviteLink = `${APP_BASE_URL}/join?token=${token}`;
      const inviterName = user.displayName || user.email || 'Jemand';
      const titleText = "**Du wurdest zu Jassguru eingeladen**";
      const bodyText = `${inviterName} lädt dich ein, der Jassgruppe "${currentGroup.name}" beizutreten.`;
      const linkText = `👉 Hier beitreten: ${inviteLink}`;
      const shareText = `${titleText}

${bodyText}

${linkText}`;
      let imageFile: File | null = null;
      const imageUrlToLoad = '/welcome-guru.png';

      try {
        const response = await fetch(imageUrlToLoad);
        if (!response.ok) throw new Error(`Standardbild konnte nicht geladen werden: ${response.statusText}`);
        const blob = await response.blob();
        imageFile = new File([blob], 'welcome-guru.png', { type: blob.type || 'image/png' });
      } catch (fetchError) {
 console.error("Fehler beim Laden des Standardbildes:", fetchError);
}

      if (navigator.share) {
        const shareData: ShareData = { title: `Du wurdest zu Jassguru eingeladen`, text: shareText, url: inviteLink };
        if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
          shareData.files = [imageFile];
        }
        await navigator.share(shareData);
        showNotification({ message: "Einladungslink geteilt!", type: "success" });
      } else {
        navigator.clipboard.writeText(inviteLink);
        showNotification({ message: "Einladungslink in die Zwischenablage kopiert!", type: "info" });
      }
    } catch (error: any) {
      let errorMessage = "Ein interner Fehler ist aufgetreten.";
      if (error?.code && typeof error.code === 'string') errorMessage = `Fehler (${error.code}): ${error.message || 'Keine weitere Information.'}`;
      else if (error instanceof Error) errorMessage = `Fehler: ${error.message}`;
      else if (typeof error === 'string') errorMessage = error;
      setDirectInviteError(errorMessage);
      showNotification({ message: errorMessage, type: "error" });
    } finally {
      setIsGeneratingDirectInvite(false);
    }
  };

  // === HANDLER für Score Inputs ===
  const handleScoreInputChange = (mode: ScoreMode, inputValue: string) => {
      // Nur den Input Buffer aktualisieren
      const cleanInputValue = inputValue.replace(/[^0-9]/g, '');
      setTempInput(prev => ({ ...prev, [mode]: cleanInputValue }));

      // --- NEU: Abhängige Buffer für sofortiges Feedback aktualisieren ---
      // Nur wenn der Input gültig ist (nicht leer, keine Buchstaben etc.)
      if (cleanInputValue !== '') {
          const numericValue = parseInt(cleanInputValue, 10);
          if (!isNaN(numericValue)) {
              // Lese aktuellen State für aktivierte Modi
              const currentEnabled = tempScoreSettings.enabled;
              // Lese aktuellen State für Sieg-Wert (als Basis für Berg/Schneider)
              let currentSiegValue = tempScoreSettings.values.sieg;

      if (mode === 'sieg') {
                  // Wenn Sieg geändert wird, nimm den *neuen* Sieg-Wert als Basis
                  currentSiegValue = Math.max(SCORE_RANGES.sieg.min, Math.min(numericValue, SCORE_RANGES.sieg.max));
                  const halfValue = Math.floor(currentSiegValue / 2);

                  // Aktualisiere Berg-Buffer, wenn Berg aktiviert
                  if (currentEnabled.berg) {
                      const newBergValue = Math.min(halfValue, SCORE_RANGES.berg.max);
                      setTempInput(prev => ({ ...prev, berg: newBergValue.toString() }));
                  }
                  // Aktualisiere Schneider-Buffer, wenn Schneider aktiviert
                  if (currentEnabled.schneider) {
                      const newSchneiderValue = Math.min(halfValue, SCORE_RANGES.schneider.max);
                      setTempInput(prev => ({ ...prev, schneider: newSchneiderValue.toString() }));
        }
      } else if (mode === 'berg') {
                   // Wenn Berg geändert wird
                   const validatedBergValue = Math.max(0, Math.min(numericValue, Math.floor(currentSiegValue / 2), SCORE_RANGES.berg.max));
                   // Aktualisiere Schneider-Buffer, wenn Schneider aktiviert
                   if (currentEnabled.schneider) {
                       const newSchneiderValue = Math.min(validatedBergValue, SCORE_RANGES.schneider.max);
                       setTempInput(prev => ({ ...prev, schneider: newSchneiderValue.toString() }));
                   }
              } // Schneider hat keine Abhängigkeiten nach außen
          }
      } else { // Wenn Input leer ist
           if (mode === 'sieg') {
              // Leere auch abhängige Buffer, wenn Sieg geleert wird
              setTempInput(prev => ({ ...prev, berg: undefined, schneider: undefined }));
           } else if (mode === 'berg') {
              // Leere Schneider Buffer, wenn Berg geleert wird
              setTempInput(prev => ({ ...prev, schneider: undefined }));
           }
      }
  };

  const handleScoreToggle = (mode: ScoreMode) => {
      // Logik zum Umschalten und Anpassen von Berg/Schneider bleibt hier, da es eine direkte State-Änderung ist
      setTempScoreSettings(prev => {
          const newEnabled = { ...prev.enabled, [mode]: !prev.enabled[mode] };
          const newValues = { ...prev.values };

          if (mode === 'berg' && !newEnabled.berg && newEnabled.schneider) {
              const maxSchneiderValue = Math.min(Math.floor(newValues.sieg / 2), SCORE_RANGES.schneider.max);
              newValues.schneider = Math.min(newValues.schneider, maxSchneiderValue);
          }
          if (mode === 'berg' && newEnabled.berg && newEnabled.schneider) {
              newValues.schneider = Math.min(newValues.schneider, newValues.berg, SCORE_RANGES.schneider.max);
          }
          
          return { ...prev, values: newValues, enabled: newEnabled };
      });
  };

  // === HANDLER für Stroke Inputs ===
   const handleStrokeInputChange = (mode: StrokeMode, inputValue: string) => {
       // Nur den Input Buffer aktualisieren
       setTempStrokeInput(prev => ({ ...prev, [mode]: inputValue.replace(/[^0-9]/g, '') }));
   };

  // === HANDLER für Farbe Inputs ===
   const handleFarbeInputChange = (modeId: FarbeModeKey, inputValue: string) => {
       // Nur den Input Buffer aktualisieren
       setTempFarbeInput(prev => ({ ...prev, [modeId]: inputValue.replace(/[^0-9]/g, '') }));
   };

  // === HANDLER für Card Style (hierher verschoben) ===
  const handleCardStyleChange = (style: CardStyle) => {
    setTempFarbeSettings(prev => ({ ...prev, cardStyle: style }));
  };

  // === RENDER-FUNKTIONEN (Score, Stroke, Farbe) - mit korrigierten Handlern ===
  const renderScoreSettings = () => {
    return (
      <Card className="bg-gray-800 border-gray-700 shadow-inner mt-4">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg text-gray-200">Punkte-Ziele & Modi</CardTitle>
          <CardDescription className="text-gray-400 text-sm">...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0 pb-4">
          {/* Sieg */}
          <div className="flex items-center justify-between space-x-2 p-2 rounded-md hover:bg-gray-700/50">
            <Label htmlFor="score-sieg" className="font-medium text-gray-200">Sieg-Punkte</Label>
            <Input id="score-sieg" type="number" inputMode="numeric" pattern="[0-9]*"
              min={SCORE_RANGES.sieg.min} max={SCORE_RANGES.sieg.max}
              className="w-24 bg-gray-700 border-gray-600 text-white text-right"
              value={tempInput.sieg ?? tempScoreSettings.values.sieg}
              onChange={(e) => handleScoreInputChange('sieg', e.target.value)}
              onFocus={(e) => {
 e.target.select(); setTimeout(() => e.target.select(), 0);
}}
            />
          </div>
          {/* Berg */}
          <div className="bg-gray-700/50 rounded-lg overflow-hidden border border-gray-600/50">
            <div className="flex items-center justify-between p-3 border-b border-gray-600/50">
              <Label htmlFor="toggle-berg" className="font-medium text-gray-200">Berg aktiviert</Label>
              <Switch id="toggle-berg" checked={tempScoreSettings.enabled.berg} onCheckedChange={() => handleScoreToggle('berg')}
                className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-600"
              />
            </div>
            {tempScoreSettings.enabled.berg && (
              <div className="flex items-center justify-between p-3">
                <Label htmlFor="score-berg" className="font-medium text-gray-200">Berg-Punkte</Label>
                <Input id="score-berg" type="number" inputMode="numeric" pattern="[0-9]*" min="0"
                  max={Math.floor(tempScoreSettings.values.sieg / 2)}
                  className="w-24 bg-gray-700 border-gray-600 text-white text-right"
                  value={tempInput.berg ?? tempScoreSettings.values.berg}
                  onChange={(e) => handleScoreInputChange('berg', e.target.value)}
                   onFocus={(e) => {
 e.target.select(); setTimeout(() => e.target.select(), 0);
}}
                />
              </div>
            )}
          </div>
          {/* Schneider */}
          <div className="bg-gray-700/50 rounded-lg overflow-hidden border border-gray-600/50">
            <div className="flex items-center justify-between p-3 border-b border-gray-600/50">
              <Label htmlFor="toggle-schneider" className="font-medium text-gray-200">Schneider aktiviert</Label>
              <Switch id="toggle-schneider" checked={tempScoreSettings.enabled.schneider} onCheckedChange={() => handleScoreToggle('schneider')}
                className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-600"
              />
            </div>
            {tempScoreSettings.enabled.schneider && (
              <div className="flex items-center justify-between p-3">
                <Label htmlFor="score-schneider" className="font-medium text-gray-200">Schneider-Punkte</Label>
                <Input id="score-schneider" type="number" inputMode="numeric" pattern="[0-9]*" min="0"
                  max={tempScoreSettings.enabled.berg ? tempScoreSettings.values.berg : Math.floor(tempScoreSettings.values.sieg / 2)}
                  className="w-24 bg-gray-700 border-gray-600 text-white text-right"
                  value={tempInput.schneider ?? tempScoreSettings.values.schneider}
                  onChange={(e) => handleScoreInputChange('schneider', e.target.value)}
                  onFocus={(e) => {
 e.target.select(); setTimeout(() => e.target.select(), 0);
}}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderStrokeSettings = () => {
    return (
        <Card className="bg-gray-800 border-gray-700 shadow-inner mt-4">
            <CardHeader className="pb-4">
                <CardTitle className="text-lg text-gray-200">Striche Zuweisung</CardTitle>
                <CardDescription className="text-gray-400 text-sm">...</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 pb-4">
                {STROKE_MODES.map((mode) => (
                    <div key={mode} className="flex items-center justify-between space-x-4 p-2 rounded-md hover:bg-gray-700/50">
                        <Label htmlFor={`stroke-${mode}`} className="font-medium capitalize flex-1 text-gray-200">
                            {mode.replace(/([A-Z])/g, ' $1').trim()} Striche
                        </Label>
                        <Input id={`stroke-${mode}`} type="number" min="0" max="2"
                            className="w-20 bg-gray-700 border-gray-600 text-white text-right"
                            value={tempStrokeInput[mode as StrokeMode] ?? tempStrokeSettings[mode as StrokeMode] ?? ''}
                            onChange={(e) => handleStrokeInputChange(mode as StrokeMode, e.target.value)}
                            onFocus={(e) => {
 e.target.select(); setTimeout(() => e.target.select(), 0);
}}
                        />
                    </div>
                ))}
            </CardContent>
        </Card>
    );
  };

  const renderFarbeSettings = () => {
    return (
      <Card className="bg-gray-800 border-gray-700 shadow-inner mt-4">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg text-gray-200">Farben & Kartensatz</CardTitle>
          <CardDescription className="text-gray-400 text-sm">...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0 pb-4">
          {/* Kartensatz Auswahl */}
          <div className="flex items-center justify-between space-x-2 p-3 rounded-lg bg-gray-700/50 border border-gray-600/50">
            <Label className="font-medium text-gray-200">Kartensatz</Label>
            <div className="flex gap-2">
              <Button type="button" variant={tempFarbeSettings.cardStyle === 'DE' ? 'default' : 'outline'} size="sm"
                onClick={() => handleCardStyleChange('DE')}
                className={`min-w-[50px] text-center font-semibold ${tempFarbeSettings.cardStyle === 'DE' ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600 hover:text-gray-300'}`}
              >DE</Button>
              <Button type="button" variant={tempFarbeSettings.cardStyle === 'FR' ? 'default' : 'outline'} size="sm"
                onClick={() => handleCardStyleChange('FR')}
                className={`min-w-[50px] text-center font-semibold ${tempFarbeSettings.cardStyle === 'FR' ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600 hover:text-gray-300'}`}
              >FR</Button>
            </div>
          </div>
          {/* Multiplikatoren */}
          <div className="border-t border-gray-700/50 pt-4 space-y-3">
            <h4 className="text-base font-medium text-gray-300 mb-2">Multiplikatoren</h4>
            {FARBE_MODES.map((mode) => {
                const multiplier = tempFarbeSettings.values[mode.id as FarbeModeKey] ?? 1;
                const isInactive = multiplier === 0;
                // KORREKTUR: Logik aus den Turnier-Einstellungen übernehmen für Konsistenz
                const mappedColorKey = toTitleCase(mode.id);
                const displayName = CARD_SYMBOL_MAPPINGS[mappedColorKey as JassColor]?.[tempFarbeSettings.cardStyle] ?? mappedColorKey;

                return (
                    <div key={mode.id}
                        className={`flex items-center justify-between space-x-4 p-2 rounded-md transition-opacity duration-200 ${isInactive ? 'opacity-60 hover:bg-gray-700/30' : 'hover:bg-gray-700/50'}`}>
                         <div className="flex items-center space-x-2 flex-1">
                            <FarbePictogram farbe={mode.name as JassColor} mode="svg" cardStyle={tempFarbeSettings.cardStyle} className="w-5 h-5 flex-shrink-0" />
                            <Label htmlFor={`farbe-${mode.id}`} className="font-medium text-gray-200">{displayName}</Label>
                        </div>
                        <Input id={`farbe-${mode.id}`} type="number" min="0" max="12"
                            className={`w-20 bg-gray-700 border-gray-600 text-white text-right ${isInactive ? 'text-gray-400' : ''}`}
                            value={tempFarbeInput[mode.id as FarbeModeKey] ?? multiplier ?? ''}
                            onChange={(e) => handleFarbeInputChange(mode.id as FarbeModeKey, e.target.value)}
                            onFocus={(e) => {
 e.target.select(); setTimeout(() => e.target.select(), 0);
}}
                        />
                    </div>
                );
            })}             
          </div>
        </CardContent>
      </Card>
    );
  };

  // Zeige Ladescreen während Auth-Status geprüft wird oder Gruppe noch nicht geladen
  if (status === "loading" || (routeGroupId && !currentGroup)) {
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
        {/* Back Button */}
        <Link href="/start" passHref legacyBehavior>
          <Button variant="ghost" className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3" aria-label="Zurück zur Startseite">
            <ArrowLeft size={28} />
          </Button>
        </Link>

        <div className="w-full max-w-md space-y-6 py-16">
          <h1 className="text-center text-2xl font-bold text-white">Gruppeneinstellungen</h1>

          {error && (
            <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-6" id="group-settings-container">
            {/* Gruppengrundinformationen */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Settings className="w-5 h-5" />Grundinformationen</CardTitle>
                <CardDescription className="text-gray-400">Basis-Einstellungen für deine Gruppe</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-gray-200">Name</label>
                  <Input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white" placeholder="Gruppenname" required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium text-gray-200">Beschreibung</label>
                  <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white min-h-[100px]" placeholder="Gruppenbeschreibung (optional)" maxLength={150}
                  />
                  <p className="text-xs text-gray-400">Maximal 150 Zeichen.</p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="mainLocationZip" className="text-sm font-medium text-gray-200">Hauptspielort (PLZ)</label>
                  <Input id="mainLocationZip" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={mainLocationZip} onChange={(e) => setMainLocationZip(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                    className="bg-gray-700 border-gray-600 text-white" placeholder="z.B. 8000"
                  />
                  <p className="text-xs text-gray-400">Schweizer Postleitzahl (4-stellig).</p>
                </div>
                {/* NEUER "Öffentlicher Link"-Block */}
                <div className="space-y-2">
                  <label htmlFor="public-link-info" className="text-sm font-medium text-gray-200">Öffentlicher Link</label>
                  <p id="public-link-info" className="text-sm text-gray-400">
                    Die Gruppe kann unter diesem Link eingesehen werden:
                  </p>
                  {currentGroup?.id && (
                    <Link href={`https://jassguru.ch/view/group/${currentGroup.id}`} target="_blank" className="block text-sm text-blue-400 hover:text-blue-300 underline break-all">
                      {`https://jassguru.ch/view/group/${currentGroup.id}`}
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* === Jass-Einstellungen Card === */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Palette className="w-5 h-5" />Jass-Einstellungen</CardTitle>
                <CardDescription className="text-gray-400">Lege fest, welche Varianten und Multiplikatoren gelten.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="farben" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-gray-700/50 p-1 rounded-lg mb-4">
                    <TabsTrigger value="farben" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300 hover:bg-gray-600/50 rounded-md py-1.5 text-sm">Farben</TabsTrigger>
                    <TabsTrigger value="punkte" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300 hover:bg-gray-600/50 rounded-md py-1.5 text-sm">Punkte</TabsTrigger>
                    <TabsTrigger value="striche" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300 hover:bg-gray-600/50 rounded-md py-1.5 text-sm">Striche</TabsTrigger>
                  </TabsList>
                  <TabsContent value="punkte">{renderScoreSettings()}</TabsContent>
                  <TabsContent value="striche">{renderStrokeSettings()}</TabsContent>
                  <TabsContent value="farben">{renderFarbeSettings()}</TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* === Aktionen Karte === */}
            {isCurrentUserAdmin && (
               <Card className="bg-gray-800 border-gray-700">
                 <CardHeader className="pb-2">
                   <CardTitle className="text-white flex items-center gap-2"><UserPlus className="w-5 h-5" />Freunde einladen</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <p className="text-sm text-gray-400 mt-1 mb-4">Lade deine Jassfreunde zur Gruppe ein.</p>
                   <Button onClick={handleDirectInviteShare} disabled={isGeneratingDirectInvite || !currentGroup}
                         className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                       >
                     {isGeneratingDirectInvite ? (<><Loader2 className="h-4 w-4 animate-spin" />Wird generiert...</>) : ("Zur Gruppe einladen")}
                       </Button>
                   {directInviteError && (<p className="text-xs text-red-400 mt-2 text-center">{directInviteError}</p>)}
                 </CardContent>
               </Card>
            )}

            {/* Mitglieder */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Users className="w-5 h-5" />Mitglieder</CardTitle>
                <CardDescription className="text-gray-400">Aktuelle Mitglieder und Admins verwalten</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Dateninkonsistenz-Warnung */}
                {hasInconsistentData && (
                  <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded-md flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-yellow-300 font-medium">Dateninkonsistenz erkannt</p>
                      <p className="text-xs text-gray-300 mt-1">Einige Mitglieder haben unvollständige Daten...</p>
                      <Button variant="outline" size="sm" className="mt-2 text-yellow-300 border-yellow-600 hover:bg-yellow-900/50"
                        onClick={handleRepairData} disabled={repairingData}>
                        {repairingData ? (<><Loader2 className="mr-2 h-3 w-3 animate-spin" />Wird repariert...</>) : (<><Wrench className="mr-2 h-3 w-3" />Daten reparieren</>)}
                      </Button>
                    </div>
                  </div>
                )}
                {/* Mitgliederliste */}
                {membersLoading ? (
                  <div className="flex justify-center items-center p-4"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /><span className="ml-2 text-gray-400">Lade Mitglieder...</span></div>
                ) : members.length === 0 ? (
                   <p className="text-center text-gray-400">Noch keine Mitglieder.</p>
                ) : (
                  <CardContent className="p-4 pt-0">
                    <ul className="space-y-3">
                      {members.map((member) => {
                        const isMemberAdmin = !!member.userId && (currentGroup?.adminIds.includes(member.userId) ?? false);
                        const isSelf = !!user?.playerId && member.id === user.playerId;
                        const isLoading = roleChangeLoading[member.id] ?? false;
                         const isLastAdmin = isMemberAdmin && currentGroup?.adminIds.length === 1;
                        const isCreator = member.userId === currentGroup?.createdBy;
                        const canChangeRole = isCurrentUserAdmin && !isSelf;

                        return (
                          <li key={member.id} className="flex items-center justify-between space-x-3 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                               <ProfileImage 
                                 src={member.photoURL || undefined} 
                                 alt={member.displayName || 'Avatar'} 
                                 size="sm"
                                 className="flex-shrink-0"
                                 fallbackClassName={`text-gray-300 ${(member as PlayerWithPlaceholder)._isPlaceholder ? 'bg-yellow-800' : 'bg-gray-600'}`}
                                 fallbackText={member.displayName?.charAt(0).toUpperCase() || "?"}
                               />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">
                                  {member.displayName || "Unbekannt"}
                                  {(member as PlayerWithPlaceholder)._isPlaceholder && (<span className="ml-2 text-xs text-yellow-400">(unvollständig)</span>)}
                                  {isSelf && <span className="ml-1 text-xs text-blue-400">(Du)</span>}
                                </p>
                                <p className="text-xs text-gray-400 truncate">
                                  {(member as PlayerWithPlaceholder)._isPlaceholder ? <span className="text-yellow-500">ID: {member.id.slice(0, 6)}...</span> : (member.userId ? 'Registriert' : 'Gast')}
                                  </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Admin/Creator Badge */}
                              {isMemberAdmin && (
                                <Badge variant="outline" className="border-green-600 text-green-400 bg-green-900/30 px-2 py-0.5">
                                  <Crown className="w-3 h-3 mr-1" /> {isCreator ? "Gründer" : "Admin"}
                                </Badge>
                              )}
                              {/* Action Buttons */}
                              {canChangeRole && !isCreator && (
                                <>
                                  {!isMemberAdmin ? (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="sm" className={`h-auto text-xs font-medium flex items-center justify-center px-2 py-1 rounded-lg ${isLoading ? 'text-gray-500 border-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'}`} disabled={isLoading} title={"Zum Admin ernennen"}>
                                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Admin'}
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                                        <AlertDialogHeader><AlertDialogTitle>Zum Admin ernennen?</AlertDialogTitle><AlertDialogDescription className="text-gray-400">...</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel className="..." disabled={isLoading}>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={() => handleRoleChange(member.id, 'admin')} className="..." disabled={isLoading}>Ja, ernennen</AlertDialogAction></AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  ) : (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="sm" className={`h-auto text-xs font-medium flex items-center justify-center rounded-md w-6 h-6 p-0 ${isLoading || isLastAdmin ? 'text-gray-500 border-gray-600 cursor-not-allowed' : 'bg-red-800/50 text-white hover:bg-red-700/60'}`} disabled={isLoading || isLastAdmin} title={isLastAdmin ? "Letzter Admin kann nicht entfernt werden" : "Admin-Status entfernen"}>
                                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="w-4 h-4" />}
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                                        <AlertDialogHeader><AlertDialogTitle>Admin-Status entfernen?</AlertDialogTitle><AlertDialogDescription className="text-gray-400">...</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel className="..." disabled={isLoading}>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={() => handleRoleChange(member.id, 'member')} className="..." disabled={isLoading}>Ja, entfernen</AlertDialogAction></AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                )}
              </CardContent>
            </Card>

            {/* Sichtbarkeit */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Globe className="w-5 h-5" />Sichtbarkeit</CardTitle>
                <CardDescription className="text-gray-400">Wer kann die Gruppe sehen und beitreten?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label htmlFor="public-toggle" className="text-sm font-medium text-gray-200">Öffentliche Gruppe</label>
                    <p className="text-sm text-gray-400">Die Gruppe ist für alle sichtbar und beitretbar.</p>
                  </div>
                  <Switch 
                    id="public-toggle"
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                    disabled={isSubmitting}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Gefahrenzone */}
            {isCurrentUserAdmin && (
              <Card className="bg-red-900/20 border-red-900/50">
                <CardHeader><CardTitle className="text-red-300">Gefahrenzone</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-col space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-200">Einladungslinks zurücksetzen</h4>
                      <p className="text-sm text-gray-400 mt-1 mb-3">Macht alle aktuell gültigen Einladungslinks ungültig.</p>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" disabled={isInvalidating} className="bg-red-700 hover:bg-red-800 border-red-900 text-white">
                            {isInvalidating ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Wird zurückgesetzt...</>) : ("Alle Links zurücksetzen")}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                          <AlertDialogHeader><AlertDialogTitle>Wirklich alle Links zurücksetzen?</AlertDialogTitle><AlertDialogDescription className="text-gray-400">...</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel className="..." disabled={isInvalidating}>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={handleInvalidateInvites} className="..." disabled={isInvalidating}>Ja, zurücksetzen</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default GroupSettingsPage;
