import streamDeck from "@elgato/streamdeck";
import { GuestDialAction } from "./actions/guest-dial";
import { GuestWlanAction } from "./actions/guest-wlan";
import { OnlineAction } from "./actions/online";
import { DEFAULT_HOST, fritz, type FritzSettings, isConfigured } from "./fritz/service";

type JsonValue = Parameters<typeof streamDeck.ui.sendToPropertyInspector>[0];

streamDeck.logger.setLevel("info");

const guestWlan = new GuestWlanAction();
const online = new OnlineAction();
const guestDial = new GuestDialAction();

streamDeck.actions.registerAction(guestWlan);
streamDeck.actions.registerAction(online);
streamDeck.actions.registerAction(guestDial);

// Keep every visible key and dial in sync with the Fritz!Box.

function refreshAll(): void {
  void guestWlan.refresh();
  void online.refresh();
  void guestDial.refresh();
}

fritz.on("update", () => {
  refreshAll();
  sendToPropertyInspector(statusMessage());
});

fritz.on("state", () => {
  streamDeck.logger.info(`fritz connection: ${fritz.state}${fritz.error ? ` (${fritz.error})` : ""}`);
  refreshAll();
  sendToPropertyInspector(statusMessage());
});

// Messages from the property inspectors (ui/*.html).

type UiMessage =
  | { event: "getStatus" | "disconnect" }
  | { event: "connect"; host: string; https: boolean; username: string; password: string; guestIndex?: number };

streamDeck.ui.onSendToPlugin<UiMessage>(async (ev) => {
  const message = ev.payload;
  switch (message.event) {
    case "getStatus":
      sendToPropertyInspector(statusMessage());
      break;
    case "connect": {
      const settings: FritzSettings = {
        host: message.host.trim() || DEFAULT_HOST,
        https: Boolean(message.https),
        username: message.username.trim(),
        // An empty password keeps the stored one (editing host or user only).
        password: message.password || fritz.settings.password,
        guestIndex: message.guestIndex || undefined,
      };
      const result = await fritz.test(settings);
      if (result.ok) {
        await saveSettings(settings);
      }
      sendToPropertyInspector({ event: "connect", ...result });
      break;
    }
    case "disconnect":
      await saveSettings({ host: fritz.settings.host, https: fritz.settings.https });
      break;
  }
});

function statusMessage(): JsonValue {
  return {
    event: "status",
    state: fritz.state,
    host: fritz.settings.host ?? DEFAULT_HOST,
    https: Boolean(fritz.settings.https),
    username: fritz.settings.username ?? "",
    guestIndex: fritz.settings.guestIndex ?? 0,
    error: fritz.error ?? "",
    configured: isConfigured(fritz.settings),
    model: fritz.model ?? "",
    guestSsid: fritz.guest?.ssid ?? "",
    guestFound: fritz.guest?.index ?? 0,
  };
}

function sendToPropertyInspector(payload: JsonValue): void {
  if (streamDeck.ui.action) {
    streamDeck.ui.sendToPropertyInspector(payload).catch(() => undefined);
  }
}

async function saveSettings(settings: FritzSettings): Promise<void> {
  await streamDeck.settings.setGlobalSettings(settings);
  fritz.configure(settings);
  sendToPropertyInspector(statusMessage());
}

streamDeck.settings.onDidReceiveGlobalSettings<FritzSettings>((ev) => fritz.configure(ev.settings));

await streamDeck.connect();
fritz.configure(await streamDeck.settings.getGlobalSettings<FritzSettings>());
