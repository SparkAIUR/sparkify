# API Playground

`sparkify` renders OpenAPI docs with endpoint-page mode by default (`api.mode: "endpoint-pages"`).

<CardGroup cols={2}>
  <Card title="Endpoint pages" icon="diagram-project">
    Generates operation pages under `/api-reference/*`.
  </Card>
  <Card title="Single page" icon="file-lines">
    Optional fallback with `api.mode: "single-page"`.
  </Card>
</CardGroup>

## Auth support

- API key
- Bearer
- Basic
- OAuth2 browser-safe flows:
  - Authorization Code + PKCE
  - Device Code

<Warning>
Secret-dependent OAuth2 flows are intentionally out of scope for static-browser execution.
</Warning>

## Static hosting constraints

Try It runs in-browser. Your API must allow CORS, or requests must go through a proxy.

```json
{
  "playground": {
    "provider": "stoplight",
    "tryItCorsProxy": "https://proxy.example.com"
  }
}
```

## Troubleshooting Try It

<AccordionGroup>
  <Accordion title="CORS preflight fails">
    Add the docs origin to allowed origins and ensure required methods/headers are permitted.
  </Accordion>
  <Accordion title="Remote schema requires auth">
    Prefer local checked-in schema for deterministic builds, or configure authenticated fetch pipeline outside runtime.
  </Accordion>
  <Accordion title="Spec too large or has circular refs">
    Pre-bundle the schema during CI and feed `sparkify` a bundled local artifact.
  </Accordion>
</AccordionGroup>

## Config patterns

<Tabs>
  <Tab title="Endpoint pages (default)">

```json
{
  "api": {
    "mode": "endpoint-pages",
    "apiRoot": "/api-reference"
  }
}
```

  </Tab>
  <Tab title="Single-page fallback">

```json
{
  "api": {
    "mode": "single-page",
    "apiRoot": "/api"
  }
}
```

  </Tab>
</Tabs>
