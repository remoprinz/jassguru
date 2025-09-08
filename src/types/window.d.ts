// This file extends the global Window interface to include custom properties
// used by the PWA watchdog timer. This prevents TypeScript errors during build.

export {};

declare global {
  interface Window {
    pwaLoadTimeout?: NodeJS.Timeout;
    cancelPwaLoadTimeout?: () => void;
  }
}
