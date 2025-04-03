import {Timestamp} from "firebase/firestore";

export interface FirestoreGroup {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  createdAt: Timestamp;
  createdBy: string;
  playerIds: string[];
  adminIds: string[];
  isPublic: boolean;
  players: {
    [key: string]: {
      displayName: string;
      email: string;
      joinedAt: Timestamp;
    };
  };
  gameCount?: number;
  totalGames?: number;
  totalGameTime?: number;
  firstGameAt?: Timestamp;
  lastGameAt?: Timestamp;
  location?: string;
  averageGameDuration?: number;
  averageRoundDuration?: number;
  averageGamesPerSession?: number;
  averageRoundsPerGame?: number;
  averageMatschPerGame?: number;
  playerHighlights?: {
    mostGames?: {
      playerId: string;
      count: number;
    };
    highestStrichDiff?: {
      playerId: string;
      diff: number;
    };
    highestWinRatePerSession?: {
      playerId: string;
      rate: number;
    };
    highestWinRatePerGame?: {
      playerId: string;
      rate: number;
    };
    highestMatschRatePerGame?: {
      playerId: string;
      rate: number;
    };
    mostWeisPointsPerGame?: {
      playerId: string;
      points: number;
    };
  };
  teamHighlights?: {
    highestWinRatePerSession?: {
      teamId: string;
      rate: number;
    };
    highestWinRatePerGame?: {
      teamId: string;
      rate: number;
    };
    highestMatschRatePerGame?: {
      teamId: string;
      rate: number;
    };
  };
}
