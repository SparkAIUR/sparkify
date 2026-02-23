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

  it("normalizes modern docs.json navigation/navbar/footer fields", async () => {
    const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkify-docs-v2-test-"));

    await fs.writeFile(
      path.join(docsDir, "docs.json"),
      JSON.stringify(
        {
          name: "PipesHub",
          navbar: {
            links: [{ label: "Support", href: "https://example.com/support" }],
            primary: { type: "github", href: "https://github.com/example/repo" }
          },
          footer: {
            socials: { github: "https://github.com/example/repo" }
          },
          navigation: {
            global: {
              anchors: [{ anchor: "Docs", href: "https://example.com/docs", icon: "book" }]
            },
            tabs: [
              {
                tab: "Documentation",
                groups: [{ group: "Getting Started", pages: ["index", "quickstart"] }]
              },
              {
                tab: "API Reference",
                groups: [{ group: "Endpoints", pages: ["api-reference/get-users"] }]
              }
            ]
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const discovered = await loadDocsConfig(docsDir);
    expect(discovered.source).toBe("docs.json");
    expect(discovered.config?.topbarLinks?.[0]?.name).toBe("Support");
    expect(discovered.config?.topbarCtaButton?.name).toBe("GitHub");
    expect(discovered.config?.footerSocials?.github).toContain("github.com");
    expect(discovered.config?.anchors?.[0]?.name).toBe("Docs");
    expect(discovered.config?.tabs?.[1]?.name).toBe("API Reference");
    expect(discovered.config?.navigation.length).toBeGreaterThanOrEqual(2);
  });
});
