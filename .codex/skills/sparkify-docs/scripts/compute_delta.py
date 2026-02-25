#!/usr/bin/env python3
"""Compute repository delta and decide full vs incremental docs generation."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

DEFAULT_STATE_PATH = ".sparkify-docs/state.json"
DEFAULT_CHURN_THRESHOLD = 120
DEFAULT_RATIO_THRESHOLD = 0.35



def run_git(repo: Path, args: list[str]) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            ["git", *args],
            cwd=repo,
            capture_output=True,
            text=True,
            check=False,
        )
        return proc.returncode, proc.stdout.strip()
    except FileNotFoundError:
        return 127, ""



def load_state(state_path: Path) -> dict[str, Any]:
    if not state_path.exists():
        return {}
    try:
        parsed = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(parsed, dict):
        return {}
    return parsed



def commit_exists(repo: Path, commit: str) -> bool:
    if not commit:
        return False
    code, _ = run_git(repo, ["cat-file", "-e", f"{commit}^{{commit}}"])
    return code == 0



def collect_changed_files(repo: Path, base_commit: str | None) -> tuple[list[str], dict[str, bool]]:
    changed: set[str] = set()

    if base_commit:
        diff_code, diff_output = run_git(repo, ["diff", "--name-only", f"{base_commit}..HEAD"])
        if diff_code == 0 and diff_output:
            changed.update(line.strip() for line in diff_output.splitlines() if line.strip())

    cached_code, cached_output = run_git(repo, ["diff", "--name-only", "--cached"])
    if cached_code == 0 and cached_output:
        changed.update(line.strip() for line in cached_output.splitlines() if line.strip())

    unstaged_code, unstaged_output = run_git(repo, ["diff", "--name-only"])
    if unstaged_code == 0 and unstaged_output:
        changed.update(line.strip() for line in unstaged_output.splitlines() if line.strip())

    untracked_code, untracked_output = run_git(repo, ["ls-files", "--others", "--exclude-standard"])
    if untracked_code == 0 and untracked_output:
        changed.update(line.strip() for line in untracked_output.splitlines() if line.strip())

    flags = {
        "has_staged": cached_code == 0 and bool(cached_output),
        "has_unstaged": unstaged_code == 0 and bool(unstaged_output),
        "has_untracked": untracked_code == 0 and bool(untracked_output),
    }

    return sorted(changed), flags



def changed_modules_from_files(changed_files: list[str]) -> list[str]:
    modules: set[str] = set()
    for file_path in changed_files:
        normalized = file_path.replace("\\", "/")
        if normalized.startswith("docs/") or normalized.startswith(".github/"):
            continue
        if normalized.startswith("."):
            continue
        parts = normalized.split("/")
        if not parts:
            continue
        if parts[0] in {"README.md", "LICENSE", "Makefile"}:
            continue
        module = parts[0]
        if module.endswith(".md") or module.endswith(".mdx"):
            continue
        modules.add(module)
    return sorted(modules)



def impacted_docs(changed_files: list[str], changed_modules: list[str], doc_map: dict[str, str]) -> list[str]:
    impacted: set[str] = set()

    for changed in changed_files:
        value = doc_map.get(changed)
        if value:
            impacted.add(value)

    for module in changed_modules:
        keys = [module, f"module:{module}"]
        for key in keys:
            value = doc_map.get(key)
            if value:
                impacted.add(value)

    return sorted(impacted)



def compute_delta(
    repo: Path,
    state_path: Path,
    since: str | None,
    churn_threshold: int,
    ratio_threshold: float,
) -> dict[str, Any]:
    state = load_state(state_path)
    base_commit = since or str(state.get("last_processed_commit") or "")

    head_code, head_commit = run_git(repo, ["rev-parse", "HEAD"])
    head_commit = head_commit if head_code == 0 else ""

    tracked_code, tracked_output = run_git(repo, ["ls-files"])
    tracked_files = [line for line in tracked_output.splitlines() if line.strip()] if tracked_code == 0 else []

    result: dict[str, Any] = {
        "state_found": bool(state),
        "state_path": str(state_path),
        "base_commit": base_commit,
        "head_commit": head_commit,
        "tracked_file_count": len(tracked_files),
        "mode": "full",
        "reason": "",
        "changed_files": [],
        "changed_modules": [],
        "impacted_doc_paths": [],
        "churn_count": 0,
    }

    if not state and not since:
        result["reason"] = "no previous state file detected"
        return result

    if not base_commit:
        result["reason"] = "no base commit available"
        return result

    if not commit_exists(repo, base_commit):
        result["reason"] = "base commit is missing in local git history"
        return result

    changed_files, dirty_flags = collect_changed_files(repo, base_commit)
    changed_modules = changed_modules_from_files(changed_files)
    doc_map = state.get("doc_map") if isinstance(state.get("doc_map"), dict) else {}
    impacted = impacted_docs(changed_files, changed_modules, doc_map)

    churn_count = len(changed_files)
    churn_ratio = (churn_count / len(tracked_files)) if tracked_files else 1.0

    result.update(
        {
            "changed_files": changed_files,
            "changed_modules": changed_modules,
            "impacted_doc_paths": impacted,
            "churn_count": churn_count,
            "churn_ratio": round(churn_ratio, 5),
            "dirty": dirty_flags,
        }
    )

    if churn_count > churn_threshold:
        result["mode"] = "full"
        result["reason"] = f"churn threshold exceeded ({churn_count} > {churn_threshold})"
        return result

    if churn_ratio > ratio_threshold:
        result["mode"] = "full"
        result["reason"] = f"churn ratio exceeded ({churn_ratio:.2%} > {ratio_threshold:.2%})"
        return result

    result["mode"] = "incremental"
    result["reason"] = "delta within incremental thresholds"
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compute docs generation delta for sparkify-docs")
    parser.add_argument("--repo", default=".", help="Target repository root (default: .)")
    parser.add_argument(
        "--state-path",
        default=DEFAULT_STATE_PATH,
        help=f"Path to state file relative to repo (default: {DEFAULT_STATE_PATH})",
    )
    parser.add_argument("--since", help="Optional commit to diff from (overrides state commit)")
    parser.add_argument(
        "--churn-threshold",
        type=int,
        default=DEFAULT_CHURN_THRESHOLD,
        help=f"Escalate to full mode when changed files exceed this count (default: {DEFAULT_CHURN_THRESHOLD})",
    )
    parser.add_argument(
        "--ratio-threshold",
        type=float,
        default=DEFAULT_RATIO_THRESHOLD,
        help=f"Escalate to full mode when changed/tracked ratio exceeds this value (default: {DEFAULT_RATIO_THRESHOLD})",
    )
    parser.add_argument("--output", help="Optional output file for JSON payload")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo = Path(args.repo).resolve()
    if not repo.exists() or not repo.is_dir():
        raise SystemExit(f"Repository path does not exist or is not a directory: {repo}")

    state_path = Path(args.state_path)
    if not state_path.is_absolute():
        state_path = (repo / state_path).resolve()

    payload = compute_delta(
        repo=repo,
        state_path=state_path,
        since=args.since,
        churn_threshold=args.churn_threshold,
        ratio_threshold=args.ratio_threshold,
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
