#!/usr/bin/env python3
"""Create/update managed GitHub workflows for docs CI and Pages deploy."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

MANAGED_BEGIN = "# BEGIN SPARKIFY-DOCS MANAGED"
MANAGED_END = "# END SPARKIFY-DOCS MANAGED"

WORKFLOW_FILES = {
    "docs_pages": "docs-pages.yml",
    "docs_ci": "docs-ci.yml",
}


def normalize_docs_dir_glob(raw: str) -> str:
    value = raw.strip().replace("\\", "/")
    if value.startswith("./"):
        value = value[2:]
    value = value.rstrip("/")
    return value or "docs"


def render_template(template: str, values: dict[str, str]) -> str:
    rendered = template
    for key, value in values.items():
        rendered = rendered.replace("{{" + key + "}}", value)
    if not rendered.endswith("\n"):
        rendered += "\n"
    return rendered


def update_managed_content(existing: str, managed: str) -> tuple[str, str]:
    begin = existing.find(MANAGED_BEGIN)
    end = existing.find(MANAGED_END)
    if begin == -1 or end == -1 or end < begin:
        return existing, "skipped-existing-unmanaged"

    end_line = existing.find("\n", end)
    if end_line == -1:
        end_line = len(existing)
    else:
        end_line += 1

    replacement = existing[:begin] + managed + existing[end_line:]
    if replacement == existing:
        return existing, "unchanged"
    return replacement, "updated-managed"


def ensure_one_workflow(
    target: Path,
    rendered_template: str,
    dry_run: bool,
    created: list[str],
    updated: list[str],
    skipped: list[str],
) -> str:
    if not target.exists():
        if not dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(rendered_template, encoding="utf-8")
        created.append(str(target))
        return "created"

    existing = target.read_text(encoding="utf-8")
    replacement, status = update_managed_content(existing, rendered_template)

    if status == "updated-managed":
        if not dry_run:
            target.write_text(replacement, encoding="utf-8")
        updated.append(str(target))
    elif status.startswith("skipped"):
        skipped.append(str(target))

    return status


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ensure sparkify-docs workflows exist")
    parser.add_argument("--repo", default=".", help="Target repository root")
    parser.add_argument("--docs-dir", default="./docs", help="Docs directory path")
    parser.add_argument("--site", default="", help="Optional site URL")
    parser.add_argument("--base", default="", help="Optional base path")
    parser.add_argument("--action-ref", default="SparkAIUR/sparkify@v1", help="Reusable action reference")
    parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing")
    parser.add_argument("--output", help="Optional output JSON file")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo = Path(args.repo).resolve()
    if not repo.exists() or not repo.is_dir():
        raise SystemExit(f"Repository path does not exist or is not a directory: {repo}")

    script_dir = Path(__file__).resolve().parent
    skill_root = script_dir.parent
    template_root = skill_root / "assets" / "workflows"

    pages_template = template_root / WORKFLOW_FILES["docs_pages"]
    ci_template = template_root / WORKFLOW_FILES["docs_ci"]
    if not pages_template.exists() or not ci_template.exists():
        raise SystemExit("Workflow templates are missing from assets/workflows")

    docs_dir_value = args.docs_dir
    values = {
        "DOCS_DIR": docs_dir_value,
        "DOCS_DIR_GLOB": normalize_docs_dir_glob(docs_dir_value),
        "SITE": args.site,
        "BASE": args.base,
        "ACTION_REF": args.action_ref,
    }

    rendered_pages = render_template(pages_template.read_text(encoding="utf-8"), values)
    rendered_ci = render_template(ci_template.read_text(encoding="utf-8"), values)

    created: list[str] = []
    updated: list[str] = []
    skipped: list[str] = []

    workflow_dir = repo / ".github" / "workflows"
    pages_status = ensure_one_workflow(
        target=workflow_dir / WORKFLOW_FILES["docs_pages"],
        rendered_template=rendered_pages,
        dry_run=args.dry_run,
        created=created,
        updated=updated,
        skipped=skipped,
    )
    ci_status = ensure_one_workflow(
        target=workflow_dir / WORKFLOW_FILES["docs_ci"],
        rendered_template=rendered_ci,
        dry_run=args.dry_run,
        created=created,
        updated=updated,
        skipped=skipped,
    )

    payload: dict[str, Any] = {
        "status": {
            "docs_pages": pages_status,
            "docs_ci": ci_status,
        },
        "created": sorted(created),
        "updated": sorted(updated),
        "skipped": sorted(skipped),
        "managed_markers": {
            "begin": MANAGED_BEGIN,
            "end": MANAGED_END,
        },
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
