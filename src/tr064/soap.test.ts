import { describe, expect, it } from "vitest";
import { buildEnvelope, parseFault, parseResponse } from "./soap";

const SERVICE = "urn:dslforum-org:service:WLANConfiguration:3";

describe("soap", () => {
  it("builds an envelope with arguments", () => {
    const xml = buildEnvelope(SERVICE, "SetEnable", { NewEnable: true });
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain(`<u:SetEnable xmlns:u="${SERVICE}"><NewEnable>1</NewEnable></u:SetEnable>`);
    expect(buildEnvelope(SERVICE, "GetInfo")).toContain(`<u:GetInfo xmlns:u="${SERVICE}"></u:GetInfo>`);
    expect(buildEnvelope(SERVICE, "X", { NewSSID: "a<b>&\"c\"" })).toContain("<NewSSID>a&lt;b&gt;&amp;&quot;c&quot;</NewSSID>");
  });

  it("parses the response arguments", () => {
    const xml =
      '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
      `<s:Body><u:GetInfoResponse xmlns:u="${SERVICE}">` +
      "<NewEnable>1</NewEnable><NewStatus>Up</NewStatus><NewSSID>G&#228;ste &amp; Friends</NewSSID><NewBeaconType/><NewX_AVM-DE_APType>guest</NewX_AVM-DE_APType>" +
      "</u:GetInfoResponse></s:Body></s:Envelope>";
    expect(parseResponse(xml, "GetInfo")).toEqual({
      NewEnable: "1",
      NewStatus: "Up",
      NewSSID: "Gäste & Friends",
      NewBeaconType: "",
      "NewX_AVM-DE_APType": "guest",
    });
    expect(parseResponse(xml, "GetSecurityKeys")).toEqual({});
    expect(parseFault(xml)).toBeUndefined();
  });

  it("parses the online monitor lists untouched", () => {
    const xml = "<s:Body><u:X_AVM-DE_GetOnlineMonitorResponse><Newds_current_bps>1230000,45,0</Newds_current_bps></u:X_AVM-DE_GetOnlineMonitorResponse></s:Body>";
    expect(parseResponse(xml, "X_AVM-DE_GetOnlineMonitor")).toEqual({ Newds_current_bps: "1230000,45,0" });
  });

  it("parses a UPnP fault", () => {
    const xml =
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring>' +
      '<detail><UPnPError xmlns="urn:dslforum-org:control-1-0"><errorCode>606</errorCode><errorDescription>Action not authorized</errorDescription></UPnPError></detail>' +
      "</s:Fault></s:Body></s:Envelope>";
    expect(parseFault(xml)).toEqual({ code: 606, description: "Action not authorized", faultString: "UPnPError" });
  });
});
