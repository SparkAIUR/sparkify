# MDX Authoring Conventions

Apply these conventions when creating or updating docs pages.

## Style

- Use sentence-case prose with concise paragraphs.
- Keep headings specific and stable.
- Prefer actionable guidance over marketing language.
- Use fenced code blocks with language tags.

## Structure

- Start each page with one H1.
- Use H2 for primary sections; avoid deep heading nesting.
- Keep pages scannable with short sections and lists.

## Content Rules

- Preserve existing authored content unless stale or conflicting.
- Mark generated pages with `<!-- sparkify-docs:managed -->`.
- Never remove user-written pages unless explicitly requested.
- Link using root-relative paths (for Sparkify route stability).

## API Content

- For endpoint docs, prefer OpenAPI-derived facts.
- Include auth, request body, response shape, and errors.
- Keep examples copy/paste ready.

## Change Hygiene

- Update only impacted pages during incremental runs.
- Keep navigation synchronized with file additions/removals.
- Include assumptions inline when source certainty is low.
