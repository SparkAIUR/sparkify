# Workflow and Publishing Guardrails

Apply these checks before enabling automated docs publishing.

## Required Workflows

- `.github/workflows/docs-ci.yml`
  - Build docs
  - Verify output exists
  - Run `sparkify doctor`

- `.github/workflows/docs-pages.yml`
  - Build and upload Pages artifact
  - Deploy to `github-pages` environment

## Permissions

- CI: `contents: read`
- Pages deploy: `contents: read`, `pages: write`, `id-token: write`

## Reusable Action Contract

Prefer `uses: SparkAIUR/sparkify@v1` with explicit inputs:

- `docs-dir`
- `site` (optional override)
- `base` (optional override)
- `upload-pages-artifact`
- `deploy-pages`

## Base Path Safety

- For project pages, default base should be `/<repo>`.
- Confirm generated links keep base prefix in production.

## Release Readiness

- Docs build passes on default branch.
- GitHub Pages workflow succeeds and emits page URL.
- Optional post-release smoke: fetch homepage and one nested route.
