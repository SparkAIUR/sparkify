# sparkify

`sparkify` is a static docs generator for Mintlify-style content, designed for GitHub Pages.

It aims to provide an `mkdocs`-like workflow while preserving Mintlify authoring patterns (`docs.json`, MDX pages, snippets, and assets).

> Naming note: early planning docs may refer to this project as `mintlify-static`.

## Status

This repository is in planning/specification phase.

Documentation is split intentionally:
- `refs/` contains private internal planning/spec content.
- `docs/` is public-facing product documentation and the dogfooding input for `sparkify`.

## MVP Goals

- Build static docs from `docs/` to a deployable output (`dist/`)
- Support hybrid navigation:
  - use existing `docs.json` when present
  - auto-generate `docs.json` when missing
- Support MDX docs plus OpenAPI-driven API reference
- Include an interactive API playground in a static-hosting setup
- Provide a low-friction FastAPI path (`app.openapi()` export)

## Planned CLI (MVP)

Commands are planned as:

- `sparkify init`
- `sparkify dev`
- `sparkify build`
- `sparkify doctor`
- `sparkify export-openapi`

See `refs/docs/04-cli-spec.md` for behavior, flags, and exit codes.

## Architecture Direction

MVP architecture (from specs):

- Astro static build pipeline
- `@mintlify/astro` for Mintlify-compatible content processing
- Pluggable API playground provider (Stoplight-first)
- GitHub Pages-first deployment model (base-path aware)

Details: `refs/docs/03-technical-architecture.md` and `refs/docs/06-api-playground-spec.md`.

## Repository Layout (Current)

- `refs/base.md` — project origin and feasibility discussion
- `refs/docs/` — internal MVP charter, requirements, architecture, backlog, DoD
- `docs/` — public docs content used to test and validate `sparkify` itself
- `AGENTS.md` — contributor guide for coding, testing, and PR expectations

## Getting Started (Now)

1. Read `refs/base.md` for project context.
2. Read `refs/docs/00-overview.md` and `refs/docs/12-backlog.md` for build plan.
3. Author and maintain public docs in `docs/` as the dogfooding target.
4. Follow conventions in `AGENTS.md` for contributions.

## Contributing

Contributions should align with MVP specs, maintain public docs in `docs/`, and update `refs/docs/` when internal decisions change.

Open a PR with:
- clear scope
- linked backlog task/issue
- any spec updates needed for the change
