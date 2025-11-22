/**
 * Offline-First IndexedDB Helper für Jasstafel App
 * Persistiert wichtige Spieldaten und Sync-Queues für maximale Robustheit
 */

export interface QueuedGameFinalization {
  id: string;
  type: 'GAME_COMPLETED';
  sessionId: string;
  gameData: any; // CompletedGameSummary
  timestamp: number;
  attempts: number;
  lastAttempt?: number;
  error?: string;
}

export interface OfflineGameEntry {
  id: string;
  sessionId: string;
  gameData: any;
  timestamp: number;
  synced: boolean;
}

class OfflineDBHelper {
  private dbName = 'JasstafelOfflineDB';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 🛡️ BULLETPROOF: Timeout-Protection für IndexedDB
      const timeout = setTimeout(() => {
        console.warn('[IndexedDB] Init timeout nach 3s - möglicherweise Safari Private Mode');
        reject(new Error('IndexedDB initialization timeout'));
      }, 3000);

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        clearTimeout(timeout);
        reject(request.error);
      };
      request.onsuccess = () => {
        clearTimeout(timeout);
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 🔄 Sync Queue Store
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncQueueStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          syncQueueStore.createIndex('timestamp', 'timestamp');
          syncQueueStore.createIndex('type', 'type');
          syncQueueStore.createIndex('attempts', 'attempts');
        }

        // 💾 Offline Games Store
        if (!db.objectStoreNames.contains('offlineGames')) {
          const offlineGamesStore = db.createObjectStore('offlineGames', { keyPath: 'id' });
          offlineGamesStore.createIndex('sessionId', 'sessionId');
          offlineGamesStore.createIndex('timestamp', 'timestamp');
          offlineGamesStore.createIndex('synced', 'synced');
        }

        // ⚙️ Settings Store (für Settings-Recovery)
        if (!db.objectStoreNames.contains('gameSettings')) {
          const settingsStore = db.createObjectStore('gameSettings', { keyPath: 'sessionId' });
          settingsStore.createIndex('timestamp', 'timestamp');
        }
      };
    });
  }

  async addToSyncQueue(item: QueuedGameFinalization): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      
      const request = store.add(item);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {

        resolve();
      };
    });
  }

  async getPendingSyncItems(): Promise<QueuedGameFinalization[]> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncQueue'], 'readonly');
      const store = transaction.objectStore('syncQueue');
      const index = store.index('timestamp');
      
      const request = index.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const items = request.result as QueuedGameFinalization[];
        // Sortiere nach Priorität: Neuere zuerst, aber mit weniger Versuchen priorisiert
        items.sort((a, b) => {
          if (a.attempts !== b.attempts) return a.attempts - b.attempts;
          return b.timestamp - a.timestamp;
        });
        resolve(items);
      };
    });
  }

  async removeSyncItem(id: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {

        resolve();
      };
    });
  }

  async updateSyncItem(item: QueuedGameFinalization): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      
      const request = store.put(item);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log(`[OfflineDB] ✅ Sync item updated: ${item.id} (attempts: ${item.attempts})`);
        resolve();
      };
    });
  }

  async saveOfflineGame(game: OfflineGameEntry): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineGames'], 'readwrite');
      const store = transaction.objectStore('offlineGames');
      
      const request = store.put(game);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log(`[OfflineDB] ✅ Offline game saved: ${game.id}`);
        resolve();
      };
    });
  }

  async getOfflineGames(sessionId?: string): Promise<OfflineGameEntry[]> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineGames'], 'readonly');
      const store = transaction.objectStore('offlineGames');
      
      let request: IDBRequest;
      if (sessionId) {
        const index = store.index('sessionId');
        request = index.getAll(sessionId);
      } else {
        request = store.getAll();
      }
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as OfflineGameEntry[]);
    });
  }

  async clearSyncedGames(): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineGames'], 'readwrite');
      const store = transaction.objectStore('offlineGames');
      const index = store.index('synced');
      
      const request = index.openCursor(); // Only synced items
      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const value = cursor.value as OfflineGameEntry;
          if (value.synced) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          console.log('[OfflineDB] ✅ Synced games cleared');
          resolve();
        }
      };
    });
  }

  async saveGameSettings(sessionId: string, settings: any): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['gameSettings'], 'readwrite');
      const store = transaction.objectStore('gameSettings');
      
      const settingsData = {
        sessionId,
        settings,
        timestamp: Date.now()
      };
      
      const request = store.put(settingsData);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log(`[OfflineDB] ✅ Game settings saved for session: ${sessionId}`);
        resolve();
      };
    });
  }

  async getGameSettings(sessionId: string): Promise<any | null> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['gameSettings'], 'readonly');
      const store = transaction.objectStore('gameSettings');
      
      const request = store.get(sessionId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.settings : null);
      };
    });
  }
}

