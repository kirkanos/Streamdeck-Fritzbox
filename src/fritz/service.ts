import { EventEmitter } from "node:events";
import { Tr064Client, Tr064Error } from "../tr064/client";
import { DEVICE_INFO, type Service, WAN_COMMON, WAN_IP, WAN_PPP, wlanConfiguration } from "../tr064/services";
import { bitsPerSecondToMbit, bytesPerSecondToMbit, type GuestWlan, newestOfList, type OnlineStatus, toNumber } from "./model";

export type FritzSettings = {
  host?: string;
  https?: boolean;
  username?: string;
  password?: string;
  /** WLANConfiguration index of the guest network; undefined = detect. */
  guestIndex?: number;
};

export type ConnectionState = "unconfigured" | "connecting" | "connected" | "error";

export type TestResult = { ok: true; model: string } | { ok: false; error: string };

export const DEFAULT_HOST = "fritz.box";
export const POLL_INTERVAL_MS = 10_000;

/** Candidate indices for the guest network, most likely first (tri-band boxes use 4, dual-band 3, single-band 2). */
const GUEST_CANDIDATES = [4, 3, 2];

export const isConfigured = (s: FritzSettings): boolean => Boolean(s.username && s.password);

/**
 * Polls one Fritz!Box over TR-064 and keeps the guest WLAN and internet
 * connection state.
 *
 * Events:
 *   "update"  guest WLAN or online status changed
 *   "state"   the connection state changed
 */
export class FritzService extends EventEmitter<{ update: []; state: [] }> {
  #settings: FritzSettings = {};
  #client: Tr064Client | undefined;
  #state: ConnectionState = "unconfigured";
  #error: string | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #polling: Promise<void> | undefined;
  #guest: GuestWlan | undefined;
  #online: OnlineStatus | undefined;
  #model: string | undefined;
  #wanService: Service | undefined;
  #guestIndex: number | undefined;

  get settings(): FritzSettings {
    return this.#settings;
  }

  get state(): ConnectionState {
    return this.#state;
  }

  get error(): string | undefined {
    return this.#error;
  }

  get isConnected(): boolean {
    return this.#state === "connected";
  }

  get model(): string | undefined {
    return this.#model;
  }

  get guest(): GuestWlan | undefined {
    return this.#guest;
  }

  get online(): OnlineStatus | undefined {
    return this.#online;
  }

  get host(): string {
    return this.#settings.host?.trim() || DEFAULT_HOST;
  }

  /** URL of the box's web interface, opened by the Online key. */
  get webUrl(): string {
    return `http://${this.host}`;
  }

  /** Applies new connection settings; reconnects only when they changed. */
  configure(settings: FritzSettings): void {
    const next: FritzSettings = {
      host: settings.host?.trim() || undefined,
      https: Boolean(settings.https),
      username: settings.username,
      password: settings.password,
      guestIndex: settings.guestIndex || undefined,
    };
    if (this.#client && JSON.stringify(next) === JSON.stringify(this.#settings)) {
      return;
    }
    this.#settings = next;
    this.#stop();
    this.#guest = undefined;
    this.#online = undefined;
    this.#model = undefined;
    this.#wanService = undefined;
    this.#guestIndex = next.guestIndex;
    this.emit("update");

    if (!isConfigured(next)) {
      this.#setState("unconfigured");
      return;
    }
    this.#client = this.#createClient(next);
    this.#setState("connecting");
    void this.poll();
    this.#timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  /** Checks host and credentials with a temporary client (DeviceInfo GetInfo). */
  async test(settings: FritzSettings): Promise<TestResult> {
    if (!isConfigured(settings)) {
      return { ok: false, error: "Please enter username and password" };
    }
    try {
      const info = await this.#createClient(settings).call(DEVICE_INFO, "GetInfo");
      return { ok: true, model: info.NewModelName || "Fritz!Box" };
    } catch (err) {
      return { ok: false, error: errorText(err) };
    }
  }

  /** Switches the guest WLAN; the new state is shown right away and confirmed by the next poll. */
  async setGuestEnabled(enabled: boolean): Promise<boolean> {
    const client = this.#client;
    const guest = this.#guest;
    if (!client || !guest) {
      return false;
    }
    try {
      await client.call(wlanConfiguration(guest.index), "SetEnable", { NewEnable: enabled });
      this.#guest = { ...guest, enabled, status: enabled ? "Up" : "Disabled", associations: enabled ? guest.associations : 0 };
      this.emit("update");
      // The box needs a moment to bring the radio up before GetInfo reflects it.
      setTimeout(() => void this.poll(), 2_000);
      return true;
    } catch (err) {
      this.#setState("error", errorText(err));
      return false;
    }
  }

  /** Reads everything once; runs are never overlapped. */
  poll(): Promise<void> {
    if (!this.#polling) {
      this.#polling = this.#poll().finally(() => (this.#polling = undefined));
    }
    return this.#polling;
  }

  async #poll(): Promise<void> {
    const client = this.#client;
    if (!client) {
      return;
    }
    try {
      if (!this.#model) {
        const info = await client.call(DEVICE_INFO, "GetInfo");
        this.#model = info.NewModelName || "Fritz!Box";
      }
      const guest = await this.#readGuest(client);
      const online = await this.#readOnline(client);
      if (client !== this.#client) {
        return; // reconfigured meanwhile
      }
      const changed = JSON.stringify(guest) !== JSON.stringify(this.#guest) || JSON.stringify(online) !== JSON.stringify(this.#online);
      this.#guest = guest;
      this.#online = online;
      this.#setState("connected");
      if (changed) {
        this.emit("update");
      }
    } catch (err) {
      if (client === this.#client) {
        this.#setState("error", errorText(err));
      }
    }
  }

  async #readGuest(client: Tr064Client): Promise<GuestWlan> {
    const index = this.#guestIndex ?? (await this.#findGuestIndex(client));
    this.#guestIndex = index;
    const service = wlanConfiguration(index);
    const info = await client.call(service, "GetInfo");
    const enabled = info.NewEnable === "1";
    let associations = 0;
    let key: string | undefined;
    if (enabled) {
      associations = toNumber((await client.call(service, "GetTotalAssociations")).NewTotalAssociations);
    }
    try {
      key = (await client.call(service, "GetSecurityKeys")).NewKeyPassphrase || undefined;
    } catch (err) {
      // Not authorized for the key (user without the "Fritz!Box settings" right): no QR code then.
      if (!(err instanceof Tr064Error && err.kind === "fault")) {
        throw err;
      }
    }
    return { index, enabled, ssid: info.NewSSID ?? "", status: info.NewStatus ?? "", associations, key };
  }

