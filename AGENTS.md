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
Primary local commands:
- `npm run lint` — ESLint across TypeScript packages.
- `npm run typecheck` — TypeScript project reference checks.
- `npm run test` — unit + integration tests (Vitest).
- `npm run test:e2e` — Playwright smoke test.
- `npm run build` — build all packages in release order.

CLI commands:
- `node packages/cli/dist/bin.js init`
- `node packages/cli/dist/bin.js dev`
- `node packages/cli/dist/bin.js build --site <url> --base /<repo>`
- `node packages/cli/dist/bin.js doctor`
- `node packages/cli/dist/bin.js export-openapi --fastapi \"pkg.main:app\"`

Specs/docs support:
- `rg --files refs` — list internal spec docs.
- `sed -n '1,200p' refs/docs/<file>.md` — inspect a spec quickly.
- `make npm-whoami` — verify npm auth using `.env` (`NPM_TOKEN`) and expected user.
- `make publish-dry-run` — validate npm publish metadata and package contents.
- `make publish` — publish to npmjs.com as `spark-aiur`.

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
