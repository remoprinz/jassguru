import type { SpruchGenerator } from '../../../types/sprueche';

export const comebackSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `Was für eine Aufholjagd von ${params.winnerNames.join(' & ')}! 💪`,
    icon: '🏇'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} drehen das Spiel - stark gekämpft!`,
    icon: '✌️'
  }),
  (params) => ({
    text: `Die Wende ist geschafft! ${params.winnerNames.join(' & ')} holen sich den Sieg!`,
    icon: '🥳'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} geben die Führung noch aus der Hand - bitter!`,
    icon: '😅'
  }),
  (params) => ({
    text: `Von wegen aussichtslos! ${params.winnerNames.join(' & ')} zeigen wie man kämpft!`,
    icon: '✌️'
  })
]; 