import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  extractPageTitle,
  generateDocsJson,
  isOperationReference,
  listMdxPages,
  loadDocsConfig,
  writeDocsJson
} from "./docs-json.js";
import { ExitCode, SparkifyError } from "./errors.js";
import { exportOpenApiFromFastApi } from "./fastapi.js";
import { resolveOpenApiBundles } from "./openapi.js";
import type {
  DocsJson,
  DocsNavigationGroup,
  DocsNavigationItem,
  OpenApiBundle,
  OpenApiConfigEntry,
  PreparedWorkspace,
  SparkifyConfigV1,
  WorkspacePage
} from "./types.js";

function normalizeRoutePath(route: string): string {
  const trimmed = route.trim();
  const withoutLeading = trimmed.replace(/^\/+/, "");
  return withoutLeading.replace(/\/+$/, "");
}

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

  const defaultRoute = config.api.mode === "single-page" ? "/api" : config.api.apiRoot;
  return [
    {
      id: "api",
      source: fastApiSource,
      route: defaultRoute,
      title: "API Reference"
    }
  ];
}

function toOperationReferenceKey(method: string, routePath: string): string {
  return `${method.toUpperCase()} ${routePath}`.trim();
}

function buildOperationReferenceMap(bundles: OpenApiBundle[]): Map<string, string> {
  const operationMap = new Map<string, string>();
  for (const bundle of bundles) {
    for (const operation of bundle.operationPages) {
      operationMap.set(toOperationReferenceKey(operation.method, operation.path), operation.pagePath);
    }
  }
  return operationMap;
}

function rewriteOperationReferencesInItems(
  items: DocsNavigationItem[] | undefined,
  operationMap: Map<string, string>,
  unresolved: string[]
): void {
  if (!items) {
    return;
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (typeof item === "string") {
      if (!isOperationReference(item)) {
        continue;
      }

      const normalizedRef = item.trim().replace(/\s+/g, " ");
      const resolvedPage = operationMap.get(normalizedRef);
      if (!resolvedPage) {
        unresolved.push(normalizedRef);
        continue;
      }

      items[index] = resolvedPage;
      continue;
    }

    rewriteOperationReferencesInItems(item.pages, operationMap, unresolved);
  }
}

function rewriteOperationReferences(docsJson: DocsJson, bundles: OpenApiBundle[]): void {
  const operationMap = buildOperationReferenceMap(bundles);
  const unresolved: string[] = [];

  for (const group of docsJson.navigation) {
    rewriteOperationReferencesInItems(group.pages, operationMap, unresolved);
  }

  if (unresolved.length > 0) {
    const sample = unresolved.slice(0, 5).join(", ");
    throw new SparkifyError(
      `docs navigation references unknown OpenAPI operations: ${sample}`,
      ExitCode.InvalidDocsJson
    );
  }
}

function hasApiReferenceNavigation(docsJson: DocsJson, apiRootPath: string): boolean {
  const stack: DocsNavigationItem[] = [];
  for (const group of docsJson.navigation) {
    if (group.openapi) {
      return true;
    }
    if (group.pages) {
      stack.push(...group.pages);
    }
  }

  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) {
      continue;
    }

    if (typeof item === "string") {
      if (item === apiRootPath || item.startsWith(`${apiRootPath}/`)) {
        return true;
      }
      continue;
    }

    if (item.pages) {
      stack.push(...item.pages);
    }
  }

  return false;
}

function buildGeneratedApiNavigation(apiRootPath: string, bundles: OpenApiBundle[]): DocsNavigationGroup[] {
  const introGroup: DocsNavigationGroup = {
    group: "API Documentation",
    pages: [`${apiRootPath}/introduction`]
  };

  const groupedByTag = new Map<string, string[]>();
  for (const bundle of bundles) {
    for (const operation of bundle.operationPages) {
      const pages = groupedByTag.get(operation.tag) ?? [];
      pages.push(operation.pagePath);
      groupedByTag.set(operation.tag, pages);
    }
  }

  const endpointGroups = [...groupedByTag.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tag, pages]) => ({
      group: `${tag} Endpoints`,
      pages
    }));

  return [introGroup, ...endpointGroups];
}

