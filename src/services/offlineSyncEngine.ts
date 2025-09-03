/**
 * Offline-First Sync-Engine für Jasstafel App
 * Automatische Background-Synchronisation von Spieldaten mit Firestore
 */

import { getOfflineDB, QueuedGameFinalization, OfflineGameEntry } from '@/utils/indexedDBHelper';
import { saveCompletedGameToFirestore, updateSessionActiveGameId } from '@/services/gameService';
import { v4 as uuidv4 } from 'uuid';

export interface SyncEngineConfig {
  maxRetries: number;
  baseRetryDelay: number; // milliseconds
  maxRetryDelay: number; // milliseconds  
  batchSize: number;
  networkCheckInterval: number; // milliseconds
}

const DEFAULT_CONFIG: SyncEngineConfig = {
  maxRetries: 10,
  baseRetryDelay: 1000, // 1 second
  maxRetryDelay: 30000, // 30 seconds
  batchSize: 3,
  networkCheckInterval: 5000, // 5 seconds
};

class OfflineSyncEngine {
  private config: SyncEngineConfig;
  private isRunning = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private networkCheckInterval: NodeJS.Timeout | null = null;
  private isOnline = navigator.onLine;

  constructor(config: Partial<SyncEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupNetworkListeners();
  }

  private setupNetworkListeners(): void {
    // Browser Network Status
    window.addEventListener('online', () => {
      console.log('[SyncEngine] 🌐 Network: ONLINE - Resuming sync');
      this.isOnline = true;
      this.start();
    });

    window.addEventListener('offline', () => {
      console.log('[SyncEngine] 📴 Network: OFFLINE - Pausing sync');
      this.isOnline = false;
      this.pause();
    });

    // Additional Network Check (because browser events aren't always reliable)
    this.networkCheckInterval = setInterval(() => {
      const wasOnline = this.isOnline;
      this.isOnline = navigator.onLine;
      
      if (!wasOnline && this.isOnline) {
        console.log('[SyncEngine] 🔄 Network check: Back online - Resuming sync');
        this.start();
      } else if (wasOnline && !this.isOnline) {
        console.log('[SyncEngine] 🔄 Network check: Gone offline - Pausing sync');
        this.pause();
      }
    }, this.config.networkCheckInterval);
  }

  async start(): Promise<void> {
    if (this.isRunning || !this.isOnline) return;
    
    console.log('[SyncEngine] 🚀 Starting background synchronization');
    this.isRunning = true;
    
    // Initial sync attempt
    await this.processSyncQueue();
    
    // Start periodic sync
    this.syncInterval = setInterval(async () => {
      if (this.isOnline && this.isRunning) {
        await this.processSyncQueue();
      }
    }, 10000); // Check every 10 seconds
  }

  pause(): void {
    if (!this.isRunning) return;
    
    console.log('[SyncEngine] ⏸️ Pausing synchronization');
    this.isRunning = false;
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  stop(): void {
    console.log('[SyncEngine] 🛑 Stopping sync engine');
    this.pause();
    
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }
    
    // Remove event listeners
    window.removeEventListener('online', this.start);
    window.removeEventListener('offline', this.pause);
  }

