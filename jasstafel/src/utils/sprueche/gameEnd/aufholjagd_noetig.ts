import type { SpruchGenerator } from '../../../types/sprueche';

export const aufholjagdNoetigSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `${params.loserNames.join(' & ')}, jetzt heißt's Ärmel hochkrempeln - da ist noch viel Arbeit!`,
    icon: '💪'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')} brauchen jetzt eine echte Aufholjagd!`,
    icon: '🏃'
  }),
  (params) => ({
    text: `${params.winnerNames.join(' & ')} ziehen davon - Zeit für ein Comeback der anderen!`,
    icon: '🔄'
  }),
  (params) => ({
    text: `Die Luft wird dünn für ${params.loserNames.join(' & ')} - aber aufgeben ist keine Option!`,
    icon: '💨'
  }),
  (params) => ({
    text: `${params.loserNames.join(' & ')}, jetzt oder nie - Zeit für die große Aufholjagd!`,
    icon: '⏰'
  })
]; 