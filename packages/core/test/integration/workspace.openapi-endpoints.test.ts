import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupWorkspace, prepareWorkspace } from "../../src/workspace.js";
import type { SparkifyConfigV1 } from "../../src/types.js";

async function setupOpenApiOnlyFixture(): Promise<{ docsDir: string; openApiPath: string; rootDir: string }> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkify-openapi-fixture-"));
  const docsDir = path.join(rootDir, "docs");
  await fs.mkdir(docsDir, { recursive: true });

  const openApiPath = path.join(docsDir, "openapi.json");
  await fs.writeFile(
    openApiPath,
    JSON.stringify(
      {
        openapi: "3.1.0",
        info: { title: "Fixture API", version: "1.0.0" },
        paths: {
          "/fraud/check": {
            get: {
              summary: "Check Fraud",
              tags: ["Fraud"]
            }
          },
          "/fraud/report": {
            post: {
              summary: "Create Fraud Report",
              tags: ["Fraud"]
            }
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  return { docsDir, openApiPath, rootDir };
}

describe("prepareWorkspace endpoint pages", () => {
  it("generates api introduction and endpoint pages for openapi-only sources", async () => {
    const fixture = await setupOpenApiOnlyFixture();
    const config: SparkifyConfigV1 = {
      docsDir: fixture.docsDir,
      outDir: path.join(fixture.rootDir, "dist"),
      base: "",
      autoNav: true,
      writeDocsJson: false,
      exclude: [],
      dirTitleMap: {},
      openapi: [
        {
          id: "api",
          source: fixture.openApiPath
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
        enabled: true
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

    const workspace = await prepareWorkspace(config, { mode: "build" });

    expect(workspace.docsConfigSource).toBe("generated");
    expect(workspace.pages.some((page) => page.pagePath === "api-reference/introduction")).toBe(true);
    expect(workspace.pages.filter((page) => page.pagePath.startsWith("api-reference/fraud/")).length).toBe(2);
    expect(workspace.pages.some((page) => page.methodBadge === "GET")).toBe(true);
    expect(workspace.pages.some((page) => page.methodBadge === "POST")).toBe(true);
    expect(workspace.docsJson.navigation.some((group) => group.group === "API Documentation")).toBe(true);

    await cleanupWorkspace(workspace.rootDir);
  });
});
