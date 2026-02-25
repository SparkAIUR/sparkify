# Use Case: OpenAPI-Only Docs

This mode is for repos without authored API MDX pages. `sparkify` generates API introduction and endpoint pages from OpenAPI.

<CardGroup cols={2}>
  <Card title="Input" icon="file-import">
    OpenAPI from local file or remote URL.
  </Card>
  <Card title="Output" icon="sitemap">
    Endpoint pages grouped by tag with method badges.
  </Card>
</CardGroup>

## Minimal config

```json
{
  "openapi": [
    {
      "id": "backend",
      "source": "https://api.example.com/openapi.json",
      "route": "/api-reference",
      "title": "Backend API"
    }
  ],
  "api": {
    "mode": "endpoint-pages",
    "generateMissingEndpointPages": true,
    "apiRoot": "/api-reference"
  },
  "playground": {
    "provider": "stoplight"
  }
}
```

## Build flow

<Steps>
  <Step title="Run diagnostics">

```bash
npx sparkify doctor --config ./sparkify.config.json
```

  </Step>
  <Step title="Build output">

```bash
npx sparkify build --config ./sparkify.config.json --site https://docs.example.com
```

  </Step>
  <Step title="Verify endpoint pages">
    Confirm `/api-reference/` intro and generated operation routes are present.
  </Step>
</Steps>

## Edge conditions

<AccordionGroup>
  <Accordion title="Remote OpenAPI timeouts or auth failures">
    Prefer a pre-fetched OpenAPI artifact in CI and build from local path for deterministic output.
  </Accordion>
  <Accordion title="Circular refs or oversized schemas">
    Bundle and dereference schema ahead of time, then pass bundled artifact to `openapi[].source`.
  </Accordion>
  <Accordion title="Try It blocked by CORS">
    Configure API CORS or set `playground.tryItCorsProxy`.
  </Accordion>
</AccordionGroup>
