# Configuration Overview

## Resolution order

1. CLI flags (highest priority)
2. `sparkify.config.json`
3. Built-in defaults

<Info>
`doctor` and `dev` both report docs config source: `docs.json`, `mint.json`, or generated fallback.
</Info>

<CardGroup cols={3}>
  <Card title="Compat" icon="code-compare">
    Use `compat.allowMintJson` and `compat.preferDocsJson` to control docs config discovery behavior.
  </Card>
  <Card title="API mode" icon="route">
    `endpoint-pages` is default; `single-page` is optional fallback.
  </Card>
  <Card title="Renderer" icon="palette">
    Primary renderer is `mintlify-astro`; legacy fallback can remain enabled.
  </Card>
</CardGroup>

## `docs.json` vs `mint.json`

<Tabs>
  <Tab title="Both files exist">
    If both are present, `docs.json` wins when `compat.preferDocsJson` is true.
  </Tab>
  <Tab title="Only mint.json">
    `mint.json` is normalized into the internal docs model.
  </Tab>
  <Tab title="Neither file exists">
    Navigation is generated from docs content (`autoNav`).
  </Tab>
</Tabs>

## Minimal baseline

```json
{
  "docsDir": "./docs",
  "outDir": "./dist",
  "base": "",
  "autoNav": true,
  "writeDocsJson": false,
  "llms": {
    "enabled": true
  }
}
```

`llms.enabled` defaults to `true`, which enables `llms.txt` outputs and the in-site markdown copy widget.

## Compatibility toggles

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

## Override examples

<CodeGroup>

```bash CLI
npx sparkify build --config ./sparkify.config.json --site https://docs.example.com --base /platform
```

```json Config
{
  "site": "https://docs.example.com",
  "base": "/platform"
}
```

</CodeGroup>
