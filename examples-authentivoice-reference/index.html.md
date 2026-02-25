# Example Reference: AuthentiVoice

This reference tracks parity behavior between local `sparkify` output and the live AuthentiVoice site.

## Inputs and outputs

- Source docs: `/Volumes/S0/github/_sparkai/authentivoice/docs`
- Build config: `./refs/gen/authentivoice/sparkify.config.json`
- Output: `./refs/gen/authentivoice/dist`
- Analysis: `./refs/gen/authentivoice/PARITY_ANALYSIS.md`

<CardGroup cols={2}>
  <Card title="What matches" icon="check-circle">
    Shell layout, tabs/sidebar/TOC behavior, endpoint-page runtime chrome, and mobile stacking.
  </Card>
  <Card title="Known deltas" icon="triangle-exclamation">
    Minor syntax highlighting/UI polish differences and source-level strict-link failures if upstream links are stale.
  </Card>
</CardGroup>

## Snapshot samples

### Local output

![AuthentiVoice intro local](/images/examples/authentivoice-intro-local.png)

### Live site

![AuthentiVoice intro live](/images/examples/authentivoice-intro-live.png)

## Recommended validation for adopters

<Steps>
  <Step title="Run strict build">

```bash
npx sparkify build --docs-dir ./docs --out ./dist --strict
```

  </Step>
  <Step title="Capture local vs live screenshots">
    Lock routes, viewport, and theme, then compare for structural or behavioral drift.
  </Step>
  <Step title="Fix P0/P1 deltas first">
    Prioritize runtime and IA mismatches before minor visual polish.
  </Step>
</Steps>
