import type { TeamPosition, EffectType, EffectParams } from '../types/jass';

interface PerspectiveParams {
  y: number;
  gravity: number;
  transformX: (x: number) => number;
}

export function getPerspectiveParams(
  team: TeamPosition,
  isFlipped: boolean
): PerspectiveParams {
  // Bestimme die tatsächliche Perspektive
  const isDefaultBottomTeam = (team === 'bottom');
  const isReallyTop = (isDefaultBottomTeam && isFlipped) || 
                     (!isDefaultBottomTeam && !isFlipped);

  // Basis-Konfiguration
  const params: PerspectiveParams = isReallyTop 
    ? {
        y: 1.1,           // Start oberhalb
        gravity: -1,      // Fallen nach oben
        transformX: (x) => 1 - x  // Horizontale Spiegelung
      }
    : {
        y: -0.1,          // Start unterhalb
        gravity: 1,       // Fallen nach unten
        transformX: (x) => x  // Keine Spiegelung
      };

  return params;
}

export function getEffectParams(
  team: TeamPosition,
  isFlipped: boolean,
  effectType: EffectType
): EffectParams {
  const baseConfig: Record<EffectType, EffectParams> = {
    rain: {
      y: -0.3,           // Start oben
      gravity: 1,        // Nach unten
      startVelocity: 15,
      spread: 80
    },
    explosion: {
      y: 0.5,
      gravity: 1,
      startVelocity: 30,
      spread: 360
    },
    cannon: {
      y: 1.1,
      gravity: 1,
      startVelocity: 45,
      spread: 45
    },
    firework: {
      y: -0.1,          // Start unten
      gravity: 1,       // Nach unten
      startVelocity: 60,
      spread: 20
    }
  };

  const config = baseConfig[effectType];
  
  // Für Feuerwerk: isFlipped umkehren
  const effectiveIsFlipped = effectType === 'firework' ? !isFlipped : isFlipped;
  
  if (effectiveIsFlipped) {
    return {
      y: 1.1,            // Start oben
      gravity: -1,       // Nach oben
      startVelocity: config.startVelocity,
      spread: config.spread
    };
  }

  return config;  // Normale Richtung
} 