"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import type { CompletedGameSummary, JassSession, RoundEntry } from '@/types/jass'; // RoundEntry hinzugefügt
import FullscreenLoader from '@/components/ui/FullscreenLoader';
import MainLayout from '@/components/layout/MainLayout';
import { ArrowLeft } from 'lucide-react'; // <-- Import ArrowLeft icon
// Firestore imports hinzufügen
import { getFirestore, doc, collection, getDoc, getDocs, query, orderBy, Timestamp as ClientTimestamp } from 'firebase/firestore';
import { firebaseApp } from '@/services/firebaseInit'; // Client-seitige Firebase App importieren
// Importiere die Anzeige-Komponente und Defaults
import GameViewerKreidetafel from '@/components/layout/GameViewerKreidetafel';
// NEU: UIStore importieren
import { useUIStore } from '@/store/uiStore';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { format } from 'date-fns'; // Für Datumsformatierung im Titel
// NEU: Importiere benötigte Typen aus jass Typen
import type { StrokeSettings, CardStyle, PlayerNames, TeamScores, StricheRecord, ScoreSettings } from '@/types/jass';
// Entferne den Import von FirestoreGroup, definiere es lokal
// import type { FirestoreGroup } from '@/store/groupStore';

// --- HILFSFUNKTIONEN FÜR TIMESTAMPS (ähnlich wie in [activeGameId].tsx) ---
function parseFirebaseTimestamp(timestamp: any): number | null {
    if (!timestamp) return null;

    // 1. Echte Firebase ClientTimestamp Instanz
    if (timestamp instanceof ClientTimestamp) {
        return timestamp.toMillis();
    }

    // 2. Objekt-Struktur prüfen (könnte Firebase Timestamp oder einfache Map sein)
    if (typeof timestamp === 'object' && timestamp !== null) {
        // 2a. Wenn es eine toDate-Funktion hat, ist es wahrscheinlich ein echter Timestamp
        if (typeof (timestamp as any).toDate === 'function') {
            try {
                return (timestamp as any).toDate().getTime();
            } catch (e) {
                // Fall-through zu anderen Checks
            }
        }

        // 2b. Prüfung für Objekte mit seconds/nanoseconds (z.B. manuell erstellte Maps)
        const secondsProp = (timestamp as any).seconds ?? (timestamp as any)._seconds;
        const nanosecondsProp = (timestamp as any).nanoseconds ?? (timestamp as any)._nanoseconds;

        if (typeof secondsProp === 'number' && typeof nanosecondsProp === 'number') {
            try {
                return new ClientTimestamp(secondsProp, nanosecondsProp).toMillis();
            } catch (e) {
                // Fall-through zu anderen Checks
            }
        }
    }

    // 3. ISO-String prüfen
    if (typeof timestamp === 'string') {
        try {
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                return date.getTime();
            }
        } catch (e) {
            // Fall-through zu anderen Checks
        }
    }

    // 4. Zahl prüfen (Millisekunden)
    if (typeof timestamp === 'number' && timestamp > 0) {
        return timestamp;
    }

    // Wenn keine Methode funktioniert hat, gib null zurück
    return null;
}

function parseRoundEntryTimestamps(round: any): RoundEntry {
    return {
        ...round,
        timestamp: parseFirebaseTimestamp(round.timestamp) ?? Date.now(),
        startTime: parseFirebaseTimestamp(round.startTime),
        endTime: parseFirebaseTimestamp(round.endTime),
    } as RoundEntry;
}

function parseCompletedGameSummaryTimestamps(summary: any): CompletedGameSummary {
    const handleTimestamp = (timestamp: any) => {
        if (timestamp instanceof ClientTimestamp) return timestamp;
        if (!timestamp) return null;
        
        try {
            // Wenn es ein Objekt mit seconds/nanoseconds ist
            if (typeof timestamp === 'object' && 
                ('seconds' in timestamp || '_seconds' in timestamp) &&
                ('nanoseconds' in timestamp || '_nanoseconds' in timestamp)) {
                const seconds = timestamp.seconds ?? timestamp._seconds ?? 0;
                const nanoseconds = timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0;
                return new ClientTimestamp(seconds, nanoseconds);
            }
            
            // Wenn es eine Nummer ist, als Millisekunden interpretieren
            if (typeof timestamp === 'number') {
                const seconds = Math.floor(timestamp / 1000);
                const nanoseconds = (timestamp % 1000) * 1000000;
                return new ClientTimestamp(seconds, nanoseconds);
            }
            
            // Fallback: null zurückgeben
            return null;
        } catch (error) {
            // Nur silent fail, kein Logging mehr notwendig
            return null;
        }
    };
    
    return {
        ...summary,
        timestampCompleted: handleTimestamp(summary.timestampCompleted),
        completedAt: handleTimestamp(summary.completedAt),
        roundHistory: summary.roundHistory?.map(parseRoundEntryTimestamps) ?? [],
    } as CompletedGameSummary;
}
// --- ENDE HILFSFUNKTIONEN ---

