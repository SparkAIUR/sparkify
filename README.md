# sparkify

`sparkify` is a static docs generator for Mintlify-style content, optimized for GitHub Pages.

Command name is `sparkify` (not `sparify`).

## Highlights

- Mintlify-style static docs build for GitHub Pages and self-hosting.
- FastAPI/OpenAPI export and API reference rendering.
- Default LLM markdown exports: `/llms.txt`, `/llms-full.txt`, and per-page `index.html.md`.
- Built-in floating widget to copy current page or full site markdown.

## Use via `npx` (recommended)

### Prerequisites

- Node.js `>=20`
- Python `3.10`-`3.12` only if you run `export-openapi`

### Quickstart

```bash
npx sparkify init
npx sparkify dev
npx sparkify build --site https://<user>.github.io --base /<repo>
```

### CLI commands

- `npx sparkify init`
- `npx sparkify dev`
- `npx sparkify build`
- `npx sparkify doctor`
- `npx sparkify export-openapi`

### Config discovery precedence

1. `docs.json`
2. `mint.json`
3. generated fallback

### FastAPI OpenAPI export

```bash
npx sparkify export-openapi --fastapi "app.main:app" --out ./docs/openapi.json
npx sparkify build --site https://<user>.github.io --base /<repo>
```

## Contribute in monorepo

### Setup

```bash
npm ci
```

### First-run local dev

`npm run dev` is first-run safe and auto-builds internal package prerequisites.

```bash
npm run dev
```

### Common maintainer scripts

- `npm run build:deps` — build workspace dependencies used by local CLI source execution
- `npm run build:cli` — build the publishable `sparkify` package
- `npm run build` — full monorepo build (`build:deps` + `build:cli`)
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`

## Publish and release

- CI: `./.github/workflows/ci.yml`
- Release automation: `./.github/workflows/release.yml`
- Pages demo: `./.github/workflows/pages-demo.yml`
- Maintainer runbook: `docs/maintainer-release-runbook.mdx`

## Repository layout

- `packages/cli` — npm CLI package (`sparkify`)
- `packages/core` — config, workspace, build/OpenAPI pipeline
- `packages/template-astro` — Astro skeleton used for generated sites
- `packages/playground-stoplight` — Stoplight page generator
- `examples/fastapi-demo` — end-to-end example
- `docs` — public docs content (dogfooded by this repo)
- `refs/docs` — internal specs/backlog/ADRs
