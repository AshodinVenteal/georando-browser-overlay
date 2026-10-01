# GeoRando Browser Overlay

## Chrome / Edge extension (first testing version)

The `extension/` folder contains a Manifest V3 extension that puts a collapsible AP panel directly on GeoGuessr. It supports manual checks, received items, unlock allowances, AP messages, and declaring victory. The background worker owns the connection so GeoGuessr navigation does not reset it. Chrome/Edge 116 or newer is required.

1. Download this repository using **Code → Download ZIP**, and extract it.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge) and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted `extension` folder, which contains `manifest.json`.
4. Open or reload GeoGuessr. Enter your AP server, player name, and the exact `Manual_GeoGuessr_…` game name from your generated YAML. The suffix can differ from your slot name.
5. Connect. Search for a check, click **Mark complete**, then click again to confirm it. The extension only marks it checked once the server acknowledges it.

Use **−** to collapse the panel, **⇄** to move it to the other side, or the extension toolbar button to toggle it. It follows browser fullscreen and normal GeoGuessr page navigation. The extension retries dropped AP connections and resends pending checks only within the same configured slot and room seed. Room passwords stay in extension session storage, which is cleared when the browser restarts; saved server/player/game settings remain in local extension storage.

Version 0.3 improves the overlay layout. Drag its header (or the collapsed badge's grip) to place it anywhere; your position is saved. The default position is below the upper-left corner, leaving space for the top bar. During game/challenge/duel routes it automatically collapses to a badge and fades to 25% visibility. Hovering or focusing restores full visibility. Results pages automatically expand it. **Overlay appearance** lets you disable automatic collapse, adjust gameplay visibility from 5–100%, or reset the position. **Alt+Shift+G** toggles the panel. Open/close overrides last until the next route change; fullscreen changes and window resizing keep it within the viewport. Gameplay detection uses URL routes, so an intermediate round-result screen on the same game route stays in gameplay mode; open the badge to use checks there.

Vivaldi: open `vivaldi://extensions` and use **Load unpacked** with the repository's **extension** subfolder, not the outer extracted repository folder. The selected folder must contain `manifest.json`.

Version 0.2 adds an experimental **Completed-game score checks** section. On a classic `/results/<token>` page, choose **Read completed result**, select the matching AP map, and enter the round bonus that applied to that run (zero by default). Review the proposed checks and choose **Review and send score checks**. Bonuses apply to five-location totals only, not individual location scores. The parser accepts only a finished game with five valid player scores; unsupported modes/formats fall back to manual checks. It reads the game's endpoint only when you press the button on a results page and retains only scores and the map label. This endpoint is not a supported public GeoGuessr API and still needs live testing.

Version 0.4 adds experimental automatic AP game controls for classic `/game/<token>` pages:

- Pan and panorama zoom stay locked until their items arrive.
- Progressive Move enables 0, 1, 10, or unlimited panorama changes per round. Changes beyond the budget are reverted.
- The compass is hidden until unlocked using GeoGuessr DOM selectors.
- Terrain, satellite, and hybrid guess-map views are gated by their AP items. Choose an unlocked view in **AP game controls**.
- The overlay starts a 10-second viewing deadline plus received time items when it observes a new classic round. Time items extend the deadline when received. At expiry, Street View is covered while the guess map remains available; the extension does not automatically submit a guess or alter GeoGuessr's native timer. Choose an unlimited/long native timer so it does not end the round before the AP deadline.
- A locked or unmatched map is covered based on its result label and your AP map items. This does not prevent the website from creating the game. The car item removes an experimental lower-image cover; that cover is not a panorama shader and does not reliably hide the car at every pitch/zoom.

Connect to AP before starting a classic game. Reload an already-open game after updating the extension to capture its viewer and round state. The **AP game controls** status reports missing viewer/round detection and locked/unmatched maps. If the current GeoGuessr UI/API changes, these controls may require adjustment. Challenge, competitive, and other modes are not controlled. The adapter passively observes the game's existing responses, retains only round number/map label/guess count, and does not send true location data to AP. No live account test has been performed yet.

Traps, extra Unity-script map views, map fragments, country/streak automation, Manual access-logic evaluation, and automatic medal/victory handling remain unfinished. Victory is an explicit declaration after you meet your configured goal. To update an unpacked extension, replace its files, press **Reload** on the extensions page, and reload GeoGuessr.

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
