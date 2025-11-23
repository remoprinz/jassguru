"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeft, Settings, Loader2, AlertTriangle, Users, Trash2, Palette, BarChart, Crown, X, UserPlus, UserCog, CheckCircle, Award } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useTournamentStore } from '@/store/tournamentStore';
import { useUIStore } from '@/store/uiStore';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Textarea from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TournamentInviteModal from '@/components/tournament/TournamentInviteModal';
import AddParticipantsFromGroupModal from '@/components/tournament/AddParticipantsFromGroupModal';
import { STROKE_MODES } from '@/types/jass';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Timestamp } from 'firebase/firestore';

import type { TournamentInstance, TournamentSettings } from '@/types/tournament';
import type { ScoreSettings, StrokeSettings, ScoreMode, StrokeMode } from '@/types/jass';
import { DEFAULT_SCORE_SETTINGS, SCORE_MODES } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';

// NEUE IMPORTE FÜR FARBEINSTELLUNGEN
import type { FarbeSettings, FarbeModeKey, JassColor, CardStyle } from '@/types/jass';
import { DEFAULT_FARBE_SETTINGS, FARBE_MODES } from '@/config/FarbeSettings';
import { FarbePictogram } from '@/components/settings/FarbePictogram';
// NEUE IMPORTE FÜR KARTENSYMBOL-MAPPING
import { CARD_SYMBOL_MAPPINGS } from '@/config/CardStyles'; 
import { toTitleCase } from '@/utils/formatUtils';
// ENDE NEUE IMPORTE

// Turnier-spezifische Default-Einstellungen (identisch zu new.tsx)
const TOURNAMENT_DEFAULT_SCORE_SETTINGS: ScoreSettings = {
  values: {
    sieg: 1000, // A) Punkteziel: 1000
    berg: 0,
    schneider: 0,
  },
  enabled: {
    sieg: true,
    berg: false,    // B) Berg deaktiviert
    schneider: false, // B) Schneider deaktiviert
  },
  matschBonus: true, // NEU: Matschbonus auch bei Turnieren per Default aktiviert
};

const TOURNAMENT_DEFAULT_STROKE_SETTINGS: StrokeSettings = {
  schneider: 0,
  kontermatsch: 0,
};

