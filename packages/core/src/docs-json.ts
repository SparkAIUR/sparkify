import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { minimatch } from "minimatch";
import { z } from "zod";
import { ExitCode, SparkifyError } from "./errors.js";
import type {
  DocsConfigLoadResult,
  DocsConfigSourceType,
  DocsJson,
  DocsNavigationGroup,
  DocsNavigationItem
} from "./types.js";

const docsGroupSchema: z.ZodType<DocsNavigationGroup> = z.lazy(() =>
  z.object({
    group: z.string(),
    openapi: z.string().optional(),
    pages: z.array(z.union([z.string(), docsGroupSchema])).optional()
  })
);

const topbarLinkSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1)
});

const topbarCtaButtonSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1)
});

const tabSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1)
});

const anchorSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  url: z.string().optional()
});

const docsConfigSchema = z
  .object({
    $schema: z.string().optional(),
    theme: z.string().optional(),
    name: z.string().min(1),
    logo: z
      .union([
        z.string(),
        z.object({
          light: z.string().optional(),
          dark: z.string().optional(),
          href: z.string().optional()
        })
      ])
      .optional(),
    favicon: z.string().optional(),
    colors: z
      .object({
        primary: z.string().optional(),
        light: z.string().optional(),
        dark: z.string().optional(),
        anchors: z
          .object({
            from: z.string().optional(),
            to: z.string().optional()
          })
          .optional()
      })
      .optional(),
    topbarLinks: z.array(topbarLinkSchema).optional(),
    topbarCtaButton: topbarCtaButtonSchema.optional(),
    tabs: z.array(tabSchema).optional(),
    anchors: z.array(anchorSchema).optional(),
    footerSocials: z.record(z.string(), z.string()).optional(),
    navigation: z.array(docsGroupSchema).optional()
  })
  .passthrough();

const KNOWN_TOP_LEVEL_KEYS = new Set([
  "$schema",
  "theme",
  "name",
  "logo",
  "favicon",
  "colors",
  "topbarLinks",
  "topbarCtaButton",
  "tabs",
  "anchors",
  "navigation",
  "footerSocials"
]);

function normalizeRelPath(value: string): string {
  return value.split(path.sep).join("/");
}

function toPagePath(relativePath: string): string {
  return normalizeRelPath(relativePath).replace(/\.mdx$/i, "");
}

function isIgnored(relativePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(relativePath, pattern));
}

function prettyTitle(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

async function inferProjectName(docsDir: string): Promise<string> {
  const workspaceRoot = path.resolve(docsDir, "..");

  try {
    const packageJsonPath = path.join(workspaceRoot, "package.json");
    const packageRaw = await fs.readFile(packageJsonPath, "utf8");
    const packageData = JSON.parse(packageRaw) as { name?: string };
    if (packageData.name) {
      return packageData.name;
    }
  } catch {
    // Ignore, continue inference.
  }

  try {
    const pyprojectPath = path.join(workspaceRoot, "pyproject.toml");
    const pyprojectRaw = await fs.readFile(pyprojectPath, "utf8");
    const projectMatch = pyprojectRaw.match(/^name\s*=\s*"([^"]+)"/m);
    if (projectMatch?.[1]) {
      return projectMatch[1];
    }
  } catch {
    // Ignore, continue inference.
  }

  return path.basename(workspaceRoot);
}

function sortPages(pagePaths: string[]): string[] {
  return pagePaths.sort((left, right) => {
    if (left.endsWith("/index") && !right.endsWith("/index")) {
      return -1;
    }
    if (!left.endsWith("/index") && right.endsWith("/index")) {
      return 1;
    }
    if (left === "index") {
      return -1;
    }
    if (right === "index") {
      return 1;
    }

    return left.localeCompare(right);
  });
}

function buildNavigation(pagePaths: string[], dirTitleMap: Record<string, string>): DocsNavigationGroup[] {
  const rootPages = sortPages(pagePaths.filter((page) => !page.includes("/")));
  const groups: DocsNavigationGroup[] = [];

  if (rootPages.length > 0) {
    groups.push({
      group: "Getting Started",
      pages: rootPages
    });
  }

  const pagesByTopLevel = new Map<string, string[]>();

  for (const pagePath of pagePaths) {
    if (!pagePath.includes("/")) {
      continue;
    }
    const [top] = pagePath.split("/");
    const items = pagesByTopLevel.get(top) ?? [];
    items.push(pagePath);
    pagesByTopLevel.set(top, items);
  }

  for (const [top, pages] of [...pagesByTopLevel.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    groups.push({
      group: dirTitleMap[top] ?? prettyTitle(top),
      pages: sortPages(pages)
    });
  }

  return groups;
}

function normalizeNavigationPages(
  value: unknown,
  warnings: string[]
): Array<string | DocsNavigationGroup> | undefined {
  if (!Array.isArray(value)) {
    if (value !== undefined) {
      warnings.push("navigation.pages should be an array. Ignoring non-array value.");
    }
    return undefined;
  }

  const items: Array<string | DocsNavigationGroup> = [];
  for (const item of value) {
    if (typeof item === "string") {
      items.push(item);
      continue;
    }

    if (item && typeof item === "object") {
      const normalized = normalizeNavigationGroup(item, warnings);
      if (normalized) {
        items.push(normalized);
      }
      continue;
    }
  }

  return items.length > 0 ? items : undefined;
}

function normalizeNavigationGroup(value: unknown, warnings: string[]): DocsNavigationGroup | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const group = typeof raw.group === "string" && raw.group.trim() ? raw.group.trim() : "Documentation";
  const openapi = typeof raw.openapi === "string" && raw.openapi.trim() ? raw.openapi.trim() : undefined;
  const pages = normalizeNavigationPages(raw.pages, warnings);

  if (!pages && !openapi) {
    return null;
  }

  return {
    group,
    openapi,
    pages
  };
}

