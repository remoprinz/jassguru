// scoreCalculations.ts

import type {StrichValue} from "../types/jass";

type Position = "top" | "bottom";

export const calculateStricheCounts = (score: number) => {
  const striche: Record<StrichValue, number> = {
    100: Math.floor(score / 100),
    50: 0,
    20: 0,
  };

  let restZahl = score % 100;

  if (restZahl >= 50) {
    striche[50] = Math.floor(restZahl / 50);
    restZahl = restZahl % 50;
  }

  if (restZahl >= 20) {
    striche[20] = Math.floor(restZahl / 20);
    restZahl = restZahl % 20;
  }

  return {striche, restZahl};
};

export const calculateRoundScores = (
  weisActions: Array<{ position: Position; value: number }>,
  playAction?: { scores: { top: number; bottom: number } },
  previousScores?: { top: number; bottom: number },
  isHistoryNavigation?: boolean
) => {
  const initial = {
    total: 0,
    weis: 0,
    play: 0,
    stricheCounts: {"20": 0, "50": 0, "100": 0},
    restZahl: 0,
  };

  const scores = {
    top: {...initial, total: isHistoryNavigation ? 0 : (previousScores?.top || 0)},
    bottom: {...initial, total: isHistoryNavigation ? 0 : (previousScores?.bottom || 0)},
  };

  weisActions.forEach((action) => {
    scores[action.position].weis += action.value;
    scores[action.position].total += action.value;
  });

  if (playAction) {
    scores.top.play = playAction.scores.top;
    scores.bottom.play = playAction.scores.bottom;
    scores.top.total += playAction.scores.top;
    scores.bottom.total += playAction.scores.bottom;
  }

  ["top", "bottom"].forEach((pos) => {
    const position = pos as Position;
    const result = calculateStricheCounts(scores[position].total);
    scores[position].stricheCounts = result.striche;
    scores[position].restZahl = result.restZahl;
  });

  return scores;
};
