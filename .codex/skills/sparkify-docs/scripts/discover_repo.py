#!/usr/bin/env python3
"""Discover repository docs, framework signals, and API sources for sparkify-docs."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import Counter
from pathlib import Path
from typing import Any

IGNORED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vscode",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "__pycache__",
    ".sparkify-docs",
}

CODE_EXTENSIONS = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".swift": "swift",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".scala": "scala",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
}

OPENAPI_GLOBS = (
    "**/openapi.json",
    "**/openapi.yaml",
    "**/openapi.yml",
    "**/swagger.json",
    "**/swagger.yaml",
    "**/swagger.yml",
)


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


def is_ignored(path: Path) -> bool:
    return any(part in IGNORED_DIRS for part in path.parts)


def gather_docs(repo: Path, docs_dir: Path) -> dict[str, Any]:
    docs_search_root = docs_dir if docs_dir.exists() else repo
    docs_files: list[Path] = []
    for ext in ("*.md", "*.mdx"):
        for file_path in docs_search_root.rglob(ext):
            if not file_path.is_file() or is_ignored(file_path.relative_to(repo)):
                continue
            docs_files.append(file_path)

    docs_files = sorted(set(docs_files))
    md_count = sum(1 for item in docs_files if item.suffix.lower() == ".md")
    mdx_count = sum(1 for item in docs_files if item.suffix.lower() == ".mdx")

    has_docs_json = (docs_dir / "docs.json").exists()
    has_mint_json = (docs_dir / "mint.json").exists() or (repo / "mint.json").exists()

    score = 0
    if len(docs_files) >= 8:
        score += 2
    elif len(docs_files) >= 3:
        score += 1
    if mdx_count >= 3:
        score += 1
    if has_docs_json:
        score += 2
    if (docs_dir / "index.mdx").exists() or (docs_dir / "index.md").exists():
        score += 1

    if score >= 5:
        maturity = "high"
    elif score >= 3:
        maturity = "medium"
    else:
        maturity = "low"

    return {
        "search_root": str(docs_search_root),
        "docs_file_count": len(docs_files),
        "md_count": md_count,
        "mdx_count": mdx_count,
        "docs_files": [str(path.relative_to(repo)).replace("\\", "/") for path in docs_files],
        "docs_maturity": maturity,
        "has_docs_json": has_docs_json,
        "has_mint_json": has_mint_json,
    }


def gather_language_signals(repo: Path) -> dict[str, Any]:
    counter: Counter[str] = Counter()
    code_files: list[Path] = []

    for file_path in repo.rglob("*"):
        if not file_path.is_file():
            continue
        rel = file_path.relative_to(repo)
        if is_ignored(rel):
            continue
        lang = CODE_EXTENSIONS.get(file_path.suffix.lower())
        if not lang:
            continue
        counter[lang] += 1
        code_files.append(file_path)

    dominant = [item for item, _ in counter.most_common(5)]
    return {
        "language_counts": dict(sorted(counter.items())),
        "dominant_languages": dominant,
        "code_file_count": len(code_files),
        "code_files": [str(path.relative_to(repo)).replace("\\", "/") for path in sorted(code_files)],
    }


def fastapi_signals(repo: Path) -> dict[str, Any]:
    candidates: list[str] = []
    fastapi_files: list[str] = []
    import_re = re.compile(r"\bfrom\s+fastapi\s+import\b|\bimport\s+fastapi\b")
    app_re = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*FastAPI\s*\(")

    for py_file in repo.rglob("*.py"):
        rel = py_file.relative_to(repo)
        if is_ignored(rel):
            continue
        try:
            content = py_file.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if "FastAPI(" not in content and "fastapi" not in content.lower():
            continue
        if import_re.search(content) or "FastAPI(" in content:
            fastapi_files.append(str(rel).replace("\\", "/"))
        for match in app_re.finditer(content):
            app_name = match.group(1)
            module = str(rel.with_suffix("")).replace("\\", ".")
            candidates.append(f"{module}:{app_name}")

    unique_candidates = sorted(set(candidates))
    return {
        "detected": bool(fastapi_files),
        "files": sorted(set(fastapi_files)),
        "app_candidates": unique_candidates,
    }


def openapi_signals(repo: Path) -> dict[str, Any]:
    sources: list[str] = []

    for pattern in OPENAPI_GLOBS:
        for file_path in repo.glob(pattern):
            if not file_path.is_file():
                continue
            rel = file_path.relative_to(repo)
            if is_ignored(rel):
                continue
            sources.append(str(rel).replace("\\", "/"))

    sparkify_config = repo / "sparkify.config.json"
    if sparkify_config.exists():
        try:
            parsed = json.loads(sparkify_config.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            parsed = {}

        if isinstance(parsed, dict):
            openapi = parsed.get("openapi")
            if isinstance(openapi, list):
                for item in openapi:
                    if isinstance(item, dict) and isinstance(item.get("source"), str):
                        sources.append(item["source"])

    docs_openapi = repo / "docs" / "openapi.json"
    if docs_openapi.exists():
        sources.append("docs/openapi.json")

    unique_sources = sorted(set(sources))
    return {
        "detected": bool(unique_sources),
        "sources": unique_sources,
    }


def brand_asset_signals(repo: Path, docs_dir: Path) -> dict[str, Any]:
    candidates = [
        docs_dir / "favicon.svg",
        docs_dir / "logo.svg",
        docs_dir / "images" / "logo.svg",
        repo / "favicon.svg",
        repo / "logo.svg",
    ]
    existing = [str(path.relative_to(repo)).replace("\\", "/") for path in candidates if path.exists()]
    return {
        "has_favicon": any(path.endswith("favicon.svg") for path in existing),
        "has_logo": any(path.endswith("logo.svg") for path in existing),
        "existing_assets": sorted(existing),
    }


def git_context(repo: Path) -> dict[str, Any]:
    branch_code, branch = run_git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])
    head_code, head = run_git(repo, ["rev-parse", "HEAD"])
    status_code, status = run_git(repo, ["status", "--porcelain"])

    return {
        "is_git_repo": branch_code == 0 or head_code == 0,
        "branch": branch if branch_code == 0 else "",
        "head_commit": head if head_code == 0 else "",
        "is_dirty": bool(status) if status_code == 0 else False,
    }


def discover_repo(repo: Path, docs_dir: Path) -> dict[str, Any]:
    docs_data = gather_docs(repo, docs_dir)
    lang_data = gather_language_signals(repo)
    fastapi_data = fastapi_signals(repo)
    openapi_data = openapi_signals(repo)
    brand_data = brand_asset_signals(repo, docs_dir)
    git_data = git_context(repo)

    package_json = repo / "package.json"
    pyproject = repo / "pyproject.toml"
    requirements = repo / "requirements.txt"

    frameworks: list[str] = []
    if package_json.exists():
        frameworks.append("node")
    if pyproject.exists() or requirements.exists():
        frameworks.append("python")
    if fastapi_data["detected"]:
        frameworks.append("fastapi")

    return {
        "repo": str(repo),
        "docs_dir": str(docs_dir),
        "frameworks": sorted(set(frameworks)),
        "sparkify_config_exists": (repo / "sparkify.config.json").exists(),
        "docs": docs_data,
        "languages": lang_data,
        "fastapi": fastapi_data,
        "openapi": openapi_data,
        "branding": brand_data,
        "git": git_data,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Discover repository context for sparkify-docs")
    parser.add_argument("--repo", default=".", help="Target repository root (default: .)")
    parser.add_argument("--docs-dir", default="./docs", help="Docs directory path (default: ./docs)")
    parser.add_argument("--output", help="Optional output file path for discovery JSON")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo = Path(args.repo).resolve()
    docs_dir = (repo / args.docs_dir).resolve() if not Path(args.docs_dir).is_absolute() else Path(args.docs_dir)

    if not repo.exists() or not repo.is_dir():
        raise SystemExit(f"Repository path does not exist or is not a directory: {repo}")

    data = discover_repo(repo, docs_dir)
    payload = json.dumps(data, indent=2, sort_keys=True)

    if args.output:
        out_path = Path(args.output)
        if not out_path.is_absolute():
            out_path = (repo / out_path).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload + "\n", encoding="utf-8")

    print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
