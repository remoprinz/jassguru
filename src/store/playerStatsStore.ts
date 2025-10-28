import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { getFirestore, doc, collection, getDocs, Timestamp, getDoc } from 'firebase/firestore';
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
  subscribeToPlayerStats: (playerId: string) => Promise<void>;
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

    subscribeToPlayerStats: async (playerId) => {
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
        state.stats = null;
      });

      const db = getFirestore(firebaseApp);
      
      try {
        // ✅ NEUE ARCHITEKTUR: Lade aus players/{playerId} UND Subcollections
        const playerRef = doc(db, 'players', playerId);
        const playerDoc = await getDoc(playerRef);
        
        if (!playerDoc.exists()) {
          console.warn(`[PlayerStatsStore] Player ${playerId} not found`);
          set((state) => {
            state.stats = initialFrontendPlayerComputedStats;
            state.isLoading = false;
          });
          return;
        }
        
        const playerData = playerDoc.data() as any;
        const globalStats = playerData.globalStats?.current || {}; // ✅ KORRIGIERT: globalStats.current lesen
        
        // Lade Partner Stats aus neuer Struktur
        const partnerStatsSnap = await getDocs(collection(db, `players/${playerId}/partnerStats`));
        const partnerAggregates = partnerStatsSnap.docs.map(doc => {
          const data = doc.data();
          return {
            partnerId: data.partnerId || doc.id,
            partnerDisplayName: data.partnerDisplayName || doc.id,
            sessionsPlayedWith: data.sessionsPlayedWith || 0,
            sessionsWonWith: data.sessionsWonWith || 0,
            gamesPlayedWith: data.gamesPlayedWith || data.gamesPlayed || 0,
            gamesWonWith: data.gamesWonWith || data.wins || 0,
            totalStricheDifferenceWith: data.totalStricheDifferenceWith || 0,
            totalPointsWith: 0,
            totalPointsDifferenceWith: data.totalPointsDifferenceWith || 0,
            matschGamesWonWith: 0,
            schneiderGamesWonWith: 0,
            kontermatschGamesWonWith: 0,
            matschBilanz: data.matschBilanzWith || 0,
            schneiderBilanz: data.schneiderBilanzWith || 0,
            kontermatschBilanz: data.kontermatschBilanzWith || 0,
            matschEventsMadeWith: data.matschEventsMadeWith || 0,
            matschEventsReceivedWith: data.matschEventsReceivedWith || 0,
            schneiderEventsMadeWith: data.schneiderEventsMadeWith || 0,
            schneiderEventsReceivedWith: data.schneiderEventsReceivedWith || 0,
            kontermatschEventsMadeWith: data.kontermatschEventsMadeWith || 0,
            kontermatschEventsReceivedWith: data.kontermatschEventsReceivedWith || 0,
            sessionWinRate: data.sessionWinRateWith || 0,
            gameWinRate: data.gameWinRateWith || 0,
            // ✅ NEU: Rundentempo & Trumpfansagen
            trumpfStatistikWith: data.trumpfStatistikWith || {},
            avgRoundDurationWith: data.avgRoundDurationWith || 0,
          };
        });
        
        // Lade Opponent Stats aus neuer Struktur
        const opponentStatsSnap = await getDocs(collection(db, `players/${playerId}/opponentStats`));
        const opponentAggregates = opponentStatsSnap.docs.map(doc => {
          const data = doc.data();
          return {
            opponentId: data.opponentId || doc.id,
            opponentDisplayName: data.opponentDisplayName || doc.id,
            sessionsPlayedAgainst: data.sessionsPlayedAgainst || 0,
            sessionsWonAgainst: data.sessionsWonAgainst || 0,
            gamesPlayedAgainst: data.gamesPlayedAgainst || data.gamesPlayed || 0,
            gamesWonAgainst: data.gamesWonAgainst || data.wins || 0,
            totalStricheDifferenceAgainst: data.totalStricheDifferenceAgainst || 0,
            totalPointsScoredWhenOpponent: 0,
            totalPointsDifferenceAgainst: data.totalPointsDifferenceAgainst || 0,
            matschGamesWonAgainstOpponentTeam: 0,
            schneiderGamesWonAgainstOpponentTeam: 0,
            kontermatschGamesWonAgainstOpponentTeam: 0,
            matschBilanz: data.matschBilanzAgainst || 0,
            schneiderBilanz: data.schneiderBilanzAgainst || 0,
            kontermatschBilanz: data.kontermatschBilanzAgainst || 0,
            matschEventsMadeAgainst: data.matschEventsMadeAgainst || 0,
            matschEventsReceivedAgainst: data.matschEventsReceivedAgainst || 0,
            schneiderEventsMadeAgainst: data.schneiderEventsMadeAgainst || 0,
            schneiderEventsReceivedAgainst: data.schneiderEventsReceivedAgainst || 0,
            kontermatschEventsMadeAgainst: data.kontermatschEventsMadeAgainst || 0,
            kontermatschEventsReceivedAgainst: data.kontermatschEventsReceivedAgainst || 0,
            sessionWinRate: data.sessionWinRateAgainst || 0,
            gameWinRate: data.gameWinRateAgainst || 0,
            // ✅ NEU: Rundentempo & Trumpfansagen
            trumpfStatistikAgainst: data.trumpfStatistikAgainst || {},
            avgRoundDurationAgainst: data.avgRoundDurationAgainst || 0,
          };
        });
        
        // Kombiniere alle Daten zu FrontendPlayerComputedStats
        const combinedStats: FrontendPlayerComputedStats = {
          lastUpdateTimestamp: globalStats.lastUpdated || null,
          firstJassTimestamp: globalStats.firstJassTimestamp || null,
          lastJassTimestamp: globalStats.lastJassTimestamp || null,
          totalSessions: globalStats.totalSessions || 0,
          totalGames: globalStats.totalGames || 0,
          totalPlayTimeSeconds: globalStats.totalPlayTimeSeconds || 0,
          sessionWins: globalStats.sessionsWon || 0,
          sessionTies: globalStats.sessionsDraw || 0,
          sessionLosses: globalStats.sessionsLost || 0,
          gameWins: globalStats.gamesWon || 0,
          gameLosses: globalStats.gamesLost || 0,
          totalStricheMade: globalStats.totalStricheMade || 0,
          totalStricheReceived: globalStats.totalStricheReceived || 0,
          totalStricheDifference: globalStats.stricheDifference || 0,
          totalPointsMade: globalStats.totalPointsMade || 0,
          totalPointsReceived: globalStats.totalPointsReceived || 0,
          totalPointsDifference: globalStats.pointsDifference || 0,
          playerTotalWeisMade: globalStats.totalWeisPoints || 0,
          playerTotalWeisReceived: globalStats.totalWeisReceived || 0,
          weisDifference: globalStats.weisDifference || 0,
          totalMatschGamesMade: 0,
          totalSchneiderGamesMade: 0,
          totalKontermatschGamesMade: 0,
          totalKontermatschGamesReceived: 0,
          matschBilanz: globalStats.matschBilanz || 0,
          schneiderBilanz: globalStats.schneiderBilanz || 0,
          kontermatschBilanz: globalStats.kontermatschBilanz || 0,
          currentGameWinStreak: 0,
          currentGameLossStreak: 0,
          currentGameWinlessStreak: 0,
          currentSessionWinStreak: 0,
          currentSessionLossStreak: 0,
          currentSessionWinlessStreak: 0,
          avgPointsPerGame: globalStats.avgPointsPerGame || 0,
          avgStrichePerGame: globalStats.avgStrichePerGame || 0,
          avgMatschPerGame: 0,
          avgSchneiderPerGame: 0,
          avgWeisPointsPerGame: globalStats.avgWeisPerGame || 0,
          avgKontermatschPerGame: 0,
          totalTournamentsParticipated: globalStats.totalTournaments || 0,
          totalTournamentGamesPlayed: 0,
          tournamentWins: 0,
          bestTournamentPlacement: null,
          tournamentPlacements: [],
          highestPointsGame: null,
          highestStricheGame: null,
          mostMatschGame: null,
          mostSchneiderGame: null,
          mostWeisPointsGame: null,
          mostKontermatschMadeGame: null,
          longestWinStreakGames: null,
          lowestPointsGame: null,
          highestStricheReceivedGame: null,
          mostMatschReceivedGame: null,
          mostSchneiderReceivedGame: null,
          mostKontermatschReceivedGame: null,
          mostWeisPointsReceivedGame: null,
          longestLossStreakGames: null,
          longestWinlessStreakGames: null,
          highestPointsSession: null,
          highestStricheSession: null,
          longestWinStreakSessions: null,
          lowestPointsSession: null,
          highestStricheReceivedSession: null,
          mostMatschReceivedSession: null,
          mostWeisPointsReceivedSession: null,
          longestLossStreakSessions: null,
          longestWinlessStreakSessions: null,
          highlights: [],
          partnerAggregates,
          opponentAggregates,
          // NEU: Trumpfstatistiken aus globalStats
          trumpfStatistik: globalStats.trumpfStatistik || {},
          totalTrumpfCount: globalStats.totalTrumpfCount || 0,
        };
        
        set((state) => {
          state.stats = combinedStats;
          state.isLoading = false;
          state.error = null;
        });
        
      } catch (err: any) {
        console.error(`[PlayerStatsStore] Error loading stats for ${playerId}:`, err);
        set((state) => {
          state.error = "Spielerstatistiken konnten nicht geladen werden.";
          state.isLoading = false;
          state.stats = null;
        });
      }
    },

    unsubscribePlayerStats: () => {
      const currentUnsubscribe = get().activeListenerUnsubscribe;
      // Debug-Logging entfernt
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