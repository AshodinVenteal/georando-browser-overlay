# GeoRando Browser Overlay

## Chrome / Edge extension (first testing version)

The `extension/` folder contains a Manifest V3 extension that puts a collapsible AP panel directly on GeoGuessr. It supports manual checks, received items, unlock allowances, AP messages, and declaring victory. The background worker owns the connection so GeoGuessr navigation does not reset it. Chrome/Edge 116 or newer is required.

1. Download this repository using **Code → Download ZIP**, and extract it.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge) and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted `extension` folder, which contains `manifest.json`.
4. Open or reload GeoGuessr. Enter your AP server, player name, and the exact `Manual_GeoGuessr_…` game name from your generated YAML. The suffix can differ from your slot name.
5. Connect. Search for a check, click **Mark complete**, then click again to confirm it. The extension only marks it checked once the server acknowledges it.

Use **−** to collapse the panel, **⇄** to move it to the other side, or the extension toolbar button to toggle it. It follows browser fullscreen and normal GeoGuessr page navigation. The extension retries dropped AP connections and resends pending checks only within the same configured slot and room seed. Room passwords stay in extension session storage, which is cleared when the browser restarts; saved server/player/game settings remain in local extension storage.

Version 0.2 adds an experimental **Completed-game score checks** section. On a classic `/results/<token>` page, choose **Read completed result**, select the matching AP map, and enter the round bonus that applied to that run (zero by default). Review the proposed checks and choose **Review and send score checks**. Bonuses apply to five-location totals only, not individual location scores. The parser accepts only a finished game with five valid player scores; unsupported modes/formats fall back to manual checks. It reads the game's endpoint only when you press the button on a results page and retains only scores and the map label. This endpoint is not a supported public GeoGuessr API and still needs live testing.

This version does not yet identify countries, capture streaks, enforce movement/timer/visibility restrictions, evaluate Manual access logic, or award medals automatically. Use GeoRando's normal gameplay rules. Unlock allowances summarize the received inventory; the item list includes map unlocks and traps. Victory is an explicit declaration after you meet your configured goal. To update an unpacked extension, replace its files, press **Reload** on the extensions page, and reload GeoGuessr.

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
