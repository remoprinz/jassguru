'use client';

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { getFirestore, doc, collection, onSnapshot, query, orderBy, Timestamp, Unsubscribe, Firestore, DocumentData, QueryDocumentSnapshot, where, getDoc } from 'firebase/firestore';
import { firebaseApp } from '@/services/firebaseInit';
import { useGameStore } from '@/store/gameStore';
import { ActiveGame, RoundEntry, JassRoundEntry, GameState, WeisRoundEntry, CompletedGameSummary, PlayerNumber, JassColor } from '@/types/jass';
import { useAuth } from '@/hooks/useAuth';
import { useJassStore } from '@/store/jassStore';
import { useUIStore } from '@/store/uiStore';
import { useTimerStore } from '@/store/timerStore';
import { useRouter } from 'next/router';
import { CARD_SYMBOL_MAPPINGS } from '@/config/CardStyles'; // Für Farb-Mapping
import { sanitizeDataForFirestore } from '@/utils/firestoreUtils'; // Korrigierter Import
import { loadRoundsFromFirestore } from '@/services/gameService'; // loadRoundsFromFirestore hinzugefügt

// SyncStatus-Typ definieren
interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncError: Error | null;
  isPaused: boolean;
  currentlyProcessingRoundIds: string[];
}

// Firestore Sync Context erstellen
const FirestoreSyncContext = createContext<{
  syncStatus: SyncStatus;
  pauseSync:() => void;
  resumeSync: () => void;
  markLocalUpdate: () => void;
} | null>(null);

export function useFirestoreSync() {
  const context = useContext(FirestoreSyncContext);
  if (!context) {
    throw new Error('useFirestoreSync must be used within a FirestoreSyncProvider');
  }
  return context;
}

interface FirestoreSyncProviderProps {
  children: ReactNode;
}

// NEU: Globale API für gameStore
// Diese wird verwendet, da der gameStore direkt nicht auf den FirestoreSync-Context zugreifen kann
if (typeof window !== 'undefined') {
  // @ts-ignore - dynamischer API-Zugriff
  window.__FIRESTORE_SYNC_API__ = {
    markLocalUpdate: null, // Wird später mit der echten Funktion befüllt
  };
}

// 🔥 KRITISCHER FIX: LOCAL_UPDATE_WINDOW_MS entfernt - blockierte Cross-Client-Sync!
// const LOCAL_UPDATE_WINDOW_MS = 1500; // ← War das Hauptproblem für fehlende Echtzeit-Synchronisation

