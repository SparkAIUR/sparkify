#!/usr/bin/env python3
"""Orchestrate sparkify-docs generation, workflow sync, state update, and commit."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

MANAGED_MARKER = "<!-- sparkify-docs:managed -->"
STATE_PATH_DEFAULT = ".sparkify-docs/state.json"
BATCHES_PATH_DEFAULT = ".sparkify-docs/batches.json"
OPENAPI_DEFAULT_OUTPUT = "docs/openapi.json"


def run_command(
    cmd: list[str],
    cwd: Path,
    check: bool = False,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=check,
    )


def run_script_json(script_path: Path, repo: Path, args: list[str]) -> dict[str, Any]:
    proc = run_command([sys.executable, str(script_path), "--repo", str(repo), *args], cwd=repo)
    if proc.returncode != 0:
        stderr = proc.stderr.strip()
        stdout = proc.stdout.strip()
        msg = stderr or stdout or f"script failed: {script_path.name}"
        raise RuntimeError(msg)
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON from {script_path.name}") from exc


def load_template(skill_root: Path, template_name: str) -> str:
    template_path = skill_root / "assets" / "starter-pages" / template_name
    return template_path.read_text(encoding="utf-8")


def render_template(template: str, replacements: dict[str, str]) -> str:
    rendered = template
    for key, value in replacements.items():
        rendered = rendered.replace("{{" + key + "}}", value)
    return rendered


def normalize_rel(path: Path, repo: Path) -> str:
    return str(path.relative_to(repo)).replace("\\", "/")


def title_case_slug(slug: str) -> str:
    parts = [part for part in slug.replace("_", "-").split("-") if part]
    if not parts:
        return "Root"
    return " ".join(part.capitalize() for part in parts)


def to_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def is_managed_text(content: str) -> bool:
    return MANAGED_MARKER in content


def write_mdx_if_allowed(path: Path, content: str, dry_run: bool) -> str:
    final_content = content
    if MANAGED_MARKER not in final_content:
        final_content = f"{MANAGED_MARKER}\n\n{final_content.strip()}\n"

    if path.exists():
        current = path.read_text(encoding="utf-8")
        if not is_managed_text(current):
            return "skipped-authored"
        if current == final_content:
            return "unchanged"
        if not dry_run:
            path.write_text(final_content, encoding="utf-8")
        return "updated"

    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(final_content, encoding="utf-8")
    return "created"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return data if isinstance(data, dict) else {}


def dump_json(path: Path, payload: dict[str, Any], dry_run: bool) -> bool:
    serialized = json.dumps(payload, indent=2, sort_keys=False) + "\n"
    if path.exists():
        current = path.read_text(encoding="utf-8")
        if current == serialized:
            return False
    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(serialized, encoding="utf-8")
    return True


def extract_existing_summary(repo: Path) -> str:
    readme = repo / "README.md"
    if not readme.exists():
        return "Add a concise overview of the project's purpose, core capabilities, and intended users."
    content = readme.read_text(encoding="utf-8", errors="ignore").splitlines()
    for line in content:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            continue
        if stripped.startswith("["):
            continue
        return stripped
    return "Add a concise overview of the project's purpose, core capabilities, and intended users."


def collect_modules(
    repo: Path,
    discovery: dict[str, Any],
    mode: str,
    changed_modules: list[str],
) -> list[str]:
    if mode == "incremental" and changed_modules:
        return sorted(set(changed_modules))

    code_files = discovery.get("languages", {}).get("code_files", [])
    modules: set[str] = set()

    for file_path in code_files:
        if not isinstance(file_path, str) or not file_path:
            continue
        normalized = file_path.replace("\\", "/")
        if normalized.startswith("docs/") or normalized.startswith(".github/"):
            continue
        parts = normalized.split("/")
        if len(parts) == 1:
            modules.add("root")
            continue
        top = parts[0]
        if top.startswith("."):
            continue
        modules.add(top)

    if not modules:
        modules.add("core")

    return sorted(modules)


def module_file_bullets(discovery: dict[str, Any], module: str, max_items: int = 12) -> str:
    code_files = discovery.get("languages", {}).get("code_files", [])
    selected: list[str] = []
    for file_path in code_files:
        if not isinstance(file_path, str):
            continue
        normalized = file_path.replace("\\", "/")
        if module == "root" and "/" not in normalized:
            selected.append(normalized)
        elif normalized.startswith(module + "/"):
            selected.append(normalized)

    selected = sorted(selected)
    if not selected:
        return "- `No code files were mapped for this module during discovery.`"

    lines = [f"- `{path}`" for path in selected[:max_items]]
    if len(selected) > max_items:
        lines.append(f"- `...and {len(selected) - max_items} more files`")
    return "\n".join(lines)


def ensure_core_pages(
    skill_root: Path,
    repo: Path,
    docs_dir: Path,
    project_name: str,
    project_summary: str,
    include_api: bool,
    openapi_source: str,
    dry_run: bool,
) -> tuple[dict[str, str], dict[str, str], list[str]]:
    page_to_slug = {
        "index.mdx": "index",
        "getting-started.mdx": "getting-started",
        "architecture.mdx": "architecture",
        "deployment.mdx": "deployment",
        "contributing.mdx": "contributing",
    }
    if include_api:
        page_to_slug["api-reference.mdx"] = "api-reference"

    statuses: dict[str, str] = {}
    generated_paths: list[str] = []

    for filename, slug in page_to_slug.items():
        template_name = "api-reference.mdx" if filename == "api-reference.mdx" else filename
        template = load_template(skill_root, template_name)
        replacements = {
            "PROJECT_NAME": project_name,
            "PROJECT_SUMMARY": project_summary,
            "API_LINK": "- [API Reference](/api-reference)" if include_api else "",
            "OPENAPI_SOURCE": openapi_source or "docs/openapi.json",
        }
        rendered = render_template(template, replacements)
        target = docs_dir / filename
        status = write_mdx_if_allowed(target, rendered, dry_run)
        statuses[slug] = status
        if status in {"created", "updated"}:
            generated_paths.append(normalize_rel(target, repo))

    return page_to_slug, statuses, sorted(generated_paths)


def ensure_module_pages(
    skill_root: Path,
    repo: Path,
    docs_dir: Path,
    discovery: dict[str, Any],
    modules: list[str],
    dry_run: bool,
) -> tuple[dict[str, str], dict[str, str], list[str]]:
    template = load_template(skill_root, "module-template.mdx")
    module_slug_map: dict[str, str] = {}
    module_statuses: dict[str, str] = {}
    generated_paths: list[str] = []

    for module in modules:
        slug = f"modules/{module}"
        module_slug_map[module] = slug

        rendered = render_template(
            template,
            {
                "MODULE_TITLE": title_case_slug(module),
                "MODULE_FILES": module_file_bullets(discovery, module),
            },
        )
        target = docs_dir / "modules" / f"{module}.mdx"
        status = write_mdx_if_allowed(target, rendered, dry_run)
        module_statuses[module] = status
        if status in {"created", "updated"}:
            generated_paths.append(normalize_rel(target, repo))

    return module_slug_map, module_statuses, sorted(generated_paths)


def ensure_navigation_group(nav: list[dict[str, Any]], title: str, pages: list[str]) -> None:
    pages = [page for page in pages if page]
    if not pages:
        return

    existing_group: dict[str, Any] | None = None
    for entry in nav:
        if isinstance(entry, dict) and entry.get("group") == title and isinstance(entry.get("pages"), list):
            existing_group = entry
            break

    if existing_group is None:
        nav.append({"group": title, "pages": pages})
        return

    existing_pages = [item for item in existing_group.get("pages", []) if isinstance(item, str)]
    for page in pages:
        if page not in existing_pages:
            existing_pages.append(page)
    existing_group["pages"] = existing_pages


def ensure_docs_json(
    repo: Path,
    docs_dir: Path,
    project_name: str,
    core_slugs: dict[str, str],
    module_slug_map: dict[str, str],
    include_api: bool,
    dry_run: bool,
) -> tuple[str, list[str]]:
    docs_json_path = docs_dir / "docs.json"
    existing = load_json(docs_json_path)

    payload: dict[str, Any] = dict(existing)
    payload.setdefault("$schema", "https://mintlify.com/docs.json")
    payload.setdefault("name", project_name)

    navigation = payload.get("navigation")
    if not isinstance(navigation, list):
        navigation = []

    normalized_nav: list[dict[str, Any]] = [entry for entry in navigation if isinstance(entry, dict)]
    ensure_navigation_group(
        normalized_nav,
        "Overview",
        [core_slugs["index.mdx"], core_slugs["getting-started.mdx"], core_slugs["architecture.mdx"]],
    )
    ensure_navigation_group(
        normalized_nav,
        "Modules",
        [module_slug_map[module] for module in sorted(module_slug_map.keys())],
    )
    if include_api:
        ensure_navigation_group(normalized_nav, "API", ["api-reference"])
    ensure_navigation_group(
        normalized_nav,
        "Operations",
        [core_slugs["deployment.mdx"], core_slugs["contributing.mdx"]],
    )

    payload["navigation"] = normalized_nav
    changed = dump_json(docs_json_path, payload, dry_run=dry_run)
    status = "updated" if changed and docs_json_path.exists() else ("created" if changed else "unchanged")
    paths = [normalize_rel(docs_json_path, repo)] if changed else []
    return status, paths


def ensure_sparkify_config(
    repo: Path,
    docs_dir_arg: str,
    site: str,
    base: str,
    include_openapi: bool,
    dry_run: bool,
) -> tuple[str, list[str]]:
    config_path = repo / "sparkify.config.json"
    if config_path.exists():
        return "skipped-existing", []

    payload: dict[str, Any] = {
        "docsDir": docs_dir_arg,
        "llms": {"enabled": True},
    }
    if site:
        payload["site"] = site
    if base:
        payload["base"] = base
    if include_openapi:
        payload["openapi"] = [{"source": "./docs/openapi.json", "route": "/api"}]

    if not dry_run:
        config_path.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    return "created", [normalize_rel(config_path, repo)]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_openapi(
    repo: Path,
    docs_dir: Path,
    discovery: dict[str, Any],
    no_openapi: bool,
    fastapi_app: str,
    openapi_source: str,
    dry_run: bool,
) -> tuple[dict[str, Any], list[str]]:
    metadata: dict[str, Any] = {
        "enabled": False,
        "source": "",
        "source_kind": "",
        "output": OPENAPI_DEFAULT_OUTPUT,
        "route": "/api",
        "hash": "",
        "error": "",
    }
    generated_paths: list[str] = []

    if no_openapi:
        metadata["error"] = "openapi generation disabled via --no-openapi"
        return metadata, generated_paths

    output_path = docs_dir / "openapi.json"

    def write_bytes(data: bytes) -> None:
        if not dry_run:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(data)

    if openapi_source:
        source = openapi_source.strip()
        metadata["source"] = source
        if source.startswith("http://") or source.startswith("https://"):
            metadata["source_kind"] = "remote-url"
            try:
                with urllib.request.urlopen(source) as response:
                    write_bytes(response.read())
                generated_paths.append(normalize_rel(output_path, repo))
            except urllib.error.URLError as exc:
                metadata["error"] = f"failed to fetch openapi source: {exc}"
                return metadata, generated_paths
        else:
            src_path = Path(source)
            if not src_path.is_absolute():
                src_path = (repo / src_path).resolve()
            if not src_path.exists():
                metadata["error"] = f"openapi source does not exist: {src_path}"
                return metadata, generated_paths
            metadata["source_kind"] = "local-file"
            if not dry_run:
                output_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src_path, output_path)
            generated_paths.append(normalize_rel(output_path, repo))

    elif output_path.exists():
        metadata["source"] = "docs/openapi.json"
        metadata["source_kind"] = "existing-docs-file"

    else:
        discovered_sources = discovery.get("openapi", {}).get("sources", [])
        local_sources = [
            item
            for item in discovered_sources
            if isinstance(item, str)
            and not item.startswith("http://")
            and not item.startswith("https://")
        ]

        if local_sources:
            src_path = (repo / local_sources[0]).resolve()
            metadata["source"] = local_sources[0]
            metadata["source_kind"] = "discovered-local-file"
            if src_path.exists():
                if not dry_run:
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(src_path, output_path)
                generated_paths.append(normalize_rel(output_path, repo))
            else:
                metadata["error"] = f"discovered openapi source missing: {src_path}"
                return metadata, generated_paths

        else:
            candidate = fastapi_app or ""
            if not candidate:
                app_candidates = discovery.get("fastapi", {}).get("app_candidates", [])
                if isinstance(app_candidates, list) and app_candidates:
                    candidate = str(app_candidates[0])

            if candidate:
                metadata["source"] = candidate
                metadata["source_kind"] = "fastapi-export"
                cmd = [
                    "npx",
                    "-y",
                    "sparkify@latest",
                    "export-openapi",
                    "--fastapi",
                    candidate,
                    "--output",
                    str(output_path),
                ]
                proc = run_command(cmd, cwd=repo)
                if proc.returncode != 0:
                    details = proc.stderr.strip() or proc.stdout.strip()
                    metadata["error"] = details or "fastapi export-openapi command failed"
                    return metadata, generated_paths
                generated_paths.append(normalize_rel(output_path, repo))
            else:
                metadata["error"] = "no openapi source or fastapi app could be resolved"
                return metadata, generated_paths

    if output_path.exists() and not dry_run:
        metadata["hash"] = sha256_file(output_path)
    metadata["enabled"] = output_path.exists() or dry_run
    return metadata, sorted(set(generated_paths))


def build_doc_map(
    discovery: dict[str, Any],
    module_slug_map: dict[str, str],
    core_slugs: dict[str, str],
    include_api: bool,
) -> dict[str, str]:
    doc_map: dict[str, str] = {}

    code_files = discovery.get("languages", {}).get("code_files", [])
    for file_path in code_files:
        if not isinstance(file_path, str):
            continue
        normalized = file_path.replace("\\", "/")
        parts = normalized.split("/")
        if len(parts) == 1:
            module = "root"
        else:
            module = parts[0]
        slug = module_slug_map.get(module)
        if slug:
            doc_map[normalized] = slug

    for module, slug in module_slug_map.items():
        doc_map[module] = slug
        doc_map[f"module:{module}"] = slug

    for filename, slug in core_slugs.items():
        doc_map[f"page:{filename}"] = slug

    if include_api:
        doc_map["api"] = "api-reference"
        doc_map["page:api-reference.mdx"] = "api-reference"

    return dict(sorted(doc_map.items()))


def parse_git_status_files(output: str) -> list[str]:
    files: list[str] = []
    for line in output.splitlines():
        if len(line) < 4:
            continue
        path_part = line[3:].strip()
        if " -> " in path_part:
            path_part = path_part.split(" -> ", 1)[1].strip()
        path_part = path_part.strip('"')
        if path_part:
            files.append(path_part.replace("\\", "/"))
    return sorted(set(files))


def git_dirty_files(repo: Path) -> tuple[bool, list[str]]:
    proc = run_command(["git", "status", "--porcelain"], cwd=repo)
    if proc.returncode != 0:
        return False, []
    return True, parse_git_status_files(proc.stdout)


def git_commit_generated(
    repo: Path,
    generated_paths: list[str],
    commit_message: str,
    commit_branch: str,
    push: bool,
    preexisting_dirty: list[str],
    dry_run: bool,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "status": "skipped",
        "reason": "",
        "committed_files": [],
        "branch": "",
        "pushed": False,
    }

    if dry_run:
        result["status"] = "skipped"
        result["reason"] = "dry-run enabled"
        return result

    is_git, _ = git_dirty_files(repo)
    if not is_git:
        result["status"] = "skipped"
        result["reason"] = "not a git repository"
        return result

    if not generated_paths:
        result["status"] = "skipped"
        result["reason"] = "no generated files"
        return result

    branch_proc = run_command(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo)
    current_branch = branch_proc.stdout.strip() if branch_proc.returncode == 0 else ""
    result["branch"] = current_branch

    if commit_branch != "current" and current_branch != commit_branch:
        result["status"] = "blocked"
        result["reason"] = f"current branch '{current_branch}' does not match --commit-branch '{commit_branch}'"
        return result

    preexisting = set(preexisting_dirty)
    generated = set(generated_paths)
    overlap = sorted(preexisting.intersection(generated))
    if overlap:
        result["status"] = "blocked"
        result["reason"] = "generated paths already had local modifications before run"
        result["conflicts"] = overlap
        return result

    existing_paths = [path for path in sorted(generated) if (repo / path).exists()]
    if not existing_paths:
        result["status"] = "skipped"
        result["reason"] = "generated paths are missing on disk"
        return result

    add_proc = run_command(["git", "add", "--", *existing_paths], cwd=repo)
    if add_proc.returncode != 0:
        result["status"] = "failed"
        result["reason"] = add_proc.stderr.strip() or "git add failed"
        return result

    staged_proc = run_command(["git", "diff", "--cached", "--name-only"], cwd=repo)
    staged = [line.strip() for line in staged_proc.stdout.splitlines() if line.strip()] if staged_proc.returncode == 0 else []
    if not staged:
        result["status"] = "skipped"
        result["reason"] = "no staged docs changes"
        return result

    commit_proc = run_command(["git", "commit", "-m", commit_message], cwd=repo)
    if commit_proc.returncode != 0:
        result["status"] = "failed"
        result["reason"] = commit_proc.stderr.strip() or commit_proc.stdout.strip() or "git commit failed"
        return result

    result["status"] = "committed"
    result["committed_files"] = staged

    if push:
        push_proc = run_command(["git", "push"], cwd=repo)
        if push_proc.returncode != 0:
            result["status"] = "failed"
            result["reason"] = push_proc.stderr.strip() or push_proc.stdout.strip() or "git push failed"
            return result
        result["pushed"] = True

    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run sparkify-docs workflow")
    parser.add_argument("--repo", default=".", help="Target repository root")
    parser.add_argument("--docs-dir", default="./docs", help="Docs directory path")
    parser.add_argument("--mode", choices=["auto", "full", "incremental"], default="auto")
    parser.add_argument("--since", default="", help="Optional commit for delta base")
    parser.add_argument("--max-subagents", type=int, default=4, help="Max subagents for planning")
    parser.add_argument("--no-workflows", action="store_true", help="Skip workflow creation/sync")
    parser.add_argument("--no-brand-assets", action="store_true", help="Skip logo/favicon generation")
    parser.add_argument("--no-openapi", action="store_true", help="Skip OpenAPI detection/export")
    parser.add_argument("--fastapi-app", default="", help="Optional FastAPI app target module:app")
    parser.add_argument("--openapi-source", default="", help="Optional OpenAPI source path or URL")
    parser.add_argument("--site", default="", help="Optional site URL")
    parser.add_argument("--base", default="", help="Optional base path")
    parser.add_argument("--commit", default="true", choices=["true", "false"], help="Auto-commit generated docs")
    parser.add_argument(
        "--commit-branch",
        default="current",
        help="Branch allowed for commit (default: current)",
    )
    parser.add_argument("--push", default="false", choices=["true", "false"], help="Push after commit")
    parser.add_argument(
        "--commit-message",
        default="docs: update sparkify docs",
        help="Commit message used when --commit=true",
    )
    parser.add_argument("--dry-run", action="store_true", help="Compute and report without writing files")
    parser.add_argument("--output", help="Optional output JSON path")
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

    if not args.dry_run:
        docs_dir.mkdir(parents=True, exist_ok=True)
        (repo / ".sparkify-docs").mkdir(parents=True, exist_ok=True)

    preexisting_dirty: list[str] = []
    is_git, dirty_now = git_dirty_files(repo)
    if is_git:
        preexisting_dirty = dirty_now

    discover_payload = run_script_json(script_dir / "discover_repo.py", repo, ["--docs-dir", args.docs_dir])
    delta_payload = run_script_json(
        script_dir / "compute_delta.py",
        repo,
        [
            "--state-path",
            STATE_PATH_DEFAULT,
            *( ["--since", args.since] if args.since else [] ),
        ],
    )

    selected_mode = delta_payload.get("mode", "full")
    if args.mode in {"full", "incremental"}:
        selected_mode = args.mode
        delta_payload["mode"] = args.mode
        delta_payload["reason"] = f"mode forced via --mode {args.mode}"

    changed_files = delta_payload.get("changed_files", []) if isinstance(delta_payload.get("changed_files"), list) else []
    changed_modules = (
        delta_payload.get("changed_modules", []) if isinstance(delta_payload.get("changed_modules"), list) else []
    )

    plan_payload = run_script_json(
        script_dir / "plan_batches.py",
        repo,
        [
            "--docs-dir",
            args.docs_dir,
            "--mode",
            selected_mode,
            "--changed-files-json",
            json.dumps(changed_files),
            "--changed-modules-json",
            json.dumps(changed_modules),
            "--max-subagents",
            str(args.max_subagents),
        ],
    )

    project_name = repo.name
    project_summary = extract_existing_summary(repo)
    modules = collect_modules(repo, discover_payload, selected_mode, changed_modules)

    openapi_metadata, openapi_generated = resolve_openapi(
        repo=repo,
        docs_dir=docs_dir,
        discovery=discover_payload,
        no_openapi=args.no_openapi,
        fastapi_app=args.fastapi_app,
        openapi_source=args.openapi_source,
        dry_run=args.dry_run,
    )

    include_api = bool(openapi_metadata.get("enabled"))
    core_slugs, core_status, core_generated = ensure_core_pages(
        skill_root=skill_root,
        repo=repo,
        docs_dir=docs_dir,
        project_name=project_name,
        project_summary=project_summary,
        include_api=include_api,
        openapi_source=str(openapi_metadata.get("source") or "docs/openapi.json"),
        dry_run=args.dry_run,
    )

    module_slug_map, module_status, module_generated = ensure_module_pages(
        skill_root=skill_root,
        repo=repo,
        docs_dir=docs_dir,
        discovery=discover_payload,
        modules=modules,
        dry_run=args.dry_run,
    )

    docs_json_status, docs_json_paths = ensure_docs_json(
        repo=repo,
        docs_dir=docs_dir,
        project_name=project_name,
        core_slugs=core_slugs,
        module_slug_map=module_slug_map,
        include_api=include_api,
        dry_run=args.dry_run,
    )

    sparkify_config_status, sparkify_config_paths = ensure_sparkify_config(
        repo=repo,
        docs_dir_arg=args.docs_dir,
        site=args.site,
        base=args.base,
        include_openapi=include_api,
        dry_run=args.dry_run,
    )

    brand_payload: dict[str, Any] = {"status": {"favicon": "skipped", "logo": "skipped"}, "created": [], "updated": []}
    if not args.no_brand_assets:
        frameworks = discover_payload.get("frameworks", [])
        brand_payload = run_script_json(
            script_dir / "generate_brand_assets.py",
            repo,
            [
                "--docs-dir",
                args.docs_dir,
                "--stack-json",
                json.dumps(frameworks if isinstance(frameworks, list) else []),
                "--project-name",
                project_name,
                *( ["--dry-run"] if args.dry_run else [] ),
            ],
        )

    workflow_payload: dict[str, Any] = {
        "status": {"docs_pages": "skipped", "docs_ci": "skipped"},
        "created": [],
        "updated": [],
        "skipped": [],
    }
    if not args.no_workflows:
        workflow_payload = run_script_json(
            script_dir / "ensure_workflows.py",
            repo,
            [
                "--docs-dir",
                args.docs_dir,
                "--site",
                args.site,
                "--base",
                args.base,
                *( ["--dry-run"] if args.dry_run else [] ),
            ],
        )

    doc_map = build_doc_map(discover_payload, module_slug_map, core_slugs, include_api)

    state_payload = run_script_json(
        script_dir / "write_state.py",
        repo,
        [
            "--state-path",
            STATE_PATH_DEFAULT,
            "--last-processed-commit",
            str(discover_payload.get("git", {}).get("head_commit") or ""),
            "--mode-used",
            selected_mode,
            "--doc-map-json",
            json.dumps(doc_map),
            "--openapi-json",
            json.dumps(openapi_metadata),
            "--workflow-status-json",
            json.dumps(workflow_payload.get("status", {})),
            "--brand-assets-status-json",
            json.dumps(brand_payload.get("status", {})),
            "--merge-existing",
            *( ["--dry-run"] if args.dry_run else [] ),
        ],
    )

    batches_path = repo / BATCHES_PATH_DEFAULT
    if not args.dry_run:
        batches_path.parent.mkdir(parents=True, exist_ok=True)
        batches_path.write_text(json.dumps(plan_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    generated_paths = sorted(
        set(
            core_generated
            + module_generated
            + docs_json_paths
            + sparkify_config_paths
            + openapi_generated
            + [BATCHES_PATH_DEFAULT, STATE_PATH_DEFAULT]
            + [
                str(Path(path).relative_to(repo)).replace("\\", "/")
                for path in brand_payload.get("created", []) + brand_payload.get("updated", [])
                if str(path).startswith(str(repo))
            ]
            + [
                str(Path(path).relative_to(repo)).replace("\\", "/")
                for path in workflow_payload.get("created", []) + workflow_payload.get("updated", [])
                if str(path).startswith(str(repo))
            ]
        )
    )

    commit_payload = {
        "status": "skipped",
        "reason": "--commit=false",
        "committed_files": [],
        "branch": "",
        "pushed": False,
    }
    if to_bool(args.commit):
        commit_payload = git_commit_generated(
            repo=repo,
            generated_paths=generated_paths,
            commit_message=args.commit_message,
            commit_branch=args.commit_branch,
            push=to_bool(args.push),
            preexisting_dirty=preexisting_dirty,
            dry_run=args.dry_run,
        )

    payload: dict[str, Any] = {
        "repo": str(repo),
        "docs_dir": normalize_rel(docs_dir, repo) if str(docs_dir).startswith(str(repo)) else str(docs_dir),
        "mode": selected_mode,
        "mode_reason": str(delta_payload.get("reason") or ""),
        "subagents": {
            "recommended": plan_payload.get("recommended_subagents", 1),
            "should_use": bool(plan_payload.get("should_use_subagents", False)),
            "batch_count": plan_payload.get("batch_count", 0),
            "module_batch_count": plan_payload.get("module_batch_count", 0),
            "manifest_path": BATCHES_PATH_DEFAULT,
        },
        "discovery": {
            "frameworks": discover_payload.get("frameworks", []),
            "docs_maturity": discover_payload.get("docs", {}).get("docs_maturity", "unknown"),
            "fastapi_detected": discover_payload.get("fastapi", {}).get("detected", False),
            "openapi_detected": discover_payload.get("openapi", {}).get("detected", False),
        },
        "generation": {
            "modules": modules,
            "core_page_status": core_status,
            "module_page_status": module_status,
            "docs_json_status": docs_json_status,
            "sparkify_config_status": sparkify_config_status,
            "openapi": openapi_metadata,
            "workflows": workflow_payload.get("status", {}),
            "brand_assets": brand_payload.get("status", {}),
            "generated_paths": generated_paths,
        },
        "state": state_payload,
        "commit": commit_payload,
    }

    serialized = json.dumps(payload, indent=2, sort_keys=True)
    if args.output:
        out_path = Path(args.output)
        if not out_path.is_absolute():
            out_path = (repo / out_path).resolve()
        if not args.dry_run:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(serialized + "\n", encoding="utf-8")

    print(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
