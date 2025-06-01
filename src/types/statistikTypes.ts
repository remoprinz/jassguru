// src/statistics/types.ts
import {TeamStand, GameEntry, JassState, PlayerNames, CardStyle, StrokeSettings, CompletedGameSummary} from "./jass";

export type StatisticId = "striche" | "jasspunkte" | "rundenverlauf";

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
  games: Array<GameEntry | CompletedGameSummary>;
  currentGameId: number;
  playerNames: PlayerNames;
  cardStyle: CardStyle;
  strokeSettings: StrokeSettings;
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

export interface PlayerStatistics {
  // Spielerübersicht
  spieleAnzahl: number;
  gesamteJassZeit: string; // Formatiert z.B. "10 Std. 30 Min."
  mitgliedSeit: string;    // Formatiertes Datum "dd.mm.yyyy"
  letzteAktivitaet: string; // Formatiertes Datum "dd.mm.yyyy"

  // Deine Durchschnittswerte
  avgStricheProSpiel: number;       // Eigene Strichbilanz / Anzahl eigener Spiele
  avgPunkteProSpiel: number;        // Eigene Teampunkte (Jass+Weis) / Anzahl eigener Spiele
  matschquoteProSpiel: number;    // Eigene Team-Matsch / Anzahl eigener Spiele
  avgWeisPunkteProSpiel: number;    // Eigene Team-Weispunkte / Anzahl eigener Spiele
  avgZeitProRunde: string;         // Formatiert (gesamteJassZeit / gesamte eigene Rundenzahl)

  // Deine Highlights
  hoechsterSiegStrichdifferenzPartie: number | null; // Max. positive Punktedifferenz in einer *gewonnenen Session*
  laengsteSiegesseriePartien: number;          // Aufeinanderfolgende *gewonnene Sessions*
  laengsteSiegesserieSpiele: number;           // Aufeinanderfolgende *gewonnene Spiele*
}