  async queueGameFinalization(
    sessionId: string,
    gameData: any,
    priority: 'HIGH' | 'NORMAL' = 'HIGH'
  ): Promise<void> {
    const offlineDB = await getOfflineDB();
    
    const queueItem: QueuedGameFinalization = {
      id: uuidv4(),
      type: 'GAME_COMPLETED',
      sessionId,
      gameData,
      timestamp: Date.now(),
      attempts: 0,
    };
    
    try {
      await offlineDB.addToSyncQueue(queueItem);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SyncEngine] ✅ Game finalization queued: ${queueItem.id}`);
      }
      
      // Try immediate sync if online
      if (this.isOnline) {
        await this.processSyncQueue();
      }
    } catch (error) {
      console.error('[SyncEngine] ❌ Failed to queue game finalization:', error);
      throw error;
    }
  }

  async saveOfflineGame(sessionId: string, gameData: any): Promise<void> {
    const offlineDB = await getOfflineDB();
    
    const offlineGame: OfflineGameEntry = {
      id: uuidv4(),
      sessionId,
      gameData,
      timestamp: Date.now(),
      synced: false,
    };
    
    try {
      await offlineDB.saveOfflineGame(offlineGame);
      console.log(`[SyncEngine] 💾 Game saved offline: ${offlineGame.id}`);
    } catch (error) {
      console.error('[SyncEngine] ❌ Failed to save offline game:', error);
      throw error;
    }
  }

  private async processSyncQueue(): Promise<void> {
    if (!this.isOnline) return;
    
    try {
      const offlineDB = await getOfflineDB();
      const pendingItems = await offlineDB.getPendingSyncItems();
      
      if (pendingItems.length === 0) {
        // console.log('[SyncEngine] ✅ Sync queue is empty');
        return;
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SyncEngine] 🔄 Processing ${pendingItems.length} pending sync items`);
      }
      
      // Process items in batches
      const batchSize = this.config.batchSize;
      for (let i = 0; i < pendingItems.length; i += batchSize) {
        const batch = pendingItems.slice(i, i + batchSize);
        await Promise.all(batch.map(item => this.processSyncItem(item)));
      }
      
    } catch (error) {
      console.error('[SyncEngine] ❌ Error processing sync queue:', error);
    }
  }

  private async processSyncItem(item: QueuedGameFinalization): Promise<void> {
    const offlineDB = await getOfflineDB();
    
    try {
      // Check if we should retry
      if (item.attempts >= this.config.maxRetries) {
        console.error(`[SyncEngine] ❌ Max retries exceeded for item ${item.id}. Removing from queue.`);
        await offlineDB.removeSyncItem(item.id);
        return;
      }
      
      // Calculate retry delay
      const delay = Math.min(
        this.config.baseRetryDelay * Math.pow(2, item.attempts),
        this.config.maxRetryDelay
      );
      
      // Check if enough time has passed since last attempt
      if (item.lastAttempt && (Date.now() - item.lastAttempt) < delay) {
        return; // Too soon to retry
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SyncEngine] 🔄 Attempting sync for item ${item.id} (attempt ${item.attempts + 1})`);
      }
      
      // Attempt to sync
      await this.syncGameFinalization(item);
      
      // Success - remove from queue
      await offlineDB.removeSyncItem(item.id);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SyncEngine] ✅ Successfully synced item ${item.id}`);
      }
      
    } catch (error) {
      console.warn(`[SyncEngine] ⚠️ Sync attempt failed for item ${item.id}:`, error);
      
      // Update item with error info
      const updatedItem: QueuedGameFinalization = {
        ...item,
        attempts: item.attempts + 1,
        lastAttempt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
      
      await offlineDB.updateSyncItem(updatedItem);
    }
  }

  private async syncGameFinalization(item: QueuedGameFinalization): Promise<void> {
    const { sessionId, gameData } = item;
    
    // Determine game number from gameData
    const gameNumber = gameData.gameNumber || 1;
    
    try {
      // 1. Save completed game to Firestore
      await saveCompletedGameToFirestore(sessionId, gameNumber, gameData, false);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SyncEngine] ✅ Completed game saved to Firestore: Session ${sessionId}, Game ${gameNumber}`);
      }
      
      // 2. Clear active game ID from session (if this was the last game)
      // This is optional and depends on your business logic
      if (gameData.clearActiveGameId !== false) {
        try {
          await updateSessionActiveGameId(sessionId, null);
          if (process.env.NODE_ENV === 'development') {
            console.log(`[SyncEngine] ✅ Session activeGameId cleared: ${sessionId}`);
          }
        } catch (sessionError) {
          console.warn(`[SyncEngine] ⚠️ Failed to clear session activeGameId (non-critical):`, sessionError);
          // Don't fail the entire sync for this
        }
      }
      
    } catch (error) {
      console.error(`[SyncEngine] ❌ Failed to sync game finalization:`, error);
      throw error; // Re-throw to trigger retry logic
    }
  }

  async getPendingCount(): Promise<number> {
    try {
      const offlineDB = await getOfflineDB();
      const pendingItems = await offlineDB.getPendingSyncItems();
      return pendingItems.length;
    } catch (error) {
      console.error('[SyncEngine] ❌ Failed to get pending count:', error);
      return 0;
    }
  }

  async clearCompletedSyncs(): Promise<void> {
    try {
      const offlineDB = await getOfflineDB();
      await offlineDB.clearSyncedGames();
      console.log('[SyncEngine] ✅ Cleared completed syncs from local storage');
    } catch (error) {
      console.error('[SyncEngine] ❌ Failed to clear completed syncs:', error);
    }
  }
}

// Singleton Pattern
let syncEngineInstance: OfflineSyncEngine | null = null;

export const getSyncEngine = (): OfflineSyncEngine => {
  if (!syncEngineInstance) {
    syncEngineInstance = new OfflineSyncEngine();
  }
  return syncEngineInstance;
};

export const initSyncEngine = (config?: Partial<SyncEngineConfig>): OfflineSyncEngine => {
  if (syncEngineInstance) {
    syncEngineInstance.stop(); // Stop existing instance
  }
  syncEngineInstance = new OfflineSyncEngine(config);
  return syncEngineInstance;
};

export default OfflineSyncEngine; 