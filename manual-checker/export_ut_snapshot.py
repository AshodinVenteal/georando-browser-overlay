"""Call export_snapshot(ctx, path) from a running Universal Tracker context."""
import json
from datetime import datetime, timezone
from pathlib import Path


def export_snapshot(ctx, path):
    core = ctx.tracker_core
    if core.multiworld is None or core.player_id is None or core.tracker_disabled:
        raise ValueError("Universal Tracker has not initialized a supported world")
    ctx.updateTracker()
    snapshot = dict(
        schema="ap-ut-snapshot-v1", seed=ctx.seed_name, team=ctx.team,
        slot=ctx.slot, game=ctx.game, generated_at=datetime.now(timezone.utc).isoformat(),
        items=[dict(item=x.item, location=x.location, player=x.player, flags=x.flags)
               for x in ctx.items_received], checked=sorted(ctx.checked_locations),
        in_logic=sorted(set(core.locations_available).intersection(ctx.missing_locations)),
    )
    target = Path(path)
    data = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {"slots": []}
    key = lambda x: (x["seed"], x["team"], x["slot"])
    data["slots"] = [x for x in data["slots"] if key(x) != key(snapshot)] + [snapshot]
    target.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return snapshot
