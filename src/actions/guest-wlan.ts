import {
  action,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type TitleParametersDidChangeEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { PLUGIN_ID } from "../config";
import { fritz } from "../fritz/service";
import { guestKey, messageKey, qrKey } from "../render/keys";
import { showImage, updates } from "../throttle";
import { guestQrMatrix, unavailableMessage } from "./shared";

export type GuestWlanSettings = {
  /** What a short press does; a long press always shows the QR code. */
  pressAction?: "toggle" | "qr";
};

/** Holding the key this long shows the QR code instead of toggling. */
export const LONG_PRESS_MS = 600;
/** How long the QR code stays on the key. */
export const QR_DURATION_MS = 30_000;

/** A key showing the guest WLAN; press toggles it, long press shows the Wi-Fi QR code. */
@action({ UUID: `${PLUGIN_ID}.guest-wlan` })
export class GuestWlanAction extends SingletonAction<GuestWlanSettings> {
  readonly #settings = new Map<string, GuestWlanSettings>();
  /** Keys with a user-defined title: the SSID is not drawn into the image then. */
  readonly #hasTitle = new Map<string, boolean>();
  readonly #longPress = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #qrTimers = new Map<string, ReturnType<typeof setTimeout>>();

  override onWillAppear(ev: WillAppearEvent<GuestWlanSettings>): Promise<void> {
    this.#settings.set(ev.action.id, ev.payload.settings);
    return this.#render(ev.action.id);
  }

  override onWillDisappear(ev: WillDisappearEvent<GuestWlanSettings>): void {
    this.#settings.delete(ev.action.id);
    this.#hasTitle.delete(ev.action.id);
    this.#clearTimer(this.#longPress, ev.action.id);
    this.#clearTimer(this.#qrTimers, ev.action.id);
    updates.forget(ev.action.id);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<GuestWlanSettings>): Promise<void> {
    this.#settings.set(ev.action.id, ev.payload.settings);
    return this.#render(ev.action.id);
  }

  override onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<GuestWlanSettings>): Promise<void> {
    this.#hasTitle.set(ev.action.id, ev.payload.title.trim() !== "");
    return this.#render(ev.action.id);
  }

  override onKeyDown(ev: KeyDownEvent<GuestWlanSettings>): void {
    this.#clearTimer(this.#longPress, ev.action.id);
    if (!fritz.guest) {
      return;
    }
    // Show the QR code as soon as the key has been held long enough.
    this.#longPress.set(
      ev.action.id,
      setTimeout(() => {
        this.#longPress.delete(ev.action.id);
        void this.#showQr(ev.action.id);
      }, LONG_PRESS_MS),
    );
  }

  override async onKeyUp(ev: KeyUpEvent<GuestWlanSettings>): Promise<void> {
    const wasShort = this.#longPress.has(ev.action.id);
    this.#clearTimer(this.#longPress, ev.action.id);
    const guest = fritz.guest;
    if (!wasShort || !guest) {
      return;
    }
    if (ev.payload.settings.pressAction === "qr") {
      await this.#showQr(ev.action.id);
      return;
    }
    // A press while the QR code is shown hides it instead of toggling.
    if (this.#qrTimers.has(ev.action.id)) {
      this.#clearTimer(this.#qrTimers, ev.action.id);
      await this.#render(ev.action.id);
      return;
    }
    const ok = await fritz.setGuestEnabled(!guest.enabled);
    await (ok ? ev.action.showOk() : ev.action.showAlert());
  }

  /** Re-renders all visible keys. */
  async refresh(): Promise<void> {
    for (const id of this.#settings.keys()) {
      await this.#render(id);
    }
  }

  async #showQr(actionId: string): Promise<void> {
    if (!guestQrMatrix()) {
      return;
    }
    this.#clearTimer(this.#qrTimers, actionId);
    this.#qrTimers.set(
      actionId,
      setTimeout(() => {
        this.#qrTimers.delete(actionId);
        void this.#render(actionId);
      }, QR_DURATION_MS),
    );
    await this.#render(actionId);
  }

  #clearTimer(timers: Map<string, ReturnType<typeof setTimeout>>, actionId: string): void {
    const timer = timers.get(actionId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(actionId);
    }
  }

  async #render(actionId: string): Promise<void> {
    const key = this.actions.find((a) => a.id === actionId) as KeyAction<GuestWlanSettings> | undefined;
    if (!key || !this.#settings.has(actionId)) {
      return;
    }

    const unavailable = unavailableMessage();
    const guest = fritz.guest;
    if (unavailable || !guest) {
      showImage(key, unavailable ? messageKey(...unavailable) : messageKey("Guest WLAN", "no data"));
      return;
    }

    const matrix = this.#qrTimers.has(actionId) ? guestQrMatrix() : undefined;
    if (matrix) {
      showImage(key, qrKey(matrix, guest.ssid));
      return;
    }

    showImage(
      key,
      guestKey({ enabled: guest.enabled, ssid: guest.ssid, guests: guest.associations, showSsid: !this.#hasTitle.get(actionId) }),
    );
  }
}