function escapeFrontmatterString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function escapeMdxText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}");
}

function renderApiIntroductionPage(bundle: OpenApiBundle): string {
  return `---
title: "API Introduction"
description: "Generated API reference overview"
---

# API Introduction

This section is generated from the OpenAPI source \`${escapeMdxText(bundle.source)}\`.

- Operations: **${bundle.operations}**
- Playground: [Open interactive API reference](../)
`;
}

function renderHomePage(bundles: OpenApiBundle[]): string {
  const operationCount = bundles.reduce((sum, bundle) => sum + bundle.operations, 0);
  return `---
title: "Introduction"
description: "Generated developer documentation overview"
---

# Introduction

This site was generated by sparkify from OpenAPI input.

- API specifications: **${bundles.length}**
- Operations detected: **${operationCount}**

## Next steps

- Read the [API Introduction](./api-reference/introduction)
- Open the [interactive API playground](./api-reference)
`;
}

function renderEndpointPage(bundle: OpenApiBundle, operation: OpenApiBundle["operationPages"][number]): string {
  const safeSummary = escapeMdxText(operation.summary);
  const safeTag = escapeMdxText(operation.tag);
  const safeOperationRef = escapeMdxText(`${operation.method} ${operation.path}`);
  const lines: string[] = [
    "---",
    `title: "${escapeFrontmatterString(operation.summary)}"`,
    "description: \"Generated from OpenAPI\"",
    "---",
    "",
    `# ${safeSummary}`,
    "",
    `\`${safeOperationRef}\``,
    "",
    `Tag: **${safeTag}**`,
    ""
  ];

  if (operation.description) {
    lines.push(escapeMdxText(operation.description), "");
  }

  lines.push(
    "## Try It",
    "",
    `Use the [interactive API playground](../../) and select \`${safeOperationRef}\`.`,
    "",
    "## cURL",
    "",
    "```bash",
    `curl -X ${operation.method} '${bundle.serverUrl ?? "https://api.example.com"}${operation.path}'`,
    "```",
    ""
  );

  return lines.join("\n");
}

