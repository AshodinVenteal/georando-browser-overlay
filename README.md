# GeoRando Browser Overlay

## Chrome / Edge extension (first testing version)

The `extension/` folder contains a Manifest V3 extension that puts a collapsible AP panel directly on GeoGuessr. It supports manual checks, received items, unlock allowances, AP messages, and declaring victory. The background worker owns the connection so GeoGuessr navigation does not reset it. Chrome/Edge 116 or newer is required.

1. Download this repository using **Code → Download ZIP**, and extract it.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge) and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted `extension` folder, which contains `manifest.json`.
4. Open or reload GeoGuessr. Enter your AP server, player name, and the exact `Manual_GeoGuessr_…` game name from your generated YAML. The suffix can differ from your slot name.
5. Connect. Search for a check, click **Mark complete**, then click again to confirm it. The extension only marks it checked once the server acknowledges it.

Use **−** to collapse the panel, **⇄** to move it to the other side, or the extension toolbar button to toggle it. It follows browser fullscreen and normal GeoGuessr page navigation. The extension retries dropped AP connections and resends pending checks only within the same configured slot and room seed. Room passwords stay in extension session storage, which is cleared when the browser restarts; saved server/player/game settings remain in local extension storage.

This version does not yet capture GeoGuessr results automatically, enforce movement/timer/visibility restrictions, evaluate Manual access logic, or award medals automatically. Use GeoRando's normal gameplay rules and submit earned checks manually. Unlock allowances summarize the received inventory; the item list includes map unlocks and traps. Victory is an explicit declaration after you meet your configured goal.

Development checks: run `npm test` with a recent Node.js installation. No dependency installation is required. Tests cover protocol state transitions with a mock AP socket and core item handling; a real AP room and GeoGuessr browser test are still required.

## Standalone browser page

This is a standalone fullscreen browser companion for arborelia's current **Manual_GeoGuessr_arborelia** world. It connects directly to an Archipelago server over its WebSocket protocol, shows the generated location list and received items, and lets you submit GeoRando checks without keeping the Manual Client in front of GeoGuessr.

## Use

1. Generate the GeoRando world and start/host the Archipelago session as usual.
2. Open `index.html` in Chrome or Edge. Use the browser's fullscreen command (`F11`) for a full-screen overlay window.
3. Enter the server address and the exact player/slot name from the generated YAML, then choose **Connect**.
4. After each GeoGuessr result, filter for the appropriate check (country, map score, streak, etc.) and click it once.

The overlay does not read GeoGuessr's score or country automatically; this is intentional and matches the manual world. The GeoGuessr setup, timer, movement restrictions, compass/car visibility, and map rules remain controlled by the scripts and settings described in GeoRando's README.

If the server is local, use `localhost:38281`. For a hosted room, use its host and port. Keep the existing Manual Client connected if desired, but do not use both the client and overlay to submit the same check.
