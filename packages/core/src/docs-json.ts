import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { minimatch } from "minimatch";
import { z } from "zod";
import { ExitCode, SparkifyError } from "./errors.js";
import type { DocsJson, DocsNavigationGroup, DocsNavigationItem } from "./types.js";

const docsGroupSchema: z.ZodType<DocsNavigationGroup> = z.lazy(() =>
  z.object({
    group: z.string(),
    openapi: z.string().optional(),
    pages: z.array(z.union([z.string(), docsGroupSchema])).optional()
  })
);

const docsJsonSchema = z.object({
  $schema: z.string().optional(),
  theme: z.string().min(1),
  name: z.string().min(1),
  colors: z
    .object({
      primary: z.string().optional()
    })
    .optional(),
  navigation: z.array(docsGroupSchema)
});

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

export async function loadDocsJson(docsDir: string): Promise<DocsJson | null> {
  const docsJsonPath = path.join(docsDir, "docs.json");

  try {
    const raw = await fs.readFile(docsJsonPath, "utf8");
    const parsed = JSON.parse(raw);
    const result = docsJsonSchema.safeParse(parsed);

    if (!result.success) {
      throw new SparkifyError(
        `Invalid docs.json: ${result.error.issues.map((issue) => issue.message).join(", ")}`,
        ExitCode.InvalidDocsJson
      );
    }

    return result.data;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return null;
    }

    if (error instanceof SparkifyError) {
      throw error;
    }

    throw new SparkifyError(`Unable to parse docs.json: ${err.message}`, ExitCode.InvalidDocsJson);
  }
}

export interface GenerateDocsJsonOptions {
  docsDir: string;
  excludePatterns: string[];
  dirTitleMap: Record<string, string>;
  primaryColor?: string;
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

  if (pagePaths.length === 0) {
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
    navigation: buildNavigation(pagePaths, options.dirTitleMap)
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
