import type { SpruchGenerator } from '../../../types/sprueche';

export const ehrenpunkteSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `${params.loserNames.join(' & ')} kämpfen tapfer weiter - Respekt für den Durchhaltewillen!`,
    icon: '🎖️'
  }),
  (params) => ({
    text: `Auch wenn's schwer wird - ${params.loserNames.join(' & ')} geben nicht auf!`,
    icon: '💪'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} zeigen Charakter und spielen trotz Rückstand weiter!`,
    icon: '🏅'
  }),
  (params) => ({
    text: `Der Rückstand ist gross, aber ${params.loserNames.join(' & ')} kämpfen um jeden Punkt!`,
    icon: '✨'
  }),
  (params) => ({
    text: `Aufgeben ist keine Option für ${params.loserNames.join(' & ')} - weiter so!`,
    icon: '🌟'
  })
]; 