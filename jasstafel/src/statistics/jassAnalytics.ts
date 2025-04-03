import type {
  GameEntry,
  RoundEntry,
  JassColor,
  TeamPosition,
  StrichTyp,
  TeamScores,
} from "../types/jass";
import {useTimerStore} from "../store/timerStore";

// Interface für die Spielstatistiken
export interface GameStatistics {
  totalGames: number;
  colorStats: Record<JassColor, number>;
  teamStats: Record<TeamPosition, {
    totalPoints: number;
    totalWeis: number;
    stricheByType: Record<StrichTyp, number>;
    averagePointsPerGame: number;
  }>;
  mostPlayedColor?: JassColor;
  totalWeisCount: number;
}

// Hauptklasse für Analytics
export class JassAnalytics {
  private games: GameEntry[] = [];
  private rounds: RoundEntry[] = [];

  trackGame(game: GameEntry): void {
    this.games.push(game);
  }

  trackRound(round: RoundEntry): void {
    this.rounds.push(round);
  }

  generateStats(): GameStatistics {
    const timerStore = useTimerStore.getState();
    const timeAnalytics = timerStore.getAnalytics();

    const stats: GameStatistics = {
      totalGames: this.games.length,
      colorStats: {} as Record<JassColor, number>,
      teamStats: {
        top: this.initTeamStats(),
        bottom: this.initTeamStats(),
      },
      totalWeisCount: 0,
    };

    // Statistiken aus den Runden aggregieren
    this.aggregateRoundStats(stats);

    // Meist gespielte Farbe ermitteln
    stats.mostPlayedColor = this.getMostPlayedColor(stats.colorStats);

    return stats;
  }

  private initTeamStats() {
    return {
      totalPoints: 0,
      totalWeis: 0,
      stricheByType: {
        berg: 0,
        sieg: 0,
        matsch: 0,
        schneider: 0,
        kontermatsch: 0,
        normal: 0,
      },
      averagePointsPerGame: 0,
    };
  }

  private aggregateRoundStats(stats: GameStatistics): void {
    for (const round of this.rounds) {
      // Weis-Punkte
      stats.totalWeisCount += round.weisActions.length;

      // Team-Punkte
      this.updateTeamStats(stats, round.scores);

      // Farben-Statistik (nur für Jass-Runden)
      if ("farbe" in round) {
        stats.colorStats[round.farbe] = (stats.colorStats[round.farbe] || 0) + 1;
      }
    }

    // Durchschnittliche Punkte pro Spiel berechnen
    if (this.games.length > 0) {
      ["top", "bottom"].forEach((team) => {
        const position = team as TeamPosition;
        stats.teamStats[position].averagePointsPerGame =
          stats.teamStats[position].totalPoints / this.games.length;
      });
    }
  }

  private updateTeamStats(stats: GameStatistics, scores: TeamScores): void {
    ["top", "bottom"].forEach((team) => {
      const position = team as TeamPosition;
      stats.teamStats[position].totalPoints += scores[position];
      if (scores.weisPoints) {
        stats.teamStats[position].totalWeis += scores.weisPoints[position];
      }
    });
  }

  private getMostPlayedColor(colorStats: Record<JassColor, number>): JassColor | undefined {
    return Object.entries(colorStats).reduce((a, b) =>
      (b[1] > (a?.[1] ?? 0) ? b : a), ["", 0]
    )[0] as JassColor | undefined;
  }
}

// Singleton-Instanz exportieren
export const jassAnalytics = new JassAnalytics();
