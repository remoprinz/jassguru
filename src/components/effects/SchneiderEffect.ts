import type {ChargeLevel} from "@/types/jass";

const MAIN_EMOJIS = ["🦞", "✂️"] as const;

const getBaseBurstsByLevel = (chargeLevel: ChargeLevel): number => {
  switch (chargeLevel) {
  case "extreme": return 60;
  case "super": return 48;
  case "high": return 38;
  case "medium": return 30;
  case "low": return 22;
  default: return 18;
  }
};

const spawnEmojiBurst = (container: HTMLDivElement, startX: number, startY: number, emoji: string) => {
  const node = document.createElement("span");
  node.textContent = emoji;
  node.style.position = "absolute";
  node.style.left = `${startX}px`;
  node.style.top = `${startY}px`;
  node.style.opacity = "1";
  node.style.fontSize = `${34 + Math.random() * 18}px`;
  node.style.willChange = "transform, opacity";
  container.appendChild(node);

  const driftX = (Math.random() - 0.5) * 300;
  const riseY = 260 + Math.random() * 480;
  const spin = (Math.random() - 0.5) * 360;
  const duration = 1500 + Math.random() * 1100;

  const animation = node.animate(
    [
      {transform: "translate3d(0, 0, 0) rotate(0deg) scale(0.95)", opacity: 1},
      {transform: `translate3d(${driftX * 0.35}px, ${-riseY * 0.35}px, 0) rotate(${spin * 0.4}deg) scale(1.02)`, opacity: 1, offset: 0.35},
      {transform: `translate3d(${driftX}px, ${-riseY}px, 0) rotate(${spin}deg) scale(1.08)`, opacity: 0.96},
    ],
    {
      duration,
      easing: "cubic-bezier(0.2, 0.85, 0.25, 1)",
      fill: "forwards",
    }
  );

  animation.onfinish = () => node.remove();
};

export const triggerSchneiderEffect = (config?: {chargeLevel?: ChargeLevel; durationMs?: number}) => {
  if (typeof document === "undefined") return;

  const chargeLevel = config?.chargeLevel ?? "low";
  const durationMs = config?.durationMs ?? 0;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.pointerEvents = "none";
  container.style.zIndex = "10000";
  document.body.appendChild(container);

  const centerX = window.innerWidth * 0.5;
  const startY = window.innerHeight * 0.78;
  const baseBursts = getBaseBurstsByLevel(chargeLevel);
  const bonusBursts = Math.max(0, Math.floor((durationMs - 3000) / 350));
  const totalBursts = Math.min(baseBursts + bonusBursts, 72);

  for (let i = 0; i < totalBursts; i += 1) {
    setTimeout(() => {
      const emoji = MAIN_EMOJIS[Math.floor(Math.random() * MAIN_EMOJIS.length)];
      const spreadX = (Math.random() - 0.5) * 260;
      spawnEmojiBurst(container, centerX + spreadX, startY, emoji);
    }, i * 55);
  }

  setTimeout(() => {
    container.remove();
  }, 3800 + Math.min(totalBursts * 12, 900));
};
