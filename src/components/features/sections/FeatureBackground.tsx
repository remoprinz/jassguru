'use client';

import Image from 'next/image';

type BgType = 'chalkboard' | 'wood';

const BG_CONFIG: Record<BgType, { src: string; overlay: string }> = {
  chalkboard: {
    src: '/images/backgrounds/chalkboard-jvs.webp',
    overlay: 'bg-black/30',
  },
  wood: {
    src: '/images/backgrounds/holztisch.webp',
    overlay: 'bg-black/25',
  },
};

export function FeatureBackground({ type }: { type: BgType }) {
  const cfg = BG_CONFIG[type];
  return (
    <div className="absolute inset-0 z-0">
      <Image src={cfg.src} alt="" fill className="object-cover" aria-hidden="true" />
      <div className={`absolute inset-0 ${cfg.overlay}`} />
    </div>
  );
}
