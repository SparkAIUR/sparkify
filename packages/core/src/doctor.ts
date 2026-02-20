import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadDocsJson } from "./docs-json.js";
import { resolveOpenApiBundles } from "./openapi.js";
import type { DoctorReport, SparkifyConfigV1 } from "./types.js";

function validateNodeVersion(report: DoctorReport): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major < 20) {
    report.errors.push(`Node ${process.versions.node} detected. sparkify requires Node 20+.`);
  } else {
    report.info.push(`Node ${process.versions.node} is supported.`);
  }
}

async function validateDocsDir(config: SparkifyConfigV1, report: DoctorReport): Promise<void> {
  try {
    const stat = await fs.stat(config.docsDir);
    if (!stat.isDirectory()) {
      report.errors.push(`docsDir '${config.docsDir}' is not a directory.`);
      return;
    }
    report.info.push(`docsDir found: ${config.docsDir}`);
  } catch {
    report.errors.push(`docsDir '${config.docsDir}' does not exist.`);
    return;
  }

  const docsJson = await loadDocsJson(config.docsDir);
  if (docsJson) {
    report.info.push("docs.json found and parsed successfully.");
  } else if (config.autoNav) {
    report.warnings.push("docs.json missing. It will be auto-generated during build.");
  } else {
    report.errors.push("docs.json missing and autoNav=false.");
  }
}

async function validateOpenApi(config: SparkifyConfigV1, report: DoctorReport): Promise<void> {
  const docsJson = (await loadDocsJson(config.docsDir)) ?? {
    theme: "mint",
    name: "sparkify",
    navigation: []
  };

  try {
    const bundles = await resolveOpenApiBundles({
      docsJson,
      workspaceDir: path.join(config.docsDir, ".sparkify-doctor"),
      docsDir: config.docsDir,
      entries: config.openapi,
      configuredServerUrl: config.playground.serverUrl
    });

    if (bundles.length === 0) {
      report.warnings.push("No OpenAPI sources configured.");
      return;
    }

    for (const bundle of bundles) {
      report.info.push(`OpenAPI '${bundle.id}' validated (${bundle.operations} operations).`);
    }

    await fs.rm(path.join(config.docsDir, ".sparkify-doctor"), { recursive: true, force: true });
  } catch (error) {
    report.errors.push((error as Error).message);
  }
}

function validatePython(config: SparkifyConfigV1, report: DoctorReport): void {
  if (!config.fastapi) {
    return;
  }

  const pythonCommand = config.fastapi.python ?? "python";
  const version = spawnSync(pythonCommand, ["--version"], {
    encoding: "utf8"
  });

  if (version.status !== 0) {
    report.errors.push(`Python check failed using '${pythonCommand}'.`);
    return;
  }

  const output = `${version.stdout}${version.stderr}`.trim();
  report.info.push(`Python detected: ${output}`);
}

export async function runDoctor(config: SparkifyConfigV1): Promise<DoctorReport> {
  const report: DoctorReport = {
    errors: [],
    warnings: [],
    info: []
  };

  validateNodeVersion(report);
  await validateDocsDir(config, report);
  validatePython(config, report);
  await validateOpenApi(config, report);

  return report;
}
