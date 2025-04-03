import confetti, {Shape} from "canvas-confetti";

export const createLightningStrike = () => {
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.zIndex = "9999";
  canvas.style.pointerEvents = "none";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Blitz-Animation
  let opacity = 1;
  const flash = () => {
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    opacity -= 0.1;

    if (opacity > 0) {
      requestAnimationFrame(flash);
    } else {
      document.body.removeChild(canvas);
    }
  };
  flash();
};

export const createChaosExplosion = (x: number, y: number) => {
  return confetti({
    particleCount: 500,
    spread: 360,
    origin: {x, y},
    colors: ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF"],
    shapes: ["star" as Shape, "square" as Shape],
    ticks: 300,
    startVelocity: 60,
    gravity: -0.5,
    scalar: 2,
    drift: Math.random() * 2 - 1,
  });
};

export const triggerKontermatschChaos = () => {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.zIndex = "9999";
  overlay.style.pointerEvents = "none";
  document.body.appendChild(overlay);

  overlay.style.animation = "shake 0.1s infinite";
  createLightningStrike();
  overlay.style.transition = "all 0.5s";
  overlay.style.filter = "saturate(200%) brightness(150%)";

  const positions = [
    {x: 0.2, y: 0.2},
    {x: 0.8, y: 0.2},
    {x: 0.2, y: 0.8},
    {x: 0.8, y: 0.8},
    {x: 0.5, y: 0.5},
  ];

  positions.forEach((pos, i) => {
    setTimeout(() => createChaosExplosion(pos.x, pos.y), i * 200);
  });

  setTimeout(() => {
    overlay.style.animation = "";
    overlay.style.filter = "";
    overlay.style.transition = "";
    document.body.removeChild(overlay);
  }, 3000);
};
