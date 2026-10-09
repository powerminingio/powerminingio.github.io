# Power Mining Web Flasher

Flash firmware onto your miner and set it up, straight from the browser. No drivers, no
installer.

**Live at <https://powerminingio.github.io/>.**

The repository is named `powerminingio.github.io` because that is what GitHub requires
to serve an organisation's Pages site from the root rather than a `/repo-name/` subpath.
The name describes where the site is published, not what the project is.

## 1. Flash firmware

Connect your miner over USB, pick the device and firmware version, and click flash.

Tick **Keep configuration** to preserve the miner's existing Wi-Fi and pool settings: the NVS
partition is read from the firmware image's own partition table and skipped, so nothing is
assumed about where it sits.

Needs a Chromium-based browser (Chrome, Edge, Brave) on Windows, macOS, Linux or ChromeOS —
Web Serial is not available in Firefox or on iOS. Android works over WebUSB.

## 2. Configure over Bluetooth

Set the miner's Wi-Fi network and mining pool over BLE, without joining its setup hotspot.

**The miner has to be in setup mode** — right after flashing, or any time before it has joined
Wi-Fi. The firmware tears the Bluetooth service down as soon as it connects to a network, so a
miner already online will not appear in the device chooser. It also advertises slowly, so give it
a few seconds.

Needs Web Bluetooth: Chrome or Edge on Windows, macOS, ChromeOS or Android. On Linux it is behind
`chrome://flags/#enable-experimental-web-platform-features`.

## Development

```bash
npm ci
npm run dev          # http://localhost:3000
npm run build        # static export into ./out
npm start            # serve the built ./out locally
```

The production site is the static export in `out/`, published to GitHub Pages — there is no Node
server in production.

### Run locally with Docker

Two targets. The default builds the production site — the same static export GitHub Pages
serves, behind nginx, with no Node runtime in the image:

```bash
docker build . -t pm-web-flasher
docker run --rm -d -p 8080:80 pm-web-flasher     # http://localhost:8080
```

The `dev` target is a Next dev server with hot reload, for working on the app without a local
Node install:

```bash
docker build . --target dev -t pm-web-flasher-dev
docker run --rm -d -p 3000:3000 pm-web-flasher-dev   # http://localhost:3000
```

The production image is ~26 MB against the dev image's ~830 MB, because it carries only the
built files rather than `node_modules` and a toolchain.