function normalizeNavigation(value: unknown, warnings: string[]): DocsNavigationGroup[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeNavigationGroup(item, warnings))
      .filter((group): group is DocsNavigationGroup => Boolean(group));
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.groups)) {
      return obj.groups
        .map((item) => normalizeNavigationGroup(item, warnings))
        .filter((group): group is DocsNavigationGroup => Boolean(group));
    }

    // Legacy object form: { "Group Name": ["page-a", "page-b"] }
    const groups: DocsNavigationGroup[] = [];
    for (const [groupName, entry] of Object.entries(obj)) {
      if (groupName === "groups") {
        continue;
      }

      if (Array.isArray(entry)) {
        groups.push({
          group: groupName,
          pages: entry.filter((item): item is string => typeof item === "string")
        });
        continue;
      }

      if (entry && typeof entry === "object") {
        const normalized = normalizeNavigationGroup(
          {
            group: groupName,
            ...(entry as Record<string, unknown>)
          },
          warnings
        );
        if (normalized) {
          groups.push(normalized);
        }
      }
    }
    return groups;
  }

  warnings.push("navigation should be an array/object. Ignoring unsupported navigation value.");
  return [];
}

function normalizeDocsConfig(
  rawValue: unknown,
  source: DocsConfigSourceType,
  sourcePath: string
): DocsConfigLoadResult {
  if (!rawValue || typeof rawValue !== "object") {
    throw new SparkifyError(`Invalid ${source} at ${sourcePath}: expected a JSON object.`, ExitCode.InvalidDocsJson);
  }

  const rawObject = rawValue as Record<string, unknown>;
  const parse = docsConfigSchema.safeParse(rawObject);
  if (!parse.success) {
    throw new SparkifyError(
      `Invalid ${source} at ${sourcePath}: ${parse.error.issues.map((issue) => issue.message).join(", ")}`,
      ExitCode.InvalidDocsJson
    );
  }

  const warnings: string[] = [];
  const navigation = normalizeNavigation(rawObject.navigation, warnings);
  const unknownFields = Object.keys(rawObject).filter((key) => !KNOWN_TOP_LEVEL_KEYS.has(key));

  const docsConfig: DocsJson = {
    $schema: parse.data.$schema,
    theme: parse.data.theme ?? "mint",
    name: parse.data.name,
    logo: parse.data.logo,
    favicon: parse.data.favicon,
    colors: parse.data.colors,
    topbarLinks: parse.data.topbarLinks,
    topbarCtaButton: parse.data.topbarCtaButton,
    tabs: parse.data.tabs,
    anchors: parse.data.anchors,
    footerSocials: parse.data.footerSocials,
    navigation,
    configSource: source,
    configPath: sourcePath,
    warnings,
    unknownFields
  };

  return {
    config: docsConfig,
    source,
    sourcePath,
    warnings,
    unknownFields
  };
}

async function loadJsonConfigAtPath(
  configPath: string,
  source: DocsConfigSourceType
): Promise<DocsConfigLoadResult | null> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeDocsConfig(parsed, source, configPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return null;
    }

    if (error instanceof SparkifyError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      throw new SparkifyError(
        `Unable to parse ${source} at ${configPath}: ${error.message}`,
        ExitCode.InvalidDocsJson
      );
    }

    throw new SparkifyError(
      `Unable to parse ${source} at ${configPath}: ${err.message}`,
      ExitCode.InvalidDocsJson
    );
  }
}

export interface LoadDocsConfigOptions {
  preferDocsJson?: boolean;
  allowMintJson?: boolean;
}