  /**
   * Finds the WLANConfiguration index of the guest network: the highest index
   * that answers, unless X_AVM-DE_GetWLANExtInfo identifies another one as "guest".
   */
  async #findGuestIndex(client: Tr064Client): Promise<number> {
    let fallback: number | undefined;
    for (const index of GUEST_CANDIDATES) {
      const service = wlanConfiguration(index);
      try {
        await client.call(service, "GetInfo");
      } catch (err) {
        if (err instanceof Tr064Error && err.kind !== "unreachable" && err.kind !== "auth") {
          continue; // index does not exist on this box
        }
        throw err;
      }
      let apType: string | undefined;
      try {
        apType = (await client.call(service, "X_AVM-DE_GetWLANExtInfo"))["NewX_AVM-DE_APType"];
      } catch {
        // Older firmware without the extension: take the highest existing index.
      }
      if (apType === undefined || apType.toLowerCase() === "guest") {
        return index;
      }
      fallback ??= index;
    }
    if (fallback === undefined) {
      throw new Tr064Error("No guest WLAN found (WLANConfiguration 2-4)", "fault");
    }
    return fallback;
  }

  async #readOnline(client: Tr064Client): Promise<OnlineStatus> {
    const link = await client.call(WAN_COMMON, "GetCommonLinkProperties");
    const wan = await this.#wanConnection(client);
    const status = await client.call(wan, "GetStatusInfo");
    const connected = status.NewConnectionStatus === "Connected";
    let downMbit = 0;
    let upMbit = 0;
    try {
      const monitor = await client.call(WAN_COMMON, "X_AVM-DE_GetOnlineMonitor", { NewSyncGroupIndex: 0 });
      downMbit = bytesPerSecondToMbit(newestOfList(monitor.Newds_current_bps));
      upMbit = bytesPerSecondToMbit(newestOfList(monitor.Newus_current_bps));
    } catch (err) {
      if (!(err instanceof Tr064Error && err.kind === "fault")) {
        throw err;
      }
    }

    return {
      connected,
      status: status.NewConnectionStatus ?? "",
      linkStatus: link.NewPhysicalLinkStatus ?? "",
      uptime: toNumber(status.NewUptime),
      downMbit,
      upMbit,
      downMaxMbit: bitsPerSecondToMbit(toNumber(link.NewLayer1DownstreamMaxBitRate)),
      upMaxMbit: bitsPerSecondToMbit(toNumber(link.NewLayer1UpstreamMaxBitRate)),
    };
  }

  /** WANPPPConnection on DSL boxes, WANIPConnection on cable / fiber boxes. */
  async #wanConnection(client: Tr064Client): Promise<Service> {
    if (this.#wanService) {
      return this.#wanService;
    }
    for (const service of [WAN_PPP, WAN_IP]) {
      try {
        const status = await client.call(service, "GetStatusInfo");
        // A PPP service that exists but is unused reports "Unconfigured".
        if (status.NewConnectionStatus && status.NewConnectionStatus !== "Unconfigured") {
          this.#wanService = service;
          return service;
        }
      } catch (err) {
        if (!(err instanceof Tr064Error && err.kind === "fault")) {
          throw err;
        }
      }
    }
    this.#wanService = WAN_IP;
    return WAN_IP;
  }

  #createClient(settings: FritzSettings): Tr064Client {
    return new Tr064Client({
      host: settings.host?.trim() || DEFAULT_HOST,
      https: Boolean(settings.https),
      username: settings.username ?? "",
      password: settings.password ?? "",
    });
  }

  #stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    this.#client = undefined;
  }

  #setState(state: ConnectionState, error?: string): void {
    if (state === this.#state && error === this.#error) {
      return;
    }
    this.#state = state;
    this.#error = error;
    this.emit("state");
  }
}

function errorText(err: unknown): string {
  if (err instanceof Tr064Error) {
    if (err.kind === "unreachable" && /ECONNREFUSED|timeout|ENOTFOUND|EHOSTUNREACH/i.test(err.message)) {
      return `${err.message} – is TR-064 enabled?`;
    }
    if (err.kind === "fault" && err.code === 606) {
      return "Not authorized: the user needs the \"Fritz!Box settings\" right";
    }
    return err.message;
  }
  return (err as Error)?.message ?? String(err);
}

export const fritz = new FritzService();
