// src/statistics/types.ts
import { TeamStand, GameEntry, JassState } from './jass';

export interface StatisticProps {
  teams: {
    top: TeamStand;
    bottom: TeamStand;
  };
  games: GameEntry[];
  currentGameId: number;
  onSwipe?: (direction: 'left' | 'right') => void;
}

export interface StatisticModule {
  id: StatisticId;
  title: string;
  component: React.FC<StatisticProps>;
  calculateData: (state: JassState) => { top: number; bottom: number };
}

export type StatisticId = 'striche' | 'jasspunkte';