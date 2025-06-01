import type {
  EffectConfig,
} from "@/types/jass";
import {getEffectParams} from "@/utils/effectUtils";
import {createBergConfetti} from "./BergConfetti";
import {createBedankenFirework} from "./BedankenFireworks";

// ------------------------------------------------------------------------
// Berg-Effekt (Gold-Konfetti)
// ------------------------------------------------------------------------
export const triggerBergConfetti = (config: EffectConfig): void => {
  const {chargeLevel, team, isFlipped = false} = config;

  const {y, gravity} = getEffectParams(team, isFlipped, "rain");

  if (!chargeLevel || chargeLevel === "none") return;

  const positions = [0.2, 0.35, 0.5, 0.65, 0.8];

  // Erste Welle
  positions.forEach((x, i) => {
    setTimeout(() => createBergConfetti(x, y, gravity, chargeLevel), i * 100);
  });

  // Zusätzliche Wellen für höhere Levels
  if (chargeLevel === "high" || chargeLevel === "super") {
    setTimeout(() => {
      positions.forEach((x, i) => {
        setTimeout(() => createBergConfetti(x, y, gravity, chargeLevel), i * 100);
      });
    }, 300);
  }

  if (chargeLevel === "extreme") {
    setTimeout(() => {
      positions.forEach((x, i) => {
        setTimeout(() => createBergConfetti(x, y, gravity, chargeLevel), i * 50);
      });
    }, 600);
  }
};

// ------------------------------------------------------------------------
// Bedanken/Sieg-Effekt (Feuerwerk)
// ------------------------------------------------------------------------
export const triggerBedankenFireworks = (config: EffectConfig): void => {
  const {chargeLevel, team, isFlipped = false} = config;
  if (chargeLevel === "none") return;

  const {y, gravity} = getEffectParams(team, isFlipped, "firework");

  const positions = [0.2, 0.5, 0.8];

  // Erste Welle
  positions.forEach((x, i) => {
    setTimeout(() => {
      createBedankenFirework(x, y, gravity, chargeLevel, "shoot");
      setTimeout(() => {
        createBedankenFirework(x, 0.5, -gravity, chargeLevel, "explode");
      }, 300);
    }, i * 500);
  });

  // Zusätzliche Welle für höhere Levels
  if (chargeLevel === "high" || chargeLevel === "super") {
    setTimeout(() => {
      positions.forEach((x, i) => {
        setTimeout(() => {
          createBedankenFirework(x, y, gravity, chargeLevel, "shoot");
          setTimeout(() => {
            createBedankenFirework(x, 0.5, -gravity, chargeLevel, "explode");
          }, 300);
        }, i * 500);
      });
    }, 800);
  }

  // Finale für extreme Level
  if (chargeLevel === "extreme") {
    setTimeout(() => {
      positions.forEach((x, i) => {
        setTimeout(() => {
          createBedankenFirework(x, y, gravity, chargeLevel, "shoot");
          setTimeout(() => {
            createBedankenFirework(x, 0.5, -gravity, chargeLevel, "explode");
          }, 300);
          // Zusätzliche Explosionen für extreme Level
          setTimeout(() => {
            createBedankenFirework(x + 0.1, 0.5, -gravity, chargeLevel, "explode");
            createBedankenFirework(x - 0.1, 0.5, -gravity, chargeLevel, "explode");
          }, 400);
        }, i * 400);
      });
    }, 1600);
  }
};
