#!/usr/bin/env python3
"""Write sparkify-docs state file schema."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_STATE_PATH = ".sparkify-docs/state.json"
STATE_VERSION = "1"


def parse_json_object(raw: str, field_name: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON for {field_name}: {exc}") from exc
    if not isinstance(parsed, dict):
        raise SystemExit(f"{field_name} must be a JSON object")
    return parsed


def load_existing(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Write .sparkify-docs/state.json")
    parser.add_argument("--repo", default=".", help="Target repository root")
    parser.add_argument("--state-path", default=DEFAULT_STATE_PATH, help="State file path relative to repo")
    parser.add_argument("--last-processed-commit", default="", help="Last processed commit hash")
    parser.add_argument("--mode-used", default="full", choices=["full", "incremental"], help="Mode used")
    parser.add_argument("--doc-map-json", default="{}", help="JSON object mapping source keys to docs paths")
    parser.add_argument("--openapi-json", default="{}", help="JSON object with openapi metadata")
    parser.add_argument("--workflow-status-json", default="{}", help="JSON object with workflow status")
    parser.add_argument("--brand-assets-status-json", default="{}", help="JSON object with branding status")
    parser.add_argument("--merge-existing", action="store_true", help="Merge into existing state before overwrite")
    parser.add_argument("--output", help="Optional additional output JSON path")
    parser.add_argument("--dry-run", action="store_true", help="Render state without writing state path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo = Path(args.repo).resolve()
    if not repo.exists() or not repo.is_dir():
        raise SystemExit(f"Repository path does not exist or is not a directory: {repo}")

    state_path = Path(args.state_path)
    if not state_path.is_absolute():
        state_path = (repo / state_path).resolve()

    doc_map = parse_json_object(args.doc_map_json, "doc_map_json")
    openapi = parse_json_object(args.openapi_json, "openapi_json")
    workflow_status = parse_json_object(args.workflow_status_json, "workflow_status_json")
    brand_status = parse_json_object(args.brand_assets_status_json, "brand_assets_status_json")

    existing = load_existing(state_path) if args.merge_existing else {}

    payload: dict[str, Any] = dict(existing)
    payload.update(
        {
            "version": STATE_VERSION,
            "last_processed_commit": args.last_processed_commit,
            "last_run_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "mode_used": args.mode_used,
            "doc_map": doc_map,
            "openapi": openapi,
            "workflow_status": workflow_status,
            "brand_assets_status": brand_status,
        }
    )

    serialized = json.dumps(payload, indent=2, sort_keys=True)
    if not args.dry_run:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(serialized + "\n", encoding="utf-8")

    if args.output:
        out_path = Path(args.output)
        if not out_path.is_absolute():
            out_path = (repo / out_path).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(serialized + "\n", encoding="utf-8")

    print(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
