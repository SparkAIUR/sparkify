# FastAPI + OpenAPI Playbook

Use this process when API documentation is needed.

## Detection Order

1. Existing OpenAPI file (`openapi.json|yaml|yml`, `swagger.json|yaml|yml`).
2. Existing `docs/openapi.json`.
3. FastAPI app detection from Python source.
4. Explicit overrides (`--openapi-source`, `--fastapi-app`).

## Export Strategy

- Preferred command:
  - `npx -y sparkify@latest export-openapi --fastapi <module:app> --output docs/openapi.json`
- If export fails, keep docs generation running and record the failure in state metadata.

## OpenAPI Source Handling

- Local file: copy into `docs/openapi.json`.
- Remote URL: fetch and persist to `docs/openapi.json`.
- Existing docs file: reuse as source of truth.

## API Docs Update

- Ensure `docs/api-reference.mdx` exists.
- Ensure navigation includes an `API` group entry.
- Keep route stable at `/api` unless repo-specific constraints require otherwise.

## Validation

- Confirm `docs/openapi.json` is valid JSON or YAML.
- Run docs build after OpenAPI ingest to catch routing/rendering issues.
