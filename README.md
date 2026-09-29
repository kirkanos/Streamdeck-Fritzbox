# Fritz!Box Control

Switch the guest WLAN of your [AVM Fritz!Box](https://avm.de/) and keep an eye on your internet connection from your Elgato Stream Deck.

Unofficial plugin, not affiliated with AVM.

## Features

* **Guest WLAN** key:
  * On / off as background color, the SSID (left out if you set your own title on the key) and the number of connected guest devices.
  * Pressing the key turns the guest WLAN on or off.
  * Holding the key for about a second shows the Wi-Fi QR code (`WIFI:T:WPA;S:…;P:…;;`) for 30 seconds; guests scan it with their phone camera to join.
* **Online** key: 🟩 online / 🟥 offline, the external IP address, the current download and upload rate in Mbit/s and the connection uptime. Pressing the key opens the Fritz!Box web interface.
* **Guest WLAN Dial** (Stream Deck + / + XL): the touch strip shows the Wi-Fi QR code, SSID and guest count while the guest WLAN is on; pushing the dial or tapping the strip turns it on or off.
* The plugin talks to the box over its TR-064 interface (SOAP over HTTP with digest authentication, the same interface the Fritz!App and MyFritz use) and polls every 10 seconds.

## Installation

Download the [latest release](https://github.com/kirkanos/Streamdeck-Fritzbox/releases/latest) and open `com.kirkanos.fritzbox.streamDeckPlugin`. Requires Stream Deck 7.1 or newer.

Then add a key, open its settings and enter the host name, username and password of your Fritz!Box. "Connect" checks the login and stores it for all keys and dials of the plugin.

## Settings

The connection is shared by all keys and dials and is set up once in any key's settings:

| Setting | Description |
| --- | --- |
| Host | Host name or IP address of the box, `fritz.box` by default. |
| Protocol | HTTP on port 49000 (the default in the home network) or HTTPS on port 49443. The box uses a self-signed certificate, which the plugin accepts in HTTPS mode. |
| Username, password | A Fritz!Box user, see [Prerequisites](#prerequisites). The password is stored in the Stream Deck settings. |
| Guest WLAN | Which `WLANConfiguration` service carries the guest network. "Detect automatically" tries WLAN 4, 3 and 2 and picks the one the box reports as guest access point (the highest existing one on older firmware). Override it if the wrong network is switched. |

The **Guest WLAN** key can also show the QR code on a short press instead of toggling ("On press").

## Prerequisites

* **TR-064 must be enabled** on the Fritz!Box: Home Network > Network > Network Settings > "Allow access for applications" (Fritz!OS 7 or newer, older versions have the setting under Home Network > Home Network Overview > Network Settings).
* **Create a dedicated Fritz!Box user** for the Stream Deck under System > FRITZ!Box Users with only the "FRITZ!Box settings" right and without "Access from the internet". The plugin stores the password in the Stream Deck settings, so the user should not be able to do more than it needs. Without the settings right the box rejects the Wi-Fi password lookup and the QR code is not shown.
* The computer running Stream Deck must be in the home network of the box (or reach it through a VPN).

## Development

Fritz!Box Control is a Node.js plugin built with the official [Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/) (`@elgato/streamdeck`, TypeScript, rollup). The settings pages use [sdpi-components](https://sdpi-components.dev). The QR code matrix comes from [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator); everything else (digest authentication, SOAP, rendering) is implemented in the plugin.

| Path | Content |
| --- | --- |
| `src/actions/` | One class per Stream Deck action |
| `src/tr064/` | TR-064 client: HTTP digest authentication, SOAP envelopes and parsing |
| `src/fritz/` | Polling service for guest WLAN and internet status, Wi-Fi QR payload |
| `src/render/` | SVG images for keys and touch strips, QR code drawing |
| `plugin/` | Static plugin files: manifest, icons, settings pages (`ui/`), dial layout |
| `assets/` | Plugin icon source (rendered to PNG by the build) |
| `scripts/` | Build |

```sh
npm install
npm test               # unit tests
npm run typecheck

# Development: a parallel-installable copy "Fritz!Box Control (dev)"
npm run link:dev       # build + link into Stream Deck (once)
npm run watch:dev      # rebuild and restart the plugin on every change

npm run validate       # build + streamdeck validate
npm run pack           # Release/com.kirkanos.fritzbox.streamDeckPlugin
```

Linking and restarting need the Stream Deck developer mode (`npx streamdeck dev`, then restart the Stream Deck app once). Plugin logs are written to `dist/<plugin id>.sdPlugin/logs/`.

GitHub Actions builds and tests every push (`.github/workflows/ci.yml`) and publishes a release with the packed plugin for tags like `v1.0.0` (`.github/workflows/release.yml`).

## Troubleshooting

* **Keys show "Connect":** open the settings of any key and enter the connection data.
* **"Cannot reach … is TR-064 enabled?":** check the host name and that "Allow access for applications" is enabled on the box.
* **"Wrong username or password":** the box also rejects users without the "FRITZ!Box settings" right for most actions.
* **The wrong Wi-Fi is switched:** set the guest WLAN index in the settings.
* Anything else: [open an issue](https://github.com/kirkanos/Streamdeck-Fritzbox/issues).
