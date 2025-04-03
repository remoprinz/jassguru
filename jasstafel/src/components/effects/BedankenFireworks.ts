import confetti, {Shape} from "canvas-confetti";
import type {ChargeLevel, EffectConfig} from "../../types/jass";
import {CHARGE_THRESHOLDS} from "../../types/jass";
import {getEffectParams} from "../../utils/effectUtils";

export function createBedankenFirework(x: number, y: number, gravity: number, chargeLevel: ChargeLevel, phase: "shoot" | "explode") {
  const intensity = getFireworkIntensity(chargeLevel);

  // Wenn gravity negativ (flipped), dann schießen wir von oben nach unten
  const startVelocity = phase === "shoot" ?
    (gravity < 0 ? 45 : -45) : // Bei negativer Gravitation nach unten schießen
    30;

  return confetti({
    particleCount: phase === "shoot" ? 10 : Math.floor(intensity / 5),
    origin: {x, y},
    spread: phase === "shoot" ? 15 : 360, // Schmal hoch, dann kreisförmig explodieren
    startVelocity,
    gravity: gravity,
    decay: phase === "shoot" ? 0.92 : 0.94,
    shapes: ["circle" as Shape],
    colors: [
      "#FF0000", "#00FF00", "#0000FF",
      "#FFFF00", "#FF00FF", "#00FFFF",
    ],
    scalar: 1, // Immer gleiche Größe
    ticks: phase === "shoot" ? 100 : (chargeLevel === "extreme" ? 200 : 150),
  });
}

export const getFireworkIntensity = (chargeLevel: ChargeLevel): number => {
  switch (chargeLevel) {
  case "low": return 500; // Basis-Level
  case "medium": return 1000; // Deutlich mehr
  case "high": return 2500; // Jetzt wird's wild
  case "super": return 5000; // SEHR viel
  case "extreme": return 10000; // ABSOLUT MASSIV
  default: return 0;
  }
};

export async function triggerBedankenFireworks(config: EffectConfig): Promise<void> {
  const {chargeLevel, team, isFlipped = false} = config;
  if (chargeLevel === "none") return;

  const duration = CHARGE_THRESHOLDS[chargeLevel];
  if (!duration) return;

  const {y, gravity} = getEffectParams(team, isFlipped, "firework");

  const positions = chargeLevel === "extreme" ?
    [0.2, 0.35, 0.5, 0.65, 0.8] : // 5 Positionen
    chargeLevel === "super" ?
      [0.25, 0.5, 0.75] : // 3 Positionen
      [0.3, 0.7]; // 2 Basis-Positionen

  const endTime = Date.now() + duration;

  while (Date.now() < endTime) {
    for (const baseX of positions) {
      // Schuss mit originaler Gravitation
      createBedankenFirework(baseX, y, gravity, chargeLevel, "shoot");

      await new Promise<void>((resolve) => setTimeout(resolve, 300));

      // Explosion mit gleicher Gravitation (nicht mehr umkehren)
      createBedankenFirework(baseX, 0.5, gravity, chargeLevel, "explode");

      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 800));
  }
}
