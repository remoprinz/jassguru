import confetti, { Shape } from 'canvas-confetti';

const createFirework = (x: number, y: number, colors: string[]) => {
  return confetti({
    particleCount: 100,
    spread: 360,
    startVelocity: 25,
    origin: { x, y },
    colors: colors.map(color => `rgba${color.substring(4, color.length - 1)}, 0.8)`),
    ticks: 200,
    shapes: ['circle' as Shape],
    gravity: 0.8,
    decay: 0.94,
    scalar: 2
  });
};

export const triggerBedankenFireworks = (chargeAmount: number) => {
  const burstCount = Math.floor(chargeAmount * 5); // Max 5 Feuerwerke
  const colors = [
    'rgba(0, 255, 0, 0.8)',    // Hellgrün
    'rgba(50, 205, 50, 0.8)',  // Limegreen
    'rgba(152, 251, 152, 0.8)' // Palegreen
  ];
  
  // Rakete von unten nach oben mit Rauchspur
  const rocketAnimation = (x: number) => {
    return new Promise<void>((resolve) => {
      let position = 0.9; // Start von unten
      const interval = setInterval(() => {
        position -= 0.1;
        
        // Rauchspur hinzufügen
        confetti({
          particleCount: 3,
          spread: 10,
          startVelocity: 1,
          origin: { x, y: position + 0.1 },
          colors: ['rgba(128, 128, 128, 0.5)'], // Grauer Rauch
          ticks: 20,
          shapes: ['circle' as Shape],
          gravity: 0.3,
          decay: 0.95,
          scalar: 0.5
        });

        if (position <= 0.3) { // Explosion bei y=0.3
          clearInterval(interval);
          createFirework(x, position, colors);
          
          // Zweite, verzögerte Explosion für mehr Effekt
          setTimeout(() => {
            createFirework(x + 0.1, position + 0.1, colors);
          }, 100);
          
          resolve();
        }
      }, 50);
    });
  };

  // Mehrere Raketen nacheinander
  for (let i = 0; i < burstCount; i++) {
    setTimeout(() => {
      const randomX = 0.2 + Math.random() * 0.6; // Zwischen 0.2 und 0.8
      rocketAnimation(randomX);
    }, i * 300);
  }
};
