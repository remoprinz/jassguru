import type { SpruchGenerator } from '../../../types/sprueche';

export const knappGesamtSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `Was für ein spannendes Spiel - nur ${Math.abs(params.gesamtStand.team1 - params.gesamtStand.team2)} Striche trennen die Teams!`,
    icon: '😅'
  }),
  (params) => ({
    text: `Das ist Nervenkitzel pur - die Teams trennen nur wenige Striche!`,
    icon: '🫣'
  }),
  (params) => ({
    text: `Kopf an Kopf - hier ist noch alles möglich!`,
    icon: '🫢'
  }),
  (params) => ({
    text: `Ein echter Krimi - jeder Strich zählt jetzt!`,
    icon: '🦹'
  }),
  (params) => ({
    text: `So eng war's schon lange nicht mehr - wer behält die Nerven?`,
    icon: '🫦'
  })
]; 