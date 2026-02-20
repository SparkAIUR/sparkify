import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cleanupWorkspace, prepareWorkspace } from "../../src/workspace.js";
import type { SparkifyConfigV1 } from "../../src/types.js";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function setupDocsFixture(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkify-workspace-fixture-"));
  await fs.mkdir(path.join(dir, "docs"), { recursive: true });
  await fs.writeFile(path.join(dir, "docs/index.mdx"), "# Home\n", "utf8");
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "workspace-fixture" }), "utf8");
  return path.join(dir, "docs");
}

describe("prepareWorkspace", () => {
  it("produces stable generated docs.json and page map", async () => {
    const docsDir = await setupDocsFixture();
    const config: SparkifyConfigV1 = {
      docsDir,
      outDir: path.join(path.dirname(docsDir), "dist"),
      base: "",
      autoNav: true,
      writeDocsJson: false,
      exclude: [],
      dirTitleMap: {},
      openapi: [],
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

    const first = await prepareWorkspace(config, { mode: "build" });
    const second = await prepareWorkspace(config, { mode: "build" });

    const firstDocs = await fs.readFile(path.join(first.docsDir, "docs.json"), "utf8");
    const secondDocs = await fs.readFile(path.join(second.docsDir, "docs.json"), "utf8");

    expect(hash(firstDocs)).toBe(hash(secondDocs));
    expect(first.pages.map((page) => page.pagePath)).toEqual(second.pages.map((page) => page.pagePath));

    await cleanupWorkspace(first.rootDir);
    await cleanupWorkspace(second.rootDir);
  });
});
