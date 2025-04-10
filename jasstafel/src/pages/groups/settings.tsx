"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import Link from "next/link";
import {ArrowLeft, Users, Globe, Settings, Crown, Loader2, ShieldCheck, AlertTriangle, Wrench, X, Palette, Share2, UserPlus} from "lucide-react";
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
import {FirestorePlayer} from "@/types/jass";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {Badge} from "@/components/ui/badge";
import {db} from "@/services/firebaseInit";
import {doc, getDoc, updateDoc, arrayRemove, arrayUnion, Timestamp} from "firebase/firestore";
import { FarbePictogram } from '@/components/settings/FarbePictogram';
import { toTitleCase } from "@/utils/stringUtils";

// --- NEUE IMPORTE für Jass-Einstellungen --- 
// Entferne den falschen Import
// import { DEFAULT_SCORE_SETTINGS, DEFAULT_STROKE_SETTINGS, DEFAULT_FARBE_SETTINGS } from '@/constants/jassSettings';

// Füge korrekte Imports hinzu (basierend auf der vermuteten Struktur)
import { DEFAULT_FARBE_SETTINGS, FARBE_MODES } from '@/config/FarbeSettings';
import { DEFAULT_SCORE_SETTINGS, SCORE_MODES } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings'; // Nur Default importieren

import type { ScoreSettings, StrokeSettings, FarbeSettings, ScoreMode, StrokeMode, FarbeModeKey, JassColor, CardStyle } from '@/types/jass';
// Importiere STROKE_MODES jetzt aus types
import { STROKE_MODES } from '@/types/jass'; 

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

// Typ für FirestorePlayer mit _isPlaceholder Eigenschaft
type PlayerWithPlaceholder = FirestorePlayer & { _isPlaceholder?: boolean };

// --- Hinzufügen von SCORE_RANGES Konstante, falls noch nicht global vorhanden ---
const SCORE_RANGES = {
  sieg: { min: 1000, max: 10000, default: 2000 }, // Beispielwerte, anpassen falls nötig
  berg: { min: 0, max: 5000, default: 1000 },
  schneider: { min: 0, max: 5000, default: 1000 },
} as const;

// --- App Base URL KORRIGIERT --- 
const APP_BASE_URL = "https://jassguru.ch"; // Direkt setzen, um Umgebungsvariablen zu überschreiben

