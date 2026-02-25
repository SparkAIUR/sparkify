# sparkify

Build static docs from Mintlify-style sources, with endpoint-level OpenAPI rendering and FastAPI export support.

<Info>
`v0.1.0` runtime contract: Node `20.x` and Python `3.10`-`3.12` (Python required only for `export-openapi`).
</Info>

<CardGroup cols={2}>
  <Card title="Quickstart" icon="rocket" href="/getting-started">
    Start with `npx` and publish your first docs build in minutes.
  </Card>
  <Card title="Configuration" icon="sliders" href="/configuration-overview">
    Learn precedence, defaults, compatibility toggles, and API/playground options.
  </Card>
  <Card title="Deployment" icon="cloud-arrow-up" href="/deploy-github-pages">
    Publish to GitHub Pages or ship static docs in containers.
  </Card>
  <Card title="Examples" icon="images" href="/examples-pipeshub-full">
    See a full PipeHub implementation plus AuthentiVoice and Frauditor references.
  </Card>
</CardGroup>

## Commands

```bash
sparkify init
sparkify dev
sparkify build
sparkify doctor
sparkify export-openapi
```

## Typical workflow

<Steps>
  <Step title="Scaffold docs source">
    Run `npx sparkify init` to create starter docs files and a base config.
  </Step>
  <Step title="Develop and validate">
    Run `npx sparkify dev` and use `npx sparkify doctor` to verify environment and config source.
  </Step>
  <Step title="Build for deployment">
    Run `npx sparkify build --site <url> --base /<repo>` and publish `dist/`.
  </Step>
</Steps>

## What `v0.1.0` supports

| Capability | Status |
| --- | --- |
| `docs.json` input | Supported |
| `mint.json` input | Supported via compat layer |
| Missing docs config fallback | Generated navigation |
| Endpoint-page API reference | Default mode |
| Single-page API playground | Optional mode |
| FastAPI OpenAPI export | Supported |
| Browser-safe OAuth2 flows | PKCE + Device Code |

## Start here

- Use `/getting-started` for first build.
- Use `/configuration-reference` for full config schema.
- Use `/deploy-github-pages` for CI-based publishing.
- Use `/examples-pipeshub-full` for a production-like case study.
- Maintainers: use `/maintainer-release-runbook` for publish workflow.
