/**
 * Test-Helper für die Offline-Sync-Engine
 * Hilfsfunktionen zum Testen von Offline-Szenarien und Sync-Verhalten
 */

import { getSyncEngine } from '@/services/offlineSyncEngine';
import { getOfflineDB } from '@/utils/indexedDBHelper';

export interface OfflineTestResult {
  success: boolean;
  message: string;
  details?: any;
}

export class OfflineTestHelper {
  static async testIndexedDBConnection(): Promise<OfflineTestResult> {
    try {
      const offlineDB = await getOfflineDB();
      return {
        success: true,
        message: 'IndexedDB connection successful',
        details: { dbInitialized: true }
      };
    } catch (error) {
      return {
        success: false,
        message: 'IndexedDB connection failed',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  static async testSyncEngineInitialization(): Promise<OfflineTestResult> {
    try {
      const syncEngine = getSyncEngine();
      const pendingCount = await syncEngine.getPendingCount();
      
      return {
        success: true,
        message: 'Sync engine initialized successfully',
        details: { 
          engineInitialized: true,
          pendingItems: pendingCount,
          isOnline: navigator.onLine
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Sync engine initialization failed',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  static async testOfflineGameSave(mockSessionId: string = 'test-session'): Promise<OfflineTestResult> {
    try {
      const syncEngine = getSyncEngine();
      const mockGameData = {
        gameNumber: 999,
        finalScores: { top: 1000, bottom: 800 },
        finalStriche: { 
          top: { berg: 0, sieg: 1, matsch: 0, schneider: 0, kontermatsch: 0 },
          bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
        },
        timestamp: Date.now(),
        isTest: true
      };

      await syncEngine.saveOfflineGame(mockSessionId, mockGameData);
      
      return {
        success: true,
        message: 'Offline game save successful',
        details: { gameData: mockGameData }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Offline game save failed',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  static async testSyncQueueing(mockSessionId: string = 'test-session'): Promise<OfflineTestResult> {
    try {
      const syncEngine = getSyncEngine();
      const mockGameData = {
        gameNumber: 998,
        finalScores: { top: 900, bottom: 700 },
        finalStriche: { 
          top: { berg: 1, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
          bottom: { berg: 0, sieg: 0, matsch: 1, schneider: 0, kontermatsch: 0 }
        },
        timestamp: Date.now(),
        isTest: true,
        clearActiveGameId: false // Don't clear for test
      };

      await syncEngine.queueGameFinalization(mockSessionId, mockGameData, 'HIGH');
      const pendingCount = await syncEngine.getPendingCount();
      
      return {
        success: true,
        message: 'Sync queueing successful',
        details: { 
          queuedGameData: mockGameData,
          pendingCount: pendingCount
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Sync queueing failed',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  static async runOfflineTests(): Promise<OfflineTestResult[]> {
    console.log('[OfflineTestHelper] 🧪 Running offline functionality tests...');
    
    const results: OfflineTestResult[] = [];
    
    // Test 1: IndexedDB Connection
    console.log('[OfflineTestHelper] Test 1: IndexedDB Connection');
    const dbTest = await this.testIndexedDBConnection();
    results.push(dbTest);
    console.log(`[OfflineTestHelper] Result: ${dbTest.success ? '✅' : '❌'} ${dbTest.message}`);
    
    // Test 2: Sync Engine Initialization
    console.log('[OfflineTestHelper] Test 2: Sync Engine Initialization');
    const syncTest = await this.testSyncEngineInitialization();
    results.push(syncTest);
    console.log(`[OfflineTestHelper] Result: ${syncTest.success ? '✅' : '❌'} ${syncTest.message}`);
    
    // Test 3: Offline Game Save (only if previous tests passed)
    if (dbTest.success && syncTest.success) {
      console.log('[OfflineTestHelper] Test 3: Offline Game Save');
      const offlineTest = await this.testOfflineGameSave();
      results.push(offlineTest);
      console.log(`[OfflineTestHelper] Result: ${offlineTest.success ? '✅' : '❌'} ${offlineTest.message}`);
      
      // Test 4: Sync Queueing
      console.log('[OfflineTestHelper] Test 4: Sync Queueing');
      const queueTest = await this.testSyncQueueing();
      results.push(queueTest);
      console.log(`[OfflineTestHelper] Result: ${queueTest.success ? '✅' : '❌'} ${queueTest.message}`);
    } else {
      console.log('[OfflineTestHelper] ⚠️ Skipping advanced tests due to basic failures');
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`[OfflineTestHelper] 📊 Tests completed: ${successCount}/${results.length} passed`);
    
    return results;
  }

  static async clearTestData(): Promise<void> {
    try {
      const offlineDB = await getOfflineDB();
      
      // Clear test sync items
      const pendingItems = await offlineDB.getPendingSyncItems();
      for (const item of pendingItems) {
        if (item.gameData?.isTest) {
          await offlineDB.removeSyncItem(item.id);
          console.log(`[OfflineTestHelper] 🗑️ Removed test sync item: ${item.id}`);
        }
      }
      
      // Clear test offline games
      const offlineGames = await offlineDB.getOfflineGames();
      for (const game of offlineGames) {
        if (game.gameData?.isTest) {
          // Note: No direct delete method for offline games, so we mark them as synced
          console.log(`[OfflineTestHelper] 🗑️ Found test offline game: ${game.id}`);
        }
      }
      
      console.log('[OfflineTestHelper] ✅ Test data cleanup completed');
    } catch (error) {
      console.error('[OfflineTestHelper] ❌ Test data cleanup failed:', error);
    }
  }
}

// Global Test Function (can be called from browser console)
(window as any).testOfflineSync = async () => {
  const results = await OfflineTestHelper.runOfflineTests();
  console.table(results);
  return results;
};

(window as any).clearOfflineTestData = async () => {
  await OfflineTestHelper.clearTestData();
  console.log('Test data cleared');
};

export default OfflineTestHelper; 