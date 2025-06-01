// src/statistics/registry.ts
import {StatisticModule} from "../types/statistikTypes";
import {StricheStatistik} from "./StricheStatistik";
import {JasspunkteStatistik} from "./JasspunkteStatistik";
import { RoundHistoryDisplay } from './RoundHistoryDisplay';
import React from 'react';
import { useGameStore } from '../store/gameStore';
import { useUIStore } from '../store/uiStore';
import type { StatisticProps } from '../types/statistikTypes';
import type { CardStyle } from '../types/jass';
import { useGroupStore } from '@/store/groupStore';

// Debug-Ausgabe hinzufügen
// console.log("STATISTIC_MODULES wird geladen");

// <<< Wrapper-Komponente definieren >>>
const RoundHistoryWrapper: React.FC<StatisticProps> = (props) => {
  const playerNames = useGameStore((state) => state.playerNames);
  // Annahme: cardStyle kommt aus den groupSettings oder fallback auf UIStore
  // const { currentGroup } = useGroupStore.getState(); // Nicht mehr hier benötigt
  // const uiSettings = useUIStore.getState().settings; // Nicht mehr hier benötigt
  // const cardStyle: CardStyle = currentGroup?.farbeSettings?.cardStyle ?? uiSettings.cardStyle; // cardStyle wird jetzt direkt aus props genommen

  // Übergebe alle ursprünglichen Props und die zusätzlichen benötigten Props
  return (
    <RoundHistoryDisplay
      {...props} // games, teams, currentGameId, onSwipe, cardStyle (kommt jetzt von props)
      playerNames={playerNames}
      // cardStyle wird bereits durch {...props} übergeben, wenn es in StatisticProps definiert ist
      // und von der aufrufenden Komponente (ResultatKreidetafel/GameViewerKreidetafel) korrekt gesetzt wird.
    />
  );
};

export const STATISTIC_MODULES: StatisticModule[] = [
  {
    id: "striche",
    title: "Striche",
    component: StricheStatistik,
    calculateData: (state) => ({
      top: state.teams.top.total,
      bottom: state.teams.bottom.total,
    }),
  },
  {
    id: "rundenverlauf",
    title: "Runden",
    component: RoundHistoryWrapper,
    calculateData: () => ({ top: 0, bottom: 0 }),
  },
  {
    id: "jasspunkte",
    title: "Punkte",
    component: JasspunkteStatistik,
    calculateData: (state) => ({
      top: state.teams.top.jassPoints,
      bottom: state.teams.bottom.jassPoints,
    }),
  },
];

// Debug-Ausgabe hinzufügen
// console.log("STATISTIC_MODULES:", STATISTIC_MODULES);

// Kein default export mehr, nur named export
