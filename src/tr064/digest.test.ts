import { describe, expect, it } from "vitest";
import { authorizationHeader, digestResponse, parseChallenge } from "./digest";

// Example from RFC 2617, section 3.5.
const challenge = parseChallenge(
  'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
)!;
const input = { username: "Mufasa", password: "Circle Of Life", method: "GET", uri: "/dir/index.html", nc: 1, cnonce: "0a4f113b" };

describe("digest", () => {
  it("parses the challenge", () => {
    expect(challenge).toEqual({
      realm: "testrealm@host.com",
      nonce: "dcd98b7102dd2f0e8b11d0f600bfb0c093",
      qop: "auth,auth-int",
      opaque: "5ccc069c403ebaf9f0171e9517f40e41",
      algorithm: undefined,
      stale: false,
    });
    expect(parseChallenge('Digest realm="F!Box SOAP-Auth", nonce="1A2B3C", algorithm=MD5, qop="auth", stale=TRUE')).toMatchObject({
      realm: "F!Box SOAP-Auth",
      algorithm: "MD5",
      qop: "auth",
      stale: true,
    });
    expect(parseChallenge('Basic realm="x"')).toBeUndefined();
    expect(parseChallenge(undefined)).toBeUndefined();
  });

  it("computes the RFC 2617 response", () => {
    expect(digestResponse(challenge, input)).toBe("6629fae49393a05397450978507c4ef1");
  });

  it("falls back to RFC 2069 without qop", () => {
    const legacy = { ...challenge, qop: undefined };
    expect(digestResponse(legacy, input)).toBe("670fd8c2df070c60b045671b8b24ff02");
  });

  it("builds the Authorization header", () => {
    const header = authorizationHeader(challenge, input);
    expect(header).toBe(
      'Digest username="Mufasa", realm="testrealm@host.com", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", uri="/dir/index.html", ' +
        'response="6629fae49393a05397450978507c4ef1", qop=auth, nc=00000001, cnonce="0a4f113b", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
    );
  });
});
