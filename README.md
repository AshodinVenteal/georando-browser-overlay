# GeoRando Browser Overlay

This is a standalone fullscreen browser companion for arborelia's current **Manual_GeoGuessr_arborelia** world. It connects directly to an Archipelago server over its WebSocket protocol, shows the generated location list and received items, and lets you submit GeoRando checks without keeping the Manual Client in front of GeoGuessr.

## Use

1. Generate the GeoRando world and start/host the Archipelago session as usual.
2. Open `index.html` in Chrome or Edge. Use the browser's fullscreen command (`F11`) for a full-screen overlay window.
3. Enter the server address and the exact player/slot name from the generated YAML, then choose **Connect**.
4. After each GeoGuessr result, filter for the appropriate check (country, map score, streak, etc.) and click it once.

The overlay does not read GeoGuessr's score or country automatically; this is intentional and matches the manual world. The GeoGuessr setup, timer, movement restrictions, compass/car visibility, and map rules remain controlled by the scripts and settings described in GeoRando's README.

If the server is local, use `localhost:38281`. For a hosted room, use its host and port. Keep the existing Manual Client connected if desired, but do not use both the client and overlay to submit the same check.
