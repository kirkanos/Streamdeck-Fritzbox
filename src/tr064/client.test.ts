import { describe, expect, it } from "vitest";
import { Tr064Client, Tr064Error, type Transport, type TransportRequest } from "./client";
import { digestResponse, parseChallenge } from "./digest";
import { DEVICE_INFO, wlanConfiguration } from "./services";

const CHALLENGE = 'Digest realm="HTTPS Access", nonce="A1B2C3D4", algorithm=MD5, qop="auth"';
const OK_BODY = '<s:Body><u:GetInfoResponse xmlns:u="x"><NewModelName>FRITZ!Box 7590</NewModelName></u:GetInfoResponse></s:Body>';

/** A box that accepts the password "secret" for user "sd" and records the requests. */
function fakeBox(password = "secret") {
  const requests: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    requests.push(req);
    const auth = req.headers.Authorization;
    const values: Record<string, string> = {};
    for (const m of (auth ?? "").matchAll(/([a-z]+)=(?:"([^"]*)"|([^,\s]+))/g)) {
      values[m[1]] = m[2] ?? m[3];
    }
    const expected = digestResponse(parseChallenge(CHALLENGE)!, {
      username: values.username,
      password,
      method: "POST",
      uri: values.uri,
      nc: Number.parseInt(values.nc ?? "0", 16),
      cnonce: values.cnonce ?? "",
    });
    if (!auth || values.response !== expected) {
      return { status: 401, header: (n) => (n === "www-authenticate" ? CHALLENGE : undefined), body: "" };
    }
    if (req.url.endsWith("/upnp/control/wlanconfig4")) {
      return {
        status: 500,
        header: () => undefined,
        body: "<s:Body><s:Fault><detail><UPnPError><errorCode>401</errorCode><errorDescription>Invalid Action</errorDescription></UPnPError></detail></s:Fault></s:Body>",
      };
    }
    return { status: 200, header: () => undefined, body: OK_BODY };
  };
  return { transport, requests };
}

describe("Tr064Client", () => {
  it("answers the digest challenge and reuses it", async () => {
    const box = fakeBox();
    const client = new Tr064Client({ host: "fritz.box", username: "sd", password: "secret", transport: box.transport });
    expect(await client.call(DEVICE_INFO, "GetInfo")).toEqual({ NewModelName: "FRITZ!Box 7590" });
    expect(box.requests).toHaveLength(2);
    expect(box.requests[0].url).toBe("http://fritz.box:49000/upnp/control/deviceinfo");
    expect(box.requests[0].headers.SoapAction).toBe("urn:dslforum-org:service:DeviceInfo:1#GetInfo");
    expect(box.requests[0].headers.Authorization).toBeUndefined();
    expect(box.requests[1].headers.Authorization).toMatch(/^Digest username="sd", realm="HTTPS Access"/);

    await client.call(DEVICE_INFO, "GetInfo");
    expect(box.requests).toHaveLength(3);
    expect(box.requests[2].headers.Authorization).toContain("nc=00000002");
  });

  it("reports wrong credentials", async () => {
    const box = fakeBox("other");
    const client = new Tr064Client({ host: "fritz.box", username: "sd", password: "secret", transport: box.transport });
    await expect(client.call(DEVICE_INFO, "GetInfo")).rejects.toMatchObject({ kind: "auth", message: "Wrong username or password" });
    expect(box.requests).toHaveLength(2);
  });

  it("turns UPnP faults into errors", async () => {
    const box = fakeBox();
    const client = new Tr064Client({ host: "fritz.box", username: "sd", password: "secret", transport: box.transport });
    const error = await client.call(wlanConfiguration(4), "GetInfo").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Tr064Error);
    expect(error).toMatchObject({ kind: "fault", code: 401, message: "GetInfo failed: Invalid Action (401)" });
  });

  it("uses the TLS port for https", async () => {
    const box = fakeBox();
    const client = new Tr064Client({ host: "192.168.178.1", https: true, username: "sd", password: "secret", transport: box.transport });
    await client.call(DEVICE_INFO, "GetInfo");
    expect(box.requests[0].url).toBe("https://192.168.178.1:49443/upnp/control/deviceinfo");
  });

  it("reports unreachable hosts", async () => {
    const client = new Tr064Client({
      host: "fritz.box",
      username: "sd",
      password: "secret",
      transport: () => Promise.reject(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } })),
    });
    await expect(client.call(DEVICE_INFO, "GetInfo")).rejects.toMatchObject({ kind: "unreachable", message: "Cannot reach http://fritz.box:49000: ECONNREFUSED" });
  });
});
