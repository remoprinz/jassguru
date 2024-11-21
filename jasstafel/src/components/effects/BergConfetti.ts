import confetti, { Shape } from 'canvas-confetti';

export const triggerBergConfetti = (chargeAmount: number) => {
  const count = Math.floor(chargeAmount * 200); // Max 200 Konfetti
  
  // Mehrere Startpunkte am oberen Bildschirmrand
  const createGoldRain = (x: number) => {
    return confetti({
      particleCount: Math.floor(count / 5), // Verteile Partikel auf mehrere Startpunkte
      origin: { x, y: -0.1 }, // Starte etwas über dem sichtbaren Bereich
      spread: 80, // Geringere Streuung für "Regen-Effekt"
      ticks: 300, // Längere Animation
      gravity: 1, // Höhere Gravitation für schnelleren Fall
      decay: 0.95,
      startVelocity: 40,
      shapes: ['square' as Shape],
      colors: ['#FFD700', '#FFA500', '#FF8C00'], // Gold, Orange Töne
      scalar: 1.5,
      drift: 0 // Kein seitlicher Drift
    });
  };

  // Verteile Konfetti über die Breite
  const positions = [0.2, 0.35, 0.5, 0.65, 0.8];
  
  // Erste Welle
  positions.forEach((x, i) => {
    setTimeout(() => {
      createGoldRain(x);
    }, i * 100);
  });

  // Zweite Welle für mehr Effekt
  setTimeout(() => {
    positions.forEach((x, i) => {
      setTimeout(() => {
        createGoldRain(x);
      }, i * 100);
    });
  }, 300);
};
