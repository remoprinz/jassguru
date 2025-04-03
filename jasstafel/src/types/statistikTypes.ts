// src/statistics/types.ts
import {TeamStand, GameEntry, JassState} from "./jass";

export type StatisticId = "striche" | "jasspunkte";

// Neue Interface für die Gesamtstatistik
export interface JassTotal {
  striche: {
    top: number;
    bottom: number;
  };
  punkte: {
    top: number;
    bottom: number;
  };
  matsche: number; // Neue Property für Gesamtanzahl Matsche
}

export interface StatisticProps {
  teams: {
    top: TeamStand;
    bottom: TeamStand;
  };
  games: GameEntry[];
  currentGameId: number;
  onSwipe?: (direction: "left" | "right") => void;
}

export interface StatisticModule {
  id: StatisticId;
  title: string;
  component: React.FC<StatisticProps>;
  calculateData: (state: JassState) => { top: number; bottom: number };
  // Optional: Neue Methode für Gesamtstatistik
  calculateTotal?: (games: GameEntry[]) => JassTotal;
}
