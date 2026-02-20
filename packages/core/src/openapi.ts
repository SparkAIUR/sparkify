import fs from "node:fs/promises";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import YAML from "yaml";
import { ExitCode, SparkifyError } from "./errors.js";
import type { ApiMode, DocsJson, OpenApiBundle, OpenApiConfigEntry, OpenApiOperation } from "./types.js";
import { collectNavigationOpenApiSources } from "./docs-json.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function loadSource(cwd: string, source: string): Promise<string> {
  if (isHttpUrl(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new SparkifyError(
        `OpenAPI download failed for ${source}: ${response.status} ${response.statusText}`,
        ExitCode.InvalidOpenApi
      );
    }

    return response.text();
  }

  const absolutePath = path.isAbsolute(source) ? source : path.resolve(cwd, source);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    throw new SparkifyError(
      `Unable to read OpenAPI source at ${absolutePath}: ${err.message}`,
      ExitCode.InvalidOpenApi
    );
  }
}

function parseSource(raw: string, source: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(raw);
  }

  try {
    return YAML.parse(raw);
  } catch (error) {
    throw new SparkifyError(
      `OpenAPI source ${source} is neither valid JSON nor YAML: ${(error as Error).message}`,
      ExitCode.InvalidOpenApi
    );
  }
}

function countOperations(schema: any): number {
  if (!schema?.paths || typeof schema.paths !== "object") {
    return 0;
  }

  let count = 0;
  for (const entry of Object.values(schema.paths)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    for (const method of HTTP_METHODS) {
      if ((entry as Record<string, unknown>)[method]) {
        count += 1;
      }
    }
  }

  return count;
}

function normalizeServerUrl(schema: any, configuredServerUrl?: string): string | undefined {
  if (configuredServerUrl) {
    schema.servers = [{ url: configuredServerUrl }];
    return configuredServerUrl;
  }

  const candidate = schema?.servers?.[0]?.url;
  return typeof candidate === "string" ? candidate : undefined;
}

function toApiRoot(apiRoot: string): string {
  const prefixed = apiRoot.startsWith("/") ? apiRoot : `/${apiRoot}`;
  return prefixed.endsWith("/") && prefixed !== "/" ? prefixed.slice(0, -1) : prefixed;
}

function buildOperationPages(schema: any, apiRoot: string): OpenApiOperation[] {
  const pages: OpenApiOperation[] = [];
  const usedPaths = new Set<string>();
  const normalizedApiRoot = toApiRoot(apiRoot).replace(/^\//, "");
  const paths = schema?.paths as Record<string, Record<string, any>> | undefined;
  if (!paths) {
    return pages;
  }

  for (const [rawPath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object") {
        continue;
      }

      const tag = typeof operation.tags?.[0] === "string" ? operation.tags[0] : "General";
      const tagSlug = slugify(tag) || "general";
      const idBase = slugify(operation.operationId || `${method}-${rawPath}`) || `${method}-endpoint`;
      let pagePath = `${normalizedApiRoot}/${tagSlug}/${idBase}`;
      let suffix = 2;
      while (usedPaths.has(pagePath)) {
        pagePath = `${normalizedApiRoot}/${tagSlug}/${idBase}-${suffix}`;
        suffix += 1;
      }
      usedPaths.add(pagePath);

      pages.push({
        id: operation.operationId ?? `${method.toUpperCase()} ${rawPath}`,
        method: method.toUpperCase(),
        path: rawPath,
        summary:
          (typeof operation.summary === "string" && operation.summary.trim()) ||
          `${method.toUpperCase()} ${rawPath}`,
        description: typeof operation.description === "string" ? operation.description : undefined,
        tag,
        pagePath
      });
    }
  }

  return pages.sort((left, right) => {
    if (left.tag !== right.tag) {
      return left.tag.localeCompare(right.tag);
    }
    if (left.path !== right.path) {
      return left.path.localeCompare(right.path);
    }
    return left.method.localeCompare(right.method);
  });
}

export interface ResolveOpenApiOptions {
  docsJson: DocsJson;
  workspaceDir: string;
  docsDir: string;
  entries: OpenApiConfigEntry[];
  configuredServerUrl?: string;
  apiMode?: ApiMode;
  apiRoot?: string;
}

function dedupeEntries(entries: OpenApiConfigEntry[]): OpenApiConfigEntry[] {
  const seen = new Set<string>();
  const result: OpenApiConfigEntry[] = [];

  for (const entry of entries) {
    const signature = `${entry.id}::${entry.source}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    result.push(entry);
  }

  return result;
}

function deriveNavigationEntries(docsJson: DocsJson, defaultRoute: string): OpenApiConfigEntry[] {
  return collectNavigationOpenApiSources(docsJson).map((source) => ({
    id: slugify(path.basename(source).replace(/\.(json|yaml|yml)$/i, "")) || "api",
    source,
    route: defaultRoute,
    title: "API Reference"
  }));
}

export async function resolveOpenApiBundles(options: ResolveOpenApiOptions): Promise<OpenApiBundle[]> {
  const apiMode = options.apiMode ?? "endpoint-pages";
  const apiRoot = options.apiRoot ?? "/api-reference";
  const defaultRoute = apiMode === "single-page" ? "/api" : apiRoot;
  const combinedEntries = dedupeEntries([
    ...options.entries,
    ...deriveNavigationEntries(options.docsJson, defaultRoute)
  ]);

  if (combinedEntries.length === 0) {
    return [];
  }

  const outputDir = path.join(options.workspaceDir, "openapi");
  await fs.mkdir(outputDir, { recursive: true });

  const bundles: OpenApiBundle[] = [];

  for (const entry of combinedEntries) {
    try {
      const raw = await loadSource(options.docsDir, entry.source);
      const parsed = parseSource(raw, entry.source);
      const validated = (await SwaggerParser.validate(parsed as any)) as any;
      const serverUrl = normalizeServerUrl(validated, options.configuredServerUrl);
      const bundlePath = path.join(outputDir, `${slugify(entry.id) || "api"}.json`);
      const operationPages = apiMode === "endpoint-pages" ? buildOperationPages(validated, apiRoot) : [];

      await fs.writeFile(bundlePath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");

      bundles.push({
        id: entry.id,
        source: entry.source,
        route: entry.route ?? defaultRoute,
        title: entry.title ?? "API Reference",
        outputAbsolutePath: bundlePath,
        operations: countOperations(validated),
        operationPages,
        serverUrl
      });
    } catch (error) {
      if (error instanceof SparkifyError) {
        throw error;
      }

      throw new SparkifyError(
        `OpenAPI validation failed for ${entry.source}: ${(error as Error).message}`,
        ExitCode.InvalidOpenApi
      );
    }
  }

  return bundles;
}

