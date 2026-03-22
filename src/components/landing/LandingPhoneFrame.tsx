'use client';

import React from 'react';

/**
 * Smartphone-Mockup für Landing-Sections (Home / Features).
 * Balance: Rand etwas dunkler als der strukturierte App-Screen, aber kein flaches #000 —
 * Anthrazit + sehr dezentes Inset liest sich natürlicher (Mattschwarz / Aluminium).
 */
const BEZEL_BORDER = '#1e1e1e';
const BEZEL_FILL = '#121212';

export function LandingPhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative w-[min(42vw,240px)] overflow-hidden"
      style={{
        aspectRatio: '390 / 844',
        borderRadius: 'clamp(16px, 4vw, 32px)',
        border: `clamp(3px, 0.6vw, 5px) solid ${BEZEL_BORDER}`,
        backgroundColor: BEZEL_FILL,
        boxShadow:
          '0 22px 52px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.35)',
      }}
    >
      {children}
    </div>
  );
}
