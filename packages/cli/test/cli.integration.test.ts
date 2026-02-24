import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

  it("returns non-zero when doctor finds errors", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sparkify-doctor-test-"));
    const missingDocsDir = path.join(cwd, "missing-docs");

    const exitCode = await runCli([
      "node",
      "sparkify",
      "doctor",
      "--docs-dir",
      missingDocsDir
    ]);

    expect(exitCode).toBe(1);
  });

  it("prints package version from package.json", async () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(testDir, "..", "..", "..");
    const packageJsonPath = path.resolve(testDir, "..", "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as { version: string };

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "packages/cli/src/bin.ts", "--version"],
      { cwd: repoRoot, encoding: "utf8" }
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });
});
