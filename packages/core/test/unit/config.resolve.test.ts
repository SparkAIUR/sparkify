import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../../src/config.js";

describe("resolveConfig", () => {
  it("applies precedence flags > file > defaults", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sparkify-config-test-"));
    await fs.mkdir(path.join(cwd, "docs"), { recursive: true });

    await fs.writeFile(
      path.join(cwd, "sparkify.config.json"),
      JSON.stringify(
        {
          docsDir: "./docs",
          outDir: "./site",
          base: "/from-file",
          openapi: [{ id: "api", source: "./docs/openapi.json" }]
        },
        null,
        2
      ),
      "utf8"
    );

    const config = await resolveConfig({
      cwd,
      overrides: {
        outDir: "./dist",
        base: "/from-flag"
      }
    });

    expect(config.docsDir).toBe(path.join(cwd, "docs"));
    expect(config.outDir).toBe(path.join(cwd, "dist"));
    expect(config.base).toBe("/from-flag");
    expect(config.openapi[0]?.source).toBe(path.join(cwd, "docs/openapi.json"));
  });
});
