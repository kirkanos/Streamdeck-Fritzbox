import { createHash, pbkdf2 } from "node:crypto";
import { promisify } from "node:util";
import { fetchTransport, httpsTransport, type Transport, type TransportResponse, Tr064Error } from "../tr064/client";
import { type TrafficToday, toNumber } from "./model";

const pbkdf2Async = promisify(pbkdf2);

export type WebSessionOptions = {
  host: string;
  username: string;
  password: string;
  /** Web interface over HTTPS on port 443 (self-signed certificate) instead of HTTP on port 80. */
  https?: boolean;
  timeoutMs?: number;
  /** Replaceable for tests. */
  transport?: Transport;
  now?: () => number;
};

const NO_SID = /^0+$/;

/** Wait at least this long after a failed login; the box blocks logins that come too fast. */
const MIN_LOGIN_BACKOFF_MS = 60_000;

/**
 * A session in the Fritz!Box web interface (login_sid.lua), used for values
 * TR-064 does not offer: the online counter ("Online-Zähler") with today's
 * traffic. The session id is kept and renewed by every request; it is
 * replaced by a new login when the box no longer accepts it.
 */
export class FritzWebSession {
  readonly #options: WebSessionOptions;
  readonly #base: string;
  readonly #transport: Transport;
  readonly #now: () => number;
  #sid: string | undefined;
  #blockedUntil = 0;

  constructor(options: WebSessionOptions) {
    this.#options = options;
    this.#base = `${options.https ? "https" : "http"}://${options.host}`;
    this.#transport = options.transport ?? (options.https ? httpsTransport : fetchTransport);
    this.#now = options.now ?? Date.now;
  }

  /** Today's traffic from the online counter; logs in when needed. */
  async todayTraffic(): Promise<TrafficToday> {
    const reused = Boolean(this.#sid);
    const sid = this.#sid ?? (await this.#login());
    const result = await this.#readCounter(sid);
    if (result.traffic) {
      return result.traffic;
    }
    this.#sid = undefined;
    if (reused) {
      // The session expired (e.g. after the computer slept): log in once more.
      const retry = await this.#readCounter(await this.#login());
      if (retry.traffic) {
        return retry.traffic;
      }
      throw unparsed(retry.body);
    }
    throw unparsed(result.body);
  }

  /** data.lua (Fritz!OS 7 and newer), then query.lua (older firmware). */
  async #readCounter(sid: string): Promise<{ traffic?: TrafficToday; body: string }> {
    const page = await this.#request("POST", "/data.lua", new URLSearchParams({ xhr: "1", sid, lang: "de", page: "netCnt", xhrId: "all" }).toString());
    const traffic = page.status === 200 ? parseTodayCounter(page.body) : undefined;
    if (traffic) {
      return { traffic, body: page.body };
    }
    const query = new URLSearchParams({ sid, ...QUERY_VARIABLES });
    const res = await this.#request("GET", `/query.lua?${query}`);
    return { traffic: res.status === 200 ? parseQueryCounter(res.body) : undefined, body: `HTTP ${page.status} ${page.body}` };
  }

