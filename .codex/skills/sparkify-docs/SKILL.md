---
name: sparkify-docs
description: Generate and maintain developer-centric documentation for arbitrary repositories using Sparkify-first Mintlify schema (`docs/docs.json` + MDX pages), including incremental updates via git delta/state, FastAPI/OpenAPI ingestion, brand asset bootstrapping, and GitHub Pages CI/workflow setup. Use when the user asks to create, refresh, or automate project docs and publishing.
---

# Sparkify Docs

Execute this skill from the target repository root. Prefer deterministic scripts in `scripts/`.

## Quick Start

Run the full workflow with defaults:

```bash
python3 <skill-dir>/scripts/run.py
```

Default behavior:

1. Discover repository context (`*.md`/`*.mdx` first, then code and framework signals).
2. Choose mode automatically (`full` on first run, `incremental` when safe from git delta).
3. Plan module batches for subagent parallelization.
4. Generate or update docs files in `docs/` with Sparkify/Mintlify-compatible navigation.
5. Ensure missing `sparkify.config.json`, CI, and Pages workflows.
6. Generate missing `docs/favicon.svg` and `docs/logo.svg`.
7. Write `.sparkify-docs/state.json` and `.sparkify-docs/batches.json`.
8. Auto-commit generated scope on the current branch (no push by default).

## Command Interface

Use `run.py` as the main entry point:

```bash
python3 <skill-dir>/scripts/run.py \
  --repo . \
  --docs-dir ./docs \
  --mode auto \
  --commit true \
  --commit-branch current \
  --push false
```

Optional controls:

- `--mode auto|full|incremental`
- `--since <commit>`
- `--max-subagents <n>`
- `--no-workflows`
- `--no-brand-assets`
- `--no-openapi`
- `--fastapi-app <module:app>`
- `--openapi-source <path-or-url>`
- `--site <url>`
- `--base <path>`
- `--commit-message <msg>`
- `--dry-run`

## Subagent Orchestration Protocol

Use `scripts/plan_batches.py` output (`.sparkify-docs/batches.json`) when repository size/churn is high.

1. Treat each `module:*` batch as single-owner work for one subagent.
2. Keep orchestrator ownership for:
   - `docs/docs.json`
   - workflows
   - state files
3. Apply deterministic merge rules:
   - orchestrator-owned batches always win,
   - then higher priority,
   - then lexicographically smaller batch id.
4. Rebuild navigation/state only after all batch outputs are merged.

## Update Policy

Apply these generation rules:

1. Preserve authored docs by default.
2. Update managed pages (`<!-- sparkify-docs:managed -->`) in place.
3. Add missing core sections on first run:
   - Overview
   - Getting Started
   - Architecture
   - Modules
   - API (when available)
   - Deployment
   - Contributing
4. Run incremental updates only for impacted modules/pages when delta is within thresholds.

## FastAPI/OpenAPI Policy

Use this resolution order:

1. Explicit `--openapi-source`.
2. Existing local OpenAPI files.
3. Existing `docs/openapi.json`.
4. FastAPI export (`sparkify export-openapi`) using `--fastapi-app` or discovered app candidate.

Use API playbook details in [references/fastapi-openapi-playbook.md](references/fastapi-openapi-playbook.md).

## References

Load only what is required for the task:

- Information architecture template: [references/docs-ia-template.md](references/docs-ia-template.md)
- MDX writing conventions: [references/mdx-authoring-conventions.md](references/mdx-authoring-conventions.md)
- FastAPI/OpenAPI handling: [references/fastapi-openapi-playbook.md](references/fastapi-openapi-playbook.md)
- CI/Pages guardrails: [references/workflow-publishing-guardrails.md](references/workflow-publishing-guardrails.md)

## Operational Commands

Use helper scripts directly when debugging one subsystem:

```bash
python3 <skill-dir>/scripts/discover_repo.py --repo . --docs-dir ./docs
python3 <skill-dir>/scripts/compute_delta.py --repo . --state-path .sparkify-docs/state.json
python3 <skill-dir>/scripts/plan_batches.py --repo . --docs-dir ./docs --mode full
python3 <skill-dir>/scripts/generate_brand_assets.py --repo . --docs-dir ./docs
python3 <skill-dir>/scripts/ensure_workflows.py --repo . --docs-dir ./docs
python3 <skill-dir>/scripts/write_state.py --repo . --state-path .sparkify-docs/state.json
```

## Git Rules

1. Commit only generated scope.
2. Skip push unless explicitly requested.
3. If generated paths already had local edits before run, block commit and report conflict paths.
4. Leave generated files in place even when commit is blocked.
