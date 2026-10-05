# Archipelago Manual Checker

Tracker connections discover the game through Connected.slot_info. Item names come from the
receiving slot's game data package, with Archipelago as fallback for shared items. Item history
is newest first in server delivery order, including duplicates. NEW means an arrival since
the previous successful refresh in this browser. The first refresh establishes a baseline.
Baselines are separate per seed/team/slot. Failed refreshes do not advance them. Archipelago
does not supply historical receipt timestamps; the number is delivery sequence.

## In-logic checks

Universal Tracker reconstructs each game's world using its APWorld, seed options, items and
events. The server's missing_locations includes all unfinished checks. Generation spheres
are not current reachability. Network data packages do not contain arbitrary APWorld rules.

The page displays available checks only from a matching Universal Tracker snapshot. Without
one it reports logic unavailable; all unfinished checks stay in a separate collapsed section.
Snapshots are rejected as stale if the item stream or checked-location set changes.

`export_ut_snapshot.py` is an integration helper, not a standalone launcher or automatic UT
plugin. Place it in a running Universal Tracker environment and call:

```python
from export_ut_snapshot import export_snapshot
export_snapshot(ctx, "ut-checker-snapshots.json")
```

Here ctx is the active TrackerGameContext. This updates UT and exports locations_available
intersected with missing locations, excluding the glitched-location list. Multiple contexts
can export into the same file. Import that file through the page's logic snapshot picker.
The helper does not automatically connect slots or install itself in UT.

Automatic reachability for all games on the webpage is still unfinished. It requires a hosted
UT/APWorld evaluator or seed-specific browser rules. The integration helper has not been
installed into the user's Universal Tracker runtime.

Publish this folder on GitHub Pages. Passwords remain in memory; settings, item baselines and
imported snapshots are stored in the browser.
