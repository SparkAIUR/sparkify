# Getting Started

<Note>
Primary onboarding path uses `npx`, so you do not need a global install.
</Note>

## Prerequisites

<CardGroup cols={3}>
  <Card title="Node.js" icon="node" color="#339933">
    Version `20.x`
  </Card>
  <Card title="npm" icon="cube">
    Required for package execution and install workflows.
  </Card>
  <Card title="Python" icon="python" color="#3776AB">
    `3.10`-`3.12` only if you run `export-openapi`.
  </Card>
</CardGroup>

## 5-minute quickstart

<Steps>
  <Step title="Initialize docs scaffold">

```bash
npx sparkify init
```

  </Step>
  <Step title="Run local preview">

```bash
npx sparkify dev
```

  </Step>
  <Step title="Build deployable output">

```bash
npx sparkify build --site https://<user>.github.io --base /<repo>
```

  </Step>
</Steps>

## First `sparkify.config.json`

```json
{
  "docsDir": "./docs",
  "outDir": "./dist",
  "site": "https://<user>.github.io",
  "base": "/<repo>",
  "api": {
    "mode": "endpoint-pages",
    "apiRoot": "/api-reference"
  }
}
```

## First-run modes

<Tabs>
  <Tab title="Run with npx (recommended)">

```bash
npx sparkify dev --docs-dir ./docs
npx sparkify doctor --docs-dir ./docs
npx sparkify build --docs-dir ./docs --out ./dist
```

  </Tab>
  <Tab title="Run from local clone">

```bash
npm ci
npm run dev -- --docs-dir ./docs
npx tsx packages/cli/src/bin.ts doctor --docs-dir ./docs
npx tsx packages/cli/src/bin.ts build --docs-dir ./docs --out ./dist
```

First `npm run dev` auto-builds internal workspace dependencies.

  </Tab>
</Tabs>

## Common first-run issues

<AccordionGroup>
  <Accordion title="`build --strict` reports broken links">
    Run `npx sparkify doctor` and fix unresolved internal links and missing static assets before publishing.
  </Accordion>
  <Accordion title="GitHub Pages output loads without styles">
    Confirm `--base` matches the repository path (for project pages) and rebuild.
  </Accordion>
  <Accordion title="FastAPI export fails on import side effects">
    Use `--env-file`, `--cwd`, and `--pythonpath` on `export-openapi` to mirror app runtime conditions.
  </Accordion>
</AccordionGroup>
