import type { SpruchGenerator } from '../../../types/sprueche';

export const vernichtendSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `${params.winnerNames.join(' & ')} richten ein Massaker an!`,
    icon: '🔪'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} wurden gerade öffentlich hingerichtet!`,
    icon: '⚰️'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} zermalmen alles zu Staub!`,
    icon: '💣'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} wurden atomisiert - das tat beim Zuschauen weh!`,
    icon: '☢️'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} veranstalten hier ein Blutbad!`,
    icon: '🩸'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} wurden gerade aus dem Jass-Universum geschossen!`,
    icon: '🚀'
  }),
  (params) => ({
    text: `Brutaler geht's nicht! ${params.winnerNames.join(' & ')} zerstören alles!`,
    icon: '💥'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} sollten sich einen neuen Sport suchen...`,
    icon: '🏳️'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} spielen wie die Götter - das ist Jass-Perfektion!`,
    icon: '👹'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} wurden gerade aus allen Dimensionen gejasst!`,
    icon: '🌪️'
  })
]; 