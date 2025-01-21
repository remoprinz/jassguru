import type { SpieltempoKategorie, SpruchGenerator } from '../../../types/sprueche';

const createZeitSpruch = (text: string, icon: string): SpruchGenerator => 
  () => ({ text, icon });

export const gameEndZeitSprueche: Record<SpieltempoKategorie, SpruchGenerator[]> = {
  blitz_schnell: [
    createZeitSpruch('Zack, zack - das ging aber flott!', '🐆⚡'),
    createZeitSpruch('Blitzschnell gespielt!', '🦅')
  ],
  schnell: [
    createZeitSpruch('Ein flottes Spielchen!', '🦊'),
    createZeitSpruch('Zügig durchgespielt!', '🐇')
  ],
  normal: [
    createZeitSpruch('Ein schönes Spiel!', '🦁'),
    createZeitSpruch('Genau richtig getaktet!', '🐺')
  ],
  gemütlich: [
    createZeitSpruch('Da wurde jede Karte gut überlegt!', '🐢'),
    createZeitSpruch('Ein gemütliches Spielchen!', '🦥'),
    createZeitSpruch('Gut Ding will Weile haben!', '🐪')
  ],
  marathon: [
    createZeitSpruch('Ein echter Marathon-Jass - die Gläser waren wohl nie leer!', '🐌🍺'),
    createZeitSpruch('Nach diesem Marathon-Jass seid ihr hoffentlich noch fahrtüchtig!', '🐘🍻'),
    createZeitSpruch('Das war ein Marathon! Zum Glück war genug zu trinken da!', '🦥🍺'),
    createZeitSpruch('Ein Jass der längeren Sorte - die Wirtin hatte ihre Freude!', '🐢🍻'),
    createZeitSpruch('Marathon-Jass vom Feinsten! Prost!', '🐌🍺')
  ]
}; 