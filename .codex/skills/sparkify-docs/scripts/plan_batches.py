#!/usr/bin/env python3
"""Plan deterministic docs generation batches for large repositories."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

CODE_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".swift",
    ".rb",
    ".php",
    ".cs",
    ".scala",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
}


def collect_full_mode_modules(repo: Path) -> list[str]:
    modules: set[str] = set()
    for file_path in repo.rglob("*"):
        if not file_path.is_file():
            continue
        rel = file_path.relative_to(repo)
        if not rel.parts:
            continue
        if len(rel.parts) == 1:
            top = "root"
        else:
            top = rel.parts[0]
        if top.startswith(".") or top in {"docs", "node_modules", "dist", "build", "coverage", "venv", ".venv"}:
            continue
        if file_path.suffix.lower() not in CODE_EXTENSIONS:
            continue
        modules.add(top)
    return sorted(modules)



def group_files_by_module(changed_files: list[str]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for file_path in changed_files:
        normalized = file_path.replace("\\", "/")
        if normalized.startswith("docs/") or normalized.startswith(".github/"):
            continue
        parts = normalized.split("/")
        if not parts:
            continue
        if len(parts) == 1:
            leaf = parts[0]
            if (
                leaf.startswith(".")
                or leaf in {"README.md", "LICENSE", "Makefile"}
                or leaf.endswith(".md")
                or leaf.endswith(".mdx")
            ):
                continue
            module = "root"
        else:
            module = parts[0]
        grouped.setdefault(module, []).append(normalized)

    for key in grouped:
        grouped[key] = sorted(set(grouped[key]))
    return dict(sorted(grouped.items()))



def build_batches(
    repo: Path,
    mode: str,
    changed_files: list[str],
    changed_modules: list[str],
    docs_dir: str,
    max_subagents: int,
) -> dict[str, Any]:
    module_candidates = changed_modules if mode == "incremental" else collect_full_mode_modules(repo)
    file_groups = group_files_by_module(changed_files)

    if mode == "incremental" and not module_candidates and changed_files:
        module_candidates = sorted(file_groups.keys())

    if not module_candidates:
        module_candidates = ["core"]

    batches: list[dict[str, Any]] = []
    for module in sorted(set(module_candidates)):
        files = file_groups.get(module, [])
        batches.append(
            {
                "id": f"module:{module}",
                "type": "module-docs",
                "module": module,
                "owner": "subagent",
                "changed_files": files,
                "doc_targets": [f"{docs_dir.rstrip('/')}/modules/{module}.mdx"],
                "priority": 10 if files else 5,
            }
        )

    global_batches = [
        {
            "id": "global:docs-index",
            "type": "docs-index",
            "owner": "orchestrator",
            "doc_targets": [f"{docs_dir.rstrip('/')}/docs.json", f"{docs_dir.rstrip('/')}/index.mdx"],
            "priority": 50,
        },
        {
            "id": "global:workflows",
            "type": "workflow-sync",
            "owner": "orchestrator",
            "doc_targets": [".github/workflows/docs-pages.yml", ".github/workflows/docs-ci.yml"],
            "priority": 60,
        },
        {
            "id": "global:state",
            "type": "state-write",
            "owner": "orchestrator",
            "doc_targets": [".sparkify-docs/state.json", ".sparkify-docs/batches.json"],
            "priority": 70,
        },
    ]

    all_batches = batches + global_batches

    requested_max = max_subagents if max_subagents > 0 else len(batches)
    recommended_subagents = min(max(1, len(batches)), max(1, requested_max))

    changed_volume = len(changed_files)
    should_use_subagents = len(batches) >= 3 or changed_volume >= 40 or mode == "full"
    should_use_subagents = should_use_subagents and recommended_subagents > 1

    return {
        "mode": mode,
        "batch_count": len(all_batches),
        "module_batch_count": len(batches),
        "recommended_subagents": recommended_subagents,
        "should_use_subagents": should_use_subagents,
        "collision_policy": "single-owner-per-doc-path",
        "tie_break_rules": [
            "orchestrator-owned batches always win",
            "higher priority batch wins for same file",
            "if priority ties, lexicographically smaller batch id wins",
        ],
        "batches": all_batches,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Plan docs generation batches for sparkify-docs")
    parser.add_argument("--repo", default=".", help="Target repository root")
    parser.add_argument("--docs-dir", default="./docs", help="Docs directory path")
    parser.add_argument("--mode", choices=["full", "incremental"], default="full")
    parser.add_argument("--changed-files-json", default="[]", help="JSON array of changed files")
    parser.add_argument("--changed-modules-json", default="[]", help="JSON array of changed modules")
    parser.add_argument("--max-subagents", type=int, default=4, help="Maximum subagents to recommend")
    parser.add_argument("--output", help="Optional output path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo = Path(args.repo).resolve()
    if not repo.exists() or not repo.is_dir():
        raise SystemExit(f"Repository path does not exist or is not a directory: {repo}")

    try:
        changed_files = json.loads(args.changed_files_json)
        changed_modules = json.loads(args.changed_modules_json)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON input: {exc}") from exc

    if not isinstance(changed_files, list) or not all(isinstance(item, str) for item in changed_files):
        raise SystemExit("--changed-files-json must be a JSON array of strings")
    if not isinstance(changed_modules, list) or not all(isinstance(item, str) for item in changed_modules):
        raise SystemExit("--changed-modules-json must be a JSON array of strings")

    payload = build_batches(
        repo=repo,
        mode=args.mode,
        changed_files=sorted(set(changed_files)),
        changed_modules=sorted(set(changed_modules)),
        docs_dir=args.docs_dir,
        max_subagents=args.max_subagents,
    )

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
