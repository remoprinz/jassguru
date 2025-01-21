import type { SpruchGenerator } from '../../../types/sprueche';

export const schneiderSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `Autsch! ${params.loserNames.join(' & ')} wurden beschneidert! Das tut weh!`,
    icon: '✂️'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} haben gekämpft wie das tapfere Schneiderlein... am Ende wurden sie trotzdem beschnitten!`,
    icon: '✂️'
  }),
  (params) => ({
    text: `Schnipp, schnapp, Schneider! ${params.loserNames.join(' & ')} wurden zurechtgestutzt!`,
    icon: '✂️'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} haben ${params.loserNames.join(' & ')} regelrecht filetiert - Schneider!`,
    icon: '🍽️'
  }),
  (params) => ({
    text: `Brutal! ${params.winnerNames.join(' & ')} haben die Schere richtig angesetzt!`,
    icon: '💇‍♂️'
  }),
  (params) => ({
    text: `Schneider! ${params.loserNames.join(' & ')} wurden von ${params.winnerNames.join(' & ')} regelrecht zerschnippelt!`,
    icon: '🦞'
  }),
  (params) => ({
    text: `Eine messerscharfe Vorstellung von ${params.winnerNames.join(' & ')} - Beschneiderung für die Gegner!`,
    icon: '🔪'
  }),
  (params) => ({
    text: `Das war chirurgisch präzise! ${params.loserNames.join(' & ')} wurden sauber beschnitten!`,
    icon: '✂️'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} haben die Schneider-Schere ausgepackt - autsch!`,
    icon: '✂️'
  }),
  (params) => ({
    text: `Schneiderei deluxe! ${params.loserNames.join(' & ')} wurden fachgerecht gestutzt!`,
    icon: '🦞'
  })
]; 