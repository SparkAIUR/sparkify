import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadDocsConfig } from "./docs-json.js";
import { resolveOpenApiBundles } from "./openapi.js";
import type { DocsJson, DoctorReport, SparkifyConfigV1 } from "./types.js";

function validateNodeVersion(report: DoctorReport): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major < 20) {
    report.errors.push(`Node ${process.versions.node} detected. sparkify requires Node 20+.`);
  } else {
    report.info.push(`Node ${process.versions.node} is supported.`);
  }
}

async function validateDocsDir(
  config: SparkifyConfigV1,
  report: DoctorReport
): Promise<DocsJson | null> {
  try {
    const stat = await fs.stat(config.docsDir);
    if (!stat.isDirectory()) {
      report.errors.push(`docsDir '${config.docsDir}' is not a directory.`);
      return null;
    }
    report.info.push(`docsDir found: ${config.docsDir}`);
  } catch {
    report.errors.push(`docsDir '${config.docsDir}' does not exist.`);
    return null;
  }

  const discovered = await loadDocsConfig(config.docsDir, {
    preferDocsJson: config.compat.preferDocsJson,
    allowMintJson: config.compat.allowMintJson
  });

  if (discovered.config) {
    const sourcePath = discovered.sourcePath ? ` (${discovered.sourcePath})` : "";
    report.info.push(`Docs config source: ${discovered.source}${sourcePath}`);
    for (const warning of discovered.warnings) {
      report.warnings.push(`Docs config: ${warning}`);
    }
    for (const field of discovered.unknownFields) {
      report.warnings.push(`Unsupported docs config field '${field}' will be ignored.`);
    }
    return discovered.config;
  }

  if (config.autoNav) {
    report.warnings.push("No docs.json or mint.json found. docs config will be auto-generated during build.");
    return null;
  }

  report.errors.push("No docs.json or mint.json found and autoNav=false.");
  return null;
}

async function validateOpenApi(config: SparkifyConfigV1, docsJson: DocsJson | null, report: DoctorReport): Promise<void> {
  const effectiveDocsJson: DocsJson = docsJson ?? {
    theme: "mint",
    name: "sparkify",
    navigation: []
  };

  try {
    const bundles = await resolveOpenApiBundles({
      docsJson: effectiveDocsJson,
      workspaceDir: path.join(config.docsDir, ".sparkify-doctor"),
      docsDir: config.docsDir,
      entries: config.openapi,
      configuredServerUrl: config.playground.serverUrl,
      apiMode: config.api.mode,
      apiRoot: config.api.apiRoot
    });

    if (bundles.length === 0) {
      report.warnings.push("No OpenAPI sources configured.");
      return;
    }

    for (const bundle of bundles) {
      report.info.push(
        `OpenAPI '${bundle.id}' validated (${bundle.operations} operations, ${bundle.operationPages.length} endpoint pages).`
      );
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
  report.info.push(`API mode: ${config.api.mode} (root: ${config.api.apiRoot})`);
  report.info.push(`Renderer: ${config.renderer.engine}`);

  const docsJson = await validateDocsDir(config, report);
  validatePython(config, report);
  await validateOpenApi(config, docsJson, report);

  return report;
}

