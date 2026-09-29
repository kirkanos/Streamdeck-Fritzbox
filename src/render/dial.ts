import { wifiIcon } from "./keys";
import { type QrMatrix, qrSvg } from "./qr";
import { background, mix, svg, text, toDataUrl, truncate } from "./svg";
import { THEME } from "./theme";
import { formatGuests } from "./values";

/** Touch strip segment of one dial (Stream Deck + / + XL). */
const W = 200;
const H = 100;

/** Guest WLAN on: the Wi-Fi QR code with SSID and guest count next to it. */
export function dialQr(matrix: QrMatrix, ssid: string, guests: number): string {
  const bg = background("bg", mix(THEME.ok, THEME.base, 0.75), THEME.base, W, H);
  const qr = qrSvg(matrix, { x: 4, y: 4, size: H - 8, quiet: 1 });
  const label = text("Guest WLAN", { x: 104, y: 30, size: 13, weight: 600, opacity: 0.7, anchor: "start" });
  // The SSID must fit between the QR code and the right edge (92 px): shrink long names.
  const ssidText = truncate(ssid, 14);
  const name = text(ssidText, { x: 104, y: 54, size: Math.max(11, Math.min(16, Math.floor(92 / (ssidText.length * 0.6)))), weight: 800, anchor: "start" });
  const count = text(formatGuests(guests), { x: 104, y: 78, size: 13, weight: 600, opacity: 0.8, anchor: "start" });
  return toDataUrl(svg(W, H, bg + qr + label + name + count));
}

/** Guest WLAN off. */
export function dialOff(ssid: string): string {
  const bg = background("bg", THEME.surface, THEME.base, W, H);
  const icon = wifiIcon(40, 60, 26, THEME.subtle, 0.7);
  const off = `<line x1="22" y1="72" x2="60" y2="34" stroke="${THEME.error}" stroke-width="4" stroke-linecap="round"/>`;
  const name = text(truncate(ssid || "Guest WLAN", 14), { x: 84, y: 44, size: 16, weight: 800, anchor: "start" });
  const hint = text("off · push to enable", { x: 84, y: 68, size: 12, weight: 600, fill: THEME.subtle, anchor: "start" });
  return toDataUrl(svg(W, H, bg + icon + off + name + hint));
}

export function dialMessage(title: string, subtitle: string): string {
  return toDataUrl(
    svg(
      W,
      H,
      background("bg", THEME.surface, THEME.base, W, H) +
        text(title, { x: 12, y: 44, size: 20, weight: 800, anchor: "start" }) +
        text(subtitle, { x: 12, y: 70, size: 14, weight: 600, fill: THEME.subtle, anchor: "start" }),
    ),
  );
}
