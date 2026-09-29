# Streamdeck-Fritzbox

Stream Deck plugin `com.kirkanos.fritzbox`. Status: M1–M3 implemented (see README.md); M4 (release) open.

Deviations from the original plan: TR-064 is used over plain HTTP on port 49000 by default (HTTPS on 49443 is an option), and the connection settings live in the global settings shared by all keys, with a status block in every settings page.

## Goal

Switch the guest WLAN and see the internet connection status from the deck.

## Keys & dials

- **Guest WLAN** key: on/off as color, SSID as text, number of connected guest devices. Press toggles. Long press shows a QR code (WIFI:T:WPA;S:<ssid>;P:<key>;;) on the key for 30 s.
- **Online** key: connected/disconnected, external IP, current down/up rate in Mbit/s, connection uptime. Press opens `http://fritz.box`.
- **Dial** (optional): touch strip shows the QR code permanently while the guest WLAN is on.

## Data source & API

- TR-064 over HTTPS on port 49443 with HTTP digest auth, SOAP requests built by a small module in `src/tr064/` (no third-party library; Kuma Glance also keeps dependencies minimal).
  - `urn:dslforum-org:service:WLANConfiguration:3` (guest WLAN on dual-band boxes): `GetInfo`, `SetEnable`, `GetSecurityKeys`, `GetTotalAssociations`.
  - `urn:dslforum-org:service:WANCommonInterfaceConfig:1`: `GetCommonLinkProperties`, `X_AVM-DE_GetOnlineMonitor` for rates.
  - `urn:dslforum-org:service:WANIPConnection:1` (or `WANPPPConnection:1` on DSL): `GetStatusInfo`, `GetExternalIPAddress`.
- Poll every 10 s. Discover the guest WLAN index via `GetInfo` on indices 2 and 3 (`NewSSID` and `NewGuestWLAN` on newer firmware).

## Settings

- Host (default `fritz.box`), username, password.
- Guest WLAN index override (auto by default).
- Note in the settings page: create a dedicated Fritz!Box user with the "settings" right only, no internet access, since the plugin stores the password in the action settings.

## Open questions

- Fritz!Box model and firmware; which WLANConfiguration index carries the guest network.
- TR-064 must be enabled in the box (Home Network > Network > Network Settings > "Allow access for applications").
- Whether the QR code should render as an SVG in the plugin or use a tiny QR module (the SVG path from a QR matrix is small enough to write ourselves).

## Milestones

- M1: Online key, TR-064 client with digest auth, tests for SOAP parsing.
- M2: Guest WLAN toggle.
- M3: QR code on key and touch strip.
- M4: CI workflows, release `v1.0.0`.

## Scaffold

Copy the tooling from [Kuma Glance](https://github.com/kirkanos/kuma-glance) (`../Streamdeck-Uptime-Kuma`), not from Termine:

- `@elgato/streamdeck` ^3, `@elgato/cli`, TypeScript, rollup via `scripts/build.mjs` and `createRollupConfig()` from its `rollup.config.mjs`; `tsconfig` extends `@tsconfig/node20`, `moduleResolution: Bundler`, `customConditions: ["node"]`.
- Manifest: SDKVersion 3, Nodejs 24, `Software.MinimumVersion` 7.1, version `0.0.0.0` (the build fills it in).
- Layout: `plugin/` (manifest, `ui/`, `layouts/`, icons), `src/plugin.ts`, `src/actions/`, `src/<service>/`, `src/render/` (reuse `svg.ts` and `theme.ts`).
- Dev variant `<uuid>-dev` via `--dev`, `npm run link:dev`, `npm run watch:dev`.
- Settings pages: static HTML with vendored sdpi-components 4.0.1 in `plugin/ui/`.
- CI: `.github/workflows/ci.yml` (typecheck, vitest, pack, artifact) and `release.yml` (tag `v*`, `PLUGIN_VERSION`, `gh release create`).
- Tests: vitest for model and render code, like `render.test.ts` in Kuma Glance.
- Secrets live in the action settings, never in global settings. Passwords are exchanged for a token once and not stored.
- No license for now.
