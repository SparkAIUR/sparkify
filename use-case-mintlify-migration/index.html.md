# Use Case: Migrate Existing Mintlify Docs

Use this path when you already have Mintlify-flavored MDX plus `docs.json` or `mint.json`.

<Steps>
  <Step title="Point sparkify at your docs source">

```bash
npx sparkify doctor --docs-dir ./docs
```

  </Step>
  <Step title="Verify config source + compatibility warnings">
    Confirm source detection (`docs.json`, `mint.json`, or generated) and resolve blocking validation errors.
  </Step>
  <Step title="Run strict build and fix link issues">

```bash
npx sparkify build --docs-dir ./docs --out ./dist --strict
```

  </Step>
</Steps>

## Source compatibility modes

<Tabs>
  <Tab title="`docs.json` preferred">

```json
{
  "compat": {
    "allowMintJson": true,
    "preferDocsJson": true
  }
}
```

  </Tab>
  <Tab title="`mint.json` only">

```json
{
  "compat": {
    "allowMintJson": true,
    "preferDocsJson": false
  }
}
```

  </Tab>
</Tabs>

## Migration checklist

- Confirm logos/icons resolve (no 4xx icon fetches).
- Confirm topbar/tabs/sidebar/TOC structure is preserved.
- Confirm all custom MDX components render.
- Confirm `api:` frontmatter pages render endpoint chrome.
- Confirm `build --strict` has zero broken internal links.

<Warning>
If a page references missing routes (for example stale API links), strict mode will fail intentionally.
</Warning>
