import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadDocsJson } from "../../src/docs-json.js";
import { resolveOpenApiBundles } from "../../src/openapi.js";

describe("resolveOpenApiBundles", () => {
  it("validates and bundles OpenAPI documents", async () => {
    const fixtureDir = path.resolve("packages/core/test/fixtures/navigation-with-openapi");
    const docsJson = await loadDocsJson(fixtureDir);
    if (!docsJson) {
      throw new Error("Missing docs.json fixture");
    }

    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkify-openapi-test-"));

    const bundles = await resolveOpenApiBundles({
      docsJson,
      workspaceDir,
      docsDir: fixtureDir,
      entries: [],
      configuredServerUrl: undefined
    });

    expect(bundles.length).toBeGreaterThan(0);
    expect(bundles[0]?.operations).toBe(1);
    expect(bundles[0]?.operationPages.length).toBe(1);
    expect(bundles[0]?.route).toBe("/api-reference");
    await fs.access(bundles[0]!.outputAbsolutePath);
  });
});
