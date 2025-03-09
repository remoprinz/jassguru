import type { SpruchGenerator } from '../../../types/sprueche';

export const fuehrungAusgebautSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `${params.winnerNames.join(' & ')} bauen ihre Führung weiter aus - das sieht gut aus!`,
    icon: '😎'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} legen noch einen drauf - stark!`,
    icon: '😎'
  }),
  (params) => ({
    text: `Die Führung wird grösser und grösser - ${params.winnerNames.join(' & ')} sind on fire! 🔥`,
    icon: '🤩'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} machen ernst - der Vorsprung wächst!`,
    icon: '😎'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} müssen aufpassen - der Rückstand wird immer grösser!`,
    icon: '😳'
  })
]; 