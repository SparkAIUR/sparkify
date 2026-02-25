import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateAstroProject } from "../../src/astro-project.js";
import { cleanupWorkspace, prepareWorkspace } from "../../src/workspace.js";
import type { SparkifyConfigV1 } from "../../src/types.js";

async function setupFixture(): Promise<{ rootDir: string; docsDir: string; openApiPath: string }> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkify-llms-fixture-"));
  const docsDir = path.join(rootDir, "docs");
  await fs.mkdir(path.join(docsDir, "guide"), { recursive: true });

  await fs.writeFile(
    path.join(docsDir, "index.mdx"),
    `---\ntitle: "Fixture Site"\n---\n\n# Fixture Site\n\nWelcome.\n`,
    "utf8"
  );

  await fs.writeFile(
    path.join(docsDir, "guide/setup.mdx"),
    `---\ntitle: "Setup"\n---\n\n# Setup\n\n\`\`\`bash\necho "hello"\n\`\`\`\n`,
    "utf8"
  );

  const openApiPath = path.join(docsDir, "openapi.json");
  await fs.writeFile(
    openApiPath,
    JSON.stringify(
      {
        openapi: "3.1.0",
        info: { title: "Fixture API", version: "1.0.0" },
        paths: {
          "/status": {
            get: {
              summary: "Status",
              tags: ["System"],
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      example: { ok: true }
                    }
                  }
                }
              }
            }
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  return { rootDir, docsDir, openApiPath };
}

function createConfig(fixture: { rootDir: string; docsDir: string; openApiPath: string }, llmsEnabled: boolean): SparkifyConfigV1 {
  return {
    docsDir: fixture.docsDir,
    outDir: path.join(fixture.rootDir, "dist"),
    site: "https://docs.example.com",
    base: "/project-docs",
    autoNav: true,
    writeDocsJson: false,
    exclude: [],
    dirTitleMap: {},
    openapi: [
      {
        id: "api",
        source: fixture.openApiPath,
        route: "/api-reference",
        title: "API Reference"
      }
    ],
    compat: {
      allowMintJson: true,
      preferDocsJson: true
    },
    api: {
      mode: "endpoint-pages",
      generateMissingEndpointPages: true,
      apiRoot: "/api-reference"
    },
    renderer: {
      engine: "mintlify-astro",
      fallbackLegacyRenderer: true
    },
    llms: {
      enabled: llmsEnabled
    },
    playground: {
      provider: "stoplight",
      auth: {
        apiKey: true,
        bearer: true,
        basic: true,
        oauth2: {
          enabled: true,
          flows: ["authorizationCodePkce", "deviceCode"],
          tokenStorage: "sessionStorage"
        }
      }
    }
  };
}

describe("generateAstroProject llms exports", () => {
  it("writes llms artifacts and index metadata when enabled", async () => {
    const fixture = await setupFixture();
    const config = createConfig(fixture, true);
    const workspace = await prepareWorkspace(config, { mode: "build" });

    try {
      const project = await generateAstroProject(workspace, config);

      await fs.access(path.join(project.projectRoot, "public", "llms.txt"));
      await fs.access(path.join(project.projectRoot, "public", "llms-full.txt"));
      await fs.access(path.join(project.projectRoot, "public", "index.html.md"));
      await fs.access(path.join(project.projectRoot, "public", "guide", "setup", "index.html.md"));
      await fs.access(path.join(project.projectRoot, "public", "api-reference", "introduction", "index.html.md"));

      const llmsTxt = await fs.readFile(path.join(project.projectRoot, "public", "llms.txt"), "utf8");
      const llmsFull = await fs.readFile(path.join(project.projectRoot, "public", "llms-full.txt"), "utf8");
      expect(llmsTxt).toContain("/guide/setup/index.html.md");
      expect(llmsFull).toContain("https://docs.example.com/project-docs/guide/setup");

      const llmsIndexRaw = await fs.readFile(
        path.join(project.projectRoot, "src", "generated", "llms-index.json"),
        "utf8"
      );
      const llmsIndex = JSON.parse(llmsIndexRaw) as {
        enabled: boolean;
        siteMarkdownPath: string;
        pageMarkdownByPath: Record<string, string>;
      };

      expect(llmsIndex.enabled).toBe(true);
      expect(llmsIndex.siteMarkdownPath).toBe("/llms-full.txt");
      expect(llmsIndex.pageMarkdownByPath["/"]).toBe("/index.html.md");
      expect(llmsIndex.pageMarkdownByPath["/guide/setup"]).toBe("/guide/setup/index.html.md");
      expect(llmsIndex.pageMarkdownByPath["/api-reference/introduction"]).toBe(
        "/api-reference/introduction/index.html.md"
      );
    } finally {
      await cleanupWorkspace(workspace.rootDir);
    }
  });

  it("skips llms artifacts and writes disabled index metadata when disabled", async () => {
    const fixture = await setupFixture();
    const config = createConfig(fixture, false);
    const workspace = await prepareWorkspace(config, { mode: "build" });

    try {
      const project = await generateAstroProject(workspace, config);

      await expect(fs.access(path.join(project.projectRoot, "public", "llms.txt"))).rejects.toThrow();
      await expect(fs.access(path.join(project.projectRoot, "public", "llms-full.txt"))).rejects.toThrow();

      const llmsIndexRaw = await fs.readFile(
        path.join(project.projectRoot, "src", "generated", "llms-index.json"),
        "utf8"
      );
      const llmsIndex = JSON.parse(llmsIndexRaw) as {
        enabled: boolean;
        siteMarkdownPath: string;
        pageMarkdownByPath: Record<string, string>;
      };

      expect(llmsIndex.enabled).toBe(false);
      expect(llmsIndex.siteMarkdownPath).toBe("");
      expect(Object.keys(llmsIndex.pageMarkdownByPath)).toHaveLength(0);
    } finally {
      await cleanupWorkspace(workspace.rootDir);
    }
  });
});