export const FirestoreSyncProvider: React.FC<FirestoreSyncProviderProps> = ({ children }) => {
  const db = getFirestore(firebaseApp);
  const isInitialSyncRef = useRef<boolean>(false);
  // Hole den gameStore nur noch für resetGame, nicht mehr für activeGameId
  const gameStoreReset: (nextStarter: PlayerNumber, newActiveGameId?: string) => void = useGameStore((state) => state.resetGame);
  const gameStoreSetState = useGameStore.setState; 
  
  // NEU: activeGameId aus dem jassStore holen
  const activeGameIdFromJassStore = useJassStore((state) => state.activeGameId);
  const jassSessionId = useJassStore((state) => state.jassSessionId); // Für completedGames
  
  const { user } = useAuth();
  const router = useRouter();
  
  // Lokale Status-Updates verfolgen um Endlosschleifen zu vermeiden
  const isLocalUpdate = useRef(false);
  const lastServerUpdateTimestamp = useRef<number>(0);
  const lastLocalUpdateTimestamp = useRef<number>(0);
  const processedRounds = useRef<Set<string>>(new Set());
  // NEU: Ref, um bereits behandelte Spielbeendigungen zu speichern
  const terminationHandledForGameId = useRef<string | null>(null); 
  
  // Sync-Status verwalten
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    syncError: null,
    isPaused: false,
    currentlyProcessingRoundIds: []
  });

  // Unsubscribe-Funktionen speichern
  const gameUnsubscribeRef = useRef<Unsubscribe | null>(null);
  const roundsUnsubscribeRef = useRef<Unsubscribe | null>(null);
  const completedGamesUnsubscribeRef = useRef<Unsubscribe | null>(null);
  const currentListenerGameId = useRef<string | null>(null);

  // Hilfsfunktion: Überprüft, ob ein Wert ein gültiges Firestore Timestamp Objekt ist
  const isValidTimestamp = (value: any): boolean => {
    return value && 
           typeof value === 'object' && 
           (value instanceof Timestamp || 
            ('_seconds' in value && '_nanoseconds' in value && 
             typeof value.toMillis === 'function'));
  };

  // Hilfsfunktion: Extrahiert Millisekunden aus einem Timestamp-Objekt oder gibt die aktuelle Zeit zurück
  const getMillisFromTimestamp = (timestamp: any): number => {
    if (isValidTimestamp(timestamp)) {
      try {
        return timestamp.toMillis();
      } catch (error) {
        console.error("Fehler beim Aufrufen von toMillis():", error);
        return Date.now();
      }
    }
    return Date.now();
  };

  // Handle remote game end or abort (angepasst, um resetGame direkt zu nutzen)
  const handleRemoteGameEndOrAbort = useCallback((status: 'completed' | 'aborted') => {
    const currentActiveGameId = useGameStore.getState().activeGameId; 
    if (!currentActiveGameId) {
      console.warn("[FirestoreSyncProvider] handleRemoteGameEndOrAbort called without activeGameId. Skipping.");
      return; 
    }
    if (terminationHandledForGameId.current === currentActiveGameId) {
        console.log(`[FirestoreSyncProvider] Termination for game ${currentActiveGameId} (status: ${status}) already handled. Skipping duplicate action.`);
        return;
    }
    console.log(`[FirestoreSyncProvider] handleRemoteGameEndOrAbort CALLED with status: ${status} for game ${currentActiveGameId}`);
    const localSigningState = useUIStore.getState().signingState;
    if (status === 'completed' && localSigningState === 'completed') {
        console.log(`[FirestoreSyncProvider] Ignoring 'completed' status echo from local client (signingState is 'completed'). ResultatKreidetafel will handle reset.`);
        terminationHandledForGameId.current = currentActiveGameId;
      return;
    }
    terminationHandledForGameId.current = currentActiveGameId;

    if (status === 'aborted') {
      console.log(`[FirestoreSyncProvider] Status is 'aborted' for ${currentActiveGameId}. Resetting state and showing notification.`);
              useTimerStore.getState().resetAllTimers();
              // ENTFERNT: useJassStore.getState().resetJass() - Das würde sessionId auf "initial" setzen!
      gameStoreReset(1, undefined); // Reset ohne ID
              useUIStore.getState().clearResumableGameId();
              useUIStore.getState().resetAll();
      // WARNING NOTIFICATION ENTFERNT - Redundant mit anderen Abbruch-Meldungen
      // const message = "Die Partie wurde abgebrochen. Die Daten wurden nicht gespeichert.";
      // useUIStore.getState().showNotification({ type: "warning", message });
              const isAuthenticated = !!user;
              const targetRoute = isAuthenticated ? "/start" : "/";
      console.log(`[FirestoreSyncProvider] Navigating to ${targetRoute} after remote abort.`);
              router.push(targetRoute);
    } else { 
        console.log(`[FirestoreSyncProvider] True remote game completion detected for ${currentActiveGameId}. Resetting state for this client.`);
        useTimerStore.getState().resetAllTimers();
        // ENTFERNT: useJassStore.getState().resetJass() - Das würde sessionId auf "initial" setzen!
      gameStoreReset(1, undefined); // Reset ohne ID
      useUIStore.getState().clearResumableGameId(); 
      useUIStore.getState().resetAll(); 
        const isAuthenticated = !!user;
        const targetRoute = isAuthenticated ? "/start" : "/";
        console.log(`[FirestoreSyncProvider] Navigating to ${targetRoute} after remote game completion.`);
        router.push(targetRoute);
    }
  }, [router, user, gameStoreReset]); // gameStoreReset hinzugefügt

  // Callback zum Anwenden von Server-Updates auf den lokalen Store
  const applyServerUpdate = useCallback((serverData: ActiveGame, serverRounds: RoundEntry[] | null = null) => {
      // console.log('[FirestoreSync applyServerUpdate] Received server data:', serverData);
      // console.log('[FirestoreSync applyServerUpdate] Received server rounds:', serverRounds?.length);
      
      // NEU: Prüfe, ob das Spiel bereits als beendet behandelt wurde
      const currentActiveGameId = useGameStore.getState().activeGameId;
      if (currentActiveGameId && terminationHandledForGameId.current === currentActiveGameId) {
        console.log(`[FirestoreSync applyServerUpdate] Skipping update for game ${currentActiveGameId} - termination already handled.`);
        return;
      }
      
      // --- NEU: Initialen Sync erkennen ---
      if (isInitialSyncRef.current) {
          console.log(`[FirestoreSync applyServerUpdate] Applying INITIAL sync for game ${activeGameIdFromJassStore}. Overwriting state...`);
          
          // Bestimme den korrekten Startspieler
          const initialStarter = serverData.initialStartingPlayer ?? 1;
          const currentStarter = serverData.startingPlayer ?? initialStarter;
          const currentPlayer = serverData.currentPlayer ?? currentStarter;
          
          // --- KORREKTUR: Server-Daten HIER bereinigen ---
          const sanitizedData = sanitizeDataForFirestore(serverData);
          console.log('[FirestoreSync applyServerUpdate] Initial sync data sanitized:', sanitizedData);
          
          // --- KORREKTUR: gameStoreSetState ohne replace=true, nur Datenfelder übergeben ---
          // 🔥 INITIAL SYNC: Hier ist komplette Überschreibung OK, da es der erste Load ist
          gameStoreSetState({
              activeGameId: activeGameIdFromJassStore ?? undefined, // Die neue ID, null zu undefined konvertieren
              // Direkte Übernahme der wesentlichen Felder vom BEREINIGTEN Server
              scores: sanitizedData.scores ?? { top: 0, bottom: 0 },
              striche: sanitizedData.striche ?? { top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } },
              weisPoints: sanitizedData.weisPoints ?? { top: 0, bottom: 0 },
              jassPoints: sanitizedData.jassPoints ?? { top: 0, bottom: 0 }, // jassPoints hinzufügen
              currentRound: sanitizedData.currentRound ?? 1,
              currentPlayer: currentPlayer,
              startingPlayer: currentStarter,
              initialStartingPlayer: initialStarter,
              isGameStarted: true, // Annahme: Wenn wir Daten haben, ist das Spiel gestartet
              isGameCompleted: sanitizedData.status === 'completed' || sanitizedData.status === 'aborted',
              isRoundCompleted: sanitizedData.isRoundCompleted ?? false, // Vom Server übernehmen
              currentRoundWeis: sanitizedData.currentRoundWeis ?? [], // Vom Server übernehmen
              playerNames: sanitizedData.playerNames ?? { 1: '', 2: '', 3: '', 4: '' },
              gamePlayers: sanitizedData.gamePlayers ?? null,
              // Rundenhistorie (wird separat behandelt, wenn übergeben)
              roundHistory: serverRounds ? serverRounds : [],
              currentHistoryIndex: serverRounds ? serverRounds.length - 1 : -1,
              historyState: { lastNavigationTimestamp: Date.now() }, // Reset History State
              // Settings bleiben lokal (werden nicht überschrieben)
          }); 

          // Setze das Ref zurück nach dem ersten Sync
          isInitialSyncRef.current = false;
          console.log('[FirestoreSync applyServerUpdate] Initial sync applied. isInitialSyncRef set to false.');
          return; // Beende hier, kein Merging beim ersten Mal
      }
      // --- ENDE NEU: Initialen Sync ---

      // --- Bestehende Logik für normale Updates ---
      const now = Date.now();
      const localState = useGameStore.getState();
      const timeSinceLastLocalUpdate = now - lastLocalUpdateTimestamp.current;
      const serverTimestampMillis = getMillisFromTimestamp(serverData.lastUpdated as Timestamp);

      // 🔥 KRITISCHER FIX: LOCAL_UPDATE_WINDOW_MS Blockierung entfernt!
      // Grund: Blockierte Cross-Client-Synchronisation für 1.5s nach jeder lokalen Aktion
      console.log(`[FirestoreSync applyServerUpdate] Processing server update. Time since last local update: ${timeSinceLastLocalUpdate}ms`);
      
      // OPTIONAL: Nur für Debugging - Echo-Updates erkennen (aber nicht blockieren)
      if (timeSinceLastLocalUpdate < 500) {
          console.log(`[FirestoreSync applyServerUpdate] ⚠️ Possible echo update detected (${timeSinceLastLocalUpdate}ms ago), but applying anyway for cross-client sync.`);
      }

      // 🔥 KRITISCHER FIX: History-Navigation Blockierung auch entfernt!
      // Grund: Könnte ebenfalls Cross-Client-Updates blockieren
      const isNavigatingHistory = useUIStore.getState().isNavigatingHistory;
      if (isNavigatingHistory) {
          console.log("[FirestoreSync applyServerUpdate] ⚠️ Currently navigating history, but applying server update anyway for cross-client sync.");
    }

      // --- KORREKTUR: Server-Daten HIER bereinigen ---
      const sanitizedServerData = sanitizeDataForFirestore(serverData);
      
      // === NEU: Brutales Überschreiben des Kern-Spielzustands ===
      console.log('[FirestoreSync applyServerUpdate] Overwriting local state with authoritative server data.');
      
      // KRITISCHER FIX: weisPoints auf Null setzen, wenn Runde abgeschlossen ist
      const shouldResetWeisPoints = sanitizedServerData.isRoundCompleted === true;
      const finalWeisPoints = shouldResetWeisPoints 
        ? { top: 0, bottom: 0 } 
        : (sanitizedServerData.weisPoints ?? { top: 0, bottom: 0 });
      
      console.log(`[FirestoreSync applyServerUpdate] WeisPoints handling: isRoundCompleted=${sanitizedServerData.isRoundCompleted}, shouldReset=${shouldResetWeisPoints}, finalWeisPoints=${JSON.stringify(finalWeisPoints)}`);
      
      // 🔥 KRITISCHER FIX: State-Preservation - roundHistory bewahren!
      // Grund: Runden-Listener aktualisiert roundHistory separat, darf nicht überschrieben werden
      gameStoreSetState(currentState => ({
          ...currentState, // 🔥 BEWAHRE roundHistory und andere kritische Felder
          scores: sanitizedServerData.scores ?? { top: 0, bottom: 0 },
          weisPoints: finalWeisPoints, // FIX: Verwende berechnete weisPoints statt direkte Server-Daten
          striche: sanitizedServerData.striche ?? { 
            top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, 
            bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } 
          },
          jassPoints: sanitizedServerData.currentJassPoints ?? { top: 0, bottom: 0 },
          currentRound: sanitizedServerData.currentRound ?? 1,
          currentPlayer: sanitizedServerData.currentPlayer ?? 1,
          startingPlayer: sanitizedServerData.startingPlayer ?? 1,
          isRoundCompleted: sanitizedServerData.isRoundCompleted ?? false,
          currentRoundWeis: sanitizedServerData.currentRoundWeis ?? [],
          gamePlayers: sanitizedServerData.gamePlayers ?? null,
          playerNames: sanitizedServerData.playerNames ?? {
            1: "Spieler 1",
            2: "Spieler 2", 
            3: "Spieler 3",
            4: "Spieler 4"
          },
          // roundHistory wird BEWUSST NICHT gesetzt - wird vom Runden-Listener verwaltet
      }));

      // Status prüfen (abgebrochen/beendet) - diese Logik bleibt wichtig
      if (sanitizedServerData.status === 'aborted' || sanitizedServerData.status === 'completed') {
        handleRemoteGameEndOrAbort(sanitizedServerData.status);
      }
  }, [gameStoreSetState, activeGameIdFromJassStore, handleRemoteGameEndOrAbort]); // handleRemoteGameEndOrAbort als Abhängigkeit hinzugefügt

  // Hilfsfunktion: Konvertiere Firestore-Dokument in RoundEntry
  const convertDocToRoundEntry = useCallback((doc: QueryDocumentSnapshot<DocumentData>): RoundEntry | null => {
    try {
      const data = doc.data();
      
      // Konvertiere Firestore-Timestamp zurück in JavaScript-Timestamp - mit Sicherheitsüberprüfung
      const timestamp = isValidTimestamp(data.timestamp) ? 
        getMillisFromTimestamp(data.timestamp) : 
        Date.now();
      
      // Basisobjekt für alle Rundentypen
      const baseEntry: Partial<RoundEntry> = {
        id: data.id,
        roundId: data.roundId,
        timestamp: timestamp,
        actionType: data.actionType,
        startingPlayer: data.startingPlayer,
        currentPlayer: data.currentPlayer,
        weisPoints: data.weisPoints || { top: 0, bottom: 0 },
        jassPoints: data.jassPoints || { top: 0, bottom: 0 },
        scores: data.scores || { top: 0, bottom: 0 },
        striche: data.striche || { top: {}, bottom: {} },
        weisActions: data.weisActions || [],
        roundState: data.roundState || { roundNumber: 1, nextPlayer: 1 },
        visualStriche: data.visualStriche || { top: { stricheCounts: {}, restZahl: 0 }, bottom: { stricheCounts: {}, restZahl: 0 } },
        isActive: data.isActive // isActive übernehmen
      };
      
      // Spezifische Felder für Jass-Runden
      if (data.actionType === 'jass') {
        const jassRound: JassRoundEntry = {
          ...baseEntry as RoundEntry,
          actionType: 'jass',
          farbe: data.farbe,
          cardStyle: data.cardStyle || 'deutsch',
          strichInfo: data.strichInfo,
          isRoundFinalized: true,
          isCompleted: true,
          isActive: data.isActive
        };
        return jassRound;
      } else {
        // Weis-Runden
        const weisRound: WeisRoundEntry = {
          ...baseEntry as RoundEntry,
          actionType: 'weis',
          isRoundFinalized: false,
          isCompleted: false,
          isActive: data.isActive
        };
        return weisRound;
      }
    } catch (error) {
      console.error("Fehler beim Konvertieren des Rundendokuments:", error);
      return null;
    }
  }, []);

  // Hilfsfunktion: Runden aus Firestore in den lokalen GameStore laden
  const updateRoundHistory = (rounds: RoundEntry[]) => {
    if (rounds.length === 0) return;
    
    console.log("Aktualisiere rundHistory mit", rounds.length, "Runden");
    
    // Sortiere Runden nach roundId um konsistente Reihenfolge zu garantieren
    const sortedRounds = [...rounds].sort((a, b) => a.roundId - b.roundId);
    
    // State aktualisieren durch direkten Zugriff auf getter/setter des Stores
    // Da wir die Methoden nicht direkt aufrufen können, verwenden wir den State-Zugriff
    useGameStore.setState(state => ({
      ...state,
      roundHistory: sortedRounds
    }));
  };

  // Hilfsfunktion: Synchronisation pausieren (z.B. während lokaler Updates)
  const pauseSync = useCallback(() => {
    console.log("Pausiere Synchronisation");
    setSyncStatus(prev => ({ ...prev, isPaused: true }));
  }, []);

  // Hilfsfunktion: Synchronisation fortsetzen
  const resumeSync = useCallback(() => {
    console.log("Setze Synchronisation fort");
    setSyncStatus(prev => ({ ...prev, isPaused: false }));
  }, []);
  
  // Hilfsfunktion: Markiere, dass ein lokales Update stattfindet
  const markLocalUpdate = useCallback(() => {
    console.log("[FirestoreSyncProvider] 🔥 Lokales Update erkannt - Cross-Client-Sync aktiviert!");
    // 🔥 KRITISCHER FIX: Timestamp nur für Debugging setzen, aber KEINE Blockierung mehr
    lastLocalUpdateTimestamp.current = Date.now();
    
    // ✅ KEINE BLOCKIERUNG: Andere Clients sollen sofort unsere Updates empfangen können
    // ✅ KEINE ECHO-BLOCKIERUNG: Akzeptiere minimale Echo-Updates für maximale Sync-Zuverlässigkeit
  }, []);
  
  // Registriere die markLocalUpdate-Funktion in der globalen API für gameStore
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // @ts-ignore - dynamischer API-Zugriff
      window.__FIRESTORE_SYNC_API__ = {
        markLocalUpdate,
      };
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        // @ts-ignore - dynamischer API-Zugriff
        window.__FIRESTORE_SYNC_API__ = {
          markLocalUpdate: null,
        };
      }
    };
  }, [markLocalUpdate]);

  // --- NEUER useEffect Hook für Listener-Management --- 
  useEffect(() => {
    
    // Funktion zum Einrichten der Listener (bleibt größtenteils gleich)
    const setupListeners = (gameId: string) => {
      // --- WICHTIG: isInitialSyncRef wird hier nicht mehr benötigt/gesetzt --- 
      console.log(`[FirestoreSyncProvider] 🎯 DEBUGGING: setupListeners() called for game ID: ${gameId}`);
      console.log(`[FirestoreSyncProvider] 🎯 DEBUGGING: Previous listener game ID was: ${currentListenerGameId.current}`);
      currentListenerGameId.current = gameId;
      terminationHandledForGameId.current = null;
      setSyncStatus(prev => ({ ...prev, isSyncing: true, syncError: null }));
      
      console.log(`[FirestoreSyncProvider] 🎯 DEBUGGING: About to setup listeners for BOTH game document AND rounds collection...`);

      // Listener für Haupt-Dokument
      try {
        const gameDocRef = doc(db, 'activeGames', gameId);
        console.log(`[FirestoreSyncProvider] Setting up listener for game document: activeGames/${gameId}`);
        
        gameUnsubscribeRef.current = onSnapshot(gameDocRef, (docSnapshot) => {
          setSyncStatus(prev => ({ ...prev, isSyncing: false, lastSyncTime: new Date() }));
          if (docSnapshot.exists()) {
            console.log(`[FirestoreSyncProvider] Game sync: Neues Update von Firestore ${gameId}`);
            const data = docSnapshot.data() as ActiveGame;
            console.log(`[FirestoreSyncProvider] Game data received:`, {
              currentRound: data.currentRound,
              scoresTop: data.scores?.top,
              scoresBottom: data.scores?.bottom,
              timestamp: data.lastUpdated instanceof Timestamp ? data.lastUpdated.toDate().toISOString() : 'missing'
            });
             // --- ANPASSUNG: Rufe applyServerUpdate OHNE Runden auf --- 
            applyServerUpdate(data, null);
          } else {
            console.warn(`[FirestoreSyncProvider] Active game document ${gameId} does not exist.`);
          }
        }, (error) => {
          console.error(`[FirestoreSyncProvider] Error listening to game ${gameId}:`, error);
          setSyncStatus(prev => ({ ...prev, isSyncing: false, syncError: error }));
        });
      } catch (error) {
        console.error(`[FirestoreSyncProvider] Failed to set up listener for game ${gameId}:`, error);
        setSyncStatus(prev => ({ ...prev, isSyncing: false, syncError: error as Error }));
      }

      // 🔥 KRITISCHER FIX: Runden-Listener mit verbesserter Fehlerbehandlung und Debugging
      try {
        const roundsCollectionRef = collection(db, 'activeGames', gameId, 'rounds');
        console.log(`[FirestoreSyncProvider] 🎯 DEBUGGING: Setting up listener for rounds collection: activeGames/${gameId}/rounds`);
        
        const roundsQuery = query(roundsCollectionRef, orderBy('timestamp'));
        
        // Test: Erst mal schauen, ob die Collection überhaupt existiert
        console.log(`[FirestoreSyncProvider] 🔍 DEBUGGING: Attempting to create onSnapshot listener for rounds...`);
        
        roundsUnsubscribeRef.current = onSnapshot(roundsQuery, 
          (querySnapshot) => {
            console.log(`[FirestoreSyncProvider] 🚀 ROUNDS LISTENER FIRED! Game: ${gameId}, Docs: ${querySnapshot.docs.length}`);
            console.log(`[FirestoreSyncProvider] 🚀 ROUNDS LISTENER - Full snapshot metadata:`, {
              size: querySnapshot.size,
              empty: querySnapshot.empty,
              hasPendingWrites: querySnapshot.metadata.hasPendingWrites,
              fromCache: querySnapshot.metadata.fromCache
            });
            
            const allServerRounds = querySnapshot.docs
              .map(doc => {
                console.log(`[FirestoreSyncProvider] 🚀 ROUNDS LISTENER - Processing doc: ${doc.id}`);
                return convertDocToRoundEntry(doc);
              })
              .filter(entry => entry !== null) as RoundEntry[];

            console.log(`[FirestoreSyncProvider] 🚀 ROUNDS LISTENER - Converted ${allServerRounds.length} rounds successfully`);

            // Direkte Aktualisierung des gameStore für Runden
            const localRoundHistory = useGameStore.getState().roundHistory;
            if (JSON.stringify(allServerRounds) !== JSON.stringify(localRoundHistory)) {
                console.log(`[FirestoreSyncProvider] 🚀 ROUNDS LISTENER - STATE CHANGE DETECTED! Updating roundHistory (Local: ${localRoundHistory.length} -> Server: ${allServerRounds.length} rounds).`);
                const lastActiveIndex = allServerRounds.findLastIndex(r => r.isActive === undefined || r.isActive === true);
                gameStoreSetState({
                  roundHistory: allServerRounds,
                  currentHistoryIndex: lastActiveIndex >= 0 ? lastActiveIndex : -1
                });
                console.log(`[FirestoreSyncProvider] 🚀 ROUNDS LISTENER - roundHistory updated successfully!`);
            } else {
                console.log(`[FirestoreSyncProvider] 🚀 ROUNDS LISTENER - No changes detected in roundHistory (${allServerRounds.length} rounds).`);
            }
          }, 
          (error) => {
            console.error(`[FirestoreSyncProvider] ❌ CRITICAL ERROR: Rounds listener failed for game ${gameId}:`, error);
            console.error(`[FirestoreSyncProvider] ❌ Error details:`, {
              name: error.name,
              message: error.message,
              code: (error as any).code,
              stack: error.stack
            });
          }
        );
        
        console.log(`[FirestoreSyncProvider] ✅ DEBUGGING: Rounds listener setup completed for game ${gameId}`);
        
      } catch (error) {
        console.error(`[FirestoreSyncProvider] ❌ FATAL: Failed to set up listener for rounds of game ${gameId}:`, error);
        console.error(`[FirestoreSyncProvider] ❌ Setup error details:`, {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack
        });
      }
    };

    // Funktion zum Aufräumen der Listener
    const clearListeners = () => { 
       console.log("[FirestoreSyncProvider] 🧹 DEBUGGING: clearListeners() called - removing all existing listeners");
       console.log(`[FirestoreSyncProvider] 🧹 DEBUGGING: Current listener game ID before cleanup: ${currentListenerGameId.current}`);
       console.log(`[FirestoreSyncProvider] 🧹 DEBUGGING: gameUnsubscribeRef exists: ${!!gameUnsubscribeRef.current}`);
       console.log(`[FirestoreSyncProvider] 🧹 DEBUGGING: roundsUnsubscribeRef exists: ${!!roundsUnsubscribeRef.current}`);
       
        if (gameUnsubscribeRef.current) {
         console.log("[FirestoreSyncProvider] 🧹 DEBUGGING: Unsubscribing from game document listener...");
          gameUnsubscribeRef.current();
          console.log("[FirestoreSyncProvider] 🧹 DEBUGGING: Game document listener unsubscribed successfully.");
       }
    if (roundsUnsubscribeRef.current) {
         console.log("[FirestoreSyncProvider] 🧹 DEBUGGING: Unsubscribing from rounds collection listener...");
      roundsUnsubscribeRef.current();
      console.log("[FirestoreSyncProvider] 🧹 DEBUGGING: Rounds collection listener unsubscribed successfully.");
       }
       gameUnsubscribeRef.current = null;
      roundsUnsubscribeRef.current = null;
       currentListenerGameId.current = null; 
       console.log("[FirestoreSyncProvider] 🧹 DEBUGGING: All listeners cleared and refs reset to null");
    };

    // --- NEU: Asynchrone Funktion für initiales Laden und Listener-Setup ---
    const performInitialLoadAndSetupListeners = async (newGameId: string) => {
      console.log(`[FirestoreSyncProvider LOAD] Starting initial load for game ID: ${newGameId}`); // LOG 1
      setSyncStatus(prev => ({ ...prev, isSyncing: true, syncError: null }));
      try {
        // 1. Lade Haupt-Spieldaten
        const gameDocRef = doc(db, 'activeGames', newGameId);
        console.log(`[FirestoreSyncProvider LOAD] Attempting to get game document: activeGames/${newGameId}`); // LOG 2
        const gameDocSnap = await getDoc(gameDocRef);
        
        if (!gameDocSnap.exists()) {
          console.error(`[FirestoreSyncProvider LOAD] ERROR: Active game document ${newGameId} not found!`); // LOG 3
          throw new Error(`Active game document ${newGameId} not found during initial load.`);
        }
        const gameData = gameDocSnap.data() as ActiveGame;
        console.log(`[FirestoreSyncProvider LOAD] Initial game data loaded successfully. Round: ${gameData.currentRound}, Scores: T${gameData.scores?.top}/B${gameData.scores?.bottom}`); // LOG 4

        // 2. Lade Runden-Daten
        console.log(`[FirestoreSyncProvider LOAD] Attempting to load rounds for game ${newGameId}`); // LOG 5
        const roundsData = await loadRoundsFromFirestore(newGameId);
        console.log(`[FirestoreSyncProvider LOAD] Initial rounds data loaded successfully: ${roundsData.length} rounds found.`); // LOG 6

        // 3. Setze den gameStore State EINMALIG und VOLLSTÄNDIG
        const initialStarter = gameData.initialStartingPlayer ?? 1;
        const currentStarter = gameData.startingPlayer ?? initialStarter;
        const currentPlayer = gameData.currentPlayer ?? currentStarter;
        const lastActiveIndex = roundsData.findLastIndex(r => r.isActive === undefined || r.isActive === true);
        
        console.log(`[FirestoreSyncProvider LOAD] Preparing to set initial gameStore state. Target gameId: ${newGameId}, Rounds count: ${roundsData.length}, Target history index: ${lastActiveIndex}`); // LOG 7
        
        // KRITISCHER FIX: weisPoints auch beim initialen Load korrekt handhaben
        const shouldResetWeisPointsInitial = gameData.isRoundCompleted === true;
        const finalWeisPointsInitial = shouldResetWeisPointsInitial 
          ? { top: 0, bottom: 0 } 
          : (gameData.weisPoints ?? { top: 0, bottom: 0 });
        
        console.log(`[FirestoreSyncProvider LOAD] WeisPoints handling: isRoundCompleted=${gameData.isRoundCompleted}, shouldReset=${shouldResetWeisPointsInitial}, finalWeisPoints=${JSON.stringify(finalWeisPointsInitial)}`);
        
        gameStoreSetState({
          activeGameId: newGameId, // Die neue ID setzen
          // ... (restliche Felder kopiert) ...
          scores: gameData.scores ?? { top: 0, bottom: 0 },
          striche: gameData.striche ?? { top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } },
          weisPoints: finalWeisPointsInitial, // FIX: Verwende berechnete weisPoints statt direkte Server-Daten
          jassPoints: gameData.currentJassPoints ?? { top: 0, bottom: 0 },
          currentRound: gameData.currentRound ?? 1,
          currentPlayer: currentPlayer,
          startingPlayer: currentStarter,
          initialStartingPlayer: initialStarter,
          isGameStarted: true,
          isGameCompleted: gameData.status === 'completed' || gameData.status === 'aborted',
          isRoundCompleted: gameData.isRoundCompleted ?? false,
          currentRoundWeis: gameData.currentRoundWeis ?? [],
          playerNames: gameData.playerNames ?? { 1: '', 2: '', 3: '', 4: '' },
          gamePlayers: gameData.gamePlayers ?? null,
          roundHistory: roundsData, // Runden direkt setzen
          currentHistoryIndex: lastActiveIndex >= 0 ? lastActiveIndex : -1, // Korrekten Index setzen
          historyState: { lastNavigationTimestamp: Date.now() },
        });
        // Verify state after setting
        const newState = useGameStore.getState();
        console.log(`[FirestoreSyncProvider LOAD] Initial gameStore state SET. Verified activeGameId: ${newState.activeGameId}, History length: ${newState.roundHistory.length}, Index: ${newState.currentHistoryIndex}`); // LOG 8

        // 4. Setze Listener für zukünftige Updates auf
        console.log(`[FirestoreSyncProvider LOAD] Proceeding to set up listeners for game ${newGameId}`); // LOG 9
        setupListeners(newGameId);

      } catch (error) {
        console.error(`[FirestoreSyncProvider LOAD] FATAL ERROR during initial load for game ${newGameId}:`, error); // LOG 10
        setSyncStatus(prev => ({ ...prev, isSyncing: false, syncError: error as Error }));
      } finally {
        setSyncStatus(prev => ({ ...prev, isSyncing: false }));
      }
    };
    // --- ENDE NEU ---

    // --- Hauptlogik des useEffect (angepasst) ---
    if (syncStatus.isPaused) {
      // console.log("[FirestoreSyncProvider EFFECT] Sync is paused, skipping."); // LOG A
                return;
              }
              
    const currentJassStoreId = activeGameIdFromJassStore; // Wert zwischenspeichern
    const currentListenerId = currentListenerGameId.current;
    // console.log(`[FirestoreSyncProvider EFFECT] Checking ID change. JassStore: ${currentJassStoreId}, Listener: ${currentListenerId}`); // LOG B

    if (currentJassStoreId) {
      if (currentJassStoreId !== currentListenerId) {
        console.log(`[FirestoreSyncProvider EFFECT] 🔄 DEBUGGING: ID change detected! Target: ${currentJassStoreId}, Previous: ${currentListenerId}. Initiating reload...`); 
        clearListeners(); 
        
        // ENTFERNT: gameStoreReset() - Das würde die korrekten Settings überschreiben
        // ENTFERNT: jassStore.resetJass() - Das würde sessionId auf "initial" setzen!
        // Der FirestoreSyncProvider soll nur die dynamischen Daten synchronisieren.
        console.log(`[FirestoreSyncProvider EFFECT] 🔄 DEBUGGING: Stores NICHT zurückgesetzt. Erwarte korrekte Settings von vorheriger Initialisierung.`);
        console.log(`[FirestoreSyncProvider EFFECT] 🔄 DEBUGGING: About to call performInitialLoadAndSetupListeners()...`);
        
        performInitialLoadAndSetupListeners(currentJassStoreId);
        
        console.log(`[FirestoreSyncProvider EFFECT] 🔄 DEBUGGING: performInitialLoadAndSetupListeners() call completed.`);
        
      } else if (!gameUnsubscribeRef.current || !roundsUnsubscribeRef.current) {
        // 🔥 KRITISCHER FIX: Auch wenn ID gleich ist, prüfe ob Listener überhaupt aktiv sind!
        console.log(`[FirestoreSyncProvider EFFECT] 🔄 DEBUGGING: ID unchanged (${currentJassStoreId}), but listeners missing! gameListener: ${!!gameUnsubscribeRef.current}, roundsListener: ${!!roundsUnsubscribeRef.current}`);
        console.log(`[FirestoreSyncProvider EFFECT] 🔄 DEBUGGING: Setting up missing listeners for existing game...`);
        
        // Bestehende (potentiell kaputte) Listener bereinigen
        clearListeners();
        
        // Listener neu einrichten - OHNE initialen Load (Daten sind bereits da)
        setupListeners(currentJassStoreId);
        
        console.log(`[FirestoreSyncProvider EFFECT] 🔄 DEBUGGING: Missing listeners setup completed for game ${currentJassStoreId}.`);
      } else {
        console.log(`[FirestoreSyncProvider EFFECT] ✅ DEBUGGING: ID unchanged (${currentJassStoreId}) and listeners are active. All good!`); 
              }
            } else {
      // Keine aktive Game ID
      if (currentListenerId) {
        // console.log(`[FirestoreSyncProvider EFFECT] No active game ID in jassStore. Stopping listeners and resetting state.`); // LOG G
        clearListeners();
        // ENTFERNT: gameStoreReset() - Das würde die korrekten Settings überschreiben
        terminationHandledForGameId.current = null;
              } else {
         // console.log(`[FirestoreSyncProvider EFFECT] No active game ID in jassStore and no active listeners. Doing nothing.`); // LOG H
      }
    }

    // Cleanup-Funktion
      return () => {
      // console.log("[FirestoreSyncProvider] useEffect cleanup - checking if listeners need to be cleared");
    };
  // 🔥 KRITISCHER FIX: Nur STABILE Dependencies verwenden!
  }, [activeGameIdFromJassStore, syncStatus.isPaused]); // Nur primitive Werte, keine Funktionen! 
  // --- ENDE Hauptlogik useEffect ---

  // NEU: Hilfsfunktion zum Konvertieren eines Firestore-Dokuments in ein CompletedGameSummary-Objekt
  const convertDocToCompletedGameSummary = (doc: QueryDocumentSnapshot<DocumentData>) => {
    try {
      const data = doc.data();
      
      // Prüfe, ob alle erforderlichen Felder vorhanden sind
      if (!data.gameNumber || !data.finalScores || !data.finalStriche) {
        console.warn("Unvollständiges CompletedGameSummary-Dokument:", doc.id);
        return null;
      }

      // Konvertiere Firestore-Timestamp in JavaScript Date für timestampCompleted
      const timestampCompleted = isValidTimestamp(data.timestampCompleted) ? 
        data.timestampCompleted : // Behalte Timestamp-Objekt bei
        new Timestamp(0, 0);      // Fallback auf Epoch (1970-01-01)
      
      // Konvertiere Firestore-Timestamps in der roundHistory
      let roundHistory: RoundEntry[] = [];
      if (Array.isArray(data.roundHistory)) {
        roundHistory = data.roundHistory.map((entry: any) => {
          // Konvertiere timestamp in Millisekunden
          if (entry && isValidTimestamp(entry.timestamp)) {
            entry.timestamp = getMillisFromTimestamp(entry.timestamp);
          }
          return entry as RoundEntry;
        });
      }

      // Erstelle und gib das CompletedGameSummary-Objekt zurück
      return {
        gameNumber: data.gameNumber,
        timestampCompleted: timestampCompleted,
        durationMillis: data.durationMillis || 0,
        finalScores: data.finalScores,
        finalStriche: data.finalStriche,
        weisPoints: data.weisPoints || { top: 0, bottom: 0 },
        startingPlayer: data.startingPlayer,
        initialStartingPlayer: data.initialStartingPlayer,
        playerNames: data.playerNames || { 1: "", 2: "", 3: "", 4: "" },
        trumpColorsPlayed: data.trumpColorsPlayed || [],
        roundHistory: roundHistory,
        participantUids: data.participantUids || [],
        groupId: data.groupId,
        completedAt: data.completedAt || null
      };
    } catch (error) {
      console.error("Fehler beim Konvertieren des CompletedGameSummary-Dokuments:", error);
      return null;
    }
  };

  // NEU: Listener für die completedGames-Subkollektion einrichten
  useEffect(() => {
    // KORREKTUR: Abhängigkeit von jassSessionId statt activeGameId
    if (!jassSessionId || syncStatus.isPaused) { 
        console.log(`[SyncProvider] Skipping completedGames listener setup (jassSessionId: ${jassSessionId}, paused: ${syncStatus.isPaused})`);
        return; // Frühzeitig beenden, wenn keine Session-ID oder Sync pausiert
    }

    // Bestehende Listener bereinigen
    if (completedGamesUnsubscribeRef.current) {
      completedGamesUnsubscribeRef.current();
      completedGamesUnsubscribeRef.current = null;
    }

    try {
      // Verwende die STABILE jassSessionId 
      const sessionId = jassSessionId;
      
      console.log(`[FirestoreSyncProvider] Setting up listener for completed games using sessionId: ${sessionId}`);
      
      const completedGamesCollectionRef = collection(db, 'jassGameSummaries', sessionId, 'completedGames');
      const completedGamesQuery = query(completedGamesCollectionRef, orderBy('gameNumber'));
      
      completedGamesUnsubscribeRef.current = onSnapshot(
        completedGamesQuery,
        (querySnapshot) => {
          // --- LOGGING START ---
          const timestamp = new Date().toISOString();
          console.log(`[FirestoreSync COMPLETED_GAMES ${timestamp}] Listener received update for session ${sessionId}: ${querySnapshot.size} documents.`);
          // --- LOGGING END ---
          
          // Konvertiere alle Dokumente in CompletedGameSummary-Objekte
          const completedGames = querySnapshot.docs
            .map(doc => convertDocToCompletedGameSummary(doc))
            .filter(game => game !== null) as CompletedGameSummary[];
          
          // --- LOGGING START ---
          console.log(`[FirestoreSync COMPLETED_GAMES ${timestamp}] Parsed ${completedGames.length} completed games from snapshot.`);
          // --- LOGGING END ---

          // Aktualisiere den jassStore mit den CompletedGameSummary-Objekten
          useJassStore.setState(state => {
            const oldGamesJson = JSON.stringify(state.onlineCompletedGames);
            const newGamesJson = JSON.stringify(completedGames);

            if (oldGamesJson !== newGamesJson) {
                // --- LOGGING START ---
                console.log(`[FirestoreSync COMPLETED_GAMES ${timestamp}] State changed! Attempting to update jassStore.onlineCompletedGames. Old count: ${state.onlineCompletedGames.length}, New count: ${completedGames.length}`);
                // --- LOGGING END ---
                return { ...state, onlineCompletedGames: completedGames };
            } else {
                // --- LOGGING START ---
                console.log(`[FirestoreSync COMPLETED_GAMES ${timestamp}] State unchanged. No update to jassStore needed.`);
                // --- LOGGING END ---
                return state; // Keine Änderung nötig
            }
          });
        },
        (error) => {
          // --- LOGGING START ---
          const timestamp = new Date().toISOString();
          console.error(`[FirestoreSync COMPLETED_GAMES ${timestamp}] Error listening to completed games in session ${sessionId}:`, error);
          // --- LOGGING END ---
          setSyncStatus(prev => ({
            ...prev,
            syncError: error instanceof Error ? error : new Error('Unknown error')
          }));
        }
      );

      return () => {
        if (completedGamesUnsubscribeRef.current) {
          completedGamesUnsubscribeRef.current();
          completedGamesUnsubscribeRef.current = null;
        }
      };
    } catch (error) {
      console.error('Fehler beim Einrichten der completedGames-Listener', error);
      setSyncStatus(prev => ({
        ...prev,
        syncError: error instanceof Error ? error : new Error('Unknown error')
      }));
    }
    // 🔥 KRITISCHER FIX: db entfernt - potentiell instabil
  }, [jassSessionId, syncStatus.isPaused]);

  return (
    <FirestoreSyncContext.Provider value={{
      syncStatus,
      pauseSync,
      resumeSync,
      markLocalUpdate
    }}>
      {children}
    </FirestoreSyncContext.Provider>
  );
};