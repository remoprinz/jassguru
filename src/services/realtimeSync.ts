import { doc, onSnapshot, collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebaseInit';
import { useGameStore } from '../store/gameStore';
import { useJassStore } from '../store/jassStore';
import { useUIStore } from '../store/uiStore';
import { 
  ActiveGame, 
  RoundEntry, 
  GameState, 
  TeamPosition, 
  StricheRecord,
  TeamScores
} from '../types/jass';
import { loadRoundsFromFirestore } from './gameService';

// Flag, das anzeigt, ob Änderungen vom Server kommen (true) oder lokal sind (false)
let isApplyingRemoteChanges = false;

// Zustandsvariablen für die Listener
let gameUnsubscribe: (() => void) | null = null;
let roundsUnsubscribe: (() => void) | null = null;

/**
 * Initialisiert die Echtzeit-Synchronisierung für ein aktives Spiel
 * @param gameId ID des aktiven Spiels
 * @returns Eine Funktion zum Beenden der Echtzeit-Synchronisierung
 */
export const initRealtimeSync = (gameId: string): (() => void) => {
  console.log(`[RealtimeSync] Initialisiere Echtzeit-Synchronisierung für Spiel ${gameId}`);
  
  // Bestehende Listener bereinigen, falls vorhanden
  cleanupRealtimeSync();
  
  // Listener für das Hauptdokument des aktiven Spiels
  const gameDocRef = doc(db, 'activeGames', gameId);
  gameUnsubscribe = onSnapshot(gameDocRef, async (docSnap) => {
    if (!docSnap.exists()) {
      console.warn(`[RealtimeSync] Spiel ${gameId} existiert nicht mehr.`);
      useUIStore.getState().showNotification({
        type: "warning",
        message: "Dieses Spiel existiert nicht mehr oder wurde archiviert."
      });
      return;
    }
    
    // Daten aus Firestore
    const gameData = docSnap.data() as ActiveGame;
    console.log(`[RealtimeSync] Spielupdate für ${gameId} empfangen:`, gameData);
    
    // Aktueller Spielzustand
    const currentState = useGameStore.getState();
    
    // Vergleiche Metadaten des Spiels, um zu prüfen, ob ein Update erforderlich ist
    // Achtung: lastUpdated kann vom Server gesetzt sein und dennoch ein lokales Update sein
    if (isApplyingRemoteChanges) {
      console.log("[RealtimeSync] Überspringe Update, da wir gerade ein Remote-Update anwenden");
      return;
    }
    
    // Prüfen, ob der Server-Status neuer ist als der lokale
    const serverStateIsNewer = 
      gameData.currentRound > currentState.currentRound;

    // Wenn wir eine Aktualisierung von einem anderen Client erhalten haben
    if (serverStateIsNewer) {
      try {
        console.log("[RealtimeSync] Server-Zustand ist neuer, wende Änderungen an");
        isApplyingRemoteChanges = true;
        
        // Lade die neuesten Rundendaten
        const rounds = await loadRoundsFromFirestore(gameId);
        
        // Update des GameStore mit den Daten aus Firestore
        useGameStore.setState({
          currentRound: gameData.currentRound,
          currentPlayer: gameData.currentPlayer,
          startingPlayer: gameData.startingPlayer,
          scores: gameData.scores || { top: 0, bottom: 0 },
          striche: gameData.striche || {
            top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
            bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
          },
          weisPoints: gameData.weisPoints || { top: 0, bottom: 0 },
          currentRoundWeis: gameData.currentRoundWeis || [],
          roundHistory: rounds || []
        });
        
        // Aktualisiere den currentHistoryIndex basierend auf der Länge der Historie
        if (rounds && rounds.length > 0) {
          useGameStore.setState({
            currentHistoryIndex: rounds.length - 1
          });
        }
        
        // Benachrichtigung anzeigen
        useUIStore.getState().showNotification({
          type: "info",
          message: "Spielstand wurde mit Server synchronisiert."
        });
      } catch (error) {
        console.error("[RealtimeSync] Fehler beim Synchronisieren des Spiels:", error);
        useUIStore.getState().showNotification({
          type: "error",
          message: "Fehler bei der Synchronisierung mit dem Server. Bitte überprüfe deine Internetverbindung!"
        });
      } finally {
        isApplyingRemoteChanges = false;
      }
    } else {
      console.log("[RealtimeSync] Lokaler Zustand ist aktuell oder neuer als Server-Zustand, ignoriere Update");
    }
  }, (error) => {
    console.error("[RealtimeSync] Fehler beim Abhören von Spieländerungen:", error);
    useUIStore.getState().showNotification({
      type: "error",
      message: "Verbindungsprobleme mit dem Server festgestellt. Bitte überprüfe deine Internetverbindung!"
    });
  });

  // Erstelle einen Listener für Rundenänderungen (wird bei neuen Runden ausgelöst)
  const roundsCollectionRef = collection(db, 'activeGames', gameId, 'rounds');
  const roundsQuery = query(roundsCollectionRef, orderBy('roundId', 'asc'));
  
  // Optional: Listener für einzelne Rundendaten
  // Im aktuellen Design laden wir bei Spieländerungen alle Runden neu
  // Dieser Listener könnte für eine feinere Granularität verwendet werden
  
  return cleanupRealtimeSync;
};

/**
 * Bereinigt alle aktiven Listener
 */
export const cleanupRealtimeSync = () => {
  console.log("[RealtimeSync] Bereinige Echtzeit-Listener");
  
  if (gameUnsubscribe) {
    gameUnsubscribe();
    gameUnsubscribe = null;
  }
  
  if (roundsUnsubscribe) {
    roundsUnsubscribe();
    roundsUnsubscribe = null;
  }
};

/**
 * Gibt an, ob gerade Remote-Änderungen angewendet werden.
 * Wird verwendet, um Endlosschleifen bei Synchronisierung zu vermeiden.
 */
export const getIsApplyingRemoteChanges = (): boolean => {
  return isApplyingRemoteChanges;
};

/**
 * Setzt das Flag, dass Remote-Änderungen angewendet werden
 */
export const setIsApplyingRemoteChanges = (value: boolean): void => {
  isApplyingRemoteChanges = value;
}; 