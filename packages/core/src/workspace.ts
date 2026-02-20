import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  extractPageTitle,
  generateDocsJson,
  isOperationReference,
  listMdxPages,
  loadDocsJson,
  writeDocsJson
} from "./docs-json.js";
import { ExitCode, SparkifyError } from "./errors.js";
import { exportOpenApiFromFastApi } from "./fastapi.js";
import { resolveOpenApiBundles } from "./openapi.js";
import type { OpenApiConfigEntry, PreparedWorkspace, SparkifyConfigV1, WorkspacePage } from "./types.js";

function sanitizeFastApiExportRelativePath(config: SparkifyConfigV1): string {
  const configuredExportPath = config.fastapi?.exportPath ?? path.join(config.docsDir, "openapi.json");
  const relative = path.relative(config.docsDir, configuredExportPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return "openapi.json";
  }

  return relative;
}

function ensureOpenApiEntries(config: SparkifyConfigV1, fastApiSource?: string): OpenApiConfigEntry[] {
  if (config.openapi.length > 0) {
    return config.openapi;
  }

  if (!fastApiSource) {
    return [];
  }

  return [
    {
      id: "api",
      source: fastApiSource,
      route: "/api",
      title: "API Reference"
    }
  ];
}

async function validateNavigationReferences(
  docsJson: { navigation: Array<{ pages?: Array<string | Record<string, unknown>> }> },
  pageSet: Set<string>
): Promise<void> {
  const visit = (items: Array<string | Record<string, unknown>> | undefined): void => {
    if (!items) {
      return;
    }

    for (const item of items) {
      if (typeof item === "string") {
        if (!isOperationReference(item) && !pageSet.has(item)) {
          throw new SparkifyError(
            `docs.json navigation references '${item}', but that page does not exist as an .mdx file.`,
            ExitCode.InvalidDocsJson
          );
        }
        continue;
      }

      const nested = (item as { pages?: Array<string | Record<string, unknown>> }).pages;
      visit(nested);
    }
  };

  for (const group of docsJson.navigation) {
    visit(group.pages);
  }
}

export interface PrepareWorkspaceOptions {
  mode: "build" | "dev";
  debug?: boolean;
}

export async function prepareWorkspace(
  config: SparkifyConfigV1,
  options: PrepareWorkspaceOptions
): Promise<PreparedWorkspace> {
  let rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkify-workspace-"));
  rootDir = await fs.realpath(rootDir);
  const workspaceDocsDir = path.join(rootDir, "docs");
  const sourceRoot = path.resolve(config.docsDir, "..");

  await fs.cp(config.docsDir, workspaceDocsDir, { recursive: true });

  for (const candidate of ["package.json", "pyproject.toml"]) {
    const sourcePath = path.join(sourceRoot, candidate);
    const destinationPath = path.join(rootDir, candidate);
    try {
      await fs.copyFile(sourcePath, destinationPath);
    } catch {
      // Ignore missing optional metadata files.
    }
  }

  let docsJson = await loadDocsJson(workspaceDocsDir);

  if (!docsJson) {
    if (!config.autoNav) {
      throw new SparkifyError(
        "docs.json is missing and autoNav=false. Add docs.json or enable autoNav.",
        ExitCode.InvalidDocsJson
      );
    }

    docsJson = await generateDocsJson({
      docsDir: workspaceDocsDir,
      excludePatterns: config.exclude,
      dirTitleMap: config.dirTitleMap
    });
    await writeDocsJson(workspaceDocsDir, docsJson);

    if (config.writeDocsJson) {
      await writeDocsJson(config.docsDir, docsJson);
    }
  }

  let fastApiSource: string | undefined;
  if (config.fastapi) {
    const relativeExportPath = sanitizeFastApiExportRelativePath(config);
    const workspaceExportPath = path.join(workspaceDocsDir, relativeExportPath);

    await exportOpenApiFromFastApi({
      app: config.fastapi.app,
      outPath: workspaceExportPath,
      python: config.fastapi.python,
      serverUrl: config.fastapi.serverUrl,
      envFile: config.fastapi.envFile,
      cwd: config.fastapi.cwd,
      pythonPath: config.fastapi.pythonPath
    });

    fastApiSource = relativeExportPath.split(path.sep).join("/");
  }

  const mdxFiles = await listMdxPages(workspaceDocsDir, config.exclude);
  const pages: WorkspacePage[] = [];

  for (const entry of mdxFiles) {
    const absolutePath = path.join(workspaceDocsDir, entry.relativePath);
    const content = await fs.readFile(absolutePath, "utf8");
    pages.push({
      sourceAbsolutePath: absolutePath,
      relativePath: entry.relativePath,
      pagePath: entry.pagePath,
      title: extractPageTitle(content, entry.pagePath)
    });
  }

  const pageSet = new Set(pages.map((page) => page.pagePath));
  await validateNavigationReferences(docsJson as any, pageSet);

  const openapiEntries = ensureOpenApiEntries(config, fastApiSource);
  const openapiBundles = await resolveOpenApiBundles({
    docsJson,
    workspaceDir: rootDir,
    docsDir: workspaceDocsDir,
    entries: openapiEntries,
    configuredServerUrl: config.playground.serverUrl ?? config.fastapi?.serverUrl
  });

  if (options.debug) {
    console.log(`[debug] Workspace prepared at ${rootDir}`);
  }

  return {
    rootDir,
    docsDir: workspaceDocsDir,
    docsJson,
    pages,
    openapiBundles
  };
}

export async function cleanupWorkspace(rootDir: string): Promise<void> {
  await fs.rm(rootDir, { recursive: true, force: true });
}
