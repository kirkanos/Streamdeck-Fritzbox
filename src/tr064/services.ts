/** TR-064 services of a Fritz!Box used by the plugin. */
export type Service = { type: string; url: string };

const service = (name: string, url: string, index = 1): Service => ({
  type: `urn:dslforum-org:service:${name}:${index}`,
  url: `/upnp/control/${url}`,
});

export const DEVICE_INFO = service("DeviceInfo", "deviceinfo");
export const WAN_COMMON = service("WANCommonInterfaceConfig", "wancommonifconfig1");
export const WAN_PPP = service("WANPPPConnection", "wanpppconn1");
export const WAN_IP = service("WANIPConnection", "wanipconnection1");
export const wlanConfiguration = (index: number): Service => service("WLANConfiguration", `wlanconfig${index}`, index);

export const HTTP_PORT = 49000;
export const HTTPS_PORT = 49443;
