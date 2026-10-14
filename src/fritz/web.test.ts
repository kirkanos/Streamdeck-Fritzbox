import { createHash, pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Transport, TransportRequest, TransportResponse } from "../tr064/client";
import { FritzWebSession, loginResponse, parseQueryCounter, parseSessionInfo, parseTodayCounter } from "./web";

const CHALLENGE = "2$10$5A1711$20$BA1D";
const sessionXml = (sid: string, challenge = CHALLENGE, blockTime = 0) =>
  `<?xml version="1.0" encoding="utf-8"?><SessionInfo><SID>${sid}</SID><Challenge>${challenge}</Challenge><BlockTime>${blockTime}</BlockTime><Rights></Rights></SessionInfo>`;

const TODAY = { BytesSentHigh: "0", BytesSentLow: "52428800", BytesReceivedHigh: "1", BytesReceivedLow: "705032704", Time: "1440", Connections: "1" };
const TODAY_BYTES = { sentBytes: 52_428_800, receivedBytes: 2 ** 32 + 705_032_704 };

/** A web interface that accepts "secret" for user "sd"; `counter` answers data.lua for a valid session. */
function fakeBox(counter: (sid: string) => { status: number; body: string }) {
  const reply = (status: number, body: string): TransportResponse => ({ status, header: () => undefined, body });
  const requests: TransportRequest[] = [];
  const sids: string[] = [];
  let logins = 0;
  const transport: Transport = async (req) => {
    requests.push(req);
    const url = new URL(req.url);
    if (url.pathname === "/login_sid.lua") {
      if (req.method === "GET") {
        return reply(200, sessionXml("0000000000000000"));
      }
      const form = new URLSearchParams(req.body);
      const ok = form.get("username") === "sd" && form.get("response") === (await loginResponse(CHALLENGE, "secret"));
      const sid = ok ? `${++logins}`.padStart(16, "a") : "0000000000000000";
      if (ok) {
        sids.push(sid);
      }
      return reply(200, sessionXml(sid, CHALLENGE, ok ? 0 : 8));
    }
    const sid = url.pathname === "/data.lua" ? new URLSearchParams(req.body).get("sid") : url.searchParams.get("sid");
    if (!sid || !sids.includes(sid)) {
      return reply(403, "");
    }
    if (url.pathname !== "/data.lua") {
      return reply(404, "");
    }
    const res = counter(sid);
    return reply(res.status, res.body);
  };
  return { transport, requests, sids };
}

const session = (transport: Transport, password = "secret", now = () => 0) =>
  new FritzWebSession({ host: "fritz.box", username: "sd", password, transport, now });

describe("web login", () => {
  it("answers PBKDF2 challenges", async () => {
    const hash1 = pbkdf2Sync("secret", Buffer.from("5A1711", "hex"), 10, 32, "sha256");
    const hash2 = pbkdf2Sync(hash1, Buffer.from("BA1D", "hex"), 20, 32, "sha256");
    expect(await loginResponse(CHALLENGE, "secret")).toBe(`BA1D$${hash2.toString("hex")}`);
  });

  it("answers MD5 challenges of old firmware", async () => {
    const md5 = createHash("md5").update(Buffer.from("1234567z-äbc.", "utf16le")).digest("hex");
    expect(await loginResponse("1234567z", "äbc€")).toBe(`1234567z-${md5}`);
  });

  it("parses the session info", () => {
    expect(parseSessionInfo(sessionXml("0000000000000000", "abc", 16))).toEqual({ sid: "0000000000000000", challenge: "abc", blockTime: 16 });
  });
});

describe("online counter", () => {
  it("finds today's row in JSON", () => {
    expect(parseTodayCounter(JSON.stringify({ pid: "netCnt", data: { Today: TODAY, Yesterday: { ...TODAY, BytesSentLow: "1" } } }))).toEqual(TODAY_BYTES);
  });

  it("finds today's row in a script block", () => {
    const html = `<script>const data = {"Today":${JSON.stringify(TODAY)},"Yesterday":{}};</script>`;
    expect(parseTodayCounter(html)).toEqual(TODAY_BYTES);
  });

  it("returns undefined without a counter", () => {
    expect(parseTodayCounter('{"data":{"foo":1}}')).toBeUndefined();
    expect(parseTodayCounter("<html>login</html>")).toBeUndefined();
  });

  it("parses query.lua answers", () => {
    expect(parseQueryCounter('{"sh":"0","sl":"52428800","rh":"1","rl":"705032704"}')).toEqual(TODAY_BYTES);
    expect(parseQueryCounter('{"sh":"","sl":"","rh":"","rl":""}')).toBeUndefined();
  });
});

describe("FritzWebSession", () => {
  it("logs in once and reuses the session", async () => {
    const box = fakeBox(() => ({ status: 200, body: JSON.stringify({ data: { Today: TODAY } }) }));
    const web = session(box.transport);
    expect(await web.todayTraffic()).toEqual(TODAY_BYTES);
    expect(await web.todayTraffic()).toEqual(TODAY_BYTES);
    expect(box.sids).toHaveLength(1);
    const dataRequest = box.requests.find((r) => r.url.endsWith("/data.lua"));
    expect(new URLSearchParams(dataRequest?.body).get("page")).toBe("netCnt");
  });

  it("logs in again when the session expired", async () => {
    const box = fakeBox(() => ({ status: 200, body: JSON.stringify({ Today: TODAY }) }));
    const web = session(box.transport);
    await web.todayTraffic();
    const [expired] = box.sids.splice(0);
    expect(await web.todayTraffic()).toEqual(TODAY_BYTES);
    expect(box.sids).toHaveLength(1);
    expect(box.sids[0]).not.toBe(expired);
  });

  it("reports an unknown page format with the response", async () => {
    const box = fakeBox(() => ({ status: 200, body: '{"data":{"unexpected":true}}' }));
    await expect(session(box.transport).todayTraffic()).rejects.toThrow(/Online counter not found.*unexpected/);
  });

  it("backs off after a wrong password", async () => {
    let now = 0;
    const box = fakeBox(() => ({ status: 200, body: "" }));
    const web = session(box.transport, "wrong", () => now);
    await expect(web.todayTraffic()).rejects.toThrow(/wrong username or password/);
    const logins = box.requests.length;
    now = 30_000;
    await expect(web.todayTraffic()).rejects.toThrow(/blocked for 30 s/);
    expect(box.requests).toHaveLength(logins);
  });
});
