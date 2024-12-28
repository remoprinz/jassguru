// Basis-Interface für Effekt-Parameter
interface EffectParams {
  chargeAmount?: number;  // Wie "stark" der Effekt sein soll
  isFlipped?: boolean;    // Für Orientierung des Effekts
  position?: 'top' | 'bottom';  // Wo der Effekt starten soll
}

// Effekt-Funktionen mit Platzhalter-Implementierung
export const triggerBergConfetti = (params?: EffectParams) => {
  console.log('🏔️ Berg-Effekt!', params);
  // TODO: Zufällige Auswahl aus verschiedenen Berg-Effekten
  // - Konfetti-Explosion
  // - Bergsilhouette-Animation
  // - "Berg!"-Text-Animation
};

export const triggerBedankenFireworks = (params?: EffectParams) => {
  console.log('🎆 Bedanken-Effekt!', params);
  // TODO: Verschiedene Feuerwerk-Effekte
  // - Klassisches Feuerwerk
  // - Spiralförmige Funken
  // - Goldener Regen
};

export const triggerSchneiderEffect = () => {
  // Implementierung für Schneider-Effekt
};

export const triggerKontermatschChaos = (chargeAmount?: number) => {
  // Implementierung für Kontermatsch-Chaos
};

export const triggerMatschConfetti = (chargeAmount?: number, isFlipped?: boolean) => {
  // Implementierung für Matsch-Konfetti
}; 