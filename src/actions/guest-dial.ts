import {
  action,
  type DialAction,
  type DialDownEvent,
  SingletonAction,
  type TouchTapEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { PLUGIN_ID } from "../config";
import { fritz } from "../fritz/service";
import { dialMessage, dialOff, dialQr } from "../render/dial";
import { updates } from "../throttle";
import { guestQrMatrix, unavailableMessage } from "./shared";

export type GuestDialSettings = Record<string, never>;

/** A dial whose touch strip shows the guest Wi-Fi QR code while the network is on; push toggles it. */
@action({ UUID: `${PLUGIN_ID}.guest-dial` })
export class GuestDialAction extends SingletonAction<GuestDialSettings> {
  readonly #visible = new Set<string>();

  override onWillAppear(ev: WillAppearEvent<GuestDialSettings>): Promise<void> {
    this.#visible.add(ev.action.id);
    return this.#render(ev.action.id);
  }

  override onWillDisappear(ev: WillDisappearEvent<GuestDialSettings>): void {
    this.#visible.delete(ev.action.id);
    updates.forget(ev.action.id);
  }

  override onDialDown(ev: DialDownEvent<GuestDialSettings>): Promise<void> {
    return this.#toggle(ev.action);
  }

  override onTouchTap(ev: TouchTapEvent<GuestDialSettings>): Promise<void> {
    return this.#toggle(ev.action);
  }

  async refresh(): Promise<void> {
    for (const id of this.#visible) {
      await this.#render(id);
    }
  }

  async #toggle(dial: DialAction<GuestDialSettings>): Promise<void> {
    const guest = fritz.guest;
    if (!guest || !(await fritz.setGuestEnabled(!guest.enabled))) {
      await dial.showAlert();
    }
  }

  async #render(actionId: string): Promise<void> {
    const dial = this.actions.find((a) => a.id === actionId);
    if (!dial?.isDial() || !this.#visible.has(actionId)) {
      return;
    }

    const unavailable = unavailableMessage();
    const guest = fritz.guest;
    let canvas: string;
    if (unavailable) {
      canvas = dialMessage(unavailable[0], unavailable[1] === "see settings" ? "open the dial settings" : unavailable[1]);
    } else if (!guest) {
      canvas = dialMessage("Guest WLAN", "no data");
    } else if (!guest.enabled) {
      canvas = dialOff(guest.ssid);
    } else {
      const matrix = guestQrMatrix();
      canvas = matrix ? dialQr(matrix, guest.ssid, guest.associations) : dialMessage(guest.ssid, "on · no QR code");
    }
    updates.update(dial.id, canvas, (value) => dial.setFeedback({ canvas: value }));
  }
}
