import { type QrMatrix, qrSvg } from "./qr";
import { background, mix, svg, text, toDataUrl, truncate, wrapText } from "./svg";
import { THEME } from "./theme";
import { formatGuests, formatMbit, formatUptime } from "./values";

/** Key images are drawn at 144×144 and scaled by Stream Deck. */
const S = 144;

/** Wi-Fi symbol (three arcs and a dot) centered at (cx, cy) of the given radius. */
export function wifiIcon(cx: number, cy: number, r: number, color: string, opacity = 1): string {
  const arc = (radius: number) => {
    const a = (50 * Math.PI) / 180;
    const x1 = (cx - radius * Math.sin(a)).toFixed(1);
    const x2 = (cx + radius * Math.sin(a)).toFixed(1);
    const y = (cy - radius * Math.cos(a)).toFixed(1);
    return `M ${x1} ${y} A ${radius} ${radius} 0 0 1 ${x2} ${y}`;
  };
  const stroke = Math.max(2, r * 0.17);
  return (
    `<g fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${stroke.toFixed(1)}" stroke-linecap="round">` +
    `<path d="${arc(r * 0.42)}"/><path d="${arc(r * 0.72)}"/><path d="${arc(r)}"/></g>` +
    `<circle cx="${cx}" cy="${cy}" r="${(stroke * 0.7).toFixed(1)}" fill="${color}" fill-opacity="${opacity}"/>`
  );
}

export type GuestKey = {
  enabled: boolean;
  ssid: string;
  guests: number;
  /** Omit the SSID when the user shows their own title. */
  showSsid?: boolean;
};

export function guestKey(k: GuestKey): string {
  const color = k.enabled ? THEME.ok : THEME.idle;
  const bg = k.enabled
    ? background("bg", mix(color, THEME.base, 0.7), THEME.base, S, S)
    : background("bg", THEME.surface, THEME.base, S, S);
  const accent = `<rect x="0" y="0" width="${S}" height="5" fill="${color}"/>`;
  const icon = wifiIcon(S / 2, 58, 32, k.enabled ? "#FFFFFF" : THEME.subtle, k.enabled ? 1 : 0.8);

  const lines = k.showSsid === false ? [] : wrapText(k.ssid || "Guest WLAN", 14, 2);
  const ssid = lines.map((line, i) => text(line, { x: S / 2, y: 92 + i * 17, size: 15, weight: 700 })).join("");
  const caption = k.enabled ? formatGuests(k.guests) : "off";
  const captionY = [108, 116, 126][lines.length];
  const captionText = text(caption, { x: S / 2, y: captionY, size: lines.length ? 14 : 18, weight: 600, opacity: 0.75 });

  return toDataUrl(svg(S, S, bg + accent + icon + ssid + captionText));
}

export type OnlineKey = {
  connected: boolean;
  status: string;
  downMbit: number;
  upMbit: number;
  uptime: number;
};

export function onlineKey(k: OnlineKey): string {
  const color = k.connected ? THEME.ok : THEME.error;
  const bg = k.connected
    ? background("bg", mix(color, THEME.base, 0.72), THEME.base, S, S)
    : background("bg", mix(color, "#000000", 0.05), mix(color, THEME.base, 0.55), S, S);
  const accent = k.connected ? `<rect x="0" y="0" width="${S}" height="5" fill="${color}"/>` : "";

  if (!k.connected) {
    const title = k.status === "Connecting" ? "Connecting…" : "Offline";
    const detail = k.status && k.status !== "Disconnected" && k.status !== "Connecting" ? k.status : "not connected";
    return toDataUrl(
      svg(S, S, bg + text(title, { x: S / 2, y: 68, size: 24, weight: 800 }) + text(truncate(detail, 16), { x: S / 2, y: 92, size: 14, weight: 600, opacity: 0.8 })),
    );
  }

  const title = text("Online", { x: S / 2, y: 28, size: 19, weight: 800 });
  const rate = (value: number, arrow: string, color: string, y: number) =>
    text(arrow, { x: 12, y, size: 20, weight: 700, fill: color, anchor: "start" }) +
    text(formatMbit(value), { x: S - 12, y, size: 30, weight: 800, anchor: "end" });
  const rates =
    rate(k.upMbit, "▲", THEME.upload, 64) + rate(k.downMbit, "▼", THEME.download, 98) + text("Mbit/s", { x: S - 12, y: 113, size: 11, weight: 600, opacity: 0.6, anchor: "end" });
  const uptime = text(`up ${formatUptime(k.uptime)}`, { x: S / 2, y: 132, size: 14, weight: 600, opacity: 0.75 });

  return toDataUrl(svg(S, S, bg + accent + title + rates + uptime));
}

/** Full-key Wi-Fi QR code on white, with the SSID above. */
export function qrKey(matrix: QrMatrix, ssid: string): string {
  return toDataUrl(
    svg(
      S,
      S,
      `<rect width="${S}" height="${S}" fill="#FFFFFF"/>` +
        text(truncate(ssid, 18), { x: S / 2, y: 13, size: 11, weight: 700, fill: "#0B1220" }) +
        qrSvg(matrix, { x: 8, y: 16, size: S - 24, quiet: 1 }),
    ),
  );
}

/** Neutral key with two lines of text, e.g. "Connect / see settings" or "Offline". */
export function messageKey(title: string, subtitle: string): string {
  return toDataUrl(
    svg(
      S,
      S,
      background("bg", THEME.surface, THEME.base, S, S) +
        `<rect x="3" y="3" width="${S - 6}" height="${S - 6}" rx="14" fill="none" stroke="${THEME.muted}" stroke-width="2"/>` +
        text(title, { x: S / 2, y: 68, size: 22, weight: 800 }) +
        text(subtitle, { x: S / 2, y: 92, size: 15, weight: 600, fill: THEME.subtle }),
    ),
  );
}
