# Repository Guidelines

## Project Structure & Module Organization
This repository has two documentation tracks:
- `refs/base.md`: origin discussion and feasibility decisions.
- `refs/docs/`: private/internal MVP specs (architecture, CLI, testing, CI/CD, backlog).
- `docs/`: public-facing docs content that we dogfood with `sparkify`.

Treat `docs/` as the publishable docs source. Keep internal planning detail in `refs/`.

When implementation starts, follow the planned monorepo layout from `refs/docs/08-repository-structure.md`:
- `packages/cli` (command entrypoint)
- `packages/core` (config, workspace, OpenAPI/docs processing)
- `packages/template-astro` (site template)
- `packages/playground-*` (provider adapters)
- `examples/` (FastAPI + docs demos)

## Build, Test, and Development Commands
There is no runnable code yet. During this phase, contributors should validate and evolve specs:
- `rg --files refs` — list all project docs.
- `sed -n '1,200p' refs/docs/<file>.md` — inspect a spec quickly.
- `make npm-whoami` — verify npm auth using `.env` (`NPM_TOKEN`) and expected user.
- `make publish-dry-run` — validate npm publish metadata and package contents.
- `make publish` — publish to npmjs.com as `spark-aiur`.

Target commands once scaffolded (keep interfaces stable):
- `npx sparkify init` — scaffold docs setup.
- `npx sparkify dev` — run local docs preview.
- `npx sparkify build --site <url> --base /<repo>` — generate GitHub Pages output.
- `npx sparkify doctor` — environment/config diagnostics.
- `npx sparkify export-openapi --fastapi "pkg.main:app"` — export FastAPI OpenAPI schema.

## Coding Style & Naming Conventions
- Use TypeScript with strict mode for CLI/core packages.
- Use 2-space indentation and default formatter output.
- Package/module names should be lowercase and descriptive (e.g., `playground-stoplight`).
- Prefer explicit, stable command/config names; avoid breaking flag renames.

## Testing Guidelines
Planned stack: unit + integration + E2E smoke tests.
- Unit: core transforms (docs.json generation, OpenAPI parsing, slug mapping).
- Integration: CLI behavior (`init`, `build`, `doctor`) in temp workspaces.
- E2E: built-site smoke checks (routing, base path, API playground mount).

Name tests by behavior (example: `build.generates-dist.test.ts`), and keep fixtures under `packages/core/test/fixtures/`.

## Commit & Pull Request Guidelines
Current history uses short imperative subjects (`Initial commit`, `Create .gitignore`). Continue that style:
- Subject line in imperative mood, <= 72 chars.
- One focused change per commit when possible.

PRs should include:
- What changed and why.
- Linked issue/task from the backlog.
- Any spec updates in `refs/docs/`.
- Matching public docs updates in `docs/` when behavior or UX changes.
- Screenshots for UI/playground changes once frontend code exists.

## Security & Configuration Notes
- Do not commit secrets or private API tokens.
- Keep npm credentials in `.env` as `NPM_TOKEN=...` for publish commands.
- Treat browser-side playground auth as non-secret runtime input.
- For GitHub Pages, always verify base-path-safe links and assets.
