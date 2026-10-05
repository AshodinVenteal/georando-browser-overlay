# Archipelago Manual Checker

Static browser tool for refreshing several Archipelago slots and showing each slot's server-reported missing locations and received items.

Open `index.html` locally or publish this folder with GitHub Pages. Add one row per slot/player, then click **Update all**. The browser connects once per row and closes the connection after the snapshot.

The current build uses Archipelago's `missing_locations` response as the authoritative list. A future game adapter can translate each game's slot data and logic pack into richer regions, logic reasons, and item-gated checks.

## GitHub Pages

Publish `manual-checker/` as the Pages artifact, or copy its contents to the repository root. No server-side component is required; the user's browser connects directly to the AP WebSocket server. The AP server must allow browser WebSocket connections from the published origin.
