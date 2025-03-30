import { useUIStore } from '../store/uiStore';
import type { 
  StricheKategorie 
} from '../types/jass';

// Types
export interface TeamScores {
  team1: number;
  team2: number;
}

export interface TeamNames {
  team1: string[];
  team2: string[];
}

// Neue Interface für Spielstatistiken
export interface GameStats {
  currentGameNumber: number;
  totalGames: number;
  isComeback: boolean;
  comebackTeam?: 'team1' | 'team2';
  führungsWechsel: boolean;
  höchsterVorsprung: {
    team: 'team1' | 'team2';
    differenz: number;
  };
}

export interface TeamCalculationResult {
  winnerNames: string[];
  loserNames: string[];
  playerNames: string[];
  pointDifference: number;
  stricheDifference: number;
  totalMatsche: number;
  isTeam2Winner: boolean;
  isDraw: boolean;
  isSchneider: boolean;
  schneiderTeam?: 'team1' | 'team2';
  gesamtStand: TeamScores;
  previousGesamtStand: TeamScores;
  gameStats: GameStats;
}

export interface CalculateTeamStatsParams {
  playerNames: string[];
  currentStatistic: 'striche' | 'punkte';
  totals: {
    striche: TeamScores;
    punkte: TeamScores;
  };
  matchCount?: {
    team1: number;
    team2: number;
  };
  type: 'gameEnd' | 'jassEnd';
  // Neue Felder
  gameHistory: {
    gesamtStand: TeamScores;
    gameNumber: number;
    totalGames: number;
  };
  currentStriche: Record<'team1' | 'team2', Record<StricheKategorie, number>>;
}

/**
 * Berechnet alle team-bezogenen Statistiken für Spiel- oder Jass-Ende
 */
export function calculateTeamStats(params: CalculateTeamStatsParams): TeamCalculationResult {
  const { playerNames, currentStatistic, totals, matchCount, gameHistory, currentStriche } = params;
  
  const scoreSettings = useUIStore.getState().scoreSettings;
  const schneiderPoints = scoreSettings.values.schneider;
  
  const teamNames: TeamNames = {
    team1: [playerNames[1], playerNames[3]],
    team2: [playerNames[2], playerNames[4]]
  };

  const relevantScores = currentStatistic === 'striche' ? totals.striche : totals.punkte;
  const isTeam2Winner = relevantScores.team2 > relevantScores.team1;
  const isDraw = relevantScores.team1 === relevantScores.team2;

  const winnerNames = isTeam2Winner ? teamNames.team2 : teamNames.team1;
  const loserNames = isTeam2Winner ? teamNames.team1 : teamNames.team2;

  const stricheDifference = Math.abs(totals.striche.team1 - totals.striche.team2);
  const pointDifference = Math.abs(totals.punkte.team1 - totals.punkte.team2);

  const totalMatsche = matchCount ? matchCount.team1 + matchCount.team2 : 0;

  // Schneider-Logik
  const isSchneider = totals.punkte.team1 < schneiderPoints || 
                     totals.punkte.team2 < schneiderPoints;
  
  const schneiderTeam = totals.punkte.team1 < schneiderPoints ? 'team1' : 
                       totals.punkte.team2 < schneiderPoints ? 'team2' : 
                       undefined;

  const NORMAL_STRICH: StricheKategorie = 'normal';
  
  // Neue Statistik-Berechnungen mit Striche-Details
  const previousGesamtStand = {
    team1: gameHistory.gesamtStand.team1 - (currentStriche.team1[NORMAL_STRICH] || 0),
    team2: gameHistory.gesamtStand.team2 - (currentStriche.team2[NORMAL_STRICH] || 0)
  };

  // Comeback-Logik
  const previousDiff = previousGesamtStand.team1 - previousGesamtStand.team2;
  const currentDiff = gameHistory.gesamtStand.team1 - gameHistory.gesamtStand.team2;
  const isComeback = (previousDiff > 0 && currentDiff < previousDiff) || 
                    (previousDiff < 0 && currentDiff > previousDiff);
  
  const comebackTeam = isComeback 
    ? (previousDiff > 0 ? 'team2' : 'team1')
    : undefined;

  // Führungswechsel
  const führungsWechsel = (previousDiff > 0 && currentDiff < 0) || 
                         (previousDiff < 0 && currentDiff > 0);

  // Höchster Vorsprung
  const currentVorsprung = Math.abs(currentDiff);
  const team = currentDiff > 0 ? 'team1' : 'team2';

  return {
    winnerNames,
    loserNames,
    playerNames,
    pointDifference,
    stricheDifference,
    totalMatsche,
    isTeam2Winner,
    isDraw,
    isSchneider,
    schneiderTeam,
    gesamtStand: gameHistory.gesamtStand,
    previousGesamtStand,
    gameStats: {
      currentGameNumber: gameHistory.gameNumber,
      totalGames: gameHistory.totalGames,
      isComeback,
      comebackTeam,
      führungsWechsel,
      höchsterVorsprung: {
        team,
        differenz: currentVorsprung
      }
    }
  };
} 