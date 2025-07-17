import { getFirestore, enableNetwork, disableNetwork, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseApp } from './firebaseInit';
import { useGameStore } from '@/store/gameStore';
import { useJassStore } from '@/store/jassStore';
import { sanitizeDataForFirestore } from '@/utils/firestoreUtils';
import { updateActiveGame } from './gameService';

class OfflineSyncService {
  private isOnline: boolean = navigator.onLine;
  private pendingSync: boolean = false;
  private syncInProgress: boolean = false;
  private db = getFirestore(firebaseApp);
  
  constructor() {
    this.initializeListeners();
  }

  private initializeListeners() {
    // Netzwerk-Status überwachen
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
    
    // Firestore Verbindungsstatus überwachen
    const connectedRef = doc(this.db, '.info/connected');
    onSnapshot(connectedRef, (snapshot) => {
      const isConnected = snapshot.exists() && snapshot.data()?.connected === true;
      console.log('[OfflineSync] Firestore connection status:', isConnected);
      
      if (isConnected && this.pendingSync && !this.syncInProgress) {
        this.performSync();
      }
    });
  }

  private handleOnline = async () => {
    console.log('[OfflineSync] 🟢 Browser meldet: Online');
    this.isOnline = true;
    
    // Markiere, dass Sync benötigt wird
    this.pendingSync = true;
    
    // Warte kurz, damit Firestore sich verbinden kann
    setTimeout(() => {
      if (!this.syncInProgress) {
        this.performSync();
      }
    }, 1000);
  };

  private handleOffline = () => {
    console.log('[OfflineSync] 🔴 Browser meldet: Offline');
    this.isOnline = false;
  };

  private async performSync() {
    if (this.syncInProgress) {
      console.log('[OfflineSync] Sync bereits im Gange, überspringe...');
      return;
    }

    this.syncInProgress = true;
    this.pendingSync = false;

    console.log('[OfflineSync] 🔄 Starte Synchronisation...');

    try {
      // 1. Hole aktuelle States
      const gameState = useGameStore.getState();
      const jassState = useJassStore.getState();

      // 2. Prüfe ob wir eine aktive Game ID haben
      if (!gameState.activeGameId) {
        console.log('[OfflineSync] Keine aktive Game ID, überspringe Sync');
        return;
      }

      // 3. Synchronisiere Game State
      await this.syncGameState(gameState);

      // 4. Synchronisiere Jass State falls nötig
      if (jassState.activeGameId) {
        await this.syncJassState(jassState);
      }

      console.log('[OfflineSync] ✅ Synchronisation erfolgreich abgeschlossen');
      
    } catch (error) {
      console.error('[OfflineSync] ❌ Fehler bei der Synchronisation:', error);
      // Bei Fehler nochmal versuchen
      this.pendingSync = true;
      setTimeout(() => this.performSync(), 5000);
    } finally {
      this.syncInProgress = false;
    }
  }

  private async syncGameState(gameState: any) {
    const { activeGameId, scores, striche, weisPoints, currentRound, 
            currentPlayer, startingPlayer, isRoundCompleted, 
            currentJassPoints, currentRoundWeis, roundHistory } = gameState;

    console.log('[OfflineSync] Synchronisiere Game State für:', activeGameId);

    const updateData = {
      scores,
      striche,
      weisPoints,
      currentRound,
      currentPlayer,
      startingPlayer,
      isRoundCompleted,
      currentJassPoints,
      currentRoundWeis,
      lastUpdated: serverTimestamp(),
      // Markiere dass dies ein Offline-Sync ist
      offlineSync: true,
      offlineSyncTimestamp: serverTimestamp()
    };

    const cleanedData = sanitizeDataForFirestore(updateData);
    await updateActiveGame(activeGameId, cleanedData);

    // Synchronisiere auch die Round History wenn vorhanden
    if (roundHistory && roundHistory.length > 0) {
      console.log(`[OfflineSync] Synchronisiere ${roundHistory.length} Runden...`);
      
      // Importiere die Funktion dynamisch um zirkuläre Abhängigkeiten zu vermeiden
      const { saveRoundToFirestore } = await import('./gameService');
      
      // Synchronisiere nur die letzten 10 Runden um Performance zu optimieren
      const roundsToSync = roundHistory.slice(-10);
      
      for (const round of roundsToSync) {
        try {
          await saveRoundToFirestore(activeGameId, round);
        } catch (error) {
          console.error('[OfflineSync] Fehler beim Synchronisieren der Runde:', round.roundId, error);
        }
      }
    }
  }

  private async syncJassState(jassState: any) {
    const { activeGameId, currentSession } = jassState;
    
    if (!currentSession?.id) {
      console.log('[OfflineSync] Keine Session ID, überspringe Jass Sync');
      return;
    }

    console.log('[OfflineSync] Synchronisiere Jass State für Session:', currentSession.id);

    // Session Update
    const sessionRef = doc(this.db, 'sessions', currentSession.id);
    await updateDoc(sessionRef, {
      currentActiveGameId: activeGameId,
      lastUpdated: serverTimestamp(),
      offlineSync: true
    });
  }

  // Öffentliche Methode zum manuellen Triggern
  public triggerSync() {
    if (this.isOnline && !this.syncInProgress) {
      this.pendingSync = true;
      this.performSync();
    }
  }

  // Methode zum Markieren dass lokale Updates vorhanden sind
  public markPendingSync() {
    this.pendingSync = true;
  }
  
  // Öffentliche Methode um zu prüfen ob Sync läuft
  public isSyncInProgress(): boolean {
    return this.syncInProgress;
  }
  
  // Öffentliche Methode um zu prüfen ob Sync ausstehend ist
  public hasPendingSync(): boolean {
    return this.pendingSync;
  }
}

// Singleton Instance
export const offlineSyncService = new OfflineSyncService();

// Erweitere das Window Interface für globalen Zugriff
declare global {
  interface Window {
    __OFFLINE_SYNC_SERVICE__?: OfflineSyncService;
  }
}

// Mache Service global verfügbar
if (typeof window !== 'undefined') {
  window.__OFFLINE_SYNC_SERVICE__ = offlineSyncService;
} 