const TOURNAMENT_DEFAULT_FARBE_SETTINGS: FarbeSettings = {
  values: {
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

// Helper function to combine Date and Time strings into a Timestamp or null
const combineDateTimeToTimestamp = (dateStr: string, timeStr: string): Timestamp | null => {
  if (!dateStr || !timeStr) return null;
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    // JavaScript Date month is 0-indexed
    const dateObj = new Date(year, month - 1, day, hours, minutes);
    if (isNaN(dateObj.getTime())) return null; // Invalid date
    return Timestamp.fromDate(dateObj);
  } catch (error) {
    console.error("Error creating Timestamp from date/time:", error);
    return null;
  }
};

// Helper function to format Timestamp to date and time strings
const formatTimestampToDateTime = (timestamp: Timestamp | null | undefined): { dateStr: string; timeStr: string } => {
  if (!timestamp) {
    return { dateStr: '', timeStr: '' };
  }
  try {
    const dateObj = timestamp.toDate();
    const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = dateObj.toTimeString().split(':').slice(0, 2).join(':'); // HH:MM
    return { dateStr, timeStr };
  } catch (error) {
    console.error("Error formatting Timestamp to date/time:", error);
    return { dateStr: '', timeStr: '' };
  }
};

const RANKING_MODES: { value: TournamentSettings['rankingMode']; label: string }[] = [
  { value: 'total_points', label: 'Nach Punkten' },
  { value: 'striche', label: 'Nach Strichen' },
  { value: 'striche_difference', label: 'Nach Strichdifferenz' },
  { value: 'points_difference', label: 'Nach Punktedifferenz' }, // ✅ NEU
  { value: 'alle_ranglisten', label: 'Alle Ranglisten' }, // ✅ NEU
];

const TournamentSettingsPage: React.FC = () => {
  const router = useRouter();
  const { instanceId } = router.query as { instanceId: string };
  const { user, status: authStatus, isAuthenticated } = useAuthStore();
  const uiStore = useUIStore();
  const showNotification = uiStore.showNotification;
  const setPageCta = uiStore.setPageCta;
  const resetPageCta = uiStore.resetPageCta;

  const tournamentStore = useTournamentStore();
  const {
    currentTournamentInstance: tournament,
    tournamentParticipants: storeParticipants,
    participantsStatus: storeParticipantsStatus,
    activateTournament,
    status: tournamentStatus,
    error: tournamentError,
    fetchTournamentInstanceDetails,
    removeParticipant,
    makeParticipantAdmin,
    removeParticipantAdmin,
    completeTournament: completeTournamentAction,
    pauseTournament,
    resumeTournament,
    loadTournamentParticipants,
    updateTournamentDetails,
    updateTournamentSettings,
  } = tournamentStore;

  const isLoadingGlobal = useTournamentStore(state => 
    state.status === 'loading-details' || 
    state.status === 'loading-list' || 
    state.status === 'updating-settings' ||
    state.status === 'managing-participant'
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRankingMode, setSelectedRankingMode] = useState<TournamentSettings['rankingMode']>('total_points');
  const [isSubmittingGeneralSettings, setIsSubmittingGeneralSettings] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isAddFromGroupModalOpen, setIsAddFromGroupModalOpen] = useState(false);

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const [tempScoreSettings, setTempScoreSettings] = useState<ScoreSettings>(TOURNAMENT_DEFAULT_SCORE_SETTINGS);
  const [tempStrokeSettings, setTempStrokeSettings] = useState<StrokeSettings>(TOURNAMENT_DEFAULT_STROKE_SETTINGS);
  const [tempScoreInput, setTempScoreInput] = useState<{[key in ScoreMode]?: string}>({});
  const [tempStrokeInput, setTempStrokeInput] = useState<{[key in StrokeMode]?: string}>({});

  // NEUE STATE VARIABLEN FÜR FARBEINSTELLUNGEN
  const [tempFarbeSettings, setTempFarbeSettings] = useState<FarbeSettings>(TOURNAMENT_DEFAULT_FARBE_SETTINGS);
  const [tempFarbeInput, setTempFarbeInput] = useState<{[key in FarbeModeKey]?: string}>({});
  // ENDE NEUE STATE VARIABLEN

  // NEU: State für Teilnehmerlimits
  const [tempMinParticipants, setTempMinParticipants] = useState<string>('');
  const [tempMaxParticipants, setTempMaxParticipants] = useState<string>('');

  // NEU: State für Startdatum und -zeit
  const [tempStartDate, setTempStartDate] = useState<string>('');
  const [tempStartTime, setTempStartTime] = useState<string>('');

  // NEU: State für Turnier-Navigation
  const [tempShowInNavigation, setTempShowInNavigation] = useState<boolean>(true);

  const isCurrentUserAdmin = useCallback(() => {
    return !!user?.uid && !!tournament?.adminIds?.includes(user.uid);
  }, [user, tournament]);

  useEffect(() => {
    if (instanceId && typeof instanceId === 'string') {
      if (!tournament || tournament.id !== instanceId) {
        fetchTournamentInstanceDetails(instanceId);
      }
      if (tournament && tournament.id === instanceId && storeParticipantsStatus === 'idle') {
        loadTournamentParticipants(instanceId);
      }
    }
  }, [instanceId, fetchTournamentInstanceDetails, tournament, loadTournamentParticipants, storeParticipantsStatus]);

  useEffect(() => {
    if (tournament) {
      const { dateStr, timeStr } = formatTimestampToDateTime(tournament.settings?.scheduledStartTime as Timestamp | undefined);
      setTempStartDate(dateStr);
      setTempStartTime(timeStr);

      // NEU: Merge bestehende Settings mit Defaults (für neue Felder wie matschBonus)
      const scoreSettings = {
        ...TOURNAMENT_DEFAULT_SCORE_SETTINGS,
        ...(tournament.settings?.scoreSettings || {}),
      };
      setTempScoreSettings(scoreSettings);
      setTempStrokeSettings(tournament.settings?.strokeSettings || TOURNAMENT_DEFAULT_STROKE_SETTINGS);
      setTempFarbeSettings(tournament.settings?.farbeSettings || TOURNAMENT_DEFAULT_FARBE_SETTINGS);
      // NEU: Initialisiere Teilnehmerlimits
      setTempMinParticipants(tournament.settings?.minParticipants?.toString() || '4'); // Default 4
      setTempMaxParticipants(tournament.settings?.maxParticipants?.toString() || ''); // Default leer (unbeschränkt)
      
      // NEU: Initialisiere showInNavigation (Default: true)
      setTempShowInNavigation(tournament.showInNavigation ?? true);

      setTempScoreInput({});
      setTempStrokeInput({});
      setTempFarbeInput({});
      setHasChanges(false);
      setName(tournament.name || '');
      setDescription(tournament.description || '');
      // ✅ FIX: Initialisiere rankingMode aus Tournament
      setSelectedRankingMode(tournament.settings?.rankingMode || 'total_points');
    }
  }, [tournament]);

  useEffect(() => {
    if (!tournament) return;
    const nameChanged = name !== (tournament.name || '');
    const descriptionChanged = description !== (tournament.description || '');
    const rankingModeChanged = selectedRankingMode !== (tournament.settings?.rankingMode || 'total_points');
    const scoreSettingsChanged = JSON.stringify(tempScoreSettings) !== JSON.stringify({
      ...TOURNAMENT_DEFAULT_SCORE_SETTINGS,
      ...(tournament.settings?.scoreSettings || {}),
    });
    const strokeSettingsChanged = JSON.stringify(tempStrokeSettings) !== JSON.stringify(tournament.settings?.strokeSettings || TOURNAMENT_DEFAULT_STROKE_SETTINGS);
    const scoreInputChanged = Object.keys(tempScoreInput).length > 0;
    const strokeInputChanged = Object.keys(tempStrokeInput).length > 0;
    const farbeSettingsChanged = JSON.stringify(tempFarbeSettings) !== JSON.stringify(tournament.settings?.farbeSettings || TOURNAMENT_DEFAULT_FARBE_SETTINGS);
    const farbeInputChanged = Object.keys(tempFarbeInput).length > 0;
    // NEU: Änderungen an Teilnehmerlimits prüfen
    const minParticipantsChanged = tempMinParticipants !== (tournament.settings?.minParticipants?.toString() || '4');
    const maxParticipantsChanged = tempMaxParticipants !== (tournament.settings?.maxParticipants?.toString() || '');
    // NEU: Änderungen an Startzeit prüfen
    const initialScheduledTime = tournament.settings?.scheduledStartTime as Timestamp | undefined;
    const currentScheduledTime = combineDateTimeToTimestamp(tempStartDate, tempStartTime);
    const scheduledTimeChanged = 
        ((!initialScheduledTime && currentScheduledTime) || 
        (initialScheduledTime && !currentScheduledTime) || 
        (initialScheduledTime && currentScheduledTime && !initialScheduledTime.isEqual(currentScheduledTime))) ?? false;

    // NEU: Änderungen an showInNavigation prüfen
    const showInNavigationChanged = tempShowInNavigation !== (tournament.showInNavigation ?? true);

    setHasChanges(
      Boolean(
        nameChanged || 
        descriptionChanged || 
        rankingModeChanged || 
        scoreSettingsChanged || 
        strokeSettingsChanged || 
        scoreInputChanged || 
        strokeInputChanged || 
        farbeSettingsChanged || 
        farbeInputChanged ||
        minParticipantsChanged || 
        maxParticipantsChanged ||
        scheduledTimeChanged ||
        showInNavigationChanged
      )
    );
  }, [name, description, selectedRankingMode, tournament, tempScoreSettings, tempStrokeSettings, tempScoreInput, tempStrokeInput, tempFarbeSettings, tempFarbeInput, tempMinParticipants, tempMaxParticipants, tempStartDate, tempStartTime, tempShowInNavigation]);

  const memoizedHandleSaveGeneralSettings = useCallback(async () => {
    if (!tournament || !isCurrentUserAdmin() || !hasChanges || isSubmittingGeneralSettings) return;

    setIsSubmittingGeneralSettings(true);
    setLocalError(null);

    let finalScoreSettings = { ...tempScoreSettings };
    Object.entries(tempScoreInput).forEach(([mode, inputValue]) => {
      if (inputValue !== undefined && inputValue !== null) {
        const value = parseInt(inputValue, 10);
        if (!isNaN(value)) {
          const modeKey = mode as ScoreMode;
          const cleanValue = value < 0 ? 0 : value;
          const newScores = { ...finalScoreSettings.values };
          const newEnabled = { ...finalScoreSettings.enabled };
          if (modeKey === 'sieg') {
            newScores.sieg = cleanValue;
            const halfValue = Math.floor(cleanValue / 2);
            if (newEnabled.berg) newScores.berg = halfValue;
            if (newEnabled.schneider) newScores.schneider = halfValue;
          } else if (modeKey === 'berg') {
            newScores.berg = cleanValue;
             // NEU: Berg-Änderungen beeinflussen Schneider nicht mehr
          } else if (modeKey === 'schneider') {
            // NEU: Schneider kann bis zu Sieg-Punkte gehen (nicht mehr durch Berg begrenzt)
            const maxSchneiderValue = newScores.sieg;
            newScores.schneider = Math.min(cleanValue, maxSchneiderValue);
          }
          finalScoreSettings = { ...finalScoreSettings, values: newScores, enabled: newEnabled };
        }
      }
    });
    setTempScoreInput({});

    let finalStrokeSettings = { ...tempStrokeSettings };
    Object.entries(tempStrokeInput).forEach(([mode, inputValue]) => {
      if (inputValue !== undefined && inputValue !== null) {
        let value = parseInt(inputValue, 10);
        if (!isNaN(value)) {
          value = Math.max(0, Math.min(value, 2));
          if (value > 0 && value !== 1 && value !== 2) value = 2;
          finalStrokeSettings = { ...finalStrokeSettings, [mode as StrokeMode]: value as 0 | 1 | 2 };
        }
      }
    });
    setTempStrokeInput({});
    
    let finalFarbeSettings = { ...tempFarbeSettings };
    Object.entries(tempFarbeInput).forEach(([modeId, inputValue]) => {
        if (inputValue !== undefined && inputValue !== null) {
            const value = parseInt(inputValue, 10);
            if (!isNaN(value)) {
                const modeKey = modeId as FarbeModeKey;
                const cleanValue = Math.max(0, value);
                finalFarbeSettings = {
                    ...finalFarbeSettings,
                    values: {
                        ...finalFarbeSettings.values,
                        [modeKey]: cleanValue,
                    },
                };
            }
        }
    });
    setTempFarbeInput({});

    const settingsUpdates: Partial<TournamentSettings> = {};
    let actualSettingsHaveChanged = false;

    const finalRankingMode = selectedRankingMode || tournament.settings?.rankingMode || 'total_points';
    const currentRankingMode = tournament.settings?.rankingMode || 'total_points';
    if (finalRankingMode !== currentRankingMode) {
        settingsUpdates.rankingMode = finalRankingMode;
        actualSettingsHaveChanged = true;
    }
    
    if (JSON.stringify(finalScoreSettings) !== JSON.stringify({
      ...TOURNAMENT_DEFAULT_SCORE_SETTINGS,
      ...(tournament.settings?.scoreSettings || {}),
    })) {
      settingsUpdates.scoreSettings = finalScoreSettings;
      actualSettingsHaveChanged = true;
    }
    if (JSON.stringify(finalStrokeSettings) !== JSON.stringify(tournament.settings?.strokeSettings || TOURNAMENT_DEFAULT_STROKE_SETTINGS)) {
      settingsUpdates.strokeSettings = finalStrokeSettings;
      actualSettingsHaveChanged = true;
    }
    if (JSON.stringify(finalFarbeSettings) !== JSON.stringify(tournament.settings?.farbeSettings || TOURNAMENT_DEFAULT_FARBE_SETTINGS)) {
      settingsUpdates.farbeSettings = finalFarbeSettings;
      actualSettingsHaveChanged = true;
    }

    const parsedMinParticipants = tempMinParticipants.trim() === '' ? null : parseInt(tempMinParticipants, 10);
    if (!isNaN(Number(parsedMinParticipants)) || parsedMinParticipants === null) {
      const finalMin = parsedMinParticipants === null ? null : (parsedMinParticipants >= 0 ? parsedMinParticipants : 0);
      
      const currentMin = tournament.settings?.minParticipants;
      if (finalMin !== currentMin) {
        settingsUpdates.minParticipants = finalMin;
        actualSettingsHaveChanged = true;
      }
    } else {
      showNotification({ message: "Min. Teilnehmer ist keine gültige Zahl.", type: "error"});
      setIsSubmittingGeneralSettings(false);
      return;
    }

    const parsedMaxParticipants = tempMaxParticipants.trim() === '' ? null : parseInt(tempMaxParticipants, 10);
    if (!isNaN(Number(parsedMaxParticipants)) || parsedMaxParticipants === null) {
      const finalMax = parsedMaxParticipants === null ? null : (parsedMaxParticipants >= 0 ? parsedMaxParticipants : 0);
      
      const currentMax = tournament.settings?.maxParticipants;
      if (finalMax !== currentMax) {
        const minToCheck = settingsUpdates.minParticipants !== undefined ? settingsUpdates.minParticipants : tournament.settings?.minParticipants;
        if (finalMax !== null && minToCheck !== null && minToCheck !== undefined && finalMax < minToCheck) {
          showNotification({ message: "Max. Teilnehmer darf nicht kleiner als Min. Teilnehmer sein.", type: "error"});
          setIsSubmittingGeneralSettings(false);
          return;
        }
        settingsUpdates.maxParticipants = finalMax;
        actualSettingsHaveChanged = true;
      }
    } else {
      showNotification({ message: "Max. Teilnehmer ist keine gültige Zahl.", type: "error"});
      setIsSubmittingGeneralSettings(false);
      return;
    }
    
    // NEU: Verarbeite Startzeit
    const newScheduledTime = combineDateTimeToTimestamp(tempStartDate, tempStartTime);
    const oldScheduledTime = tournament.settings?.scheduledStartTime as Timestamp | undefined;
    if ((!oldScheduledTime && newScheduledTime) || 
        (oldScheduledTime && !newScheduledTime) || 
        (oldScheduledTime && newScheduledTime && !oldScheduledTime.isEqual(newScheduledTime))) {
      // @ts-ignore // Angenommen, scheduledStartTime ist Teil von TournamentSettings
      settingsUpdates.scheduledStartTime = newScheduledTime; 
      actualSettingsHaveChanged = true;
    }

    const nameChanged = name !== (tournament.name || '');
    const descriptionChanged = description !== (tournament.description || '');
    const showInNavigationChanged = tempShowInNavigation !== (tournament.showInNavigation ?? true);
    const baseDetailsChanged = nameChanged || descriptionChanged || showInNavigationChanged;

    // Fall 0: Überhaupt keine Änderungen - sollte durch `!hasChanges` oben abgefangen werden, aber zur Sicherheit
    if (!actualSettingsHaveChanged && !baseDetailsChanged) {
      showNotification({ message: "Keine Änderungen zum Speichern.", type: "info" });
      setIsSubmittingGeneralSettings(false);
      // setHasChanges(false); // Wird durch den Button-State schon indirekt gehandhabt
      return;
    }

    let detailsUpdateSuccess = false; // Geändert: Standardmäßig false, wird bei Erfolg auf true gesetzt
    let settingsUpdateSuccess = false; // Geändert: Standardmäßig false
    let anyErrorOccurred = false;

    try {
      if (baseDetailsChanged) {
        const detailUpdates: { name?: string; description?: string; showInNavigation?: boolean } = {};
        if (nameChanged) detailUpdates.name = name;
        if (descriptionChanged) detailUpdates.description = description;
        if (showInNavigationChanged) detailUpdates.showInNavigation = tempShowInNavigation;
        
        const success = await updateTournamentDetails(tournament.id, detailUpdates);
        if (success) {
          detailsUpdateSuccess = true;
        } else {
          console.error("Fehler beim Aktualisieren der Turnier-Details im Store.");
          // Fehler wurde bereits im Store geloggt und via showNotification angezeigt (hoffentlich)
          setLocalError(prev => prev ? `${prev} Fehler bei Name/Beschreibung.` : "Fehler bei Name/Beschreibung.");
          anyErrorOccurred = true;
        }
      }

      if (actualSettingsHaveChanged) {
        if (Object.keys(settingsUpdates).length > 0) {
            const success = await updateTournamentSettings(tournament.id, settingsUpdates);
            if (success) {
              settingsUpdateSuccess = true;
            } else {
              console.error("Fehler beim Aktualisieren der Turnier-Einstellungen im Store.");
              setLocalError(prev => prev ? `${prev} Fehler bei Turnier-Regeln.` : "Fehler bei Turnier-Regeln.");
              anyErrorOccurred = true;
            }
        } else {
            // Fall, dass actualSettingsHaveChanged true war, aber settingsUpdates leer ist (sollte nicht passieren)
            settingsUpdateSuccess = true; 
        }
      }

      // Benachrichtigungslogik basierend auf dem Erfolg der jeweiligen Operationen
      if (baseDetailsChanged && actualSettingsHaveChanged) { // Beides wurde versucht
        if (detailsUpdateSuccess && settingsUpdateSuccess) {
          showNotification({ message: "Alle Änderungen erfolgreich gespeichert.", type: "success" });
        } else if (detailsUpdateSuccess && !settingsUpdateSuccess) {
          showNotification({ message: "Name/Beschreibung gespeichert, aber Fehler bei den Turnier-Regeln.", type: "warning" });
        } else if (!detailsUpdateSuccess && settingsUpdateSuccess) {
          showNotification({ message: "Turnier-Regeln gespeichert, aber Fehler bei Name/Beschreibung.", type: "warning" });
        } else { // Beides fehlgeschlagen
          // Fehler wurden schon spezifischer geloggt / angezeigt, hier ggf. eine allgemeine Fehlermeldung
          if (!anyErrorOccurred) showNotification({ message: "Fehler beim Speichern der Änderungen.", type: "error" });
        }
      } else if (baseDetailsChanged) { // Nur Details wurden versucht
        if (detailsUpdateSuccess) {
          showNotification({ message: "Turnierinformationen (Name/Beschreibung) erfolgreich gespeichert.", type: "success" });
        } else {
           if (!anyErrorOccurred) showNotification({ message: "Fehler beim Speichern von Name/Beschreibung.", type: "error" });
        }
      } else if (actualSettingsHaveChanged) { // Nur Settings wurden versucht
        if (settingsUpdateSuccess) {
          showNotification({ message: "Turnier-Regeln erfolgreich gespeichert.", type: "success" });
        } else {
           if (!anyErrorOccurred) showNotification({ message: "Fehler beim Speichern der Turnier-Regeln.", type: "error" });
        }
      }

      if (!anyErrorOccurred && (baseDetailsChanged || actualSettingsHaveChanged)) {
        // Nur wenn mindestens eine Operation versucht wurde und KEIN Fehler auftrat,
        // wird hasChanges zurückgesetzt.
        // Die Store-Funktionen sollten fetchTournamentInstanceDetails triggern, um den lokalen State zu aktualisieren.
        setHasChanges(false);
      }

    } catch (err) { 
      const errorMessage = err instanceof Error ? err.message : "Ein unbekannter Fehler ist aufgetreten.";
      console.error("Schwerwiegender Fehler im Speicherprozess der Turnier-Einstellungen:", err);
      setLocalError(errorMessage);
      showNotification({ message: `Systemfehler: ${errorMessage}`, type: "error" });
    } finally {
      setIsSubmittingGeneralSettings(false);
    }
  }, [
    tournament, 
    isCurrentUserAdmin, 
    hasChanges, 
    isSubmittingGeneralSettings, 
    name, 
    description, 
    selectedRankingMode, 
    tempScoreSettings, 
    tempStrokeSettings, 
    tempScoreInput, 
    tempStrokeInput,
    tempFarbeSettings,
    tempFarbeInput,
    tempMinParticipants,
    tempMaxParticipants,
    tempStartDate,
    tempStartTime,
    showNotification,
    updateTournamentDetails,
    updateTournamentSettings
  ]);

  useEffect(() => {
    if (!tournament || !isCurrentUserAdmin()) {
      resetPageCta();
      return;
    }
    setPageCta({
      isVisible: true,
      text: "Speichern",
      onClick: memoizedHandleSaveGeneralSettings,
      loading: isSubmittingGeneralSettings,
      disabled: isSubmittingGeneralSettings || !hasChanges,
      variant: "info",
    });
    return () => resetPageCta();
  }, [tournament, isCurrentUserAdmin, isSubmittingGeneralSettings, hasChanges, name, description, selectedRankingMode, tempScoreSettings, tempStrokeSettings, tempScoreInput, tempStrokeInput, tempFarbeSettings, tempFarbeInput, setPageCta, resetPageCta, memoizedHandleSaveGeneralSettings, tempMinParticipants, tempMaxParticipants, tempStartDate, tempStartTime, tempShowInNavigation]);

  const handleParticipantAction = async (participantId: string, participantUid: string | null | undefined, actionType: 'removeParticipant' | 'makeAdmin' | 'removeAdmin') => {
    if (!tournament || !isCurrentUserAdmin() || !participantUid) {
        showNotification({message: "Aktion nicht möglich oder User-ID fehlt.", type: "error"});
        return;
    }

    setActionLoading(prev => ({ ...prev, [participantId]: true }));
    let success = false;
    try {
      switch (actionType) {
        case 'removeParticipant':
          success = await removeParticipant(tournament.id, participantUid);
          break;
        case 'makeAdmin':
          success = await makeParticipantAdmin(tournament.id, participantUid);
          break;
        case 'removeAdmin':
          success = await removeParticipantAdmin(tournament.id, participantUid);
          break;
        default:
          throw new Error("Unbekannte Aktion");
      }

      if (success) {
        showNotification({ message: `Aktion '${actionType}' erfolgreich ausgeführt.`, type: 'success' });
        fetchTournamentInstanceDetails(tournament.id);
      } else {
        const currentError = useTournamentStore.getState().error;
        showNotification({ message: currentError || `Aktion '${actionType}' fehlgeschlagen.`, type: 'error' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : `Fehler bei Aktion ${actionType}.`;
      showNotification({ message: msg, type: 'error' });
    }
    setActionLoading(prev => ({ ...prev, [participantId]: false }));
  };

  const handleScoreInputChange = (mode: ScoreMode, inputValue: string) => {
    const cleanInputValue = inputValue.replace(/[^0-9]/g, '');
    setTempScoreInput(prev => ({ ...prev, [mode]: cleanInputValue }));

    if (cleanInputValue !== '') {
        const numericValue = parseInt(cleanInputValue, 10);
        if (!isNaN(numericValue)) {
            const currentEnabled = tempScoreSettings.enabled;
            let currentSiegValue = tempScoreSettings.values.sieg;
            if (mode === 'sieg') {
                 currentSiegValue = numericValue;
            } else if (tempScoreInput.sieg !== undefined && tempScoreInput.sieg !== '') {
                 const siegInputNumeric = parseInt(tempScoreInput.sieg, 10);
                 if (!isNaN(siegInputNumeric)) currentSiegValue = siegInputNumeric;
            }

            if (mode === 'sieg') {
                const halfValue = Math.floor(numericValue / 2);
                if (currentEnabled.berg) {
                    setTempScoreInput(prev => ({ ...prev, berg: halfValue.toString() }));
                }
                if (currentEnabled.schneider) {
                     setTempScoreInput(prev => ({ ...prev, schneider: halfValue.toString() }));
                }
            } else if (mode === 'berg') {
                // NEU: Berg-Änderungen beeinflussen Schneider nicht mehr
            }
        }
    } else {
         if (mode === 'sieg') {
            setTempScoreInput(prev => ({ ...prev, berg: undefined, schneider: undefined }));
         } else if (mode === 'berg') {
            // NEU: Berg-Änderungen beeinflussen Schneider nicht mehr
         }
    }
  };

  const handleScoreToggle = (mode: ScoreMode) => {
    setTempScoreSettings(prev => {
        const newEnabled = { ...prev.enabled, [mode]: !prev.enabled[mode] };
        const newValues = { ...prev.values };

        if (mode === 'berg' && !newEnabled.berg && newEnabled.schneider) {
            newValues.schneider = Math.min(newValues.schneider, Math.floor(newValues.sieg / 2));
        }
        if (mode === 'berg' && newEnabled.berg && newEnabled.schneider) {
            newValues.schneider = Math.min(newValues.schneider, newValues.berg);
        }
        
        return { ...prev, values: newValues, enabled: newEnabled };
    });
  };

  // NEU: Handler für Matschbonus-Toggle
  const handleMatschBonusToggle = () => {
    setTempScoreSettings(prev => ({
        ...prev,
        matschBonus: !prev.matschBonus
    }));
  };

  const handleStrokeInputChange = (mode: StrokeMode, inputValue: string) => {
    setTempStrokeInput(prev => ({ ...prev, [mode]: inputValue.replace(/[^0-9]/g, '') }));
  };

  const handleFarbeInputChange = (modeId: FarbeModeKey, inputValue: string) => {
    setTempFarbeInput(prev => ({ ...prev, [modeId]: inputValue.replace(/[^0-9]/g, '') }));
  };

  const handleCardStyleChange = (style: CardStyle) => {
    setTempFarbeSettings(prev => ({ ...prev, cardStyle: style }));
  };

  const renderScoreSettings = () => {
    return (
      <Card className="bg-gray-800/50 border-gray-700/50 shadow-inner mt-4">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-base text-gray-200">Punkte-Ziele & Modi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 pb-4">
          {SCORE_MODES.map((scoreMode) => {
            if (scoreMode.id === 'sieg') {
              return (
                <div key={scoreMode.id} className="flex items-center justify-between space-x-2 p-2 rounded-md hover:bg-gray-700/30">
                  <Label htmlFor={`score-${scoreMode.id}`} className="font-medium text-gray-300">{scoreMode.name}</Label>
                  <Input id={`score-${scoreMode.id}`} type="number" inputMode="numeric" pattern="[0-9]*"
                    className="w-24 bg-gray-700 border-gray-600 text-white text-right"
                    value={tempScoreInput[scoreMode.id] ?? tempScoreSettings.values[scoreMode.id]}
                    onChange={(e) => handleScoreInputChange(scoreMode.id, e.target.value)}
                    onFocus={(e) => {
 e.target.select(); setTimeout(() => e.target.select(), 0);
}}
                  />
                </div>
              );
            }
            return (
              <div key={scoreMode.id} className="bg-gray-700/40 rounded-lg overflow-hidden border border-gray-600/40">
                <div className="flex items-center justify-between p-3 border-b border-gray-600/40">
                  <Label htmlFor={`toggle-${scoreMode.id}`} className="font-medium text-gray-300">{scoreMode.name} aktiviert</Label>
                  <Switch id={`toggle-${scoreMode.id}`} checked={tempScoreSettings.enabled[scoreMode.id]} onCheckedChange={() => handleScoreToggle(scoreMode.id)}
                    className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-600"
                  />
                </div>
                {tempScoreSettings.enabled[scoreMode.id] && (
                  <div className="flex items-center justify-between p-3">
                    <Label htmlFor={`score-${scoreMode.id}`} className="font-medium text-gray-300">{scoreMode.name}-Punkte</Label>
                    <Input id={`score-${scoreMode.id}`} type="number" inputMode="numeric" pattern="[0-9]*"
                      className="w-24 bg-gray-700 border-gray-600 text-white text-right"
                      value={tempScoreInput[scoreMode.id] ?? tempScoreSettings.values[scoreMode.id]}
                      onChange={(e) => handleScoreInputChange(scoreMode.id, e.target.value)}
                      onFocus={(e) => {
 e.target.select(); setTimeout(() => e.target.select(), 0);
}}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {/* NEU: Matschbonus */}
          <div className="bg-gray-700/40 rounded-lg overflow-hidden border border-gray-600/40">
            <div className="flex items-center justify-between p-3">
              <div className="flex-1">
                <Label htmlFor="toggle-matschbonus" className="font-medium text-gray-300">Matschbonus aktiviert</Label>
                <p className="text-xs text-gray-400 mt-1">
                  Bei einem Matsch werden 100 Bonuspunkte hinzugefügt (Total: 257 Punkte)
                </p>
              </div>
              <Switch id="toggle-matschbonus" checked={tempScoreSettings.matschBonus} onCheckedChange={() => handleMatschBonusToggle()}
                className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-600"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderStrokeSettings = () => {
    return (
        <Card className="bg-gray-800/50 border-gray-700/50 shadow-inner mt-4">
            <CardHeader className="pb-3 pt-4">
                <CardTitle className="text-base text-gray-200">Striche Zuweisung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 pb-4">
                {STROKE_MODES.map((mode) => (
                    <div key={mode} className="flex items-center justify-between space-x-4 p-2 rounded-md hover:bg-gray-700/30">
                        <Label htmlFor={`stroke-${mode}`} className="font-medium capitalize flex-1 text-gray-300">
                            {mode.replace(/([A-Z])/g, ' $1').trim()}
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
      <Card className="bg-gray-800/50 border-gray-700/50 shadow-inner mt-4">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-base text-gray-200">Farben & Kartensatz</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 pb-4">
          <div className="flex items-center justify-between space-x-2 p-2 rounded-md hover:bg-gray-700/30 mb-3 border-b border-gray-600/40 pb-3">
            <Label className="font-medium text-gray-300">Kartensatz</Label>
            <div className="flex gap-2">
              <Button type="button" variant={tempFarbeSettings.cardStyle === 'DE' ? 'default' : 'outline'} size="sm"
                onClick={() => handleCardStyleChange('DE')}
                className={`min-w-[50px] text-center font-semibold ${tempFarbeSettings.cardStyle === 'DE' ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600' : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600 hover:text-gray-300'}`}
              >DE</Button>
              <Button type="button" variant={tempFarbeSettings.cardStyle === 'FR' ? 'default' : 'outline'} size="sm"
                onClick={() => handleCardStyleChange('FR')}
                className={`min-w-[50px] text-center font-semibold ${tempFarbeSettings.cardStyle === 'FR' ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600' : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600 hover:text-gray-300'}`}
              >FR</Button>
            </div>
          </div>
          <div className="border-t border-gray-600/40 pt-3 space-y-2">
            <h4 className="text-sm font-medium text-gray-300 mb-1">Multiplikatoren</h4>
            {FARBE_MODES.map((mode) => {
                const multiplier = tempFarbeSettings.values[mode.id as FarbeModeKey] ?? 1;
                const isInactive = multiplier === 0;
                // NEU: Dynamischer Anzeigename basierend auf cardStyle
                const mappedColorKey = toTitleCase(mode.id as string);
                const displayName = CARD_SYMBOL_MAPPINGS[mappedColorKey as JassColor]?.[tempFarbeSettings.cardStyle] ?? mappedColorKey;

                return (
                    <div key={mode.id}
                        className={`flex items-center justify-between space-x-3 p-2 rounded-md transition-opacity duration-200 ${isInactive ? 'opacity-60 hover:bg-gray-700/20' : 'hover:bg-gray-700/30'}`}>
                         <div className="flex items-center space-x-2 flex-1">
                            <FarbePictogram farbe={mode.name as JassColor} mode="svg" cardStyle={tempFarbeSettings.cardStyle} className="w-5 h-5 flex-shrink-0" />
                            <Label htmlFor={`farbe-${mode.id}`} className="font-medium text-gray-300">{displayName}</Label>
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

  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const handleCompleteTournament = async () => {
    if (!instanceId || typeof instanceId !== 'string' || !tournament) {
      toast.error("Turnierdetails nicht gefunden.");
      return;
    }
    if (tournament.status !== 'active') {
      toast.info("Dieses Turnier ist nicht aktiv und kann nicht abgeschlossen werden.");
      setShowCompleteDialog(false);
      return;
    }

    setIsCompleting(true);
    try {
      const success = await completeTournamentAction(instanceId);
      if (success) {
        toast.success("Turnier erfolgreich abgeschlossen!");
      } else {
        toast.error(tournamentError || "Fehler beim Abschliessen des Turniers.");
      }
    } catch (error) {
      console.error("Fehler beim Abschliessen des Turniers:", error);
      toast.error("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setIsCompleting(false);
      setShowCompleteDialog(false);
    }
  };

  const handlePauseTournament = async () => {
    if (!instanceId || typeof instanceId !== 'string' || !tournament) {
      toast.error("Turnierdetails nicht gefunden.");
      return;
    }
    if (tournament.status !== 'active') {
      toast.info("Nur aktive Turniere können unterbrochen werden.");
      setShowPauseDialog(false);
      return;
    }

    setIsPausing(true);
    try {
      const success = await pauseTournament(instanceId);
      if (success) {
        toast.success("Turnier erfolgreich unterbrochen! Ein jassGameSummaries Eintrag wurde erstellt.");
      } else {
        toast.error(tournamentError || "Fehler beim Unterbrechen des Turniers.");
      }
    } catch (error) {
      console.error("Fehler beim Unterbrechen des Turniers:", error);
      toast.error("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setIsPausing(false);
      setShowPauseDialog(false);
    }
  };

  const handleResumeTournament = async () => {
    if (!instanceId || typeof instanceId !== 'string' || !tournament) {
      toast.error("Turnierdetails nicht gefunden.");
      return;
    }
    if (tournament.status !== 'active') {
      toast.info("Nur aktive Turniere können fortgesetzt werden.");
      return;
    }

    setIsResuming(true);
    try {
      const success = await resumeTournament(instanceId);
      if (success) {
        toast.success("Turnier erfolgreich fortgesetzt!");
      } else {
        toast.error(tournamentError || "Fehler beim Fortsetzen des Turniers.");
      }
    } catch (error) {
      console.error("Fehler beim Fortsetzen des Turniers:", error);
      toast.error("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setIsResuming(false);
    }
  };

  const handleActivateTournament = async () => {
    if (!instanceId || !tournament || tournament.status !== 'upcoming' || !isCurrentUserAdmin()) {
      toast.error("Turnier kann nicht gestartet werden oder du bist kein Admin.");
      return;
    }

    // ID für die Notification speichern, um sie später entfernen zu können
    let notificationId: string | null = null;

    const clearNotification = () => {
      if (notificationId && uiStore.removeNotification) {
        uiStore.removeNotification(notificationId);
        notificationId = null;
      }
    };

    notificationId = uiStore.showNotification({
      message: "Möchtest du das Turnier wirklich starten? Dies kann nicht rückgängig gemacht werden.",
      type: "success",
      preventClose: true,
      actions: [
        {
          label: "Abbrechen",
          onClick: () => {
            clearNotification();
          }
        },
        {
          label: "STARTEN",
          onClick: async () => {
            if (isActivating) return;
            setIsActivating(true);
            clearNotification();
            try {
              const success = await activateTournament(instanceId);
              if (success) {
                toast.success("Turnier erfolgreich gestartet!");
              } else {
                const currentError = useTournamentStore.getState().error;
                if (!currentError) {
                    toast.error("Fehler beim Starten des Turniers.");
                }
              }
            } catch (error) {
              console.error("Fehler beim Starten des Turniers:", error);
              toast.error("Ein unerwarteter Fehler ist aufgetreten.");
            } finally {
              setIsActivating(false);
            }
          }
        }
      ]
    });
  };

  const handleDeleteTournament = async () => {
    setIsDeleting(true);
    toast.info("Die Funktion zum Löschen von Turnieren ist noch nicht implementiert.");
    setIsDeleting(false);
    setShowDeleteDialog(false);
  };

  if (authStatus === 'loading' || !instanceId || (isLoadingGlobal && !tournament)) {
    return (
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400 mr-3" />
           <span>Lade Turniereinstellungen...</span>
        </div>
      </MainLayout>
    );
  }

  if (!tournament) {
      return (
        <MainLayout>
          <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
             <AlertTriangle className="h-8 w-8 text-red-500 mr-3" />
             <span>Turnier nicht gefunden oder Zugriff verweigert.</span>
          </div>
        </MainLayout>
      );
  }

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8 text-white">
         <div className="flex items-center mb-6">
            <Button variant="ghost" size="icon" onClick={() => router.push(`/view/tournament/${instanceId}`)} className="mr-4 hover:bg-gray-700">
                <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold flex items-center">
                <Settings className="mr-2 h-6 w-6 text-purple-400" />
                Turnier-Einstellungen
            </h1>
         </div>

        {localError && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-md text-red-300">
                {localError}
            </div>
        )}

        <div className="max-w-2xl mx-auto space-y-8">
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Grundinformationen</CardTitle>
                <CardDescription className="text-gray-400">Name und Beschreibung des Turniers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-gray-200">Turniername</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} 
                         className="bg-gray-700 border-gray-600 text-white"/>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-gray-200">Beschreibung (Optional)</Label>
                  <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} 
                            className="bg-gray-700 border-gray-600 text-white min-h-[80px]"/>
                </div>
                {/* NEU: Eingabefelder für Startdatum und -zeit */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="startDate" className="text-gray-200">Startdatum</Label>
                    <Input id="startDate" type="date" value={tempStartDate} 
                           key={`startdate-${tempStartDate}`}
                           onChange={(e) => setTempStartDate(e.target.value)}
                           className="bg-gray-700 border-gray-600 text-white"/>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startTime" className="text-gray-200">Startzeit</Label>
                    <Input id="startTime" type="time" value={tempStartTime} 
                           key={`starttime-${tempStartTime}`}
                           onChange={(e) => setTempStartTime(e.target.value)}
                           className="bg-gray-700 border-gray-600 text-white"/>
                  </div>
                </div>
              </CardContent>
            </Card>

             <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><BarChart className="w-5 h-5" />Turnier-Regeln</CardTitle>
                <CardDescription className="text-gray-400">Wie wird die Rangliste berechnet und welche Jass-Regeln gelten?</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-6">
                  <Label className="text-gray-200 mb-1 block font-medium">Ranglisten-Modus</Label>
                  <Select
                    value={selectedRankingMode}
                    onValueChange={(value: TournamentSettings['rankingMode']) => setSelectedRankingMode(value)}
                    disabled={isSubmittingGeneralSettings || isLoadingGlobal}
                  >
                    <SelectTrigger id="rankingMode" className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue placeholder="Ranking-Modus auswählen..." />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      {RANKING_MODES.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value} className="hover:bg-gray-700 focus:bg-gray-700">
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Tabs defaultValue="punkte" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-gray-700/50 p-1 rounded-lg mb-3">
                    <TabsTrigger value="punkte" className="data-[state=active]:bg-purple-600/80 data-[state=active]:text-white text-gray-300 hover:bg-gray-600/50 rounded-md py-1.5 text-sm">Punkte</TabsTrigger>
                    <TabsTrigger value="striche" className="data-[state=active]:bg-purple-600/80 data-[state=active]:text-white text-gray-300 hover:bg-gray-600/50 rounded-md py-1.5 text-sm">Striche</TabsTrigger>
                    <TabsTrigger value="farben" className="data-[state=active]:bg-purple-600/80 data-[state=active]:text-white text-gray-300 hover:bg-gray-600/50 rounded-md py-1.5 text-sm">Farben</TabsTrigger>
                  </TabsList>
                  <TabsContent value="punkte">{renderScoreSettings()}</TabsContent>
                  <TabsContent value="striche">{renderStrokeSettings()}</TabsContent>
                  <TabsContent value="farben">{renderFarbeSettings()}</TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* NEU: Turnier-Navigation Container */}
            <Card className="bg-gray-800 border-gray-700 mt-6">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Turnier-Anzeige
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Bestimme, ob das Turnier in der Navigation für alle Gruppenmitglieder sichtbar ist.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-700/40 rounded-lg overflow-hidden border border-gray-600/40">
                  <div className="flex items-center justify-between p-3">
                    <div className="flex-1">
                      <Label htmlFor="toggle-show-in-navigation" className="font-medium text-gray-300">
                        Turnier in Navigation einblenden
                      </Label>
                      <p className="text-xs text-gray-400 mt-1">
                        Wenn aktiviert, bleibt das Turnier-Icon in der Navigation sichtbar, bis es manuell ausgeblendet oder durch ein neues Turnier ersetzt wird.
                      </p>
                    </div>
                    <Switch 
                      id="toggle-show-in-navigation" 
                      checked={tempShowInNavigation} 
                      onCheckedChange={(checked) => setTempShowInNavigation(checked)}
                      disabled={!isCurrentUserAdmin() || isLoadingGlobal}
                      className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-600"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

             <Card className="bg-gray-800 border-gray-700 mt-6">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Users className="w-5 h-5" />Teilnehmer & Admins</CardTitle>
                 <CardDescription className="text-gray-400">Verwalte, wer am Turnier teilnimmt und wer es administrieren darf.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => setIsInviteModalOpen(true)}
                  disabled={!isCurrentUserAdmin() || isLoadingGlobal} 
                  className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2 mb-3"
                >
                  <UserPlus className="w-4 h-4 mr-1"/> Teilnehmer per Link einladen
                </Button>

                {tournament?.groupId && (
                  <Button 
                    onClick={() => setIsAddFromGroupModalOpen(true)}
                    disabled={!isCurrentUserAdmin() || isLoadingGlobal} 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 mb-6"
                  >
                    <Users className="w-4 h-4 mr-1"/> Aus Gruppe hinzufügen...
                  </Button>
                )}

                {storeParticipantsStatus === 'loading' && !storeParticipants.length ? (
                  <div className="flex justify-center items-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-400">Lade Teilnehmer...</span>
                  </div>
                ) : storeParticipants.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">Noch keine Teilnehmer im Turnier.</p>
                ) : (
                  <ul className="space-y-3">
                    {storeParticipants.sort((a, b) => {
                        const aIsAdmin = tournament?.adminIds.includes(a.userId || '');
                        const bIsAdmin = tournament?.adminIds.includes(b.userId || '');
                        if (aIsAdmin && !bIsAdmin) return -1;
                        if (!aIsAdmin && bIsAdmin) return 1;
                        return (a.displayName || '').localeCompare(b.displayName || '');
                      }).map((participant, index) => {
                      const isParticipantAdmin = tournament.adminIds.includes(participant.userId || '');
                      const isSelf = user?.uid === participant.userId;
                      const isLoadingAction = actionLoading[participant.id] || false;
                      const canManageParticipant = isCurrentUserAdmin() && !isSelf;
                      const isLastAdmin = isParticipantAdmin && tournament.adminIds.length === 1;
                      const isCreator = participant.userId === tournament.createdBy;

                      return (
                        <li key={participant.id || participant.userId || `participant-${index}`} className="flex items-center justify-between space-x-3 p-3 bg-gray-700/50 rounded-lg">
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <Avatar className="h-9 w-9 flex-shrink-0">
                              <AvatarImage src={participant.photoURL || undefined} alt={participant.displayName || 'Avatar'} />
                              <AvatarFallback className="bg-gray-600 text-gray-300">
                                {participant.displayName?.charAt(0).toUpperCase() || "P"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {participant.displayName || "Unbekannter Spieler"}
                                {isSelf && <span className="ml-1.5 text-xs text-blue-400">(Du)</span>}
                              </p>
                              {isParticipantAdmin && (
                                <Badge variant="outline" className="mt-1 border-purple-500 text-purple-300 bg-purple-900/30 px-1.5 py-0.5 text-xs">
                                  <Crown className="w-3 h-3 mr-1" /> Admin
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {isCurrentUserAdmin() && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Admin-Aktionen (links vom Entfernen-Button) */}
                              {canManageParticipant && !isParticipantAdmin && (
                                <AlertDialog>
                                   <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-green-500 hover:text-green-400 hover:bg-green-900/30 w-9 h-9 p-1.5" disabled={isLoadingAction || isLoadingGlobal} title="Zum Admin ernennen">
                                      {isLoadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserCog className="w-5 h-5" />}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                                    <AlertDialogHeader><AlertDialogTitle>Zum Admin ernennen?</AlertDialogTitle>
                                      <AlertDialogDescription className="text-gray-400">
                                        Möchtest du "{participant.displayName}" zum Turnier-Admin ernennen?
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="border-red-700 bg-red-900/50 hover:bg-red-800 text-white">Abbrechen</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleParticipantAction(participant.id, participant.userId, 'makeAdmin')} className="bg-green-600 hover:bg-green-700 text-white">Ernennen</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              {canManageParticipant && isParticipantAdmin && !isLastAdmin && !isCreator && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-yellow-500 hover:text-yellow-400 hover:bg-yellow-900/30 w-9 h-9 p-1.5" disabled={isLoadingAction || isLoadingGlobal} title={isCreator ? "Gründer kann nicht entfernt werden" : "Admin-Status entziehen"}>
                                      {isLoadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserCog className="w-5 h-5" />}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                                    <AlertDialogHeader><AlertDialogTitle>Admin-Status entziehen?</AlertDialogTitle>
                                      <AlertDialogDescription className="text-gray-400">
                                        Möchtest du "{participant.displayName}" den Admin-Status entziehen?
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="border-red-700 bg-red-900/50 hover:bg-red-800 text-white">Abbrechen</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleParticipantAction(participant.id, participant.userId, 'removeAdmin')} className="bg-yellow-600 hover:bg-yellow-700 text-white">Entziehen</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              {/* Entfernen-Aktion (ganz rechts) */}
                              {!isSelf && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      {/* Versuche Button mit sichtbarem Rand, ansonsten Fallback zu ghost */} 
                                      <Button variant="outline" size="icon" className="border-red-700 text-red-500 hover:text-red-400 hover:bg-red-900/20 hover:border-red-600 w-9 h-9 p-1.5" disabled={isLoadingAction || isLoadingGlobal} title="Teilnehmer entfernen">
                                        {isLoadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <X className="w-5 h-5" />}
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                                      <AlertDialogHeader><AlertDialogTitle>Teilnehmer entfernen?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-gray-400">
                                          Möchtest du "{participant.displayName}" wirklich aus dem Turnier entfernen?
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel className="border-red-700 bg-red-900/50 hover:bg-red-800 text-white">Abbrechen</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleParticipantAction(participant.id, participant.userId, 'removeParticipant')} className="bg-red-600 hover:bg-red-700 text-white">Entfernen</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* NEU: Gefahrenzone mit spezifischen Aktionen */} 
            {isCurrentUserAdmin() && (
              <Card className="bg-red-900/20 border-red-900/50">
                  <CardHeader><CardTitle className="text-red-300">Gefahrenzone & Turnierstatus</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {/* Aktuellen Turnierstatus anzeigen */}
                    <div className="p-3 rounded-md bg-gray-700/50 border border-gray-600/50">
                      <h4 className="font-medium text-gray-200">Aktueller Status</h4>
                      <p className="text-lg font-semibold mt-1">
                        {tournament?.status === 'upcoming' && <span className="text-yellow-400">Anstehend</span>}
                        {tournament?.status === 'active' && (
                          <span className="text-green-400">
                            {(tournament as any).pausedAt ? 'Aktiv (unterbrochen)' : 'Aktiv'}
                          </span>
                        )}
                        {tournament?.status === 'completed' && <span className="text-blue-400">Abgeschlossen</span>}
                        {tournament?.status === 'archived' && <span className="text-gray-500">Archiviert</span>}
                      </p>
                      {tournament?.status === 'completed' && tournament.completedAt && typeof (tournament.completedAt as any).toDate === 'function' && (
                        // @ts-ignore
                        <p className="text-xs text-gray-400">Abgeschlossen am {new Date((tournament.completedAt as any).toDate()).toLocaleDateString('de-CH')}</p>
                      )}
                      {tournament?.status === 'active' && (tournament as any).pausedAt && typeof ((tournament as any).pausedAt as any).toDate === 'function' && (
                        // @ts-ignore
                        <p className="text-xs text-yellow-400">Unterbrochen am {new Date(((tournament as any).pausedAt as any).toDate()).toLocaleDateString('de-CH')}</p>
                      )}
                    </div>
                    
                    {/* Turnier starten Button, wenn Status upcoming */}
                    {tournament?.status === 'upcoming' && (
                      <div>
                        <h4 className="font-medium text-gray-200">Turnier starten</h4>
                        <p className="text-sm text-gray-400 mt-1 mb-3">
                          Setze den Status dieses Turniers auf "Aktiv". Sobald es aktiv ist, können Passen gestartet werden.
                        </p>
                        <Button 
                          onClick={handleActivateTournament} 
                          disabled={isActivating || isLoadingGlobal}
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                        >
                          {isActivating ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Wird gestartet...</>
                          ) : (
                            "Turnier jetzt starten"
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Turnier unterbrechen/fortsetzen nur anzeigen, wenn aktiv */} 
                    {tournament?.status === 'active' && (
                      <div className="space-y-4">
                        {/* Unterbrechen */}
                        <div>
                          <h4 className="font-medium text-gray-200">Turnier unterbrechen</h4>
                          <p className="text-sm text-gray-400 mt-1 mb-3">
                            Unterbricht das Turnier und erstellt einen jassGameSummaries Eintrag. 
                            Das Turnier bleibt aktiv und kann später fortgesetzt werden.
                          </p>
                          <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
                            <DialogTrigger asChild>
                              <Button variant="outline" className="border-yellow-700 bg-yellow-900/50 hover:bg-yellow-800 text-yellow-300">
                                Turnier unterbrechen
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Turnier wirklich unterbrechen?</DialogTitle>
                                <DialogDescription>
                                  Das Turnier wird unterbrochen und ein jassGameSummaries Eintrag wird erstellt. 
                                  Das Turnier bleibt aktiv und kann später fortgesetzt werden.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <Button
                                  variant="outline"
                                  onClick={() => setShowPauseDialog(false)}
                                  disabled={isPausing}
                                  className="border-gray-700 bg-gray-900/50 hover:bg-gray-800 text-white"
                                >
                                  Abbrechen
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={handlePauseTournament}
                                  disabled={isPausing}
                                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                                >
                                  {isPausing ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Wird unterbrochen...
                                    </>
                                  ) : (
                                    'Unterbrechen'
                                  )}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>

                        {/* Fortsetzen (nur wenn unterbrochen) */}
                        {(tournament as any).pausedAt && (
                          <div>
                            <h4 className="font-medium text-gray-200">Turnier fortsetzen</h4>
                            <p className="text-sm text-gray-400 mt-1 mb-3">
                              Setzt das unterbrochene Turnier fort. Neue Passen können gestartet werden.
                            </p>
                            <Button 
                              onClick={handleResumeTournament}
                              disabled={isResuming || isLoadingGlobal}
                              className="w-full bg-green-600 hover:bg-green-700 text-white"
                            >
                              {isResuming ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Wird fortgesetzt...
                                </>
                              ) : (
                                "Turnier fortsetzen"
                              )}
                            </Button>
                          </div>
                        )}

                        {/* Abschließen (Legacy-Option) */}
                        <div className="border-t border-gray-600/40 pt-4">
                          <h4 className="font-medium text-gray-200">Turnier endgültig abschliessen</h4>
                          <p className="text-sm text-gray-400 mt-1 mb-3">
                            Markiere dieses Turnier als abgeschlossen. Dies kann nicht rückgängig gemacht werden.
                          </p>
                          <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
                            <DialogTrigger asChild>
                              <Button variant="outline" className="border-red-700 bg-red-900/50 hover:bg-red-800 text-red-300">
                                Turnier abschliessen
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Turnier wirklich abschliessen?</DialogTitle>
                                <DialogDescription>
                                  Wenn du dieses Turnier abschliesst, wird es als beendet
                                  markiert und ist nicht mehr aktiv. Möchtest du
                                  fortfahren?
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <Button
                                  variant="outline"
                                  onClick={() => setShowCompleteDialog(false)}
                                  disabled={isCompleting}
                                  className="border-gray-700 bg-gray-900/50 hover:bg-gray-800 text-white"
                                >
                                  Abbrechen
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={handleCompleteTournament}
                                  disabled={isCompleting}
                                >
                                  {isCompleting ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Wird abgeschlossen...
                                    </>
                                  ) : (
                                    'Abschliessen'
                                  )}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    )}
                    {/* Info anzeigen, wenn abgeschlossen */} 
                    {tournament?.status === 'completed' && (
                        <div className="p-3 rounded-md bg-green-900/30 border border-green-700/50">
                            <h4 className="font-medium text-green-300">Turnier abgeschlossen</h4>
                            <p className="text-sm text-green-400/80 mt-1">
                              Dieses Turnier wurde bereits als abgeschlossen markiert.
                              {tournament.completedAt && typeof (tournament.completedAt as any).toDate === 'function' 
                                // @ts-ignore
                                ? ` (am ${new Date((tournament.completedAt as any).toDate()).toLocaleDateString('de-CH')})` 
                                : ''}
                            </p>
                        </div>
                    )}
                    {/* Turnier löschen (Platzhalter/Deaktiviert) */} 
                    <div>
                      <h4 className="font-medium text-gray-200">Turnier löschen</h4>
                      <p className="text-sm text-gray-400 mt-1 mb-3">Das endgültige Löschen von Turnieren ist derzeit nicht vorgesehen, um historische Daten zu erhalten.</p>
                      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" className="bg-red-700 hover:bg-red-800 border-red-900 text-white" disabled={true} /* Immer deaktiviert */ >
                            <Trash2 className="w-4 h-4 mr-2"/> Turnier löschen (Deaktiviert)
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                          <AlertDialogHeader><AlertDialogTitle>Turnier wirklich löschen?</AlertDialogTitle><AlertDialogDescription className="text-gray-400">Diese Funktion ist aktuell nicht verfügbar.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="border-red-700 bg-red-900/50 hover:bg-red-800 text-white">Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteTournament} className="bg-red-600 hover:bg-red-700 text-white" disabled={true}>Ja, löschen</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
              </Card>
            )}
        </div>
      </div>

      <TournamentInviteModal 
           isOpen={isInviteModalOpen} 
           onClose={() => setIsInviteModalOpen(false)} 
           tournamentId={tournament?.id} 
           tournamentName={tournament?.name}
      />

      {tournament?.groupId && (
        <AddParticipantsFromGroupModal 
          isOpen={isAddFromGroupModalOpen} 
          onClose={() => setIsAddFromGroupModalOpen(false)} 
          tournamentId={tournament?.id} 
          groupId={tournament?.groupId}
        />
      )}

    </MainLayout>
  );
};

export default TournamentSettingsPage; 