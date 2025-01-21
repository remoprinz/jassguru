import type { SpruchGenerator } from '../../../types/sprueche';

export const dominierendSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `${params.winnerNames.join(' & ')} sind auf Siegeskurs - nur noch wenige Striche bis zum Triumph!`,
    icon: '🏆'
  }),
  (params) => ({
    text: `Die Luft wird dünn! ${params.winnerNames.join(' & ')} wittern den Sieg!`,
    icon: '👃'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} haben den Sieg vor Augen - jetzt bloss nicht nachlassen!`,
    icon: '🎯'
  }),
  (params) => ({
    text: `Das riecht nach Sieg für ${params.winnerNames.join(' & ')}!`,
    icon: '🌟'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} sind auf der Zielgeraden - gleich ist es geschafft!`,
    icon: '🏁'
  })
]; 