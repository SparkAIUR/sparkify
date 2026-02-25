# Example Reference: Frauditor Backend

This reference demonstrates live OpenAPI ingestion and generated endpoint-page IA.

## Inputs and outputs

- Docs URL: `https://frauditor.staging.nu-dev.co/api/docs`
- OpenAPI source: `https://frauditor.staging.nu-dev.co/api/openapi.json`
- Build config: `./refs/gen/frauditor-backend/sparkify.config.json`
- Output: `./refs/gen/frauditor-backend/dist`

## Snapshot samples

![Frauditor generated home](/images/examples/frauditor-home.png)

![Frauditor generated endpoint page](/images/examples/frauditor-endpoint.png)

## What this validates

<CardGroup cols={2}>
  <Card title="OpenAPI-only flow" icon="file-import">
    Generates API intro and endpoint pages with method badges.
  </Card>
  <Card title="Interactive endpoint layout" icon="code">
    Includes Try It panel, code samples, and response panel rendering.
  </Card>
</CardGroup>

## Known limitations to document

- Browser-side Try It still depends on API CORS policy.
- Remote OpenAPI fetch can fail due to timeout/auth/rate limit; local artifact fallback is recommended for CI determinism.
- Large/circular specs should be pre-bundled before build.