  async #login(): Promise<string> {
    const wait = this.#blockedUntil - this.#now();
    if (wait > 0) {
      throw new Tr064Error(`Web login blocked for ${Math.ceil(wait / 1000)} s`, "auth");
    }
    const info = parseSessionInfo((await this.#request("GET", "/login_sid.lua?version=2")).body);
    if (!info.challenge) {
      throw new Tr064Error("Web login: no challenge received", "http");
    }
    if (info.blockTime > 0) {
      this.#blockedUntil = this.#now() + info.blockTime * 1000;
      throw new Tr064Error(`Web login blocked for ${info.blockTime} s`, "auth");
    }
    const response = await loginResponse(info.challenge, this.#options.password);
    const body = new URLSearchParams({ username: this.#options.username, response }).toString();
    const result = parseSessionInfo((await this.#request("POST", "/login_sid.lua?version=2", body)).body);
    if (!result.sid || NO_SID.test(result.sid)) {
      this.#blockedUntil = this.#now() + Math.max(result.blockTime * 1000, MIN_LOGIN_BACKOFF_MS);
      throw new Tr064Error("Web login: wrong username or password", "auth", 401);
    }
    this.#sid = result.sid;
    return result.sid;
  }

  async #request(method: "GET" | "POST", path: string, body?: string): Promise<TransportResponse> {
    const headers: Record<string, string> = body ? { "Content-Type": "application/x-www-form-urlencoded" } : {};
    try {
      return await this.#transport({ url: this.#base + path, method, headers, body, timeoutMs: this.#options.timeoutMs ?? 10_000 });
    } catch (err) {
      throw new Tr064Error(`Cannot reach ${this.#base}: ${(err as Error)?.message ?? String(err)}`, "unreachable");
    }
  }
}

/** Online counter variables for query.lua, read as e.g. ?sh=inetstat:status/Today/BytesSentHigh. */
const QUERY_VARIABLES = {
  sh: "inetstat:status/Today/BytesSentHigh",
  sl: "inetstat:status/Today/BytesSentLow",
  rh: "inetstat:status/Today/BytesReceivedHigh",
  rl: "inetstat:status/Today/BytesReceivedLow",
};

function unparsed(body: string): Tr064Error {
  const snippet = body.replace(/\s+/g, " ").slice(0, 400);
  return new Tr064Error(`Online counter not found in the web interface response: ${snippet}`, "fault");
}

export type SessionInfo = { sid?: string; challenge?: string; blockTime: number };

export function parseSessionInfo(xml: string): SessionInfo {
  const tag = (name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim();
  return { sid: tag("SID"), challenge: tag("Challenge"), blockTime: toNumber(tag("BlockTime")) };
}

/**
 * Answer to a login challenge: PBKDF2-SHA256 for "2$iter1$salt1$iter2$salt2"
 * (Fritz!OS 7.24 and newer), the MD5 scheme of older firmware otherwise.
 */
export async function loginResponse(challenge: string, password: string): Promise<string> {
  const parts = challenge.split("$");
  if (parts[0] === "2" && parts.length === 5) {
    const [, iter1, salt1, iter2, salt2] = parts;
    const hash1 = await pbkdf2Async(Buffer.from(password, "utf8"), Buffer.from(salt1, "hex"), Number(iter1), 32, "sha256");
    const hash2 = await pbkdf2Async(hash1, Buffer.from(salt2, "hex"), Number(iter2), 32, "sha256");
    return `${salt2}$${hash2.toString("hex")}`;
  }
  // Characters above U+00FF are replaced by "." as the box does.
  const text = `${challenge}-${password}`.replace(/[^\u0000-ÿ]/g, ".");
  return `${challenge}-${createHash("md5").update(Buffer.from(text, "utf16le")).digest("hex")}`;
}

type Counter = Record<string, unknown>;

/**
 * Finds today's row of the online counter in a data.lua response. The page
 * format differs between firmware versions (JSON, or a script block in
 * HTML), so this looks for an object under "Today" with the byte counters
 * (BytesSentHigh / BytesSentLow etc.) anywhere in the response.
 */
export function parseTodayCounter(body: string): TrafficToday | undefined {
  try {
    const found = findToday(JSON.parse(body));
    if (found) {
      return found;
    }
  } catch {
    // Not JSON: look for the object in the text.
  }
  for (const match of body.matchAll(/["']?Today["']?\s*[:=]\s*(\{[^{}]*\})/gi)) {
    try {
      const traffic = counterTraffic(JSON.parse(match[1]) as Counter);
      if (traffic) {
        return traffic;
      }
    } catch {
      // Not valid JSON, try the next match.
    }
  }
  return undefined;
}

function findToday(value: unknown, depth = 0): TrafficToday | undefined {
  if (!value || typeof value !== "object" || depth > 8) {
    return undefined;
  }
  for (const [key, child] of Object.entries(value as Counter)) {
    if (key.toLowerCase() === "today" && child && typeof child === "object") {
      const traffic = counterTraffic(child as Counter);
      if (traffic) {
        return traffic;
      }
    }
    const nested = findToday(child, depth + 1);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/** Bytes from High / Low 32-bit halves (or a single value) of one counter row. */
function counterTraffic(row: Counter): TrafficToday | undefined {
  const lower = new Map(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
  const bytes = (name: string): number | undefined => {
    const high = lower.get(`${name}high`);
    const low = lower.get(`${name}low`);
    if (low !== undefined) {
      return toNumber(String(high ?? 0)) * 2 ** 32 + toNumber(String(low));
    }
    const single = lower.get(name);
    return single !== undefined ? toNumber(String(single)) : undefined;
  };
  const sent = bytes("bytessent");
  const received = bytes("bytesreceived");
  if (sent === undefined && received === undefined) {
    return undefined;
  }
  return { sentBytes: sent ?? 0, receivedBytes: received ?? 0 };
}

/** query.lua answer such as {"sh":"0","sl":"123",...}; undefined when the variables are missing or empty. */
export function parseQueryCounter(body: string): TrafficToday | undefined {
  try {
    const values = JSON.parse(body) as Record<string, string>;
    if (!values.sl && !values.rl) {
      return undefined;
    }
    return {
      sentBytes: toNumber(values.sh) * 2 ** 32 + toNumber(values.sl),
      receivedBytes: toNumber(values.rh) * 2 ** 32 + toNumber(values.rl),
    };
  } catch {
    return undefined;
  }
}
