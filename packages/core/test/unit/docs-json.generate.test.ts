import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateDocsJson, loadDocsConfig } from "../../src/docs-json.js";

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

  it("loads mint.json when docs.json is missing", async () => {
    const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkify-mint-config-test-"));
    await fs.writeFile(
      path.join(docsDir, "mint.json"),
      JSON.stringify(
        {
          name: "Mint Fixture",
          colors: { primary: "#7c3aed" },
          navigation: [{ group: "Docs", pages: ["index"] }],
          tabs: [{ name: "API Reference", url: "api-reference" }]
        },
        null,
        2
      ),
      "utf8"
    );

    const discovered = await loadDocsConfig(docsDir, {
      preferDocsJson: true,
      allowMintJson: true
    });

    expect(discovered.source).toBe("mint.json");
    expect(discovered.config?.name).toBe("Mint Fixture");
    expect(discovered.config?.tabs?.[0]?.name).toBe("API Reference");
  });

  it("prefers docs.json over mint.json by default", async () => {
    const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkify-docs-precedence-test-"));

    await fs.writeFile(
      path.join(docsDir, "docs.json"),
      JSON.stringify(
        {
          name: "Docs Config",
          theme: "mint",
          navigation: [{ group: "Docs", pages: ["index"] }]
        },
        null,
        2
      ),
      "utf8"
    );

    await fs.writeFile(
      path.join(docsDir, "mint.json"),
      JSON.stringify(
        {
          name: "Mint Config",
          navigation: [{ group: "Docs", pages: ["index"] }]
        },
        null,
        2
      ),
      "utf8"
    );

    const discovered = await loadDocsConfig(docsDir);
    expect(discovered.source).toBe("docs.json");
    expect(discovered.config?.name).toBe("Docs Config");
  });
});
