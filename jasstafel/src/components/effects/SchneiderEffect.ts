import confetti from "canvas-confetti";

const createSkull = (x: number, y: number) => {
  const skull = document.createElement("div");
  skull.innerHTML = "💀";
  skull.style.position = "fixed";
  skull.style.left = `${x * 100}%`;
  skull.style.top = `${y * 100}%`;
  skull.style.fontSize = "3rem";
  skull.style.transform = "translate(-50%, -50%)";
  skull.style.transition = "all 2s ease-in";
  skull.style.zIndex = "9999";

  document.body.appendChild(skull);

  return skull;
};

const createExplosion = (x: number, y: number) => {
  return confetti({
    particleCount: 150,
    spread: 360,
    origin: {x, y},
    colors: ["#FF0000", "#FF4500", "#FF6B00"],
    startVelocity: 45,
    gravity: 1,
    shapes: ["circle"],
    scalar: 1.5,
    ticks: 150,
    decay: 0.95,
  });
};

export const triggerSchneiderEffect = () => {
  const skullPositions = [0.2, 0.4, 0.6, 0.8];

  skullPositions.forEach((x, i) => {
    setTimeout(() => {
      let y = -0.1;
      const skull = createSkull(x, y);

      const interval = setInterval(() => {
        y += 0.1;
        skull.style.top = `${y * 100}%`;

        if (y >= 0.5) {
          clearInterval(interval);
          createExplosion(x, y);
          setTimeout(() => {
            skull.style.opacity = "0";
            setTimeout(() => skull.remove(), 1000);
          }, 100);
          setTimeout(() => createExplosion(x, y + 0.1), 100);
        }
      }, 100);
    }, i * 300);
  });
};
