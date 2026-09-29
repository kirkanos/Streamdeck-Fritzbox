import { describe, expect, it } from "vitest";
import { dialOff, dialQr } from "./dial";
import { guestKey, messageKey, onlineKey, qrKey } from "./keys";
import { qrMatrix, qrSvg } from "./qr";
import { escapeXml } from "./svg";
import { formatGuests, formatMbit, formatUptime } from "./values";

const decode = (dataUrl: string) => Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");

describe("values", () => {
  it("formats uptime", () => {
    expect(formatUptime(45)).toBe("45s");
    expect(formatUptime(12 * 60 + 5)).toBe("12m");
    expect(formatUptime(4 * 3600 + 12 * 60)).toBe("4h 12m");
    expect(formatUptime(3 * 86400 + 4 * 3600 + 59 * 60)).toBe("3d 4h");
    expect(formatUptime(-5)).toBe("0s");
  });

  it("formats Mbit/s", () => {
    expect(formatMbit(0)).toBe("0.0");
    expect(formatMbit(0.44)).toBe("0.4");
    expect(formatMbit(95.24)).toBe("95.2");
    expect(formatMbit(241.6)).toBe("242");
    expect(formatMbit(Number.NaN)).toBe("0");
  });

  it("formats guest counts", () => {
    expect(formatGuests(0)).toBe("0 guests");
    expect(formatGuests(1)).toBe("1 guest");
    expect(formatGuests(3)).toBe("3 guests");
  });
});

describe("qr", () => {
  it("builds a matrix with finder patterns", () => {
    const matrix = qrMatrix("WIFI:T:WPA;S:Guests;P:pass1234;;");
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix.length % 4).toBe(1);
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
    // Top-left finder pattern: 7×7 with a dark border and a 3×3 dark center.
    expect(matrix[0].slice(0, 7)).toEqual([true, true, true, true, true, true, true]);
    expect(matrix[1].slice(0, 7)).toEqual([true, false, false, false, false, false, true]);
    expect(matrix[3].slice(0, 7)).toEqual([true, false, true, true, true, false, true]);
    // Separator next to the finder is light.
    expect(matrix[7].slice(0, 8).every((dark) => !dark)).toBe(true);
  });

  it("encodes UTF-8 SSIDs", () => {
    expect(qrMatrix("WIFI:T:WPA;S:Gäste 🎉;P:x;;").length).toBeGreaterThan(0);
  });

  it("draws merged rects on a white square", () => {
    const matrix = [
      [true, true, false, true],
      [false, false, false, false],
      [true, false, true, false],
      [true, true, true, true],
    ];
    const svg = qrSvg(matrix, { x: 10, y: 20, size: 40, quiet: 1 });
    // 6 cells (4 + quiet zone) fit 6 px each into 40 px, centered with 2 px left over.
    expect(svg).toContain('<rect x="10" y="20" width="40" height="40" rx="9" fill="#FFFFFF"/>');
    expect(svg).toContain('<rect x="18" y="28" width="12" height="6" fill="#000000"/>');
    expect(svg).toContain('<rect x="36" y="28" width="6" height="6" fill="#000000"/>');
    expect(svg).toContain('<rect x="18" y="46" width="24" height="6" fill="#000000"/>');
    expect(svg.match(/<rect/g)).toHaveLength(1 + 2 + 2 + 1);
  });
});

describe("images", () => {
  it("shows the guest WLAN state", () => {
    const on = decode(guestKey({ enabled: true, ssid: "Gäste & Co", guests: 2 }));
    expect(on).toContain("Gäste &amp; Co");
    expect(on).toContain("2 guests");
    expect(on).toContain("#22C55E");

    const off = decode(guestKey({ enabled: false, ssid: "Guests", guests: 0 }));
    expect(off).toContain(">off<");
    expect(off).not.toContain("#22C55E");
    expect(off).toContain("Guests");

    expect(decode(guestKey({ enabled: true, ssid: "Guests", guests: 1, showSsid: false }))).not.toContain("Guests");
  });

  it("shows the internet connection", () => {
    const up = decode(onlineKey({ connected: true, status: "Connected", externalIp: "203.0.113.7", downMbit: 95.2, upMbit: 40.0, uptime: 90_000 }));
    expect(up).toContain(">Online<");
    expect(up).toContain("203.0.113.7");
    expect(up).toContain("95.2");
    expect(up).toContain("40.0");
    expect(up).toContain("up 1d 1h");

    const down = decode(onlineKey({ connected: false, status: "Disconnected", downMbit: 0, upMbit: 0, uptime: 0 }));
    expect(down).toContain(">Offline<");
    expect(down).toContain("not connected");
    expect(down).not.toContain("Mbit/s");
  });

  it("draws the QR code on key and dial", () => {
    const matrix = qrMatrix("WIFI:T:WPA;S:Guests;P:pass1234;;");
    const key = decode(qrKey(matrix, "Guests"));
    expect(key.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"')).toBe(true);
    expect(key).toContain('fill="#FFFFFF"/>');
    expect((key.match(/fill="#000000"/g) ?? []).length).toBeGreaterThan(50);

    const dial = decode(dialQr(matrix, "Guests", 3));
    expect(dial).toContain('width="200" height="100"');
    expect(dial).toContain("3 guests");
    expect(decode(dialOff("Guests"))).toContain("push to enable");
  });

  it("escapes text", () => {
    expect(escapeXml(`<a & "b">`)).toBe("&lt;a &amp; &quot;b&quot;&gt;");
    expect(decode(messageKey("Offline", "<check>"))).toContain("&lt;check&gt;");
  });
});
