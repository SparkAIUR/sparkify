import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateDocsJson } from "../../src/docs-json.js";

describe("generateDocsJson", () => {
  it("builds nav groups from filesystem", async () => {
    const docsDir = path.resolve("packages/core/test/fixtures/simple-docs");
    const docsJson = await generateDocsJson({
      docsDir,
      excludePatterns: [],
      dirTitleMap: {}
    });

    expect(docsJson.navigation.length).toBeGreaterThanOrEqual(1);
    expect(docsJson.navigation[0]?.group).toBe("Getting Started");
    const firstPages = docsJson.navigation[0]?.pages as string[];
    expect(firstPages).toContain("index");
    expect(firstPages).toContain("getting-started");
  });
});