// Typ für Session-Metadaten, jetzt mit korrektem PlayerNames Typ
type SessionMetadata = {
    sessionId: string;
    groupId: string | null;
    groupName: string | null;
    startedAt: number | ClientTimestamp | any;
    participantUids: string[];
    playerNames: PlayerNames; // KORRIGIERTER TYP
    status?: string;
    // ... weitere Metadaten ...
} | null;
type CompletedGamesData = CompletedGameSummary[];

// Lokale Definition für FirestoreGroup (Spiegelung der erwarteten Struktur)
interface FarbeSettings {
  cardStyle: CardStyle;
  // ... andere Farbeinstellungen falls vorhanden ...
}

interface FirestoreGroup {
  strokeSettings?: StrokeSettings;
  farbeSettings?: FarbeSettings;
  scoreSettings?: ScoreSettings;
  // ... andere Felder der Gruppe, die wir hier nicht brauchen ...
}

const SessionViewerPage: React.FC = () => {
  const router = useRouter();
  const { sessionId } = router.query;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Verwende den präziseren Typ SessionMetadata
  const [sessionData, setSessionData] = useState<SessionMetadata>(null);
  const [completedGames, setCompletedGames] = useState<CompletedGamesData>([]);
  // Zustand für Einstellungen bleibt
  const [activeStrokeSettings, setActiveStrokeSettings] = useState<StrokeSettings>(DEFAULT_STROKE_SETTINGS);
  const [activeCardStyle, setActiveCardStyle] = useState<CardStyle>(DEFAULT_FARBE_SETTINGS.cardStyle);
  // NEU: Zustand für Score Settings
  const [activeScoreSettings, setActiveScoreSettings] = useState<ScoreSettings>(DEFAULT_SCORE_SETTINGS);

  useEffect(() => {
    if (sessionId && typeof sessionId === 'string' && router.isReady) {
      const loadSessionData = async () => {
        setIsLoading(true);
        setError(null);
        setSessionData(null);
        setCompletedGames([]);
        // Setze Einstellungen auf Default zurück bei Neuladen
        setActiveStrokeSettings(DEFAULT_STROKE_SETTINGS);
        setActiveCardStyle(DEFAULT_FARBE_SETTINGS.cardStyle);
        setActiveScoreSettings(DEFAULT_SCORE_SETTINGS);

        let loadedSessionData: SessionMetadata = null;
        let loadedGamesData: CompletedGamesData = [];

        try {
          const db = getFirestore(firebaseApp);
          const sessionDocRef = doc(db, 'jassGameSummaries', sessionId);
          const gamesCollectionRef = collection(db, 'jassGameSummaries', sessionId, 'completedGames');

          // 1. Session-Metadaten laden
          console.log(`[SessionViewerPage] Fetching session metadata for: ${sessionId}`);
          const sessionSnap = await getDoc(sessionDocRef);

          if (!sessionSnap.exists()) {
            throw new Error(`Session mit ID ${sessionId} nicht gefunden.`);
          }
          loadedSessionData = sessionSnap.data() as SessionMetadata;
          setSessionData(loadedSessionData); // Session-Daten setzen, auch wenn Gruppe/Spiele fehlschlagen
          console.log("[SessionViewerPage] Session metadata loaded:", loadedSessionData);

          // --- Gruppeneinstellungen laden (in eigenem try/catch) --- 
          if (loadedSessionData?.groupId) {
            console.log(`[SessionViewerPage] Fetching group settings for group: ${loadedSessionData.groupId}`);
            const groupDocRef = doc(db, 'groups', loadedSessionData.groupId);
            try {
              const groupSnap = await getDoc(groupDocRef);
              if (groupSnap.exists()) {
                const groupData = groupSnap.data() as FirestoreGroup;
                setActiveStrokeSettings(groupData.strokeSettings ?? DEFAULT_STROKE_SETTINGS);
                setActiveCardStyle(groupData.farbeSettings?.cardStyle ?? DEFAULT_FARBE_SETTINGS.cardStyle);
                setActiveScoreSettings(groupData.scoreSettings ?? DEFAULT_SCORE_SETTINGS);
                console.log("[SessionViewerPage] Group settings applied:", { 
                  stroke: groupData.strokeSettings, 
                  farbe: groupData.farbeSettings, 
                  score: groupData.scoreSettings 
                });
              } else {
                console.warn(`[SessionViewerPage] Group ${loadedSessionData.groupId} not found. Using default settings.`);
                // Defaults sind bereits gesetzt
              }
            } catch (groupError) {
              console.error(`[SessionViewerPage] Error fetching group settings for ${loadedSessionData.groupId}:`, groupError);
              // Fehler loggen, aber weitermachen und Defaults verwenden
              useUIStore.getState().showNotification({type: 'warning', message: 'Fehler beim Laden der Gruppeneinstellungen. Standardeinstellungen werden verwendet.'});
            }
          } else {
             console.log("[SessionViewerPage] No groupId found in session data. Using default settings.");
             // Defaults sind bereits gesetzt
          }
          // --- ENDE: Gruppeneinstellungen laden ---

          // 2. Abgeschlossene Spiele laden (in eigenem try/catch)
          console.log(`[SessionViewerPage] Fetching completed games for: ${sessionId}`);
          try {
            const gamesQuery = query(gamesCollectionRef, orderBy('gameNumber'));
            const gamesSnap = await getDocs(gamesQuery);
            
            loadedGamesData = gamesSnap.docs.map(doc =>
              parseCompletedGameSummaryTimestamps(doc.data())
            );
            setCompletedGames(loadedGamesData);
            console.log(`[SessionViewerPage] ${loadedGamesData.length} completed games loaded successfully.`);
          } catch (gamesError) {
            console.error(`[SessionViewerPage] Error fetching completed games for ${sessionId}:`, gamesError);
            setError("Fehler beim Laden der Spieldetails."); // Setze Fehler für den Benutzer
            // Setze leere Spieleliste
            setCompletedGames([]);
          }

        } catch (sessionErr) { // Fehler beim Laden der Session-Metadaten
          console.error(`[SessionViewerPage] Critical error loading session metadata for ${sessionId}:`, sessionErr);
          setError(sessionErr instanceof Error ? sessionErr.message : "Ein kritischer Fehler ist aufgetreten.");
        } finally {
          setIsLoading(false);
          console.log("[SessionViewerPage] loadSessionData finished."); // Log am Ende
        }
      };

      loadSessionData();

    } else if (router.isReady && !sessionId) {
        setError("Keine Session-ID in der URL gefunden.");
        setIsLoading(false);
    }
  }, [sessionId, router.isReady]);

  // Bereite Props für GameViewerKreidetafel vor, erst wenn Daten geladen sind
  const gameDataForViewer = useMemo(() => {
    if (!sessionData || completedGames.length === 0) {
      return null;
    }
    const lastGame = completedGames[completedGames.length - 1];
    
    // Standardwerte definieren
    const defaultTeamScores: TeamScores = { top: 0, bottom: 0 };
    const defaultStricheRecord: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const defaultCurrentStriche: { top: StricheRecord; bottom: StricheRecord } = {
      top: defaultStricheRecord,
      bottom: defaultStricheRecord,
    };

    return {
      games: completedGames, // Verwende die geladenen/gesetzten Spiele
      playerNames: sessionData.playerNames,
      currentScores: lastGame?.finalScores ?? defaultTeamScores,
      currentStriche: lastGame?.finalStriche ?? defaultCurrentStriche,
      weisPoints: lastGame?.weisPoints ?? defaultTeamScores,
      strokeSettings: activeStrokeSettings,
      cardStyle: activeCardStyle,
      scoreSettings: activeScoreSettings,
      startedAt: sessionData.startedAt,
    };
  }, [sessionData, completedGames, activeStrokeSettings, activeCardStyle, activeScoreSettings]);

  const handleGoBack = () => {
    router.back();
  };

  // Dynamischer Titel
  const pageTitle = sessionData
    ? `Partie vom ${format(parseFirebaseTimestamp(sessionData.startedAt) ?? Date.now(), 'dd.MM.yyyy')}`
    : `Session Details (ID: ${sessionId})`;

  if (isLoading) {
    return <FullscreenLoader text="Session wird geladen..." />;
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Fehler</h1>
          <p className="text-gray-300 text-center">{error}</p>
          {/* Optional: Link zurück zur Startseite oder Profil */}
        </div>
      </MainLayout>
    );
  }

  // Angepasste Rückgabe mit GameViewerKreidetafel
  return (
    <MainLayout>
      {/* Container für Zurück-Pfeil und Inhalt */}
      <div className="relative pt-12"> {/* Padding-Top für den Pfeil */} 
        {/* Zurück-Pfeil (absolut positioniert) */}
        <button 
          onClick={handleGoBack} 
          className="absolute top-4 left-4 text-white p-2 rounded-full hover:bg-gray-700 transition-colors z-10"
          aria-label="Zurück"
        >
          <ArrowLeft size={20} />
        </button>

      {/* Hier wird GameViewerKreidetafel gerendert, wenn Daten vorhanden */}
      {gameDataForViewer ? (
        <GameViewerKreidetafel gameData={gameDataForViewer} />
      ) : (
        // Fallback oder spezifischere Nachricht, falls nur Session aber keine Spiele geladen?
        <div className="container mx-auto p-4">
          <h1 className="text-2xl font-bold mb-4 text-white">
             {pageTitle}
          </h1>
          <p className="text-gray-400">Keine abgeschlossenen Spieldaten gefunden oder Daten werden noch aufbereitet...</p>
          {/* Optional: Debug-Infos anzeigen */}
          <pre className="text-xs text-gray-500 mt-4 bg-gray-800 p-2 rounded max-h-96 overflow-auto">
            Session-Daten: {JSON.stringify(sessionData, null, 2)}
            \nSpiele: {JSON.stringify(completedGames, null, 2)}
          </pre>
        </div>
      )}
      </div>
    </MainLayout>
  );
};

export default SessionViewerPage; 