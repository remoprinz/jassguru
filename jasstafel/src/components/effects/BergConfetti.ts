import confetti from "canvas-confetti";
import type {ChargeLevel, EffectConfig} from "../../types/jass";
import {getEffectParams} from "../../utils/effectUtils";
import {CHARGE_THRESHOLDS} from "../../types/jass";

export function createBergConfetti(x: number, y: number, gravity: number, chargeLevel: ChargeLevel) {
  const intensity = getConfettiIntensity(chargeLevel);

  return confetti({
    particleCount: Math.floor(intensity / 10), // Basis-Partikelzahl aus Intensität
    origin: {x, y},
    spread: 140,
    gravity: gravity * 0.7,
    startVelocity: gravity > 0 ? -23 : 23,
    decay: 0.96,
    ticks: 1000,
    colors: ["#FFD700", "#FFA500", "#FF8C00"],
  });
}

// Mit export markieren!
export const getConfettiIntensity = (chargeLevel: ChargeLevel): number => {
  switch (chargeLevel) {
  case "low": return 500; // Basis-Level
  case "medium": return 1000; // Deutlich mehr
  case "high": return 2500; // Jetzt wird's wild
  case "super": return 5000; // SEHR viel
  case "extreme": return 10000; // ABSOLUT MASSIV
  default: return 0;
  }
};

export async function triggerBergConfetti(config: EffectConfig): Promise<void> {
  const {chargeLevel, team, isFlipped = false} = config;
  if (chargeLevel === "none") return;

  const duration = CHARGE_THRESHOLDS[chargeLevel];
  if (!duration) return;

  const {y, gravity} = getEffectParams(team, !isFlipped, "rain");

  // Positionen basierend auf Intensität
  const positions = chargeLevel === "extreme" ?
    [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95] : // 10 Positionen
    chargeLevel === "super" ?
      [0.1, 0.25, 0.4, 0.6, 0.75, 0.9] : // 6 Positionen
      [0.2, 0.4, 0.6, 0.8]; // 4 Basis-Positionen

  const endTime = Date.now() + duration;

  // Wellen-Interval auch basierend auf Level
  const waveInterval =
    chargeLevel === "extreme" ? 30 : // Super schnell
      chargeLevel === "super" ? 40 : // Sehr schnell
        chargeLevel === "high" ? 50 : // Schnell
          chargeLevel === "medium" ? 60 : // Normal
            70; // Langsam für 'low'

  while (Date.now() < endTime) {
    for (const xPos of positions) {
      // Schüsse pro Position auch nach Level
      const shots =
        chargeLevel === "extreme" ? 8 :
          chargeLevel === "super" ? 5 :
            chargeLevel === "high" ? 3 :
              chargeLevel === "medium" ? 2 :
                1;

      for (let i = 0; i < shots; i++) {
        createBergConfetti(xPos, y, gravity, chargeLevel);
        await new Promise<void>((resolve) => setTimeout(resolve, 8));
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, waveInterval));
  }
}