const GroupSettingsPage = () => {
  const {user, status, isAuthenticated} = useAuthStore();
  const {currentGroup, updateGroup, updateMemberRole, updateCurrentGroupScoreSettings, updateCurrentGroupStrokeSettings, updateCurrentGroupFarbeSettings, updateCurrentGroupJassSettings} = useGroupStore();
  
  // Selektiere jede Funktion einzeln
  const showNotification = useUIStore((state) => state.showNotification);
  const setPageCta = useUIStore((state) => state.setPageCta);
  const resetPageCta = useUIStore((state) => state.resetPageCta);

  const router = useRouter();
  const { groupId: routeGroupId } = router.query; // Umbenannt, um Konflikt zu vermeiden

  // Form state
  const [name, setName] = useState(currentGroup?.name || "");
  const [description, setDescription] = useState(currentGroup?.description || "");
  const [isPublic, setIsPublic] = useState(currentGroup?.isPublic ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInvalidating, setIsInvalidating] = useState(false);

  // Member list state
  const [members, setMembers] = useState<FirestorePlayer[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [roleChangeLoading, setRoleChangeLoading] = useState<Record<string, boolean>>({});
  const [repairingData, setRepairingData] = useState(false);
  const [hasInconsistentData, setHasInconsistentData] = useState(false);

  // === NEUER STATE für Jass-Einstellungen (Sichere Initialisierung) ===
  const initialScoreSettings = currentGroup?.scoreSettings ?? DEFAULT_SCORE_SETTINGS;
  const initialStrokeSettings = currentGroup?.strokeSettings ?? DEFAULT_STROKE_SETTINGS;
  const initialFarbeSettings = currentGroup?.farbeSettings ?? DEFAULT_FARBE_SETTINGS;

  const [tempScoreSettings, setTempScoreSettings] = useState<ScoreSettings>(initialScoreSettings);
  const [tempStrokeSettings, setTempStrokeSettings] = useState<StrokeSettings>(initialStrokeSettings);
  const [tempFarbeSettings, setTempFarbeSettings] = useState<FarbeSettings>(initialFarbeSettings);
  const [isJassSettingsSaving, setIsJassSettingsSaving] = useState(false);
  const [hasJassSettingsChanges, setHasJassSettingsChanges] = useState(false);
  // --- Hinzufügen des tempInput State --- 
  const [tempInput, setTempInput] = useState<{[key in ScoreMode]?: string}>({});
  // === ENDE NEUER STATE ===

  // === NEUER STATE für Stroke und Farbe Inputs ===
  const [tempStrokeInput, setTempStrokeInput] = useState<{[key in StrokeMode]?: string}>({});
  const [tempFarbeInput, setTempFarbeInput] = useState<{[key in FarbeModeKey]?: string}>({});
  // === ENDE NEUER STATE ===

  // === NEUER STATE für direktes Einladen ===
  const [isGeneratingDirectInvite, setIsGeneratingDirectInvite] = useState(false);
  const [directInviteError, setDirectInviteError] = useState<string | null>(null);
  // === ENDE NEUER STATE ===

  // Check if current user is admin (using userId/uid, not playerId)
  const isCurrentUserAdmin = !!user?.uid && !!currentGroup?.adminIds.includes(user.uid);

  // Redirect wenn nicht eingeloggt oder keine aktive Gruppe oder kein Admin
  useEffect(() => {
    if (status === "authenticated" || status === "unauthenticated") {
      if (!isAuthenticated()) {
        router.push("/");
      } else if (!currentGroup) {
        router.push("/start");
      } else if (!isCurrentUserAdmin) {
        showNotification({ message: "Nur Admins können die Gruppeneinstellungen bearbeiten.", type: "error" });
        router.push("/start");
      }
    }
  }, [status, isAuthenticated, router, currentGroup, isCurrentUserAdmin, showNotification]);

  // Fetch member details
  useEffect(() => {
    const fetchMembers = async () => {
      if (!currentGroup || !currentGroup.playerIds || currentGroup.playerIds.length === 0) {
        setMembers([]);
        setMembersLoading(false);
        return;
      }
      setMembersLoading(true);
      
      // Variable zum Tracking, ob Daten korrigiert wurden
      let dataWasHealed = false;
      
      try {
        console.log(`[DEBUG] Lade Mitglieder für Gruppe ${currentGroup.id}. playerIds:`, currentGroup.playerIds);
        
        // Füge eine Validierung hinzu, um sicherzustellen, dass wir nur mit gültigen IDs arbeiten
        const validPlayerIds = currentGroup.playerIds.filter((id: string | unknown): id is string => 
          typeof id === 'string' && id.trim() !== ''
        );
        console.log(`[DEBUG] Nach Validierung: Verarbeite ${validPlayerIds.length} gültige Player-IDs`);
        
        // Erweiterte Logik: Prüfe und korrigiere playerIds, die eigentlich userIds sind
        const memberPromises = validPlayerIds.map(async (idToCheck: string) => {
          console.log(`[DEBUG] Lade Spieler ${idToCheck}`);
          try {
            // Erst versuchen, als playerId zu laden (Standardweg)
            const playerDoc = await getPlayerDocument(idToCheck);
            if (playerDoc) {
              console.log(`[DEBUG] Spieler ${idToCheck} gefunden:`, playerDoc.nickname);
              return playerDoc;
            } 
            
            console.warn(`[DEBUG] Kein Spielerdokument für ID ${idToCheck} gefunden! Prüfe ob es eine userId ist...`);
            
            // Wenn nicht gefunden, prüfe ob es eine userId ist
            const userRef = doc(db, "users", idToCheck);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists() && userSnap.data()?.playerId) {
              // Es ist eine userId! Korrigiere auf die playerId
              const correctPlayerId = userSnap.data()?.playerId;
              console.log(`[DEBUG] ID-Korrektur! ${idToCheck} ist eine userId. Korrekte playerId ist: ${correctPlayerId}`);
              
              // Versuche, mit korrekter ID den Player zu laden
              const correctedPlayerDoc = await getPlayerDocument(correctPlayerId);
              
              if (correctedPlayerDoc) {
                console.log(`[DEBUG] Spieler mit korrekter ID ${correctPlayerId} erfolgreich geladen: ${correctedPlayerDoc.nickname}`);
                
                // Selbstheilung der Gruppen-Daten
                try {
                  const groupRef = doc(db, "groups", currentGroup.id);
                  await updateDoc(groupRef, {
                    playerIds: arrayRemove(idToCheck)
                  });
                  await updateDoc(groupRef, {
                    playerIds: arrayUnion(correctPlayerId)
                  });
                  dataWasHealed = true;
                  console.log(`[DEBUG] ✅ Gruppen-Daten automatisch geheilt: ${idToCheck} -> ${correctPlayerId}`);
                } catch (updateError) {
                  console.error(`[DEBUG] ❌ Fehler bei Datenkorrektur für Gruppe ${currentGroup.id}:`, updateError);
                }
                
                return correctedPlayerDoc;
              }
            }
            
            // Wenn alles fehlschlägt, erstelle einen Platzhalter
            console.warn(`[DEBUG] Konnte keine Zuordnung für ID ${idToCheck} finden. Erstelle Platzhalter.`);
            return {
              id: idToCheck,
              nickname: `Unbekannter Spieler ${idToCheck.slice(0, 4)}...`,
              userId: null, // Da wir keine Zuordnung haben
              isGuest: false,
              createdAt: new Date() as unknown as Timestamp,
              updatedAt: new Date() as unknown as Timestamp,
              groupIds: [currentGroup.id],
              stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
              _isPlaceholder: true // Markierung für UI-Behandlung
            } as FirestorePlayer;
          } catch (error) {
            console.error(`[DEBUG] Fehler beim Laden/Korrigieren von ID ${idToCheck}:`, error);
            return null;
          }
        });
        
        const memberResults = await Promise.all(memberPromises);
        const validMembers = memberResults.filter((member: FirestorePlayer | null): member is FirestorePlayer => member !== null);
        
        console.log(`[DEBUG] ${validMembers.length}/${currentGroup.playerIds.length} Mitglieder geladen:`, 
          validMembers.map((m: FirestorePlayer) => ({ 
            id: m.id, 
            nickname: m.nickname, 
            placeholder: (m as PlayerWithPlaceholder)._isPlaceholder 
          })));
        
        // Prüfe, ob Daten-Inkonsistenzen bestehen
        setHasInconsistentData(validMembers.some((m: FirestorePlayer) => (m as PlayerWithPlaceholder)._isPlaceholder));
        
        // Zeige Erfolgsbenachrichtigung bei Selbstheilung
        if (dataWasHealed) {
          showNotification({
            message: "Gruppen-Daten wurden automatisch korrigiert.",
            type: "success"
          });
        }
        
        setMembers(validMembers);
      } catch (err) {
        console.error("Fehler beim Laden der Mitgliederdetails:", err);
        setError("Mitgliederdetails konnten nicht geladen werden.");
      } finally {
        setMembersLoading(false);
      }
    };

    fetchMembers();
  }, [currentGroup, showNotification]);

  // Effekt zum Synchronisieren des temporären Zustands, wenn sich die aktuelle Gruppe ändert
  useEffect(() => {
    if (currentGroup) {
      // Lade die Einstellungen aus der aktuellen Gruppe ODER Defaults, falls dort null/undefined
      const groupScoreSettings = currentGroup.scoreSettings ?? DEFAULT_SCORE_SETTINGS;
      const groupStrokeSettings = currentGroup.strokeSettings ?? DEFAULT_STROKE_SETTINGS;
      const groupFarbeSettings = currentGroup.farbeSettings ?? DEFAULT_FARBE_SETTINGS;

      // Setze den temporären Zustand auf die Werte der aktuellen Gruppe (oder Defaults)
      setTempScoreSettings(groupScoreSettings);
      setTempStrokeSettings(groupStrokeSettings);
      setTempFarbeSettings(groupFarbeSettings);

      // Reset Input-Felder (falls nötig)
      setTempInput({}); 
      setTempStrokeInput({}); // Reset für Stroke-Inputs
      setTempFarbeInput({}); // Reset für Farben-Inputs

      // Nachdem geladen/synchronisiert wurde, gibt es keine ungespeicherten Änderungen
      setHasJassSettingsChanges(false);
    }
    // Falls currentGroup null wird, passiert hier nichts, State bleibt bei Defaults
  }, [currentGroup]); // Nur von currentGroup abhängig

  // === NEUER useEffect: Überwache Änderungen im Jass Settings State ===
  useEffect(() => {
    // Nur ausführen, wenn currentGroup geladen ist, um Vergleichsfehler zu vermeiden
    if (!currentGroup) return;
    
    // Hole die aktuellen Werte oder Defaults
    const currentScoreSettings = currentGroup.scoreSettings ?? DEFAULT_SCORE_SETTINGS;
    const currentStrokeSettings = currentGroup.strokeSettings ?? DEFAULT_STROKE_SETTINGS;
    const currentFarbeValues = currentGroup.farbeSettings?.values ?? DEFAULT_FARBE_SETTINGS.values;
    const currentCardStyle = currentGroup.farbeSettings?.cardStyle ?? DEFAULT_FARBE_SETTINGS.cardStyle;
    
    // Vergleich der einzelnen Einstellungen - Debug-Ausgaben
    const scoreChanged = JSON.stringify(tempScoreSettings) !== JSON.stringify(currentScoreSettings);
    const strokeChanged = JSON.stringify(tempStrokeSettings) !== JSON.stringify(currentStrokeSettings);
    const farbeChanged = JSON.stringify(tempFarbeSettings.values) !== JSON.stringify(currentFarbeValues);
    const cardStyleChanged = tempFarbeSettings.cardStyle !== currentCardStyle;

    console.log('Änderungserkennung:', {
      scoreChanged,
      strokeChanged,
      farbeChanged,
      cardStyleChanged,
      tempStrokeSettings,
      currentStrokeSettings
    });

    setHasJassSettingsChanges(scoreChanged || strokeChanged || farbeChanged || cardStyleChanged);
  }, [tempScoreSettings, tempStrokeSettings, tempFarbeSettings, currentGroup]);
  // === ENDE NEUER useEffect ===

  // === NEUE HANDLER für Score Inputs (Adaptiert von SettingsModal) ===
  const handleScoreInputChange = (mode: ScoreMode, inputValue: string) => {
    setTempInput(prev => ({ ...prev, [mode]: inputValue }));
    // Grundlegende Validierung, ob es eine Zahl ist
    if (!inputValue || isNaN(parseInt(inputValue))) return; 
    const numValue = parseInt(inputValue);

    // Nur positive Werte oder 0 erlauben
    if (numValue < 0) return;

    // Speichere den Wert sofort im temp State, wenn gültig (onBlur wird Fein-Validierung machen)
    // Wir passen handleScoreChange an, um die Logik zu zentralisieren
    handleScoreChange(mode, numValue, true); // true signalisiert, dass es von onChange kommt
  };

  const handleScoreChange = (mode: ScoreMode, value: number, fromOnChange: boolean = false) => {
    setTempScoreSettings(prev => {
      const newScores = { ...prev.values }; // Arbeite mit prev.values
      const newEnabled = { ...prev.enabled }; // Arbeite mit prev.enabled
      // Ignoriere führende Nullen, stelle sicher, dass es eine Zahl ist
      const cleanValue = isNaN(value) ? 0 : value; 

      if (mode === 'sieg') {
        // Mindestwert für Sieg = 1000
        const validatedValue = Math.max(SCORE_RANGES.sieg.min, Math.min(cleanValue, SCORE_RANGES.sieg.max));
        newScores.sieg = validatedValue;
        // Berg/Schneider automatisch anpassen, wenn sie aktiviert sind und der neue Wert gültig ist
        const halfValue = Math.floor(validatedValue / 2);
        if (newEnabled.berg) {
            newScores.berg = Math.min(halfValue, SCORE_RANGES.berg.max);
        }
        if (newEnabled.schneider) {
            newScores.schneider = Math.min(halfValue, SCORE_RANGES.schneider.max);
        }
      } else if (mode === 'berg') {
         // Kann nicht höher sein als halber Sieg
         const maxBergValue = Math.floor(newScores.sieg / 2);
         const validatedBergValue = Math.max(0, Math.min(cleanValue, maxBergValue, SCORE_RANGES.berg.max));
         newScores.berg = validatedBergValue;
         // Schneider anpassen, wenn aktiviert
         if (newEnabled.schneider) {
             newScores.schneider = Math.min(validatedBergValue, SCORE_RANGES.schneider.max);
         }
      } else if (mode === 'schneider') {
         // Kann nicht höher sein als Berg (falls Berg aktiviert) oder halber Sieg
         const maxSchneiderValueBasedOnBerg = newEnabled.berg ? newScores.berg : Math.floor(newScores.sieg / 2);
         const maxSchneiderValue = Math.min(maxSchneiderValueBasedOnBerg, SCORE_RANGES.schneider.max);
         newScores.schneider = Math.max(0, Math.min(cleanValue, maxSchneiderValue));
      }

      // Nur onBlur das tempInput leeren
      if (!fromOnChange) {
          setTempInput(prev => ({ ...prev, [mode]: undefined }));
      }

      return { ...prev, values: newScores, enabled: newEnabled }; // Gebe das gesamte ScoreSettings-Objekt zurück
    });
  };

  const handleScoreToggle = (mode: ScoreMode) => {
      setTempScoreSettings(prev => {
          const newEnabled = { ...prev.enabled, [mode]: !prev.enabled[mode] };
          const newValues = { ...prev.values };

          // Wenn Modus deaktiviert wird, optional auf Default zurücksetzen oder Wert behalten?
          // Aktuell: Wert bleibt erhalten. Ggf. anpassen.
          // Beispiel: Bei Deaktivierung Berg -> Berg Punkte auf 0? oder Default?
          // if (!newEnabled[mode]) { newValues[mode] = SCORE_RANGES[mode].default; }

          // Logik: Wenn Berg deaktiviert wird, muss Schneider ggf. angepasst werden
          if (mode === 'berg' && !newEnabled.berg && newEnabled.schneider) {
              const maxSchneiderValue = Math.min(Math.floor(newValues.sieg / 2), SCORE_RANGES.schneider.max);
              newValues.schneider = Math.min(newValues.schneider, maxSchneiderValue);
          }

          // Logik: Wenn Berg aktiviert wird, muss Schneider ggf. angepasst werden (darf nicht höher sein)
          if (mode === 'berg' && newEnabled.berg && newEnabled.schneider) {
              newValues.schneider = Math.min(newValues.schneider, newValues.berg, SCORE_RANGES.schneider.max);
          }
          
          return { ...prev, values: newValues, enabled: newEnabled };
      });
  };
  // === ENDE NEUE HANDLER ===

  // === NEUE RENDER-FUNKTIONEN für Jass-Einstellungen ===
  const renderScoreSettings = () => {
    return (
      <Card className="bg-gray-800 border-gray-700 shadow-inner mt-4">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg text-gray-200">Punkte-Ziele & Modi</CardTitle>
          <CardDescription className="text-gray-400 text-sm">
            Lege die Zielpunktzahlen für Sieg, Berg und Schneider fest und aktiviere/deaktiviere die Modi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0 pb-4">
          {/* Sieg Punkte */} 
          <div className="flex items-center justify-between space-x-2 p-2 rounded-md hover:bg-gray-700/50">
            <Label htmlFor="score-sieg" className="font-medium text-gray-200">Sieg-Punkte</Label>
            <Input
              id="score-sieg"
              type="number"
              inputMode="numeric" // Besser für mobile Tastaturen
              pattern="[0-9]*"
              min={SCORE_RANGES.sieg.min}
              max={SCORE_RANGES.sieg.max}
              className="w-24 bg-gray-700 border-gray-600 text-white text-right"
              value={tempInput.sieg ?? tempScoreSettings.values.sieg} // Zeige tempInput oder gespeicherten Wert
              onChange={(e) => handleScoreInputChange('sieg', e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => handleScoreChange('sieg', parseInt(tempInput.sieg || tempScoreSettings.values.sieg.toString()))}
               onFocus={(e) => { // Zum einfachen Überschreiben
                   e.target.select();
                   setTimeout(() => e.target.select(), 0);
               }}
            />
          </div>

          {/* Berg Punkte & Toggle */} 
          <div className="bg-gray-700/50 rounded-lg overflow-hidden border border-gray-600/50">
            <div className="flex items-center justify-between p-3 border-b border-gray-600/50">
              <Label htmlFor="toggle-berg" className="font-medium text-gray-200">Berg aktiviert</Label>
              <Switch
                id="toggle-berg"
                checked={tempScoreSettings.enabled.berg}
                onCheckedChange={() => handleScoreToggle('berg')}
                className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-600 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
              />
            </div>
            {tempScoreSettings.enabled.berg && (
              <div className="flex items-center justify-between p-3">
                <Label htmlFor="score-berg" className="font-medium text-gray-200">Berg-Punkte</Label>
                <Input
                  id="score-berg"
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  max={Math.floor(tempScoreSettings.values.sieg / 2)} // Max ist halber Sieg
                  className="w-24 bg-gray-700 border-gray-600 text-white text-right"
                  value={tempInput.berg ?? tempScoreSettings.values.berg}
                  onChange={(e) => handleScoreInputChange('berg', e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => handleScoreChange('berg', parseInt(tempInput.berg || tempScoreSettings.values.berg.toString()))}
                   onFocus={(e) => { e.target.select(); setTimeout(() => e.target.select(), 0); }}
                />
              </div>
            )}
          </div>

          {/* Schneider Punkte & Toggle */} 
          <div className="bg-gray-700/50 rounded-lg overflow-hidden border border-gray-600/50">
            <div className="flex items-center justify-between p-3 border-b border-gray-600/50">
              <Label htmlFor="toggle-schneider" className="font-medium text-gray-200">Schneider aktiviert</Label>
              <Switch
                id="toggle-schneider"
                checked={tempScoreSettings.enabled.schneider}
                onCheckedChange={() => handleScoreToggle('schneider')}
                className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-600 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
              />
            </div>
            {tempScoreSettings.enabled.schneider && (
              <div className="flex items-center justify-between p-3">
                <Label htmlFor="score-schneider" className="font-medium text-gray-200">Schneider-Punkte</Label>
                <Input
                  id="score-schneider"
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  // Max ist Berg (wenn aktiv) oder halber Sieg
                  max={tempScoreSettings.enabled.berg ? tempScoreSettings.values.berg : Math.floor(tempScoreSettings.values.sieg / 2)}
                  className="w-24 bg-gray-700 border-gray-600 text-white text-right"
                  value={tempInput.schneider ?? tempScoreSettings.values.schneider}
                  onChange={(e) => handleScoreInputChange('schneider', e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => handleScoreChange('schneider', parseInt(tempInput.schneider || tempScoreSettings.values.schneider.toString()))}
                  onFocus={(e) => { e.target.select(); setTimeout(() => e.target.select(), 0); }}
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
                <CardDescription className="text-gray-400 text-sm">
                    Legen Sie fest, wie viele Striche für bestimmte Punktbereiche vergeben werden.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 pb-4">
                {STROKE_MODES.map((mode) => (
                    <div key={mode} className="flex items-center justify-between space-x-4 p-2 rounded-md hover:bg-gray-700/50">
                        <Label htmlFor={`stroke-${mode}`} className="font-medium capitalize flex-1 text-gray-200">
                            {mode.replace(/([A-Z])/g, ' $1').trim()} Striche
                        </Label>
                        <Input
                            id={`stroke-${mode}`}
                            type="number"
                            min="0"
                            max="2"
                            className="w-20 bg-gray-700 border-gray-600 text-white text-right"
                            value={tempStrokeInput[mode as StrokeMode] ?? tempStrokeSettings[mode as StrokeMode] ?? ''}
                            onChange={(e) => {
                                setTempStrokeInput(prev => ({ 
                                  ...prev, 
                                  [mode as StrokeMode]: e.target.value.replace(/[^0-9]/g, '')
                                }));
                            }}
                            onBlur={() => {
                              const inputValue = tempStrokeInput[mode as StrokeMode];
                              const value = inputValue === '' || inputValue === undefined ? 0 : parseInt(inputValue, 10);
                              if (!isNaN(value)) {
                                handleStrokeChange(mode as StrokeMode, value);
                                setTempStrokeInput(prev => ({ ...prev, [mode as StrokeMode]: undefined }));
                              }
                            }}
                            onFocus={(e) => { e.target.select(); setTimeout(() => e.target.select(), 0); }}
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
          <CardDescription className="text-gray-400 text-sm">
            Lege die Multiplikatoren und den verwendeten Kartensatz (Deutsch/Französisch) fest.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0 pb-4">
          {/* --- Kartensatz Auswahl --- */}
          <div className="flex items-center justify-between space-x-2 p-3 rounded-lg bg-gray-700/50 border border-gray-600/50">
            <Label className="font-medium text-gray-200">Kartensatz</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={tempFarbeSettings.cardStyle === 'DE' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleCardStyleChange('DE')}
                className={`min-w-[50px] text-center font-semibold ${tempFarbeSettings.cardStyle === 'DE' 
                  ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' 
                  : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600 hover:text-gray-300'}`}
              >
                DE
              </Button>
              <Button
                type="button"
                variant={tempFarbeSettings.cardStyle === 'FR' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleCardStyleChange('FR')}
                className={`min-w-[50px] text-center font-semibold ${tempFarbeSettings.cardStyle === 'FR' 
                  ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' 
                  : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600 hover:text-gray-300'}`}
              >
                FR
              </Button>
            </div>
          </div>
          {/* --- Ende Kartensatz Auswahl --- */}
          
          {/* Multiplikatoren (bestehender Code) */} 
          <div className="border-t border-gray-700/50 pt-4 space-y-3">
            <h4 className="text-base font-medium text-gray-300 mb-2">Multiplikatoren</h4>
            {FARBE_MODES.map((mode) => {
                // Multiplikator aus dem State holen, Default auf 1 falls nicht vorhanden (für die Logik hier)
                const multiplier = tempFarbeSettings.values[mode.id as FarbeModeKey] ?? 1;
                const isInactive = multiplier === 0; // Prüfen ob inaktiv

                return (
                    <div
                        key={mode.id}
                        className={`flex items-center justify-between space-x-4 p-2 rounded-md transition-opacity duration-200 
                            ${isInactive
                                ? 'opacity-60 hover:bg-gray-700/30' // Style für inaktiv
                                : 'hover:bg-gray-700/50'         // Normaler Hover-Style
                            }`}
                    >
                         <div className="flex items-center space-x-2 flex-1">
                            <FarbePictogram
                                farbe={mode.name as JassColor}
                                mode="svg"
                                cardStyle={tempFarbeSettings.cardStyle}
                                className="w-5 h-5 flex-shrink-0"
                            />
                            <Label htmlFor={`farbe-${mode.id}`} className="font-medium text-gray-200">
                                {mode.name}
                            </Label>
                        </div>
                        <Input
                            id={`farbe-${mode.id}`}
                            type="number"
                            min="0" // Geändert von 1 auf 0
                            max="12" // Maximalwert hinzugefügt
                            className={`w-20 bg-gray-700 border-gray-600 text-white text-right ${isInactive ? 'text-gray-400' : ''}`} // Optional: Textfarbe im Input anpassen
                            value={tempFarbeInput[mode.id as FarbeModeKey] ?? multiplier ?? ''} // Zeige Multiplikator (inkl. 0)
                            onChange={(e) => {
                                setTempFarbeInput(prev => ({
                                    ...prev,
                                    [mode.id as FarbeModeKey]: e.target.value.replace(/[^0-9]/g, '')
                                }));
                            }}
                            onBlur={() => {
                                const inputValue = tempFarbeInput[mode.id as FarbeModeKey];
                                // Default auf 0, wenn leer oder ungültig, und klemme zwischen 0 und 12
                                let value = parseInt(inputValue || '0', 10);
                                if (isNaN(value)) {
                                    value = 0; // Default auf 0
                                }
                                value = Math.max(0, Math.min(value, 12)); // Klemmen

                                handleFarbeValueChange(mode.id as FarbeModeKey, value); // Geklemmten Wert übergeben
                                setTempFarbeInput(prev => ({ ...prev, [mode.id as FarbeModeKey]: undefined }));
                            }}
                            onFocus={(e) => { e.target.select(); setTimeout(() => e.target.select(), 0); }}
                        />
                    </div>
                );
            })}             
          </div>
        </CardContent>
      </Card>
    );
  };
  // === ENDE NEUE RENDER-FUNKTIONEN ===

  // === NEUE ZENTRALE HANDLER für Stroke und Farbe ===
  const handleStrokeChange = (mode: StrokeMode, value: number) => {
    // Stelle sicher, dass wir nur gültige Werte verwenden (1 oder 2)
    let validValue = Math.max(0, Math.min(value, 2));
    if (validValue > 0 && validValue !== 1 && validValue !== 2) {
      validValue = 2;
    }
    
    // Erstelle eine komplette Kopie des Objekts
    setTempStrokeSettings((prev) => {
      const newSettings = { ...prev };
      newSettings[mode] = validValue as 1 | 2;
      return newSettings;
    });
  };
  
  const handleFarbeValueChange = (modeId: FarbeModeKey, value: number) => {
    // Stelle sicher, dass der Wert zwischen 0 und 12 liegt
    const validValue = Math.max(0, Math.min(value, 12));
    
    setTempFarbeSettings((prev) => {
      const newSettings = {
        ...prev,
        values: {
          ...prev.values,
          [modeId]: validValue
        }
      };
      return newSettings;
    });
  };
  // === ENDE NEUE HANDLER ===

  // === NEUE HANDLER für Card Style ===
  const handleCardStyleChange = (style: CardStyle) => {
    setTempFarbeSettings(prev => ({ ...prev, cardStyle: style }));
  };
  // === ENDE NEUER HANDLER ===

  // --- Angepasster CTA Button Setup --- 
  useEffect(() => {
    const form = document.getElementById("group-form") as HTMLFormElement | null;
    
    // Prüfe, ob Grundinfo-Änderungen vorliegen
    const hasBasicChanges = 
        (name !== (currentGroup?.name || "")) || 
        (description !== (currentGroup?.description || "")) || 
        (isPublic !== (currentGroup?.isPublic ?? true));

    // Gesamtänderungsstatus (Grundinfos ODER Jass-Settings)
    const hasAnyChanges = hasBasicChanges || hasJassSettingsChanges;
    // Gesamt-Speicherstatus (Grundinfos ODER Jass-Settings)
    const isAnySaving = isSubmitting || isJassSettingsSaving;

    if (form) {
    setPageCta({
      isVisible: true,
      text: "Speichern",
      onClick: () => {
          // Beide Speicherfunktionen aufrufen, falls Änderungen vorliegen
          // Die Funktionen selbst prüfen intern, ob sie speichern müssen
          if (hasBasicChanges) {
            form.requestSubmit(); // Trigger für handleSubmit
          }
          if (hasJassSettingsChanges) {
             handleSaveJassSettings();
          }
        },
        loading: isAnySaving,
        // Button deaktivieren, wenn gespeichert wird ODER keine Änderungen vorliegen
        disabled: isAnySaving || !hasAnyChanges, 
      variant: "info",
    });
    } else {
      resetPageCta();
    }

    return () => {
      resetPageCta();
    };
    // Abhängigkeiten um Jass-Settings erweitert
  }, [setPageCta, resetPageCta, isSubmitting, isJassSettingsSaving, hasJassSettingsChanges, name, description, isPublic, currentGroup]); 

  // Funktion zum Aufruf der invalidateActiveGroupInvites Function
  const handleInvalidateInvites = async () => {
    if (!currentGroup) {
      console.error("handleInvalidateInvites: No current group found.");
      return;
    }

    console.log("handleInvalidateInvites: Starting invalidation process...");
    setIsInvalidating(true);
    try {
      const functions = getFunctions(undefined, 'europe-west1');
      const invalidateFn = httpsCallable(functions, "invalidateActiveGroupInvites");
      console.log(`handleInvalidateInvites: Calling cloud function for groupId: ${currentGroup.id} in region europe-west1`);
      const result = await invalidateFn({groupId: currentGroup.id});
      console.log("handleInvalidateInvites: Cloud function result received:", result.data);

      const data = result.data as { success: boolean; invalidatedCount?: number; message?: string }; // Message optional gemacht

      if (data.success) {
        const count = data.invalidatedCount ?? 0; // Default auf 0, falls nicht vorhanden
        showNotification({
          message: count > 0 ? `${count} Einladungslink(s) erfolgreich zurückgesetzt.` : "Keine aktiven Links gefunden.",
          type: "success",
        });
      } else {
        // Expliziter Fehlerfall von der Funktion
        throw new Error(data.message || "Fehler beim Zurücksetzen der Links vom Server.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler beim Zurücksetzen der Links.";
      console.error("Error calling invalidateActiveGroupInvites:", error);
      showNotification({
        message: message,
        type: "error",
      });
    } finally {
      console.log("handleInvalidateInvites: Setting isInvalidating back to false.");
      setIsInvalidating(false);
    }
  };

  // Funktion zum Reparieren inkonsistenter Daten
  const handleRepairData = async () => {
    if (!currentGroup) return;
    
    try {
      setRepairingData(true);
      showNotification({
        message: "Datenkonsistenz wird überprüft...",
        type: "info"
      });
      
      // Nutze die neue Funktion, um Konsistenz sicherzustellen
      const repairedPlayers = await ensurePlayersExist(currentGroup.playerIds, currentGroup.id);
      
      console.log(`Datenreparatur abgeschlossen. ${repairedPlayers.length} Spieler repariert/geprüft.`);
      
      // Aktualisiere die Mitgliederliste
      setMembers(repairedPlayers);
      setHasInconsistentData(false);
      
      showNotification({
        message: `Datenreparatur erfolgreich. ${repairedPlayers.length} Spieler-Datensätze überprüft.`,
        type: "success"
      });
    } catch (error) {
      console.error("Fehler bei der Datenreparatur:", error);
      showNotification({
        message: "Fehler bei der Datenreparatur.",
        type: "error"
      });
    } finally {
      setRepairingData(false);
    }
  };

  // --- Handler für Jass-Einstellungen Speichern ---
  const handleSaveJassSettings = async () => {
    // Prüfungen bleiben gleich
    if (!currentGroup || !hasJassSettingsChanges || isJassSettingsSaving) return;
    
    setIsJassSettingsSaving(true);
    const groupId = typeof routeGroupId === 'string' ? routeGroupId : currentGroup.id; 

    // Lese die DOM-Werte aus, um sicherzustellen, dass die aktuellsten Werte verwendet werden
    const domValuesForSaving = getDOMInputValues();
    
    // Prüfe, ob DOM-Werte und State-Werte unterschiedlich sind
    let usesDOMValues = false;
    const strokeFromDOM: StrokeSettings = { ...tempStrokeSettings };
    const farbeFromDOM = { ...tempFarbeSettings }; 
    const farbeValuesFromDOM = { ...tempFarbeSettings.values };
    
    // Überprüfe stroke-Werte
    for (const mode of STROKE_MODES) {
      const domValue = domValuesForSaving.stroke[mode];
      if (domValue && domValue !== '' && parseInt(domValue) > 0) {
        // Konvertiere den DOM-Wert in eine Zahl und prüfe, ob er vom State abweicht
        const numValue = Math.min(2, Math.max(1, parseInt(domValue)));
        if (numValue !== tempStrokeSettings[mode as StrokeMode]) {
          strokeFromDOM[mode as StrokeMode] = numValue as 1 | 2;
          usesDOMValues = true;
        }
      }
    }
    
    // Überprüfe farbe-Werte
    for (const mode of FARBE_MODES) {
      const domValue = domValuesForSaving.farbe[mode.id];
      if (domValue && domValue !== '' && parseInt(domValue) > 0) {
        // Konvertiere den DOM-Wert in eine Zahl und prüfe, ob er vom State abweicht
        const numValue = Math.max(1, parseInt(domValue));
        if (numValue !== tempFarbeSettings.values[mode.id as FarbeModeKey]) {
          farbeValuesFromDOM[mode.id as FarbeModeKey] = numValue;
          usesDOMValues = true;
        }
      }
    }
    
    // Aktualisiere das farbeFromDOM-Objekt mit den geänderten Werten
    if (usesDOMValues) {
      farbeFromDOM.values = farbeValuesFromDOM;
    }
    
    // Erstelle das Update-Objekt mit allen temporären Jass-Einstellungen - Erstelle Tiefe Kopien
    const jassSettingsUpdates = {
      scoreSettings: JSON.parse(JSON.stringify(tempScoreSettings)),
      strokeSettings: JSON.parse(JSON.stringify(usesDOMValues ? strokeFromDOM : tempStrokeSettings)),
      farbeSettingsValues: JSON.parse(JSON.stringify(usesDOMValues ? farbeFromDOM.values : tempFarbeSettings.values)),
      cardStyle: tempFarbeSettings.cardStyle,
    };

    try {
        // Rufe die atomare Action auf
        await updateCurrentGroupJassSettings(groupId, jassSettingsUpdates);
        
        // Setze Änderungsindikator zurück
        setHasJassSettingsChanges(false);
    } catch (err) {
        console.error("Fehler beim Speichern der Jass-Einstellungen:", err);
    } finally {
        setIsJassSettingsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!currentGroup) throw new Error("Keine aktive Gruppe ausgewählt");

      await updateGroup(currentGroup.id, {
        name,
        description,
        isPublic,
      });

      showNotification({
        message: "Gruppe erfolgreich aktualisiert.",
        type: "success",
      });

      router.push("/start");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
      setIsSubmitting(false);
    }
  };

  // Handle role change
  const handleRoleChange = async (targetPlayerId: string, newRole: 'admin' | 'member') => {
    setRoleChangeLoading(prev => ({ ...prev, [targetPlayerId]: true }));
    try {
      await updateMemberRole(targetPlayerId, newRole);
      showNotification({
        message: `Rolle erfolgreich auf ${newRole === 'admin' ? 'Admin' : 'Mitglied'} geändert.`,
        type: "success",
      });
    } catch (err) {
      console.error("Fehler beim Ändern der Rolle:", err);
      showNotification({
        message: err instanceof Error ? err.message : "Rollenänderung fehlgeschlagen.",
        type: "error",
      });
    } finally {
      setRoleChangeLoading(prev => ({ ...prev, [targetPlayerId]: false }));
    }
  };

  // Funktion zur direkten Prüfung der DOM-Werte
  const getDOMInputValues = () => {
    // Resultat-Objekt
    const result = {
      stroke: {} as Record<string, string>,
      farbe: {} as Record<string, string>
    };
    
    // Sammle alle Stroke-Inputs
    STROKE_MODES.forEach(mode => {
      const element = document.getElementById(`stroke-${mode}`) as HTMLInputElement | null;
      if (element) {
        result.stroke[mode] = element.value;
      }
    });
    
    // Sammle alle Farbe-Inputs
    FARBE_MODES.forEach(mode => {
      const element = document.getElementById(`farbe-${mode.id}`) as HTMLInputElement | null;
      if (element) {
        result.farbe[mode.id] = element.value;
      }
    });
    
    return result;
  };

  // === NEUE FUNKTION: Handler für direktes Einladen/Teilen ===
  const handleDirectInviteShare = async () => {
    if (!currentGroup || !user) return;
    setError(null);
    setDirectInviteError(null);
    setIsGeneratingDirectInvite(true);

    const functions = getFunctions(undefined, "europe-west1");
    const generateInviteToken = httpsCallable(functions, 'generateGroupInviteToken');

    try {
      console.log(`handleDirectInviteShare: Calling generateGroupInviteToken for group ${currentGroup.id}`);
      const result = await generateInviteToken({ groupId: currentGroup.id });
      const token = (result.data as { token: string }).token;

      if (!token) {
        throw new Error("Kein Token vom Server erhalten.");
      }

      const inviteLink = `${APP_BASE_URL}/join?token=${token}`;

      // Name des Einladenden holen (Fallback auf 'Jemand')
      const inviterName = user.displayName || user.email || 'Jemand';

      // Share Text erstellen (NEUE STRUKTUR - OHNE SLOGAN)
      const titleText = "**Du wurdest zu Jassguru eingeladen**";
      const bodyText = `${inviterName} lädt dich ein, der Jassgruppe "${currentGroup.name}" beizutreten.`;
      const linkText = `👉 Hier beitreten: ${inviteLink}`;
      
      const shareText = `${titleText}\n\n${bodyText}\n\n${linkText}`;

      // --- Bild laden: Immer /welcome-guru.png verwenden --- 
      let imageFile: File | null = null;
      const imageUrlToLoad = '/welcome-guru.png';
      console.log("Lade Standard-Bild für Teilen:", imageUrlToLoad);

      try {
        const response = await fetch(imageUrlToLoad);
        if (!response.ok) {
          throw new Error(`Standardbild konnte nicht geladen werden: ${response.statusText}`);
        }
        const blob = await response.blob();
        imageFile = new File([blob], 'welcome-guru.png', { type: blob.type || 'image/png' });
        console.log("Standardbild erfolgreich geladen und als File erstellt:", imageFile.name);
      } catch (fetchError) {
        console.error("Fehler beim Laden des Standardbildes:", fetchError);
        // Hier gibt es keinen weiteren Fallback, imageFile bleibt null
      }
      // --- Ende Bild laden ---


      if (navigator.share) {
        const shareData: ShareData = {
          title: `Du wurdest zu Jassguru eingeladen`, // Titel bleibt hier als Metadaten
          text: shareText, // Text enthält jetzt den sichtbaren Titel
          url: inviteLink, // URL explizit mitgeben
        };

        // Füge das Bild hinzu, falls vorhanden und Filesharing unterstützt wird
        if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
          shareData.files = [imageFile];
          console.log("Versuche Teilen mit Bild:", imageFile.name);
        } else if (imageFile) {
          console.log("Bild vorhanden, aber Teilen von Files nicht unterstützt. Teile nur Text.");
        } else {
          console.log("Kein Bild zum Teilen verfügbar.");
        }

        await navigator.share(shareData);
        showNotification({ message: "Einladungslink geteilt!", type: "success" });
      } else {
        // Fallback: Link in die Zwischenablage kopieren
        navigator.clipboard.writeText(inviteLink);
        showNotification({ message: "Einladungslink in die Zwischenablage kopiert!", type: "info" });
      }
    } catch (error: any) {
      console.error("Fehler beim Generieren/Teilen des Einladungslinks:", error);
      // Detailliertere Fehlermeldung versuchen
      let errorMessage = "Ein interner Fehler ist aufgetreten."; // Generischer Fallback
      if (error?.code && typeof error.code === 'string') {
         // Firebase Function error codes (z.B. 'internal', 'unauthenticated', 'permission-denied')
         // Format: "Fehler (Code): Nachricht"
         errorMessage = `Fehler (${error.code}): ${error.message || 'Keine weitere Information.'}`;
      } else if (error instanceof Error) {
         errorMessage = `Fehler: ${error.message}`;
      } else if (typeof error === 'string') {
         errorMessage = error; // Falls nur ein String geworfen wird
      }
      
      console.error("Angezeigte Fehlermeldung:", errorMessage); // Logge die spezifische Meldung

      setDirectInviteError(errorMessage); // Zeige die spezifischere Meldung an
      showNotification({ message: errorMessage, type: "error" });
    } finally {
      setIsGeneratingDirectInvite(false);
    }
  };
  // === ENDE NEUE FUNKTION ===

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
      <div className="flex min-h-screen flex-col items-center bg-gray-900 p-4 text-white relative">
        {/* Back Button */}
        <Link href="/start" passHref legacyBehavior>
          <Button
            variant="ghost"
            className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3"
            aria-label="Zurück zur Startseite"
          >
            <ArrowLeft size={28} />
          </Button>
        </Link>

        <div className="w-full max-w-md space-y-6 py-16">
          <h1 className="text-center text-2xl font-bold text-white">
            Gruppeneinstellungen
          </h1>

          {error && (
            <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" id="group-form">
            {/* Gruppengrundinformationen */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Grundinformationen
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Basis-Einstellungen für deine Gruppe
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-gray-200">
                    Name
                  </label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white"
                    placeholder="Gruppenname"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium text-gray-200">
                    Beschreibung
                  </label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white min-h-[100px]"
                    placeholder="Gruppenbeschreibung (optional)"
                    maxLength={150}
                  />
                  <p className="text-xs text-gray-400">
                    Die Beschreibung wird auf der Startseite angezeigt. Maximal 150 Zeichen.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* === Jass-Einstellungen Card (ANGEPASST) === */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Jass-Einstellungen
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Lege fest, welche Varianten und Multiplikatoren in der Gruppe gelten.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* --- Tabs für Jass-Einstellungen --- */}
                <Tabs defaultValue="farben" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-gray-700/50 p-1 rounded-lg mb-4">
                    <TabsTrigger value="farben" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300 hover:bg-gray-600/50 rounded-md py-1.5 text-sm">Farben</TabsTrigger>
                    <TabsTrigger value="punkte" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300 hover:bg-gray-600/50 rounded-md py-1.5 text-sm">Punkte</TabsTrigger>
                    <TabsTrigger value="striche" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-300 hover:bg-gray-600/50 rounded-md py-1.5 text-sm">Striche</TabsTrigger>
                  </TabsList>
                  <TabsContent value="punkte">
                    {renderScoreSettings()}
                  </TabsContent>
                  <TabsContent value="striche">
                    {renderStrokeSettings()}
                  </TabsContent>
                  <TabsContent value="farben">
                    {renderFarbeSettings()}
                  </TabsContent>
                </Tabs>
                {/* --- Ende Tabs --- */}
              </CardContent>
            </Card>
            {/* === ENDE Jass-Einstellungen Card === */}

            {/* === NEUE KARTE: Aktionen (nur für Admins) === */}
            {isCurrentUserAdmin && (
               <Card className="bg-gray-800 border-gray-700">
                 <CardHeader className="pb-2">
                   <CardTitle className="text-white flex items-center gap-2">
                     <UserPlus className="w-5 h-5" />
                     Freunde einladen
                   </CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="flex flex-col">
                     <div>
                       <p className="text-sm text-gray-400 mt-1 mb-4">
                         Lade deine Jassfreunde zur Gruppe ein.
                       </p>
                       <Button
                         onClick={handleDirectInviteShare}
                         disabled={isGeneratingDirectInvite || !currentGroup}
                         className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                       >
                         {isGeneratingDirectInvite ? (
                           <>
                             <Loader2 className="h-4 w-4 animate-spin" />
                             Wird generiert...
                           </>
                         ) : (
                           "Zur Gruppe einladen"
                         )}
                       </Button>
                       {directInviteError && (
                         <p className="text-xs text-red-400 mt-2 text-center">{directInviteError}</p>
                       )}
                     </div>
                   </div>
                 </CardContent>
               </Card>
            )}
            {/* === ENDE NEUE KARTE === */}

            {/* Mitglieder - Bleibt hier */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Mitglieder
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Aktuelle Mitglieder und Admins verwalten
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Dateninkonsistenz-Warnung */}
                {hasInconsistentData && (
                  <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded-md flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-yellow-300 font-medium">Dateninkonsistenz erkannt</p>
                      <p className="text-xs text-gray-300 mt-1">
                        Einige Mitglieder haben unvollständige Daten. Klicken Sie auf "Daten reparieren", um die Datenbank zu aktualisieren.
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2 text-yellow-300 border-yellow-600 hover:bg-yellow-900/50"
                        onClick={handleRepairData}
                        disabled={repairingData}
                      >
                        {repairingData ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            Wird repariert...
                          </>
                        ) : (
                          <>
                            <Wrench className="mr-2 h-3 w-3" />
                            Daten reparieren
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {membersLoading ? (
                  <div className="flex justify-center items-center p-4">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-400">Lade Mitglieder...</span>
                  </div>
                ) : members.length === 0 ? (
                   <p className="text-center text-gray-400">Noch keine Mitglieder in dieser Gruppe.</p>
                ) : (
                  <ul className="space-y-4">
                    {members.map((member) => {
                      // Korrekte Admin-Prüfung: Vergleiche die userId des Players mit den adminIds der Gruppe
                      const isMemberAdmin = !!member.userId && (currentGroup?.adminIds.includes(member.userId) ?? false);
                      const isSelf = !!user?.playerId && member.id === user.playerId;
                      const isLoading = roleChangeLoading[member.id] ?? false;
                       // Check if this admin is the last one
                       const isLastAdmin = isMemberAdmin && currentGroup?.adminIds.length === 1;

                      return (
                        <li key={member.id} className="flex items-center justify-between gap-4 p-3 bg-gray-700/50 rounded-md">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                             {/* Placeholder Avatar - Consider fetching actual photoURL if available */}
                             <Avatar className="h-9 w-9">
                               <AvatarFallback className={`text-gray-300 ${
                                 (member as PlayerWithPlaceholder)._isPlaceholder ? 'bg-yellow-800' : 'bg-gray-600'}`}>
                                 {member.nickname?.charAt(0).toUpperCase() || "?"}
                               </AvatarFallback>
                             </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {member.nickname || "Unbekannt"}
                                {
                                  (member as PlayerWithPlaceholder)._isPlaceholder && (
                                  <span className="ml-2 text-xs text-yellow-400">(Daten unvollständig)</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-400 truncate">
                                {
                                  (member as PlayerWithPlaceholder)._isPlaceholder 
                                  ? <span className="text-yellow-500">ID: {member.id}</span> 
                                  : member.userId ? 'Registriert' : 'Gast'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Action Buttons (only for admins, not for self) */}
                            {isCurrentUserAdmin && !isSelf && (
                              <>
                                {/* === Make Admin Button === */} 
                                {!isMemberAdmin && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={`
                                          h-auto text-xs font-medium transition-colors flex items-center justify-center
                                          ${isLoading ?
                                            'text-gray-500 border-gray-600 cursor-not-allowed' // Loading state
                                            : 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 border-blue-600 px-2 py-1 rounded-lg' // Style for 'Make Admin'
                                          }
                                        `}
                                        disabled={isLoading}
                                        title={"Zum Admin ernennen"}
                                      >
                                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zum Admin ernennen'}
                                      </Button>
                                    </AlertDialogTrigger>
                                    {/* AlertDialogContent for Make Admin */}
                                    <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Zum Admin ernennen?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-gray-400">
                                          Möchten Sie die Rolle von "{member.nickname || 'diesem Mitglied'}" wirklich ändern?
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-gray-600 hover:bg-gray-500 border-gray-600 text-white">Abbrechen</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleRoleChange(member.id, 'admin')}
                                          className={"bg-blue-600 hover:bg-blue-700 text-white"}
                                        >
                                          Ja, ernennen
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}

                                {/* === Remove Admin Button (only if member IS admin AND NOT the creator) === */} 
                                {isMemberAdmin && member.userId !== currentGroup?.createdBy && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={`
                                          h-auto text-xs font-medium transition-colors flex items-center justify-center
                                          ${isLoading || isLastAdmin ? // Simplified disabled check for remove
                                            'text-gray-500 border-gray-600 cursor-not-allowed' // Loading or Last admin 
                                            : 'bg-red-800/50 text-white hover:bg-red-700/60 focus-visible:ring-red-500 rounded-md w-6 h-6 p-0' // Style for 'Remove Admin' (X icon)
                                          }
                                        `}
                                        disabled={isLoading || isLastAdmin} // Disable if loading or last admin
                                        title={isLastAdmin ? "Letzter Admin kann nicht entfernt werden" : "Admin-Status entfernen"}
                                      >
                                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="w-4 h-4" />}
                                      </Button>
                                    </AlertDialogTrigger>
                                    {/* AlertDialogContent for Remove Admin */} 
                                    <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Admin-Status entfernen?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-gray-400">
                                          Möchten Sie die Rolle von "{member.nickname || 'diesem Mitglied'}" wirklich ändern?
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-gray-600 hover:bg-gray-500 border-gray-600 text-white">Abbrechen</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleRoleChange(member.id, 'member')}
                                          className={"bg-red-600 hover:bg-red-700 text-white"}
                                        >
                                          Ja, entfernen
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </>
                            )}

                            {/* Admin Badge (always shown if isMemberAdmin) */}
                            {isMemberAdmin && (
                              <Badge variant="outline" className="border-green-600 text-green-400 bg-green-900/30 px-2 py-0.5">
                                <Crown className="w-3 h-3 mr-1" /> Admin
                              </Badge>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Sichtbarkeit - Nach Mitglieder verschoben */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Sichtbarkeit
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Wer kann die Gruppe sehen und beitreten?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-gray-200">
                      Öffentliche Gruppe
                    </label>
                    <p className="text-sm text-gray-400">
                      Die Gruppe ist für alle sichtbar und beitretbar
                    </p>
                  </div>
                  <Switch
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                    className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-600 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Gefahrenzone - Nur für Admins */}
            {user && currentGroup && currentGroup.adminIds.includes(user.uid) && (
              <Card className="bg-red-900/20 border-red-900/50">
                <CardHeader>
                  <CardTitle className="text-red-300">Gefahrenzone</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-200">Einladungslinks zurücksetzen</h4>
                      <p className="text-sm text-gray-400 mt-1 mb-3">
                        Macht alle aktuell gültigen Einladungslinks für diese Gruppe sofort ungültig.
                        Nützlich, wenn ein Link ungewollt verbreitet wurde.
                      </p>
                      {/* Bestätigungsdialog einbetten */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            disabled={isInvalidating}
                            className="bg-red-700 hover:bg-red-800 border-red-900 text-white"
                          >
                            {isInvalidating ? (
                                <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wird zurückgesetzt... </>
                            ) : (
                                "Alle Links zurücksetzen"
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Wirklich alle Links zurücksetzen?</AlertDialogTitle>
                            <AlertDialogDescription className="text-gray-400">
                               Diese Aktion kann nicht rückgängig gemacht werden. Alle Personen, die versuchen,
                               mit einem zuvor geteilten Link beizutreten, werden abgewiesen.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            {/* Angepasster Stil für Abbrechen */}
                            <AlertDialogCancel 
                              className="bg-transparent border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
                              disabled={isInvalidating} // Auch hier deaktivieren
                            >
                                Abbrechen
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleInvalidateInvites}
                              className="bg-red-600 hover:bg-red-700 text-white"
                              disabled={isInvalidating} // Button im Dialog auch deaktivieren
                            >
                               Ja, zurücksetzen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    {/* Hier könnten weitere gefährliche Aktionen hin, z.B. Gruppe löschen */}
                  </div>
                </CardContent>
              </Card>
            )}
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default GroupSettingsPage;
