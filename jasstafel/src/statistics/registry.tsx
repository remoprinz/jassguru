// src/statistics/registry.ts
import {StatisticModule} from "../types/statistikTypes";
import {StricheStatistik} from "./StricheStatistik";
import {JasspunkteStatistik} from "./JasspunkteStatistik";

// Debug-Ausgabe hinzufügen
console.log("STATISTIC_MODULES wird geladen");

export const STATISTIC_MODULES: StatisticModule[] = [
  {
    id: "striche",
    title: "Strichergebnis",
    component: StricheStatistik,
    calculateData: (state) => ({
      top: state.teams.top.total,
      bottom: state.teams.bottom.total,
    }),
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
console.log("STATISTIC_MODULES:", STATISTIC_MODULES);

// Kein default export mehr, nur named export
