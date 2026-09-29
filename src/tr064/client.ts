import https from "node:https";
import { authorizationHeader, type DigestChallenge, newCnonce, parseChallenge } from "./digest";
import { HTTP_PORT, HTTPS_PORT, type Service } from "./services";
import { buildEnvelope, parseFault, parseResponse, type SoapArgs } from "./soap";

export type Tr064Options = {
  host: string;
  username: string;
  password: string;
  /** Use TLS on port 49443 (self-signed certificate) instead of plain HTTP on 49000. */
  https?: boolean;
  port?: number;
  timeoutMs?: number;
  /** Replaceable for tests. */
  transport?: Transport;
};

export type TransportRequest = { url: string; method: "POST"; headers: Record<string, string>; body: string; timeoutMs: number };
export type TransportResponse = { status: number; header(name: string): string | undefined; body: string };
export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

export type Tr064ErrorKind = "unreachable" | "auth" | "fault" | "http";

export class Tr064Error extends Error {
  constructor(
    message: string,
    readonly kind: Tr064ErrorKind,
    /** UPnP error code (e.g. 401 Invalid Action, 606 Action not authorized) or HTTP status. */
    readonly code?: number,
  ) {
    super(message);
    this.name = "Tr064Error";
  }
}

/** Plain HTTP via the global fetch. */
const fetchTransport: Transport = async (req) => {
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    signal: AbortSignal.timeout(req.timeoutMs),
  });
  return { status: res.status, header: (name) => res.headers.get(name) ?? undefined, body: await res.text() };
};

/** HTTPS with the box's self-signed certificate; only used for the HTTPS mode. */
const httpsTransport: Transport = (req) =>
  new Promise((resolve, reject) => {
    const r = https.request(
      req.url,
      { method: req.method, headers: req.headers, rejectUnauthorized: false, timeout: req.timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            header: (name) => {
              const value = res.headers[name.toLowerCase()];
              return Array.isArray(value) ? value[0] : value;
            },
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", reject);
      },
    );
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", reject);
    r.end(req.body);
  });

/**
 * Calls TR-064 actions on one Fritz!Box with HTTP digest authentication.
 * The digest challenge is kept between calls, so normally every action is a
 * single request; a stale nonce costs one extra round trip.
 */
export class Tr064Client {
  readonly #options: Tr064Options;
  readonly #base: string;
  readonly #transport: Transport;
  #challenge: DigestChallenge | undefined;
  #nc = 0;

  constructor(options: Tr064Options) {
    this.#options = options;
    const scheme = options.https ? "https" : "http";
    const port = options.port ?? (options.https ? HTTPS_PORT : HTTP_PORT);
    this.#base = `${scheme}://${options.host}:${port}`;
    this.#transport = options.transport ?? (options.https ? httpsTransport : fetchTransport);
  }

  get host(): string {
    return this.#options.host;
  }

  async call(service: Service, action: string, args: SoapArgs = {}): Promise<Record<string, string>> {
    const body = buildEnvelope(service.type, action, args);
    let res: TransportResponse | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers: Record<string, string> = {
        "Content-Type": 'text/xml; charset="utf-8"',
        SoapAction: `${service.type}#${action}`,
      };
      if (this.#challenge) {
        headers.Authorization = authorizationHeader(this.#challenge, {
          username: this.#options.username,
          password: this.#options.password,
          method: "POST",
          uri: service.url,
          nc: ++this.#nc,
          cnonce: newCnonce(),
        });
      }
      try {
        res = await this.#transport({ url: this.#base + service.url, method: "POST", headers, body, timeoutMs: this.#options.timeoutMs ?? 10_000 });
      } catch (err) {
        throw new Tr064Error(`Cannot reach ${this.#base}: ${describe(err)}`, "unreachable");
      }
      if (res.status !== 401) {
        break;
      }
      const challenge = parseChallenge(res.header("www-authenticate"));
      if (!challenge) {
        throw new Tr064Error("Authentication required but no digest challenge received", "auth", 401);
      }
      // A fresh challenge after a failed authenticated request means bad credentials
      // (unless the box only reports a stale nonce).
      if (this.#challenge && !challenge.stale && attempt > 0) {
        throw new Tr064Error("Wrong username or password", "auth", 401);
      }
      this.#challenge = challenge;
      this.#nc = 0;
    }

    if (!res) {
      throw new Tr064Error("No response", "http");
    }
    if (res.status === 401) {
      this.#challenge = undefined;
      throw new Tr064Error("Wrong username or password", "auth", 401);
    }
    const fault = parseFault(res.body);
    if (fault) {
      const text = fault.description ?? fault.faultString ?? "UPnP error";
      throw new Tr064Error(`${action} failed: ${text}${fault.code ? ` (${fault.code})` : ""}`, "fault", fault.code);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Tr064Error(`${action} failed: HTTP ${res.status}`, "http", res.status);
    }
    return parseResponse(res.body, action);
  }
}

function describe(err: unknown): string {
  const e = err as { cause?: { code?: string; message?: string }; name?: string; message?: string };
  if (e?.name === "TimeoutError" || e?.message === "timeout") {
    return "timeout";
  }
  return e?.cause?.code ?? e?.cause?.message ?? e?.message ?? String(err);
}
