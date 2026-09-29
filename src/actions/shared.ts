import { fritz } from "../fritz/service";
import { qrMatrix, type QrMatrix } from "../render/qr";
import { wifiQrPayload } from "../fritz/wifi";

/** Title / subtitle for keys and dials that cannot show data yet; undefined when data is available. */
export function unavailableMessage(): [string, string] | undefined {
  if (fritz.state === "unconfigured") {
    return ["Connect", "see settings"];
  }
  if (!fritz.isConnected) {
    return ["Offline", fritz.state === "error" ? "check settings" : "connecting…"];
  }
  return undefined;
}

let cached: { payload: string; matrix: QrMatrix } | undefined;

/** QR matrix for the current guest WLAN, computed once per SSID / key. */
export function guestQrMatrix(): QrMatrix | undefined {
  const guest = fritz.guest;
  if (!guest?.ssid) {
    return undefined;
  }
  const payload = wifiQrPayload(guest.ssid, guest.key);
  if (cached?.payload !== payload) {
    cached = { payload, matrix: qrMatrix(payload) };
  }
  return cached.matrix;
}
