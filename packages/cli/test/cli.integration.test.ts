import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

describe("CLI integration", () => {
  it("scaffolds docs on init", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sparkify-cli-test-"));
    const docsDir = path.join(cwd, "docs");

    const originalCwd = process.cwd();
    process.chdir(cwd);

    try {
      const exitCode = await runCli([
        "node",
        "sparkify",
        "init",
        "--docs-dir",
        docsDir,
        "--project-name",
        "Fixture"
      ]);
      expect(exitCode).toBe(0);
      await fs.access(path.join(docsDir, "index.mdx"));
      await fs.access(path.join(docsDir, "docs.json"));
      await fs.access(path.join(cwd, "sparkify.config.json"));
    } finally {
      process.chdir(originalCwd);
    }
  });
});
