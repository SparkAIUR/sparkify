# sparkify

`sparkify` is a static docs generator for Mintlify-style content, optimized for GitHub Pages.

It provides an `mkdocs`-style workflow while keeping Mintlify authoring conventions (`docs.json`, `.mdx`, static assets) and adds a FastAPI/OpenAPI happy path.

## Status

MVP implementation is in place for:
- `sparkify init`
- `sparkify dev`
- `sparkify build`
- `sparkify doctor`
- `sparkify export-openapi`

## Install

```bash
npm install -g sparkify
```

Or run directly:

```bash
npx sparkify --help
```

## Quickstart

```bash
sparkify init
sparkify dev
sparkify build --site https://<user>.github.io --base /<repo>
```

## Config

Default config file:

- `sparkify.config.json`

Minimal example:

```json
{
  "docsDir": "./docs",
  "outDir": "./dist",
  "base": "/my-repo",
  "openapi": [
    {
      "id": "api",
      "source": "./docs/openapi.json",
      "route": "/api",
      "title": "API Reference"
    }
  ]
}
```

## FastAPI

Export OpenAPI from a FastAPI app without running uvicorn:

```bash
sparkify export-openapi --fastapi "app.main:app" --out ./docs/openapi.json
```

Then build docs:

```bash
sparkify build --site https://<user>.github.io --base /<repo>
```

## Repository Layout

- `/Volumes/S0/github/_sparkai/sparkify/packages/cli` — CLI command surface
- `/Volumes/S0/github/_sparkai/sparkify/packages/core` — config, workspace, build/openapi pipeline
- `/Volumes/S0/github/_sparkai/sparkify/packages/template-astro` — Astro skeleton used for generated sites
- `/Volumes/S0/github/_sparkai/sparkify/packages/playground-stoplight` — Stoplight page generator
- `/Volumes/S0/github/_sparkai/sparkify/examples/fastapi-demo` — end-to-end sample project
- `/Volumes/S0/github/_sparkai/sparkify/refs/docs` — internal specs/backlog/ADRs
- `/Volumes/S0/github/_sparkai/sparkify/docs` — dogfooding/public docs content

## CI/CD

Workflows:
- `/Volumes/S0/github/_sparkai/sparkify/.github/workflows/ci.yml`
- `/Volumes/S0/github/_sparkai/sparkify/.github/workflows/release.yml`
- `/Volumes/S0/github/_sparkai/sparkify/.github/workflows/pages-demo.yml`

## Contributing

Run before opening a PR:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
