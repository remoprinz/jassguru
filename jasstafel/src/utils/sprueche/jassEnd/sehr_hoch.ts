import type { SpruchGenerator } from '../../../types/sprueche';

export const sehrHochSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `${params.winnerNames.join(' & ')} machen kurzen Prozess!`,
    icon: '☠️'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} kriegen heute einen Einlauf!`,
    icon: ' 💦'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} wurden heute in Grund und Boden gejasst!`,
    icon: '⚰️'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} spielen in einer anderen Liga!`,
    icon: '🏆'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} sollten vielleicht UNO spielen statt Jassen...`,
    icon: '🃏'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} zeigen keine Gnade - brutaler Sieg!`,
    icon: '🔥'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} wurden heute regelrecht zerlegt!`,
    icon: '🪚'
  }),
  (params) => ({
    text: `Das grenzt an Körperverletzung, was ${params.winnerNames.join(' & ')} hier abziehen!`,
    icon: '🤕'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} wurden heute zum Jass-Statisten degradiert!`,
    icon: '🎬'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} führten heute eine öffentliche Jass-Hinrichtung durch!`,
    icon: '⚔️'
  })
]; 