import { useEffect } from "react";
import { getPictogram } from "@/utils/pictogramUtils";
import type { JassColor, CardStyle } from "@/types/jass";

// Alle Farben/Modi, die der Calculator als Bild rendert.
const PICTOGRAM_COLORS: JassColor[] = [
  "Misère", "Eicheln", "Rosen", "Schellen", "Schilten",
  "Obe", "Une", "3x3", "Quer", "Slalom",
];

const STYLES: CardStyle[] = ["DE", "FR"];

/**
 * Wärmt die Calculator-Pictogramme (≤39 KB/Stück) im Hintergrund vor, sobald die
 * App idle ist. So liegen sie beim ersten Öffnen von "Runde schreiben" bereits im
 * SW-Cache (CacheFirst-Route `jass-pictograms-*`), statt erst dann nachgeladen zu
 * werden ("pop-in"). Greift für beide Kartenstile, damit der Stil egal ist.
 */
export function usePictogramPreload(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const warm = () => {
      const seen = new Set<string>();
      STYLES.forEach((style) => {
        PICTOGRAM_COLORS.forEach((color) => {
          const src = getPictogram(color, "svg", style);
          if (src && !seen.has(src)) {
            seen.add(src);
            const img = new Image();
            img.decoding = "async";
            img.src = src; // löst GET aus → SW cacht via CacheFirst
          }
        });
      });
    };

    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof ric === "function") {
      idleId = ric(warm, { timeout: 3000 });
    } else {
      timeoutId = setTimeout(warm, 1500);
    }

    return () => {
      const cic = (window as unknown as {
        cancelIdleCallback?: (id: number) => void;
      }).cancelIdleCallback;
      if (idleId !== undefined && typeof cic === "function") cic(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);
}
