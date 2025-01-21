import type { SpruchGenerator } from '../../../types/sprueche';

export const hauchdünnSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `${params.winnerNames.join(' & ')} haben mit EINEM Strich Vorsprung gewonnen - knappe Siege sind die schönsten!`,
    icon: '🕺'
  }),
  (params) => ({
    text: `Knapper ging's nicht! ${params.winnerNames.join(' & ')} gewinnen mit einem Strich!`,
    icon: '🎯'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} hätten nur EINEN Strich mehr gebraucht... bitter!`,
    icon: '😤'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} gewinnen hauchzart - das war Millimeterarbeit!`,
    icon: '📏'
  }),
  (params) => ({
    text: `Ein Wimpernschlag entscheidet - ${params.loserNames.join(' & ')} fehlt genau EIN Punkt!`,
    icon: '👁️'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} haben das Quäntchen Glück auf ihrer Seite!`,
    icon: '🍀'
  }),
  (params) => ({
    text: `Autsch! ${params.loserNames.join(' & ')} verlieren um Haaresbreite`,
    icon: '🤬'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} zittern sich zum Sieg - knapper geht's nicht!`,
    icon: '😰'
  }),
  (params) => ({
    text: `Ein Strich zwischen Himmel und Hölle - ${params.loserNames.join(' & ')} fehlt haarscharf der Sieg`,
    icon: '😫'
  })
]; 