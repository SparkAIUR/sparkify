#!/usr/bin/env python3
"""Generate docs favicon/logo assets when missing."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

PALETTE_BY_STACK = {
    "fastapi": {"bg": "#0f172a", "fg": "#f8fafc", "accent": "#10b981"},
    "python": {"bg": "#1e293b", "fg": "#e2e8f0", "accent": "#3b82f6"},
    "typescript": {"bg": "#0b1324", "fg": "#dbeafe", "accent": "#2563eb"},
    "javascript": {"bg": "#1f2937", "fg": "#f9fafb", "accent": "#f59e0b"},
    "node": {"bg": "#0b1f16", "fg": "#dcfce7", "accent": "#16a34a"},
    "go": {"bg": "#05263b", "fg": "#e0f2fe", "accent": "#0284c7"},
    "rust": {"bg": "#1c1917", "fg": "#f5f5f4", "accent": "#ea580c"},
}

MARK_BY_STACK = {
    "fastapi": "API",
    "python": "PY",
    "typescript": "TS",
    "javascript": "JS",
    "node": "NODE",
    "go": "GO",
    "rust": "RS",
}

DEFAULT_PALETTE = {"bg": "#111827", "fg": "#f9fafb", "accent": "#06b6d4"}


def load_json_array(raw: str) -> list[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item).strip().lower() for item in parsed if str(item).strip()]


def choose_stack(stacks: list[str]) -> str:
    for candidate in ["fastapi", "python", "typescript", "javascript", "node", "go", "rust"]:
        if candidate in stacks:
            return candidate
    return "default"


def read_template(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def render_template(template: str, replacements: dict[str, str]) -> str:
    rendered = template
    for key, value in replacements.items():
        rendered = rendered.replace("{{" + key + "}}", value)
    return rendered


def ensure_asset(
    target: Path,
    content: str,
    force: bool,
    dry_run: bool,
    created: list[str],
    updated: list[str],
    skipped: list[str],
) -> str:
    if target.exists() and not force:
        skipped.append(str(target))
        return "skipped-existing"

    status = "updated" if target.exists() else "created"
    if not dry_run:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    if status == "created":
        created.append(str(target))
    else:
        updated.append(str(target))
    return status


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate docs brand assets for sparkify-docs")
    parser.add_argument("--repo", default=".", help="Target repository root")
    parser.add_argument("--docs-dir", default="./docs", help="Docs directory path")
    parser.add_argument("--stack-json", default="[]", help="JSON array of detected stacks")
    parser.add_argument("--project-name", default="", help="Project name for logo text")
    parser.add_argument("--force", action="store_true", help="Overwrite existing logo/favicon")
    parser.add_argument("--dry-run", action="store_true", help="Compute without writing files")
    parser.add_argument("--output", help="Optional path to write JSON result")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo = Path(args.repo).resolve()
    docs_dir = Path(args.docs_dir)
    if not docs_dir.is_absolute():
        docs_dir = (repo / docs_dir).resolve()

    if not repo.exists() or not repo.is_dir():
        raise SystemExit(f"Repository path does not exist or is not a directory: {repo}")

    script_dir = Path(__file__).resolve().parent
    skill_root = script_dir.parent
    favicon_template_path = skill_root / "assets" / "branding" / "favicon-template.svg"
    logo_template_path = skill_root / "assets" / "branding" / "logo-template.svg"

    if not favicon_template_path.exists() or not logo_template_path.exists():
        raise SystemExit("Branding templates are missing from assets/branding")

    stacks = load_json_array(args.stack_json)
    selected_stack = choose_stack(stacks)
    palette = PALETTE_BY_STACK.get(selected_stack, DEFAULT_PALETTE)
    mark = MARK_BY_STACK.get(selected_stack, (repo.name[:4] or "DOC").upper())
    project_name = args.project_name.strip() or repo.name

    replacements = {
        "BG": palette["bg"],
        "FG": palette["fg"],
        "ACCENT": palette["accent"],
        "MARK": mark[:6],
        "NAME": project_name,
    }

    favicon_svg = render_template(read_template(favicon_template_path), replacements)
    logo_svg = render_template(read_template(logo_template_path), replacements)

    created: list[str] = []
    updated: list[str] = []
    skipped: list[str] = []

    favicon_status = ensure_asset(
        target=docs_dir / "favicon.svg",
        content=favicon_svg,
        force=args.force,
        dry_run=args.dry_run,
        created=created,
        updated=updated,
        skipped=skipped,
    )
    logo_status = ensure_asset(
        target=docs_dir / "logo.svg",
        content=logo_svg,
        force=args.force,
        dry_run=args.dry_run,
        created=created,
        updated=updated,
        skipped=skipped,
    )

    payload: dict[str, Any] = {
        "stack": selected_stack,
        "palette": palette,
        "mark": mark,
        "project_name": project_name,
        "status": {
            "favicon": favicon_status,
            "logo": logo_status,
        },
        "created": sorted(created),
        "updated": sorted(updated),
        "skipped": sorted(skipped),
        "dry_run": args.dry_run,
    }

    serialized = json.dumps(payload, indent=2, sort_keys=True)
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
