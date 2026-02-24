# sparkify

`sparkify` is a static docs generator for Mintlify-style content, optimized for GitHub Pages.

It provides an `mkdocs`-style workflow while keeping Mintlify authoring conventions (`docs.json`, `.mdx`, static assets) and adds a FastAPI/OpenAPI happy path.

Config discovery precedence is:
1. `docs.json`
2. `mint.json`
3. generated fallback

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
  "api": {
    "mode": "endpoint-pages",
    "apiRoot": "/api-reference"
  },
  "openapi": [
    {
      "id": "api",
      "source": "./docs/openapi.json",
      "route": "/api-reference",
      "title": "API Reference"
    }
  ]
}
```

Compatibility toggles:

```json
{
  "compat": {
    "allowMintJson": true,
    "preferDocsJson": true
  },
  "renderer": {
    "engine": "mintlify-astro",
    "fallbackLegacyRenderer": true
  }
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

- `./packages/cli` — CLI command surface
- `./packages/core` — config, workspace, build/openapi pipeline
- `./packages/template-astro` — Astro skeleton used for generated sites
- `./packages/playground-stoplight` — Stoplight page generator
- `./examples/fastapi-demo` — end-to-end sample project
- `./refs/docs` — internal specs/backlog/ADRs
- `./docs` — dogfooding/public docs content

## CI/CD

Workflows:
- `./.github/workflows/ci.yml`
- `./.github/workflows/release.yml`
- `./.github/workflows/pages-demo.yml`

## Contributing

Run before opening a PR:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
