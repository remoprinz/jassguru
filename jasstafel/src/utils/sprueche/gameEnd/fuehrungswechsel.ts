import type { SpruchGenerator } from '../../../types/sprueche';

export const fuehrungswechselSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `Der Spieß wurde umgedreht! ${params.winnerNames.join(' & ')} übernehmen die Führung!`,
    icon: ' 🥳'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} müssen die Führung abgeben - das tut weh!`,
    icon: '😬'
  }),
  (params) => ({
    text: `Führungswechsel! ${params.winnerNames.join(' & ')} setzen sich an die Spitze!`,
    icon: '🤯'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} melden sich zurück - jetzt wird's spannend!`,
    icon: '🥳'
  }),
  (params) => ({
    text: `Das Blatt hat sich gewendet! ${params.winnerNames.join(' & ')} liegen vorne!`,
    icon: '🤯'
  })
]; 