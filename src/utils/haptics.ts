export const HAPTIC_MIN_PRESS_MS = 3000;

const supportsVibration = (): boolean => {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
};

const getVibrationPatternForDuration = (durationMs: number): number | number[] => {
  if (durationMs >= 7000) {
    return [80, 50, 110, 50, 80];
  }
  if (durationMs >= 5000) {
    return [60, 40, 80];
  }
  if (durationMs >= HAPTIC_MIN_PRESS_MS) {
    return [40, 25, 40];
  }
  return 0;
};

export const triggerProgressivePressHaptic = (durationMs: number): boolean => {
  if (!supportsVibration() || durationMs < HAPTIC_MIN_PRESS_MS) {
    return false;
  }

  const pattern = getVibrationPatternForDuration(durationMs);
  if (!pattern) {
    return false;
  }

  return navigator.vibrate(pattern);
};
