export const formatDuration = (ms: number, showSeconds = true) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return showSeconds
      ? `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
      : `${hours}:${remainingMinutes.toString().padStart(2, '0')}`;
  }

  return showSeconds
    ? `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
    : `0:${minutes.toString().padStart(2, '0')}`;
}