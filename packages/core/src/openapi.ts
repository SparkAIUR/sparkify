import fs from "node:fs/promises";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import YAML from "yaml";
import { ExitCode, SparkifyError } from "./errors.js";
import type { DocsJson, OpenApiBundle, OpenApiConfigEntry } from "./types.js";
import { collectNavigationOpenApiSources } from "./docs-json.js";

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

  const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
  let count = 0;

  for (const entry of Object.values(schema.paths)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    for (const method of methods) {
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

export interface ResolveOpenApiOptions {
  docsJson: DocsJson;
  workspaceDir: string;
  docsDir: string;
  entries: OpenApiConfigEntry[];
  configuredServerUrl?: string;
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

function deriveNavigationEntries(docsJson: DocsJson): OpenApiConfigEntry[] {
  return collectNavigationOpenApiSources(docsJson).map((source) => ({
    id: slugify(path.basename(source).replace(/\.(json|yaml|yml)$/i, "")) || "api",
    source,
    route: "/api",
    title: "API Reference"
  }));
}

export async function resolveOpenApiBundles(options: ResolveOpenApiOptions): Promise<OpenApiBundle[]> {
  const combinedEntries = dedupeEntries([...options.entries, ...deriveNavigationEntries(options.docsJson)]);

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

      await fs.writeFile(bundlePath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");

      bundles.push({
        id: entry.id,
        source: entry.source,
        route: entry.route ?? "/api",
        title: entry.title ?? "API Reference",
        outputAbsolutePath: bundlePath,
        operations: countOperations(validated),
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
