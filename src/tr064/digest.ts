import { createHash, randomBytes } from "node:crypto";

/**
 * HTTP Digest authentication (RFC 2617) as used by the Fritz!Box TR-064
 * interface: algorithm MD5, qop "auth".
 */
export type DigestChallenge = {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
  stale: boolean;
};

const md5 = (value: string): string => createHash("md5").update(value, "utf8").digest("hex");

/** Parses a `WWW-Authenticate: Digest ...` header; undefined for other schemes. */
export function parseChallenge(header: string | undefined): DigestChallenge | undefined {
  if (!header || !/^\s*digest\s/i.test(header)) {
    return undefined;
  }
  const params: Record<string, string> = {};
  // key="quoted value" or key=token, separated by commas.
  const re = /([a-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/gi;
  const rest = header.replace(/^\s*digest\s+/i, "");
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    params[m[1].toLowerCase()] = m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : m[3];
  }
  if (!params.realm || !params.nonce) {
    return undefined;
  }
  return {
    realm: params.realm,
    nonce: params.nonce,
    qop: params.qop,
    opaque: params.opaque,
    algorithm: params.algorithm,
    stale: params.stale?.toLowerCase() === "true",
  };
}

export type DigestInput = {
  username: string;
  password: string;
  method: string;
  uri: string;
  /** Request counter, 1-based; rendered as 8 hex digits. */
  nc: number;
  cnonce: string;
};

/** Picks "auth" from the offered qop options; undefined for legacy (RFC 2069) servers. */
export function selectQop(qop: string | undefined): "auth" | undefined {
  if (!qop) {
    return undefined;
  }
  return qop
    .split(",")
    .map((q) => q.trim().toLowerCase())
    .includes("auth")
    ? "auth"
    : undefined;
}

export const formatNc = (nc: number): string => nc.toString(16).padStart(8, "0");

/** The `response` value of the Authorization header (RFC 2617, 3.2.2.1). */
export function digestResponse(challenge: DigestChallenge, input: DigestInput): string {
  const algorithm = (challenge.algorithm ?? "MD5").toUpperCase();
  let ha1 = md5(`${input.username}:${challenge.realm}:${input.password}`);
  if (algorithm === "MD5-SESS") {
    ha1 = md5(`${ha1}:${challenge.nonce}:${input.cnonce}`);
  }
  const ha2 = md5(`${input.method}:${input.uri}`);
  const qop = selectQop(challenge.qop);
  if (qop) {
    return md5(`${ha1}:${challenge.nonce}:${formatNc(input.nc)}:${input.cnonce}:${qop}:${ha2}`);
  }
  return md5(`${ha1}:${challenge.nonce}:${ha2}`);
}

/** Builds the full `Authorization: Digest ...` header value. */
export function authorizationHeader(challenge: DigestChallenge, input: DigestInput): string {
  const quote = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;
  const parts = [
    `username=${quote(input.username)}`,
    `realm=${quote(challenge.realm)}`,
    `nonce=${quote(challenge.nonce)}`,
    `uri=${quote(input.uri)}`,
    `response=${quote(digestResponse(challenge, input))}`,
  ];
  const qop = selectQop(challenge.qop);
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${formatNc(input.nc)}`, `cnonce=${quote(input.cnonce)}`);
  }
  if (challenge.opaque !== undefined) {
    parts.push(`opaque=${quote(challenge.opaque)}`);
  }
  if (challenge.algorithm) {
    parts.push(`algorithm=${challenge.algorithm}`);
  }
  return `Digest ${parts.join(", ")}`;
}

export const newCnonce = (): string => randomBytes(8).toString("hex");
