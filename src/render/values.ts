/** Formatting of the values drawn on keys and dials. */

/** "3d 4h", "4h 12m", "12m", "45s". */
export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3_600);
  const minutes = Math.floor((s % 3_600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${s}s`;
}

/** Mbit/s with one decimal below 100, none above: "0.4", "95.2", "241". */
export function formatMbit(mbit: number): string {
  if (!Number.isFinite(mbit) || mbit < 0) {
    return "0";
  }
  if (mbit >= 100) {
    return String(Math.round(mbit));
  }
  return mbit.toFixed(1);
}

export function formatGuests(count: number): string {
  return count === 1 ? "1 guest" : `${count} guests`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/** Bytes in decimal units with three significant digits: ["842", "MB"], ["12.4", "GB"], ["1.02", "TB"]. */
export function formatBytes(bytes: number): [string, string] {
  if (!Number.isFinite(bytes) || bytes < 1000) {
    return [String(Math.max(0, Math.round(Number.isFinite(bytes) ? bytes : 0))), "B"];
  }
  let unit = Math.min(Math.floor(Math.log10(bytes) / 3), BYTE_UNITS.length - 1);
  let value = bytes / 1000 ** unit;
  // 999.6 MB rounds to "1000": show "1.00 GB" instead.
  if (Math.round(value) >= 1000 && unit < BYTE_UNITS.length - 1) {
    unit++;
    value /= 1000;
  }
  const digits = value < 9.995 ? 2 : value < 99.95 ? 1 : 0;
  return [value.toFixed(digits), BYTE_UNITS[unit]];
}
