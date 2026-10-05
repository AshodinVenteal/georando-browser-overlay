# Archipelago Manual Checker

## Run locally with Universal Tracker

Open http://localhost:8000 after running `Start-Local.ps1`. The local logic API runs at
http://127.0.0.1:8765. On **Update all slots**, the page retrieves current item/check data,
then posts that snapshot to the engine. A fresh isolated Python process runs UT's actual
TrackerCore for each slot, collects received items, sweeps reachable events and evaluates
the game's access rules. Results are intersected with unfinished checks.

The runtime is a separate checkout of FarisTheAncient/Archipelago's tracker branch. Original
AP installations are not modified. Matching APWorlds go in `ut-runtime/custom_worlds`;
original player YAMLs go in `private/players`. YAMLs are selected by exact slot name before
UT generates its tracking world. Wrong data packages and worlds needing unsupported
discovered-entrance tracking are reported as errors, not empty or all-in-logic results.

For a fresh setup, run `Setup-Local.ps1` first (Python 3.12 required), install the matching
game worlds/YAMLs, then `Start-Local.ps1`. Both services bind only to loopback. Use
`Stop-Local.ps1` to stop them. See `backend/requirements.txt` for Python dependencies;
individual APWorlds may have additional requirements.

The localhost Python configuration is for local testing. Fusion and Paper Mario still need
a public HTTPS logic endpoint for remote evaluation. The bundled CT seed evaluates in the
browser and does not need Python hosting.

Verified against the supplied room: AshedUpFusion had 6 reachable checks / 110 unfinished;
PaperAsh64 had 15 / 278. Removing received progression items reduced those counts to 0
and 1, respectively. These are current-state results, not fixed counts.
Chrono Trigger now has a ROM-to-graph importer and browser evaluator. The bundled graph
supports AshTrigger (seed `14834085843224584573`, team 0, slot 3) directly on Pages,
without a Python engine URL. Each Update all slots evaluates the latest received items.

## Chrono Trigger adapter

`backend/ct_adapter.py` loads an exact `ctrdi-logic-v1` seed graph and reconstructs AP
regions, entrances, recruit/event rewards, and access requirements. UT then evaluates
the current inventory and sweeps event rewards to a fixed point. Native CTRDI progressive
conversion is retained, including Pendant, Masamune and the paired quest-item upgrades.
The adapter also fixes the bundled APWorld item factory's inability to create progressive
and DS item names. Only unfinished, reachable locations are returned. No ROM is needed
at evaluation time. Wrong seed/team/slot, data package, slot data, and incomplete location
coverage are rejected.

For new seeds, the seed generator owner can call the exporter on the **original
generated CTRDI world**, after its regions are built, before that world is discarded:

```python
# Add manual-checker/backend to the generator's Python module search path.
from export_ct_seed import export_seed
export_seed(world, "AshTrigger-logic.json", team=0)
```

The exporter uses the finalized RDI connector rules, including randomized entrances,
character requirements, element locks and starting rewards. It does not export ROM data,
treasure item placements, or other players' worlds. Then install the file locally:

```powershell
.\.venv\Scripts\python.exe backend\import_ct_seed.py C:\path\AshTrigger-logic.json
```

Refresh the local page; no restart is needed. Files live under ignored `private/ct-seeds`
(or `UT_CT_SEED_DIR`). The importer refuses to overwrite a different graph for the same
seed. Do **not** regenerate from YAML to make a graph for an existing seed: that produces
a different randomized layout. A ROM delta has no explicit graph export, but the importer
can recover supported seed layouts from the patched ROM as described below.

### ROM reconstruction

`backend/recover_ct_rom.py` applies the downloaded delta to the owner's base ROM **in
memory**, verifies the base checksum and patch slot identity, and reads:

- The overworld entrance destinations (all exit-class members are checked).
- Starting party and actual recruitment functions; unrelated vanilla character/menu
  code is excluded. The first decoder requires all seven characters uniquely recovered.
- Initial rewards from the loading script.
- Objective IDs from matching loading/title-screen tables and unlock thresholds from
  the objective-count comparisons in Crono's room.
- Element-dependent boss loads for Nizbel and Retinite.

Static access rules come from the matching installed APWorld and the local player YAML
(using APWorld defaults for omitted options), **not** inferred universally from machine
code. This dependency is shown in the page's logic-source label and graph provenance.
In this seed the old YAML fields `entrance_shuffle`, `character_recruitment`, etc. are
not recognized by the installed APWorld; actual ROM destinations are unshuffled. This
importer rejects shuffled entrances/gates and boss-objective seeds it cannot decode.
It is not a universal CT ROM decompiler. Prefer generation-time exports for other layouts.

Run `node verify-ct-rom.mjs` locally to connect AshTrigger, reconstruct its patch, compare
browser results to the real UT engine, and generate the route-only page artifact. For
other supported seeds, use the Python CLI's `--base-rom`, `--patch-url`, `--player-yaml`,
`--snapshot` (the live connector snapshot), and `--output` options. Install with
`import_ct_seed.py` for backend evaluation, or import the graph into the page.

No ROM bytes, passwords, live inventories, or treasure placements are included in the
published graph. The browser sweeps reachable event rewards to a fixed point and never
grants items from unchecked treasures. Seed/team/slot, slot data, package and location
coverage must match. Item order and NEW badges still use the normal server item stream.

Verified browser/UT parity for six cases: actual items, empty inventory, progression
removed, a progressive item removed, maximal progression, and checked locations included.
At verification AshTrigger had 0 reachable unfinished checks out of 212. The same inventory
reached 123 already-checked locations; maximal progression reached all 212 unfinished
checks. A zero therefore does not mean the importer returned no graph. Counts can change
as new items arrive.

Adapter integration tests (synthetic graph, real APWorld and UT engine):

```powershell
.\.venv\Scripts\python.exe backend\test_ct_adapter.py
```

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

Live logic evaluation is now available through the local UT backend. Snapshot import remains
an optional fallback. Public deployment of the Python backend is still pending.

Publish this folder on GitHub Pages. Passwords remain in memory; settings, item baselines and
imported snapshots are stored in the browser.
