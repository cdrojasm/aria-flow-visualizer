const SECONDS_PER_MINUTE = 60;

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds >= SECONDS_PER_MINUTE) {
    const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
    return `${minutes} min ${Math.round(seconds % SECONDS_PER_MINUTE)} s`;
  }
  if (seconds < 1) return `${Math.max(1, Math.round(seconds * 1000))} ms`;
  return `${seconds.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}
