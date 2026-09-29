/**
 * SOAP envelopes for TR-064 actions, built and parsed as plain strings: the
 * responses only ever contain flat `<NewXxx>value</NewXxx>` arguments.
 */

export type SoapArgs = Record<string, string | number | boolean>;

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

const argValue = (value: string | number | boolean): string => (typeof value === "boolean" ? (value ? "1" : "0") : String(value));

export function buildEnvelope(serviceType: string, action: string, args: SoapArgs = {}): string {
  const body = Object.entries(args)
    .map(([name, value]) => `<${name}>${escapeXml(argValue(value))}</${name}>`)
    .join("");
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    `<s:Body><u:${action} xmlns:u="${serviceType}">${body}</u:${action}></s:Body></s:Envelope>`
  );
}

export type SoapFault = { code?: number; description?: string; faultString?: string };

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tagValue = (xml: string, tag: string): string | undefined => {
  const m = new RegExp(`<(?:[\\w.-]+:)?${escapeRegex(tag)}(?:\\s[^>]*)?>([^<]*)</(?:[\\w.-]+:)?${escapeRegex(tag)}>`).exec(xml);
  return m ? unescapeXml(m[1]) : undefined;
};

/** The UPnP fault of an error response, or undefined if the body has none. */
export function parseFault(xml: string): SoapFault | undefined {
  if (!/<(?:[\w.-]+:)?Fault[\s>]/.test(xml)) {
    return undefined;
  }
  const code = tagValue(xml, "errorCode");
  return {
    code: code ? Number(code) : undefined,
    description: tagValue(xml, "errorDescription"),
    faultString: tagValue(xml, "faultstring"),
  };
}

/**
 * Output arguments of `<u:{action}Response>`. Missing response element or a
 * fault yields an empty map; use parseFault() for the error.
 */
export function parseResponse(xml: string, action: string): Record<string, string> {
  const result: Record<string, string> = {};
  const name = escapeRegex(`${action}Response`);
  const body = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`).exec(xml);
  if (!body) {
    return result;
  }
  const re = /<([\w.-]+)(?:\s[^>]*)?(?:\/>|>([^<]*)<\/\1>)/g;
  for (let m = re.exec(body[1]); m; m = re.exec(body[1])) {
    result[m[1]] = unescapeXml(m[2] ?? "");
  }
  return result;
}
