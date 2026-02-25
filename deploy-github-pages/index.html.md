# Deploy: GitHub Pages

GitHub Pages is the default recommendation for public repository docs.

## Build command

```bash
npx sparkify build --site https://<user>.github.io --base /<repo>
```

## Pipeline at a glance

<Steps>
  <Step title="Build static output">
    Run `sparkify build` with explicit `--site` and `--base` and write to `dist/`.
  </Step>
  <Step title="Upload the pages artifact">
    Upload the generated `dist/` directory with `actions/upload-pages-artifact`.
  </Step>
  <Step title="Deploy with GitHub Pages action">
    Deploy the uploaded artifact using `actions/deploy-pages`.
  </Step>
  <Step title="Smoke test deep links">
    Verify routed pages under `/<repo>/...` and confirm styles/assets load correctly.
  </Step>
</Steps>

## Workflow template (consumer repos)

```yaml
name: Deploy Docs

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx sparkify build --site https://${{ github.repository_owner }}.github.io --base /${{ github.event.repository.name }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/deploy-pages@v4
```

## Workflow template (sparkify monorepo maintainers, internal)

```yaml
- run: npm ci
- run: npm run build
- run: |
    node packages/cli/dist/bin.js build \
      --docs-dir ./docs \
      --out ./dist \
      --site https://${{ github.repository_owner }}.github.io \
      --base /${{ github.event.repository.name }}
```

## `site` and `base` matrix

| Site type | `site` | `base` |
| --- | --- | --- |
| User pages (`user.github.io`) | `https://user.github.io` | `""` |
| Project pages (`user.github.io/repo`) | `https://user.github.io` | `/repo` |

## Canonical and trailing slash notes

- Keep `site` absolute and stable to avoid broken canonical metadata.
- Keep `base` without trailing slash (`/repo`, not `/repo/`).
- Validate deep links under the deployed base path.

<Warning>
Most broken asset reports on Pages are caused by incorrect `base`.
</Warning>
