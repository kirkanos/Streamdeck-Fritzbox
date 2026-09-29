import { describe, expect, it } from "vitest";
import { bitsPerSecondToMbit, bytesPerSecondToMbit, newestOfList, toNumber } from "./model";
import { wifiQrPayload } from "./wifi";

describe("online monitor", () => {
  it("takes the newest value of the list", () => {
    expect(newestOfList("1250000,900000,0")).toBe(1_250_000);
    expect(newestOfList("")).toBe(0);
    expect(newestOfList(undefined)).toBe(0);
    expect(newestOfList("x,1")).toBe(0);
  });

  it("converts bytes per second to Mbit/s", () => {
    expect(bytesPerSecondToMbit(1_250_000)).toBe(10);
    expect(bytesPerSecondToMbit(0)).toBe(0);
    expect(bitsPerSecondToMbit(100_000_000)).toBe(100);
  });

  it("parses numbers leniently", () => {
    expect(toNumber("42")).toBe(42);
    expect(toNumber("")).toBe(0);
    expect(toNumber(undefined, 7)).toBe(7);
  });
});

describe("wifiQrPayload", () => {
  it("builds the WIFI string", () => {
    expect(wifiQrPayload("Guests", "pass1234")).toBe("WIFI:T:WPA;S:Guests;P:pass1234;;");
  });

  it("escapes special characters", () => {
    expect(wifiQrPayload(String.raw`Café; "1"`, String.raw`a:b,c\d`)).toBe(String.raw`WIFI:T:WPA;S:Café\; \"1\";P:a\:b\,c\\d;;`);
  });

  it("handles open networks", () => {
    expect(wifiQrPayload("Open", undefined)).toBe("WIFI:T:nopass;S:Open;;");
  });
});
