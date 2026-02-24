# sparkify

`sparkify` is a static docs generator for Mintlify-style content.

Command name is `sparkify` (not `sparify`).

## Requirements

- Node.js `>=20`
- Python `3.10`-`3.12` only when using `export-openapi`

## Run Without Installing

```bash
npx sparkify --help
```

## Quickstart

```bash
npx sparkify init
npx sparkify dev
npx sparkify build --site https://<user>.github.io --base /<repo>
```

## Commands

- `sparkify init`
- `sparkify dev`
- `sparkify build`
- `sparkify doctor`
- `sparkify export-openapi`

## FastAPI OpenAPI Export

```bash
npx sparkify export-openapi --fastapi "app.main:app" --out ./docs/openapi.json
```

## More Documentation

- Project docs: <https://github.com/spark-aiur/sparkify/tree/main/docs>
- Issue tracker: <https://github.com/spark-aiur/sparkify/issues>
