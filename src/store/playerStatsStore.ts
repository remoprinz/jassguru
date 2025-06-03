import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { getFirestore, doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { firebaseApp } from '@/services/firebaseInit'; 
import type { FrontendPlayerComputedStats, FrontendStatHighlight, FrontendStatStreak, FrontendTournamentPlacement } from '@/types/computedStats';
import { initialFrontendPlayerComputedStats } from '@/types/computedStats';

interface PlayerStatsState {
  stats: FrontendPlayerComputedStats | null;
  isLoading: boolean;
  error: string | null;
  activeListenerUnsubscribe: (() => void) | null;
}

interface PlayerStatsActions {
  subscribeToPlayerStats: (playerId: string) => void;
  unsubscribePlayerStats: () => void;
  clearError: () => void;
}

// Helper function to convert Firestore Timestamps in the raw data to Date objects
const convertTimestampsToDates = (data: any): any => {
  if (!data) return null;
  const convertedData = { ...data };

  for (const key in convertedData) {
    if (convertedData[key] instanceof Timestamp) {
      convertedData[key] = convertedData[key].toDate();
    } else if (Array.isArray(convertedData[key])) {
      convertedData[key] = convertedData[key].map((item: any) => {
        if (item instanceof Timestamp) return item.toDate();
        if (typeof item === 'object' && item !== null) return convertTimestampsToDates(item);
        return item;
      });
    } else if (typeof convertedData[key] === 'object' && convertedData[key] !== null) {
      convertedData[key] = convertTimestampsToDates(convertedData[key]);
    }
  }
  return convertedData;
};

export const usePlayerStatsStore = create<PlayerStatsState & PlayerStatsActions>()(
  immer((set, get) => ({
    stats: null,
    isLoading: false,
    error: null,
    activeListenerUnsubscribe: null,

    subscribeToPlayerStats: (playerId) => {
      console.log(`[PlayerStatsStore] Attempting to subscribe for playerId: ${playerId}`);
      if (!playerId) {
        console.error("[PlayerStatsStore] Player ID is undefined or null. Subscription aborted.");
        set((state) => {
          state.error = 'Player ID is required to subscribe to stats.';
          state.isLoading = false;
        });
        return;
      }

      const currentUnsubscribe = get().activeListenerUnsubscribe;
      if (currentUnsubscribe) {
        currentUnsubscribe();
      }

      set((state) => {
        state.isLoading = true;
        state.error = null;
        state.stats = null; // Reset stats on new subscription
      });

      const db = getFirestore(firebaseApp);
      const playerStatsRef = doc(db, 'playerComputedStats', playerId);

      console.log(`[PlayerStatsStore] Setting up listener for playerComputedStats/${playerId}`);

      const unsubscribe = onSnapshot(
        playerStatsRef,
        (docSnap) => {
          console.log(`[PlayerStatsStore] Listener for playerComputedStats/${playerId} received data. Doc exists: ${docSnap.exists()}`);
          if (docSnap.exists()) {
            const rawData = docSnap.data();
            console.log("[PlayerStatsStore] Raw data from Firestore:", JSON.parse(JSON.stringify(rawData)));
            const dataWithDates = convertTimestampsToDates(rawData) as FrontendPlayerComputedStats;
            console.log("[PlayerStatsStore] Data after timestamp conversion:", JSON.parse(JSON.stringify(dataWithDates)));
            set((state) => {
              state.stats = dataWithDates;
              state.isLoading = false;
              state.error = null;
            });
          } else {
            set((state) => {
              state.stats = initialFrontendPlayerComputedStats; // Set to initial if no data
              console.warn(`[PlayerStatsStore] Document for playerComputedStats/${playerId} does not exist. Setting initial stats.`);
              state.isLoading = false;
              state.error = null; // No error, just no data or initial data
            });
          }
        },
        (err) => {
          console.error(`[PlayerStatsStore] Error in Firestore listener for ${playerId}:`, err);
          set((state) => {
            state.error = "Spielerstatistiken konnten nicht geladen werden.";
            state.isLoading = false;
            state.stats = null;
          });
        }
      );

      set((state) => {
        state.activeListenerUnsubscribe = unsubscribe;
        console.log(`[PlayerStatsStore] Listener setup complete for ${playerId}.`);
      });
    },

    unsubscribePlayerStats: () => {
      const currentUnsubscribe = get().activeListenerUnsubscribe;
      console.log("[PlayerStatsStore] Attempting to unsubscribe.", currentUnsubscribe ? "Listener found." : "No active listener.");
      if (currentUnsubscribe) {
        currentUnsubscribe();
      }
      set((state) => {
        state.stats = null;
        state.isLoading = false;
        state.error = null;
        state.activeListenerUnsubscribe = null;
      });
    },
    
    clearError: () => {
        set((state) => {
            state.error = null;
        });
    }
  }))
); 