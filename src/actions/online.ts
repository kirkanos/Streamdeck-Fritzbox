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
import { messageKey, onlineKey } from "../render/keys";
import { showImage, updates } from "../throttle";
import { unavailableMessage } from "./shared";

export type OnlineSettings = Record<string, never>;

/** A key showing the internet connection; pressing it opens the Fritz!Box web interface. */
@action({ UUID: `${PLUGIN_ID}.online` })
export class OnlineAction extends SingletonAction<OnlineSettings> {
  readonly #visible = new Set<string>();

  override onWillAppear(ev: WillAppearEvent<OnlineSettings>): Promise<void> {
    this.#visible.add(ev.action.id);
    return this.#render(ev.action.id);
  }

  override onWillDisappear(ev: WillDisappearEvent<OnlineSettings>): void {
    this.#visible.delete(ev.action.id);
    updates.forget(ev.action.id);
  }

  override async onKeyDown(_ev: KeyDownEvent<OnlineSettings>): Promise<void> {
    await streamDeck.system.openUrl(fritz.webUrl);
  }

  async refresh(): Promise<void> {
    for (const id of this.#visible) {
      await this.#render(id);
    }
  }

  async #render(actionId: string): Promise<void> {
    const key = this.actions.find((a) => a.id === actionId) as KeyAction<OnlineSettings> | undefined;
    if (!key || !this.#visible.has(actionId)) {
      return;
    }
    const unavailable = unavailableMessage();
    const online = fritz.online;
    if (unavailable || !online) {
      showImage(key, unavailable ? messageKey(...unavailable) : messageKey("Internet", "no data"));
      return;
    }
    showImage(key, onlineKey(online));
  }
}
