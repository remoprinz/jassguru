import { MAX_SCORE } from '../config/GameSettings';

export function validateAndClampScore(score: number): number {
  return Math.max(0, score); // Nur negative Zahlen verhindern
}

export function calculateOpponentScore(score: number): number {
  return score === 257 ? 0 : Math.max(0, MAX_SCORE - score);
}

export function calculateRemainingPoints(currentScore: number, targetScore: number): number {
  return Math.max(0, targetScore - currentScore);
}

export function calculateRemainingPointsWithMultiplier(
  currentScore: number,
  targetScore: number,
  multiplier: number
): number {
  const remainingPoints = calculateRemainingPoints(currentScore, targetScore);
  return Math.ceil(remainingPoints / multiplier);
}

export function convertToRomanNumerals(score: number): string {
  const hundreds = Math.floor(score / 100);
  const fifties = Math.floor((score % 100) / 50);
  const twenties = Math.floor((score % 50) / 20);

  return 'X'.repeat(hundreds) + 'L'.repeat(fifties) + 'I'.repeat(twenties);
}