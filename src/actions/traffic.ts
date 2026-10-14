import streamDeck, {
  action,
  type KeyAction,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { PLUGIN_ID } from "../config";
import { fritz } from "../fritz/service";
import { messageKey, trafficKey } from "../render/keys";
import { showImage, updates } from "../throttle";
import { unavailableMessage } from "./shared";

export type TrafficSettings = Record<string, never>;

/** A key showing today's upload and download from the online counter; pressing it opens the Fritz!Box web interface. */
@action({ UUID: `${PLUGIN_ID}.traffic` })
export class TrafficAction extends SingletonAction<TrafficSettings> {
  readonly #visible = new Set<string>();

  override onWillAppear(ev: WillAppearEvent<TrafficSettings>): Promise<void> {
    this.#visible.add(ev.action.id);
    fritz.trafficWanted = true;
    return this.#render(ev.action.id);
  }

  override onWillDisappear(ev: WillDisappearEvent<TrafficSettings>): void {
    this.#visible.delete(ev.action.id);
    fritz.trafficWanted = this.#visible.size > 0;
    updates.forget(ev.action.id);
  }

  override async onKeyDown(_ev: KeyDownEvent<TrafficSettings>): Promise<void> {
    await streamDeck.system.openUrl(fritz.webUrl);
  }

  async refresh(): Promise<void> {
    for (const id of this.#visible) {
      await this.#render(id);
    }
  }

  async #render(actionId: string): Promise<void> {
    const key = this.actions.find((a) => a.id === actionId) as KeyAction<TrafficSettings> | undefined;
    if (!key || !this.#visible.has(actionId)) {
      return;
    }
    const unavailable = unavailableMessage();
    const traffic = fritz.traffic;
    if (unavailable) {
      showImage(key, messageKey(...unavailable));
    } else if (traffic) {
      showImage(key, trafficKey(traffic));
    } else {
      showImage(key, messageKey("Today", trafficProblem(fritz.trafficError)));
    }
  }
}

function trafficProblem(error: string | undefined): string {
  if (!error) {
    return "loading…";
  }
  if (/password|blocked/i.test(error)) {
    return "login failed";
  }
  if (/not found/i.test(error)) {
    return "no counter";
  }
  return "no data";
}
