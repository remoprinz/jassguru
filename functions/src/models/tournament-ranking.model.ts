import * as admin from "firebase-admin";

export interface TournamentPlayerRankingData {
    playerId: string; 
    tournamentId: string;
    tournamentName: string;
    tournamentFinalizedAt: admin.firestore.Timestamp;

    rank: number;
    totalRankedEntities: number; 

    teamId?: string;
    teamName?: string; 

    score?: number; 
    gamesPlayed?: number;
    rawWins?: number; 
    rankingSystemUsed?: string; // z.B. 'total_points', 'striche'
} 