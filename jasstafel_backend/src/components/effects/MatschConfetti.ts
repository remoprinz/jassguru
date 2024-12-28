import confetti from 'canvas-confetti';

export const triggerMatschConfetti = (chargeAmount: number, isCalculatorFlipped: boolean) => {
  const minChargeForConfetti = 0.3;
  if (chargeAmount < minChargeForConfetti) return;

  const button = document.querySelector('.matsch-button');
  if (button) {
    const rect = button.getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;

    const baseParticleCount = 10;
    const particleCount = baseParticleCount + ((chargeAmount - minChargeForConfetti) * 30);

    const shootConfetti = (angle: number, spread: number, particleCount: number, scalar: number) => {
      const adjustedAngle = isCalculatorFlipped ? (angle + 180) % 360 : angle;
      confetti({
        particleCount: particleCount,
        angle: adjustedAngle,
        spread: spread,
        origin: { x, y },
        colors: ['#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#0000FF', '#800080'],
        scalar: scalar,
        gravity: isCalculatorFlipped ? -1 : 1,
        ticks: 300,
      });
    };

    for (let angle = 0; angle < 360; angle += 45) {
      shootConfetti(angle, 55, Math.floor(particleCount * 0.3), 1.2);
      shootConfetti(angle, 25, Math.floor(particleCount * 0.4), 0.8);
      shootConfetti(angle, 10, Math.floor(particleCount * 0.3), 0.4);
    }
  }
};