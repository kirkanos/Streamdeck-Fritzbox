export type GuestWlan = {
  /** WLANConfiguration index (1-based) that carries the guest network. */
  index: number;
  enabled: boolean;
  ssid: string;
  /** "Up" while the radio is on; "Disabled" when switched off. */
  status: string;
  /** Number of associated guest devices. */
  associations: number;
  /** WPA passphrase for the QR code. */
  key?: string;
};

export type OnlineStatus = {
  connected: boolean;
  /** Raw NewConnectionStatus, e.g. "Connected", "Disconnected", "Connecting". */
  status: string;
  /** "Up" / "Down" of the physical WAN link. */
  linkStatus: string;
  externalIp?: string;
  /** Connection uptime in seconds. */
  uptime: number;
  /** Current rates in Mbit/s. */
  downMbit: number;
  upMbit: number;
  /** Maximum link rates in Mbit/s (0 if unknown). */
  downMaxMbit: number;
  upMaxMbit: number;
};

/**
 * First (newest) value of an online-monitor list such as "12345,0,0,...".
 * The Fritz!Box reports bytes per second in these lists, despite the "bps" name.
 */
export function newestOfList(list: string | undefined): number {
  const first = (list ?? "").split(",")[0]?.trim();
  const value = Number(first);
  return first && Number.isFinite(value) ? value : 0;
}

/** Bytes per second (online monitor) to Mbit/s. */
export const bytesPerSecondToMbit = (bytesPerSecond: number): number => (bytesPerSecond * 8) / 1_000_000;

/** Bits per second (link properties) to Mbit/s. */
export const bitsPerSecondToMbit = (bitsPerSecond: number): number => bitsPerSecond / 1_000_000;

export const toNumber = (value: string | undefined, fallback = 0): number => {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback;
};
