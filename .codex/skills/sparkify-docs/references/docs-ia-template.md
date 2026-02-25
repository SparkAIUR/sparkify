# Docs IA Template

Use this structure when bootstrapping docs in a new repository.

## Navigation Blueprint

1. `Overview`
2. `Getting Started`
3. `Architecture`
4. `Modules`
5. `API`
6. `Deployment`
7. `Contributing`

## Required Entry Points

- `docs/index.mdx`
- `docs/getting-started.mdx`
- `docs/architecture.mdx`
- `docs/deployment.mdx`
- `docs/contributing.mdx`

## Module Docs Pattern

- Path: `docs/modules/<module>.mdx`
- Heading: module name in Title Case
- Sections:
  - Purpose
  - Key Files
  - Contracts
  - Change Notes

## API Docs Pattern

- Use `docs/openapi.json` as canonical source when available.
- Keep `docs/api-reference.mdx` as navigation anchor.
- Route OpenAPI pages under `/api`.

## Quality Gates

- Navigation must only reference existing pages.
- Prefer stable URLs and avoid churn in slugs.
- Keep generated pages additive and idempotent.