async function writeGeneratedPage(
  workspaceDocsDir: string,
  pagePath: string,
  content: string,
  methodBadge?: string
): Promise<WorkspacePage> {
  const relativePath = path.join("_sparkify-generated", `${pagePath}.mdx`).split(path.sep).join("/");
  const absolutePath = path.join(workspaceDocsDir, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${content.trimEnd()}\n`, "utf8");

  return {
    sourceAbsolutePath: absolutePath,
    relativePath,
    pagePath,
    title: extractPageTitle(content, pagePath),
    generated: true,
    methodBadge
  };
}

async function generateEndpointPages(
  workspaceDocsDir: string,
  apiRootPath: string,
  bundles: OpenApiBundle[],
  existingPageSet: Set<string>
): Promise<WorkspacePage[]> {
  const pages: WorkspacePage[] = [];

  for (const bundle of bundles) {
    const introPath = `${apiRootPath}/introduction`;
    if (!existingPageSet.has(introPath)) {
      pages.push(await writeGeneratedPage(workspaceDocsDir, introPath, renderApiIntroductionPage(bundle)));
      existingPageSet.add(introPath);
    }

    for (const operation of bundle.operationPages) {
      if (existingPageSet.has(operation.pagePath)) {
        continue;
      }

      pages.push(
        await writeGeneratedPage(
          workspaceDocsDir,
          operation.pagePath,
          renderEndpointPage(bundle, operation),
          operation.method
        )
      );
      existingPageSet.add(operation.pagePath);
    }
  }

  return pages.sort((left, right) => left.pagePath.localeCompare(right.pagePath));
}

function collectNavigationRefs(items: DocsNavigationItem[] | undefined, output: string[]): void {
  if (!items) {
    return;
  }

  for (const item of items) {
    if (typeof item === "string") {
      output.push(item);
    } else {
      collectNavigationRefs(item.pages, output);
    }
  }
}

async function validateNavigationReferences(
  docsJson: DocsJson,
  pageSet: Set<string>
): Promise<void> {
  const refs: string[] = [];
  for (const group of docsJson.navigation) {
    collectNavigationRefs(group.pages, refs);
  }

  for (const ref of refs) {
    if (isOperationReference(ref)) {
      throw new SparkifyError(
        `docs navigation reference '${ref}' was not resolved to a generated endpoint page.`,
        ExitCode.InvalidDocsJson
      );
    }

    if (!pageSet.has(ref)) {
      throw new SparkifyError(
        `docs navigation references '${ref}', but that page does not exist as an .mdx file.`,
        ExitCode.InvalidDocsJson
      );
    }
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
  const apiRootPath = normalizeRoutePath(config.api.apiRoot || "/api-reference");

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

  const discoveredDocs = await loadDocsConfig(workspaceDocsDir, {
    preferDocsJson: config.compat.preferDocsJson,
    allowMintJson: config.compat.allowMintJson
  });

  let docsJson = discoveredDocs.config;
  let docsConfigSource = discoveredDocs.source;
  let docsConfigPath = discoveredDocs.sourcePath;
  const docsConfigWarnings = [...discoveredDocs.warnings];

  if (!docsJson) {
    if (!config.autoNav) {
      throw new SparkifyError(
        "No docs.json or mint.json found and autoNav=false. Add one of these files or enable autoNav.",
        ExitCode.InvalidDocsJson
      );
    }

    docsJson = await generateDocsJson({
      docsDir: workspaceDocsDir,
      excludePatterns: config.exclude,
      dirTitleMap: config.dirTitleMap,
      allowEmpty: config.openapi.length > 0 || Boolean(config.fastapi)
    });

    docsConfigSource = "generated";
    docsConfigPath = path.join(workspaceDocsDir, "docs.json");
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

  const openapiEntries = ensureOpenApiEntries(config, fastApiSource);
  const openapiBundles = await resolveOpenApiBundles({
    docsJson,
    workspaceDir: rootDir,
    docsDir: workspaceDocsDir,
    entries: openapiEntries,
    configuredServerUrl: config.playground.serverUrl ?? config.fastapi?.serverUrl,
    apiMode: config.api.mode,
    apiRoot: config.api.apiRoot
  });

  if (config.api.mode === "endpoint-pages" && openapiBundles.length > 0) {
    rewriteOperationReferences(docsJson, openapiBundles);

    const existingPageSet = new Set(pages.map((page) => page.pagePath));
    if (config.api.generateMissingEndpointPages && !existingPageSet.has("index")) {
      pages.push(await writeGeneratedPage(workspaceDocsDir, "index", renderHomePage(openapiBundles)));
      existingPageSet.add("index");
    }

    const generatedPages = await generateEndpointPages(workspaceDocsDir, apiRootPath, openapiBundles, existingPageSet);

    if (config.api.generateMissingEndpointPages) {
      pages.push(...generatedPages);
    }

    if (!docsJson.navigation.some((group) => group.pages?.includes("index"))) {
      docsJson.navigation.unshift({
        group: "Getting Started",
        pages: ["index"]
      });
    }

    if (!hasApiReferenceNavigation(docsJson, apiRootPath)) {
      docsJson.navigation.push(...buildGeneratedApiNavigation(apiRootPath, openapiBundles));
    }
  }

  const pageSet = new Set(pages.map((page) => page.pagePath));
  await validateNavigationReferences(docsJson, pageSet);

  if (options.debug) {
    console.log(`[debug] Workspace prepared at ${rootDir}`);
    console.log(`[debug] Docs config source: ${docsConfigSource}${docsConfigPath ? ` (${docsConfigPath})` : ""}`);
  }

  return {
    rootDir,
    docsDir: workspaceDocsDir,
    docsJson,
    docsConfigSource,
    docsConfigPath,
    docsConfigWarnings: [...docsConfigWarnings, ...(docsJson.warnings ?? []), ...(docsJson.unknownFields ?? []).map(
      (field) => `Unsupported top-level field '${field}' in docs config.`
    )],
    pages: pages.sort((left, right) => left.pagePath.localeCompare(right.pagePath)),
    openapiBundles
  };
}

export async function cleanupWorkspace(rootDir: string): Promise<void> {
  await fs.rm(rootDir, { recursive: true, force: true });
}