export async function loadDocsConfig(
  docsDir: string,
  options: LoadDocsConfigOptions = {}
): Promise<DocsConfigLoadResult> {
  const preferDocsJson = options.preferDocsJson ?? true;
  const allowMintJson = options.allowMintJson ?? true;
  const docsJsonPath = path.join(docsDir, "docs.json");
  const mintJsonPath = path.join(docsDir, "mint.json");

  const tryDocsJson = async (): Promise<DocsConfigLoadResult | null> =>
    loadJsonConfigAtPath(docsJsonPath, "docs.json");
  const tryMintJson = async (): Promise<DocsConfigLoadResult | null> => {
    if (!allowMintJson) {
      return null;
    }
    return loadJsonConfigAtPath(mintJsonPath, "mint.json");
  };

  const candidates = preferDocsJson ? [tryDocsJson, tryMintJson] : [tryMintJson, tryDocsJson];
  for (const candidate of candidates) {
    const result = await candidate();
    if (result?.config) {
      return result;
    }
  }

  return {
    config: null,
    source: "generated",
    warnings: [],
    unknownFields: []
  };
}

export async function loadDocsJson(docsDir: string): Promise<DocsJson | null> {
  const result = await loadJsonConfigAtPath(path.join(docsDir, "docs.json"), "docs.json");
  return result?.config ?? null;
}

export interface GenerateDocsJsonOptions {
  docsDir: string;
  excludePatterns: string[];
  dirTitleMap: Record<string, string>;
  primaryColor?: string;
  allowEmpty?: boolean;
}

export async function generateDocsJson(options: GenerateDocsJsonOptions): Promise<DocsJson> {
  const files = await fg("**/*.mdx", {
    cwd: options.docsDir,
    dot: false,
    onlyFiles: true
  });

  const pagePaths = files
    .map((file) => normalizeRelPath(file))
    .filter((file) => !isIgnored(file, options.excludePatterns))
    .map((file) => toPagePath(file));

  if (pagePaths.length === 0 && !options.allowEmpty) {
    throw new SparkifyError(
      `No .mdx pages were found in ${options.docsDir}. Create at least an index.mdx page.`,
      ExitCode.InvalidDocsJson
    );
  }

  return {
    $schema: "https://mintlify.com/schema/docs.json",
    theme: "mint",
    name: await inferProjectName(options.docsDir),
    colors: {
      primary: options.primaryColor ?? "#2563eb"
    },
    navigation: buildNavigation(pagePaths, options.dirTitleMap),
    configSource: "generated",
    warnings: [],
    unknownFields: []
  };
}

export async function writeDocsJson(docsDir: string, docsJson: DocsJson): Promise<void> {
  const outputPath = path.join(docsDir, "docs.json");
  await fs.writeFile(outputPath, `${JSON.stringify(docsJson, null, 2)}\n`, "utf8");
}

export async function listMdxPages(
  docsDir: string,
  excludePatterns: string[]
): Promise<Array<{ relativePath: string; pagePath: string }>> {
  const files = await fg("**/*.mdx", {
    cwd: docsDir,
    dot: false,
    onlyFiles: true
  });

  return files
    .map((relativePath) => normalizeRelPath(relativePath))
    .filter((relativePath) => !isIgnored(relativePath, excludePatterns))
    .map((relativePath) => ({
      relativePath,
      pagePath: toPagePath(relativePath)
    }))
    .sort((left, right) => left.pagePath.localeCompare(right.pagePath));
}

export function extractPageTitle(content: string, fallbackPagePath: string): string {
  const fmMatch = content.match(/^---[\s\S]*?^---/m);
  if (fmMatch?.[0]) {
    const titleMatch = fmMatch[0].match(/^title:\s*["']?(.+?)["']?$/m);
    if (titleMatch?.[1]) {
      return titleMatch[1].trim();
    }
  }

  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) {
    return headingMatch[1].trim();
  }

  const basename = fallbackPagePath.split("/").at(-1) ?? fallbackPagePath;
  return prettyTitle(basename.replace(/^index$/, "home"));
}

function collectPageRefs(items: DocsNavigationItem[] | undefined, output: string[]): void {
  if (!items) {
    return;
  }

  for (const item of items) {
    if (typeof item === "string") {
      output.push(item);
      continue;
    }

    collectPageRefs(item.pages, output);
  }
}

function collectOpenApiRefs(items: DocsNavigationItem[] | undefined, output: Set<string>): void {
  if (!items) {
    return;
  }

  for (const item of items) {
    if (typeof item !== "string") {
      if (item.openapi) {
        output.add(item.openapi);
      }
      collectOpenApiRefs(item.pages, output);
    }
  }
}

export function collectNavigationPages(docsJson: DocsJson): string[] {
  const pageRefs: string[] = [];
  for (const group of docsJson.navigation) {
    collectPageRefs(group.pages, pageRefs);
  }
  return pageRefs;
}

export function collectNavigationOpenApiSources(docsJson: DocsJson): string[] {
  const refs = new Set<string>();
  for (const group of docsJson.navigation) {
    if (group.openapi) {
      refs.add(group.openapi);
    }
    collectOpenApiRefs(group.pages, refs);
  }

  return [...refs];
}

export function isOperationReference(value: string): boolean {
  return /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\/.+/i.test(value.trim());
}

