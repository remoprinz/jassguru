import * as admin from "firebase-admin";

// 🆕 Import RoundResult from finalizeTournament
import type { RoundResult } from '../finalizeTournament';

/**
 * ✅ ERWEITERTE Turnier-Ranking-Daten (Version 2.0)
 * 
 * Speichert ALLE relevanten Statistiken beim Finalisieren eines Turniers:
 * - Punkte UND Striche mit Differenzen
 * - Event-Zählungen (Matsch, Schneider, etc.)
 * - Weis-Statistiken
 * - Detaillierte Spiel-Statistiken
 */
export interface TournamentPlayerRankingData {
    // ===== IDENTIFIKATION =====
    playerId: string; 
    tournamentId: string;
    tournamentName: string;
    tournamentFinalizedAt: admin.firestore.Timestamp;
    createdAt?: admin.firestore.Timestamp;

    // ===== RANKING =====
    rank: number;
    totalRankedEntities: number; 
    rankingSystemUsed?: string; // 'total_points', 'striche', 'wins', 'average_score_per_passe'

    // ===== TEAM-INFO (optional) =====
    teamId?: string;
    teamName?: string; 

    // ===== SCORES (IMMER BEIDE MIT DIFFERENZ!) =====
    // Punkte
    pointsScored?: number;           // ✅ NEU: Erzielte Punkte
    pointsReceived?: number;         // ✅ NEU: Erhaltene Punkte
    pointsDifference?: number;       // ✅ NEU: Differenz (scored - received)
    totalPoints?: number;            // Legacy: = pointsScored
    
    // Striche
    stricheScored?: number;          // ✅ NEU: Erzielte Striche
    stricheReceived?: number;        // ✅ NEU: Erhaltene Striche
    stricheDifference?: number;      // ✅ NEU: Differenz (scored - received)
    totalStriche?: number;           // Legacy: = stricheScored
    
    score?: number;                  // Legacy: = totalPoints ODER totalStriche (je nach rankingMode)

    // ===== SPIEL-STATISTIKEN =====
    gamesPlayed?: number;
    gamesWon?: number;               // ✅ NEU: Gewonnene Passen
    gamesLost?: number;              // ✅ NEU: Verlorene Passen
    gamesDraw?: number;              // ✅ NEU: Unentschiedene Passen
    rawWins?: number;                // Legacy: aus Ranking-Berechnung

    // ===== EVENT-ZÄHLUNGEN (NUR SINNVOLLE!) =====
    eventCounts?: {
        // Events die man MACHT oder deren OPFER man wird
        matschMade: number;          // Ich matsche den Gegner
        matschReceived: number;      // Ich werde gematscht
        schneiderMade: number;       // Ich schneidere den Gegner
        schneiderReceived: number;   // Ich werde geschneidert
        kontermatschMade: number;    // Ich mache Kontermatsch
        kontermatschReceived: number;// Ich erhalte Kontermatsch
        
        // NICHT: siegMade/Received (= gamesWon/Lost)
        // NICHT: bergMade/Received (= Teil von striche, kein Event das man "empfängt")
    };

    // ===== WEIS-STATISTIKEN =====
    totalWeisPoints?: number;        // ✅ NEU: Gesamte Weis-Punkte
    averageWeisPerGame?: number;     // ✅ NEU: Durchschnitt pro Spiel
    
    // 🆕 NEU: ROUND-LEVEL DETAILS =====
    roundResults?: RoundResult[];    // ✅ NEU: Detaillierte Ergebnisse pro Passe
} 