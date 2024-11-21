// scoreCalculations.ts

type Position = 'top' | 'bottom';
type StricheCounts = { '20': number; '50': number; '100': number };

export const calculateStricheCounts = (score: number) => {
  const striche: StricheCounts = {
    '100': Math.floor(score / 100),
    '50': 0,
    '20': 0,
  };

  let restZahl = score % 100;

  if (restZahl >= 90) {
    striche['50'] = 1;
    striche['20'] = 2;
    restZahl -= 90;
  } else if (restZahl >= 80) {
    striche['20'] = 4;
    restZahl -= 80;
  } else if (restZahl >= 70) {
    striche['50'] = 1;
    striche['20'] = 1;
    restZahl -= 70;
  } else if (restZahl >= 60) {
    striche['20'] = 3;
    restZahl -= 60;
  } else if (restZahl >= 50) {
    striche['50'] = 1;
    restZahl -= 50;
  } else if (restZahl >= 20) {
    striche['20'] = Math.floor(restZahl / 10);
    restZahl %= 20;
  }

  return { striche, restZahl };
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
    stricheCounts: { '20': 0, '50': 0, '100': 0 },
    restZahl: 0
  };

  const scores = {
    top: { ...initial, total: isHistoryNavigation ? 0 : (previousScores?.top || 0) },
    bottom: { ...initial, total: isHistoryNavigation ? 0 : (previousScores?.bottom || 0) }
  };

  weisActions.forEach(action => {
    scores[action.position].weis += action.value;
    scores[action.position].total += action.value;
  });

  if (playAction) {
    scores.top.play = playAction.scores.top;
    scores.bottom.play = playAction.scores.bottom;
    scores.top.total += playAction.scores.top;
    scores.bottom.total += playAction.scores.bottom;
  }

  ['top', 'bottom'].forEach((pos) => {
    const position = pos as Position;
    const result = calculateStricheCounts(scores[position].total);
    scores[position].stricheCounts = result.striche;
    scores[position].restZahl = result.restZahl;
  });

  return scores;
};
