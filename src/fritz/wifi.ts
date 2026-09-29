/**
 * Payload of a Wi-Fi QR code (the format understood by Android and iOS):
 * `WIFI:T:WPA;S:<ssid>;P:<password>;;`. Special characters are escaped
 * with a backslash.
 */
export function wifiQrPayload(ssid: string, key: string | undefined): string {
  const escape = (text: string) => text.replace(/[\\;,:"]/g, "\\$&");
  if (!key) {
    return `WIFI:T:nopass;S:${escape(ssid)};;`;
  }
  return `WIFI:T:WPA;S:${escape(ssid)};P:${escape(key)};;`;
}