// Singleton Pattern
let offlineDBInstance: OfflineDBHelper | null = null;

export const getOfflineDB = async (): Promise<OfflineDBHelper> => {
  if (!offlineDBInstance) {
    offlineDBInstance = new OfflineDBHelper();
    await offlineDBInstance.init();
  }
  return offlineDBInstance;
};

export default OfflineDBHelper;

// IndexedDB Corruption Recovery Helper
export const clearCorruptedIndexedDB = async (): Promise<void> => {
  try {
    console.log('🔧 [IndexedDB Recovery] Starte Reparatur korrupter IndexedDB...');
    
    // 1. Alle bekannten App-Datenbanken löschen
    const dbNamesToClear = [
      'keyval-store',           // Zustand persistence
      'firebase-installations-store',
      'firebase-messaging-store',
      'firebaseLocalStorageDb',
      'firebase-app-check-store',
      'jassguru-app-store',    // Falls vorhanden
      '_defaultdb',            // Fallback
    ];

    for (const dbName of dbNamesToClear) {
      try {
        console.log(`🗑️ [IndexedDB Recovery] Lösche Datenbank: ${dbName}`);
        await new Promise<void>((resolve, reject) => {
          const deleteReq = indexedDB.deleteDatabase(dbName);
          deleteReq.onsuccess = () => {
            console.log(`✅ [IndexedDB Recovery] ${dbName} erfolgreich gelöscht`);
            resolve();
          };
          deleteReq.onerror = () => {
            console.log(`⚠️ [IndexedDB Recovery] ${dbName} nicht gefunden (OK)`);
            resolve(); // Nicht als Fehler werten
          };
          deleteReq.onblocked = () => {
            console.log(`🔄 [IndexedDB Recovery] ${dbName} blockiert, warte...`);
            setTimeout(() => resolve(), 1000);
          };
        });
      } catch (error) {
        console.log(`⚠️ [IndexedDB Recovery] Fehler bei ${dbName}:`, error);
        // Weiter machen, nicht stoppen
      }
    }

    // 2. LocalStorage für Zustand-Persistence löschen  
    const zustandKeys = Object.keys(localStorage).filter(key => 
      key.includes('zustand') || 
      key.includes('jassguru') ||
      key.includes('firebase') ||
      key.includes('tutorial') ||
      key.includes('auth')
    );
    
    zustandKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
        console.log(`🗑️ [IndexedDB Recovery] LocalStorage Key gelöscht: ${key}`);
      } catch (error) {
        console.log(`⚠️ [IndexedDB Recovery] Fehler bei LocalStorage:`, error);
      }
    });

    console.log('✅ [IndexedDB Recovery] IndexedDB Reparatur abgeschlossen');
    
  } catch (error) {
    console.error('❌ [IndexedDB Recovery] Kritischer Fehler bei DB-Reparatur:', error);
    throw error;
  }
};

export const handleIndexedDBCorruption = async (): Promise<void> => {
  try {
    await clearCorruptedIndexedDB();
    
    // Kurz warten, dann Seite neu laden
    setTimeout(() => {
      console.log('🔄 [IndexedDB Recovery] Lade Seite neu...');
      window.location.reload();
    }, 1000);
    
  } catch (error) {
    console.error('❌ [IndexedDB Recovery] Fehler bei Korruptions-Behandlung:', error);
    
    // Letzter Ausweg: Hard-Reload
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  }
};

export const isIndexedDBCorruptionError = (error: any): boolean => {
  if (!error) return false;
  
  const errorMessage = error.message || error.toString();
  return errorMessage.includes('refusing to open IndexedDB') ||
         errorMessage.includes('potential corruption') ||
         errorMessage.includes('lastClosedDbVersion') ||
         (error.name === 'VersionError' && errorMessage.includes('database'));
}; 