import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fg from "fast-glob";
import { parse as parseYaml } from "yaml";
import { ExitCode, SparkifyError } from "./errors.js";
import type {
  DocsAnchor,
  DocsJson,
  DocsNavigationGroup,
  DocsNavigationItem,
  DocsNavbar,
  OpenApiBundle,
  PreparedWorkspace,
  SparkifyConfigV1
} from "./types.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

const SUPPORTED_MDX_COMPONENTS = new Set([
  "Accordion",
  "AccordionGroup",
  "Alert",
  "AlertDescription",
  "AlertTitle",
  "ApiPlayground",
  "Badge",
  "Callout",
  "Card",
  "CardGroup",
  "Cards",
  "Check",
  "CodeBlock",
  "CodeGroup",
  "Column",
  "Columns",
  "CustomCode",
  "CustomComponent",
  "Danger",
  "DynamicCustomComponent",
  "Expandable",
  "Frame",
  "Heading",
  "Icon",
  "Info",
  "Latex",
  "Link",
  "Loom",
  "MDXContentController",
  "Mermaid",
  "Note",
  "Panel",
  "Param",
  "ParamField",
  "PreviewButton",
  "Property",
  "RequestExample",
  "ResponseField",
  "ResponseExample",
  "Snippet",
  "SnippetGroup",
  "Step",
  "Steps",
  "Tab",
  "Table",
  "Tabs",
  "Tile",
  "Tip",
  "Update",
  "View",
  "Warning"
]);

const CODE_FENCE_LANGUAGE_ALIASES: Record<string, string> = {
  env: "bash"
};

interface SearchIndexItem {
  id: string;
  href: string;
  title: string;
  content: string;
}

interface PageMeta {
  icon?: string;
  api?: string;
  deprecated?: boolean;
  responseStatus?: string;
  responseExample?: string;
}

interface FrontmatterMeta {
  title?: string;
  sidebarTitle?: string;
  icon?: string;
  api?: string;
  deprecated?: boolean;
}

interface GeneratedOperationInfo {
  method: string;
  path: string;
  summary: string;
  serverUrl?: string;
  responseStatus?: string;
  responseExample?: string;
  openapiRoute?: string;
}

interface SiteMeta {
  name: string;
  logoHref: string;
  logoSrc?: string;
  navbarLinks: Array<{ label: string; href: string }>;
  navbarPrimary:
    | {
        type: "button";
        label: string;
        href: string;
      }
    | {
        type: "github";
        href: string;
        repo?: string;
      }
    | null;
  footerSocials: Record<string, string>;
}

interface LlmsIndexMeta {
  enabled: boolean;
  siteMarkdownPath: string;
  pageMarkdownByPath: Record<string, string>;
  pageTitleByPath: Record<string, string>;
}

interface LlmsNavigationGroup {
  group: string;
  pagePaths: string[];
}

interface MintNavGroup {
  group: string;
  pages: Array<string | MintNavGroup>;
}

interface MintNavTab {
  tab: string;
  groups: MintNavGroup[];
}

type ExtractReactComponentsFn = (
  mdxContent: string,
  mdxFilePath: string,
  componentsDir: string,
  pageSlug: string,
  userComponents: Set<string>
) => Promise<string>;

let extractReactComponentsFn: ExtractReactComponentsFn | null = null;

function toRouteFileRelative(pagePath: string): string {
  if (pagePath === "index" || pagePath.length === 0) {
    return "index.mdx";
  }

  return `${pagePath}.mdx`;
}

function normalizePagePath(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

function normalizeHref(pagePath: string): string {
  if (pagePath === "index" || pagePath.length === 0) {
    return "/";
  }

  if (pagePath.endsWith("/index")) {
    return `/${pagePath.slice(0, -"/index".length)}`;
  }

  return `/${pagePath}`;
}

function toRouteFilePath(pagesDir: string, pagePath: string): string {
  if (pagePath === "index" || pagePath.length === 0) {
    return path.join(pagesDir, "index.astro");
  }

  return path.join(pagesDir, `${pagePath}.astro`);
}

function toImportPath(fromDir: string, targetPath: string): string {
  const relative = path.relative(fromDir, targetPath).split(path.sep).join("/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function isOperationReference(value: string): boolean {
  return /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\/.+/i.test(value.trim());
}

function normalizeCodeFenceLanguages(content: string): string {
  return content.replace(/```([a-zA-Z0-9_-]+)([^\n]*)\n/g, (match, rawLanguage: string, suffix: string) => {
    const alias = CODE_FENCE_LANGUAGE_ALIASES[rawLanguage.toLowerCase()];
    if (!alias) {
      return match;
    }
    return `\`\`\`${alias}${suffix}\n`;
  });
}

function convertMermaidFences(content: string): string {
  return content.replace(/```mermaid[^\n]*\n([\s\S]*?)```/g, (_match, rawChart: string) => {
    const chart = rawChart.replace(/\s+$/, "");
    const escapedChart = chart
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${");
    return `<div className="mermaid">{String.raw\`${escapedChart}\`}</div>`;
  });
}

function escapeTemplateBraces(content: string): string {
  const chunks = content.split(/(```[\s\S]*?```)/g);
  return chunks
    .map((chunk, index) => {
      if (index % 2 === 1) {
        return chunk;
      }

      return chunk.replace(/(?<![=\\])\{([A-Za-z0-9_.-]+)\}/g, "\\{$1\\}");
    })
    .join("");
}

function parseImportedNames(content: string): Set<string> {
  const names = new Set<string>();
  const importRegex = /^import\s+(.+?)\s+from\s+["'][^"']+["'];?$/gm;
  for (const match of content.matchAll(importRegex)) {
    const clause = match[1]?.trim();
    if (!clause) {
      continue;
    }

    if (clause.startsWith("{") && clause.endsWith("}")) {
      const chunks = clause
        .slice(1, -1)
        .split(",")
        .map((chunk) => chunk.trim())
        .filter(Boolean);
      for (const chunk of chunks) {
        const alias = chunk.split(/\s+as\s+/i).at(-1)?.trim();
        if (alias) {
          names.add(alias);
        }
      }
      continue;
    }

    if (clause.includes("{")) {
      const [defaultPart, namedPart] = clause.split("{");
      const defaultImport = defaultPart.replace(/,/g, "").trim();
      if (defaultImport) {
        names.add(defaultImport);
      }
      const namedImports = namedPart.replace(/}/g, "");
      for (const chunk of namedImports.split(",").map((item) => item.trim()).filter(Boolean)) {
        const alias = chunk.split(/\s+as\s+/i).at(-1)?.trim();
        if (alias) {
          names.add(alias);
        }
      }
      continue;
    }

    const defaultImport = clause.replace(/,/g, "").trim();
    if (defaultImport && !defaultImport.startsWith("*")) {
      names.add(defaultImport);
    }
  }

  return names;
}

function stripCodeFences(content: string): string {
  return content.replace(/```[\s\S]*?```/g, "");
}

function validateMdxComponents(content: string, sourceFile: string): void {
  const importedNames = parseImportedNames(content);
  const searchable = stripCodeFences(content);
  const usedNames = new Set<string>();

  const tagRegex = /<([A-Z][A-Za-z0-9_]*)\b/g;
  for (const match of searchable.matchAll(tagRegex)) {
    const componentName = match[1];
    if (!componentName) {
      continue;
    }
    usedNames.add(componentName);
  }

  const unsupported = [...usedNames].filter(
    (name) => !SUPPORTED_MDX_COMPONENTS.has(name) && !importedNames.has(name)
  );

  if (unsupported.length > 0) {
    throw new SparkifyError(
      `Unsupported MDX component(s) in ${sourceFile}: ${unsupported.join(", ")}`,
      ExitCode.InvalidDocsJson
    );
  }
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) {
    return content;
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return content;
  }

  return content.slice(endIndex + 4);
}

function stripFrontmatterForLlms(content: string): string {
  return stripFrontmatter(content);
}

function stripTopLevelImportsExportsForLlms(content: string): string {
  const lines = content.split(/\r?\n/);
  const output: string[] = [];
  let inCodeFence = false;
  let skippingStatement = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      output.push(line);
      continue;
    }

    if (inCodeFence) {
      output.push(line);
      continue;
    }

    if (skippingStatement) {
      if (trimmed.endsWith(";")) {
        skippingStatement = false;
      }
      continue;
    }

    if (/^(import\s.+|export\s+\{.+)\s*$/.test(trimmed)) {
      if (!trimmed.endsWith(";")) {
        skippingStatement = true;
      }
      continue;
    }

    if (/^export\s+default\s+.+/.test(trimmed)) {
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

function ensureLeadingH1ForLlms(content: string, title: string): string {
  const lines = content.split(/\r?\n/);
  let inCodeFence = false;
  let hasHeading = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence || trimmed.length === 0) {
      continue;
    }

    if (/^#{1,6}\s+\S+/.test(trimmed)) {
      hasHeading = true;
    }

    break;
  }

  if (hasHeading) {
    return content.trim();
  }

  const safeTitle = title.trim() || "Documentation";
  return `# ${safeTitle}\n\n${content.trim()}`.trim();
}

function toLlmsMarkdownPathFromHref(href: string): string {
  if (href === "/" || href.length === 0) {
    return "/index.html.md";
  }

  return `${href.replace(/\/+$/, "")}/index.html.md`;
}

function withBasePath(base: string, href: string): string {
  if (!base) {
    return href;
  }

  if (href === "/") {
    return `${base}/`;
  }

  return `${base}${href}`;
}

function toCanonicalPageUrl(site: string | undefined, base: string, href: string): string {
  const withBase = withBasePath(base, href);
  if (!site) {
    return withBase;
  }

  return `${site.replace(/\/+$/, "")}${withBase}`;
}

function toLlmsMarkdown(content: string, title: string): string {
  const withoutFrontmatter = stripFrontmatterForLlms(content);
  const withoutImports = stripTopLevelImportsExportsForLlms(withoutFrontmatter);
  return ensureLeadingH1ForLlms(withoutImports, title);
}

function summarizeForSearch(content: string): string {
  const withoutFrontmatter = stripFrontmatter(content);
  return withoutFrontmatter
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[`#>*_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function extractFirstJsonFence(content: string): string | undefined {
  const withoutFrontmatter = stripFrontmatter(content);
  const jsonMatch = withoutFrontmatter.match(/```(?:json|jsonc)[^\n]*\n([\s\S]*?)```/i);
  if (jsonMatch?.[1]) {
    return jsonMatch[1].trim();
  }

  return undefined;
}

function extractResponseStatusCodes(content: string): string[] {
  const withoutFrontmatter = stripFrontmatter(content);
  const matches = withoutFrontmatter.matchAll(/<ResponseField\b[^>]*\bname=['"](\d{3})['"][^>]*>/g);
  const codes = new Set<string>();
  for (const match of matches) {
    const code = match[1];
    if (code) {
      codes.add(code);
    }
  }
  return [...codes].sort();
}

function normalizeExampleValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [];
    }
    return [normalizeExampleValue(value[0])];
  }

  if (value && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      normalized[key] = normalizeExampleValue(nested);
    }
    return normalized;
  }

  if (typeof value === "string") {
    return "<string>";
  }
  if (typeof value === "number") {
    return 123;
  }
  if (typeof value === "boolean") {
    return true;
  }
  return value;
}

function extractFallbackResponseExample(content: string): string | undefined {
  const rawExample = extractFirstJsonFence(content);
  if (!rawExample) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawExample) as unknown;
    const normalized = normalizeExampleValue(parsed);
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return JSON.stringify(normalized, null, 2);
    }

    const statusCodes = extractResponseStatusCodes(content).filter((code) => !/^2\d\d$/.test(code));
    if (statusCodes.length === 0) {
      return JSON.stringify(normalized, null, 2);
    }

    const withErrorCodes: Record<string, unknown> = {};
    for (const code of statusCodes) {
      withErrorCodes[code] = {};
    }
    Object.assign(withErrorCodes, normalized as Record<string, unknown>);
    return JSON.stringify(withErrorCodes, null, 2);
  } catch {
    return rawExample;
  }
}

function extractFrontmatterMeta(content: string): FrontmatterMeta {
  if (!content.startsWith("---")) {
    return {};
  }

  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) {
    return {};
  }

  try {
    const parsed = parseYaml(match[1]);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const obj = parsed as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title : undefined;
    const sidebarTitle = typeof obj.sidebarTitle === "string" ? obj.sidebarTitle : undefined;
    const icon = typeof obj.icon === "string" ? obj.icon : undefined;
    const api = typeof obj.api === "string" ? obj.api.trim() : undefined;
    const deprecated = obj.deprecated === true;

    return { title, sidebarTitle, icon, api, deprecated };
  } catch {
    return {};
  }
}

function getTemplateSkeletonRoot(): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("sparkify-template-astro/package.json");
  return path.join(path.dirname(pkgPath), "skeleton");
}

function getNodeModulesRoot(): string {
  const require = createRequire(import.meta.url);
  const astroPkgPath = require.resolve("astro/package.json");
  return path.resolve(path.dirname(astroPkgPath), "..");
}

async function loadExtractReactComponents(): Promise<ExtractReactComponentsFn> {
  if (extractReactComponentsFn) {
    return extractReactComponentsFn;
  }

  const mintlifyEntryPath = fileURLToPath(await import.meta.resolve("@mintlify/astro"));
  const mintlifyPackageRoot = path.resolve(path.dirname(mintlifyEntryPath), "..");
  const extractModulePath = path.join(mintlifyPackageRoot, "dist/utils/extract-react-components.js");
  const extractModule = (await import(pathToFileURL(extractModulePath).href)) as {
    extractReactComponents?: ExtractReactComponentsFn;
  };

  if (!extractModule.extractReactComponents) {
    throw new SparkifyError(
      "Mintlify compound component extractor is unavailable.",
      ExitCode.BuildFailure
    );
  }

  extractReactComponentsFn = extractModule.extractReactComponents;
  return extractReactComponentsFn;
}

function convertNavigationItem(
  item: DocsNavigationItem,
  openApiRouteBySource: Map<string, string>
): string | MintNavGroup | null {
  if (typeof item === "string") {
    if (isOperationReference(item)) {
      return null;
    }
    return normalizePagePath(item);
  }

  return convertNavigationGroup(item, openApiRouteBySource);
}

function convertNavigationGroup(
  group: DocsNavigationGroup,
  openApiRouteBySource: Map<string, string>
): MintNavGroup | null {
  const pages: Array<string | MintNavGroup> = [];

  for (const item of group.pages ?? []) {
    const converted = convertNavigationItem(item, openApiRouteBySource);
    if (converted) {
      pages.push(converted);
    }
  }

  if (group.openapi) {
    const route = openApiRouteBySource.get(group.openapi);
    if (route && !pages.some((entry) => typeof entry === "string" && entry === route)) {
      pages.push(route);
    }
  }

  if (pages.length === 0) {
    return null;
  }

  return {
    group: group.group,
    pages
  };
}

function collectPageRefsFromNavItems(items: Array<string | MintNavGroup>, output: Set<string>): void {
  for (const item of items) {
    if (typeof item === "string") {
      output.add(item);
      continue;
    }

    collectPageRefsFromNavItems(item.pages, output);
  }
}

function buildAnchors(anchors: DocsAnchor[] | undefined): Array<{ anchor: string; href?: string; icon?: string }> {
  if (!anchors || anchors.length === 0) {
    return [];
  }

  return anchors
    .filter((anchor) => anchor.name)
    .map((anchor) => ({
      anchor: anchor.name,
      href: anchor.url,
      icon: anchor.icon
    }));
}

function pageRefStartsWith(ref: string, prefix: string): boolean {
  if (!prefix) {
    return false;
  }

  return ref === prefix || ref.startsWith(`${prefix}/`);
}

function collectRefsFromGroup(group: MintNavGroup): Set<string> {
  const refs = new Set<string>();
  collectPageRefsFromNavItems(group.pages, refs);
  return refs;
}

function buildNavigationConfig(
  docsJson: DocsJson,
  openApiRouteBySource: Map<string, string>,
  openapiBundles: OpenApiBundle[]
): Record<string, unknown> {
  const groups = docsJson.navigation
    .map((group) => convertNavigationGroup(group, openApiRouteBySource))
    .filter((group): group is MintNavGroup => Boolean(group));

  const referencedPages = new Set<string>();
  for (const group of groups) {
    collectPageRefsFromNavItems(group.pages, referencedPages);
  }

  const missingApiRoutes = openapiBundles
    .map((bundle) => normalizePagePath(bundle.route))
    .filter((route) => route && !referencedPages.has(route));

  if (missingApiRoutes.length > 0) {
    groups.push({
      group: "API",
      pages: missingApiRoutes
    });
    for (const route of missingApiRoutes) {
      referencedPages.add(route);
    }
  }

  const globalAnchors = buildAnchors(docsJson.anchors);

  if (!docsJson.tabs || docsJson.tabs.length === 0) {
    return {
      ...(globalAnchors.length > 0
        ? {
            global: {
              anchors: globalAnchors
            }
          }
        : {}),
      groups
    };
  }

  const docsGroups: MintNavGroup[] = [];
  const tabGroups = docsJson.tabs.map((tab) => ({
    tab,
    groups: [] as MintNavGroup[]
  }));

  for (const group of groups) {
    const refs = collectRefsFromGroup(group);
    let assigned = false;

    for (const tabEntry of tabGroups) {
      const prefix = normalizePagePath(tabEntry.tab.url);
      if (!prefix) {
        continue;
      }

      if ([...refs].some((ref) => pageRefStartsWith(ref, prefix))) {
        tabEntry.groups.push(group);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      docsGroups.push(group);
    }
  }

  const tabs: MintNavTab[] = [];
  if (docsGroups.length > 0) {
    tabs.push({
      tab: "Documentation",
      groups: docsGroups
    });
  }

  for (const tabEntry of tabGroups) {
    if (tabEntry.groups.length === 0) {
      continue;
    }

    tabs.push({
      tab: tabEntry.tab.name,
      groups: tabEntry.groups
    });
  }

  if (tabs.length === 0) {
    tabs.push({
      tab: "Documentation",
      groups
    });
  }

  return {
    ...(globalAnchors.length > 0
      ? {
          global: {
            anchors: globalAnchors
          }
        }
      : {}),
    tabs
  };
}

function buildNavbar(docsJson: DocsJson): DocsNavbar | undefined {
  const links = docsJson.navbar?.links ?? docsJson.topbarLinks?.map((link) => ({
    label: link.name,
    href: link.url
  }));

  const primary =
    docsJson.navbar?.primary ??
    (docsJson.topbarCtaButton
      ? {
          type: "button" as const,
          label: docsJson.topbarCtaButton.name,
          href: docsJson.topbarCtaButton.url
        }
      : undefined);

  if ((!links || links.length === 0) && !primary) {
    return undefined;
  }

  return {
    ...(links && links.length > 0 ? { links } : {}),
    ...(primary ? { primary } : {})
  };
}

function parseGitHubRepoFromHref(href: string): string | undefined {
  try {
    const url = new URL(href);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      return undefined;
    }

    const [owner, repo] = url.pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 2);

    if (!owner || !repo) {
      return undefined;
    }

    return `${owner}/${repo}`;
  } catch {
    return undefined;
  }
}

function buildSiteMeta(docsJson: DocsJson): SiteMeta {
  const logoHref = typeof docsJson.logo === "object" && docsJson.logo?.href ? docsJson.logo.href : "/";
  const logoSrc = typeof docsJson.logo === "string" ? docsJson.logo : docsJson.logo?.light ?? docsJson.logo?.dark;
  const navbar = buildNavbar(docsJson);

  return {
    name: docsJson.name,
    logoHref,
    logoSrc,
    navbarLinks: (navbar?.links ?? []).map((link) => ({ label: link.label, href: link.href })),
    navbarPrimary:
      navbar?.primary && navbar.primary.type === "button"
        ? { type: "button", label: navbar.primary.label, href: navbar.primary.href }
        : navbar?.primary
          ? {
              type: "github",
              href: navbar.primary.href,
              repo: parseGitHubRepoFromHref(navbar.primary.href)
            }
          : null,
    footerSocials: docsJson.footer?.socials ?? docsJson.footerSocials ?? {}
  };
}

function buildDocsConfigForRenderer(docsJson: DocsJson, openapiBundles: OpenApiBundle[]): Record<string, unknown> {
  const openApiRouteBySource = new Map<string, string>();
  for (const bundle of openapiBundles) {
    openApiRouteBySource.set(bundle.source, normalizePagePath(bundle.route));
  }

  const navbar = buildNavbar(docsJson);
  const footerSocials = docsJson.footer?.socials ?? docsJson.footerSocials;

  return {
    $schema: docsJson.$schema ?? "https://mintlify.com/docs.json",
    theme: docsJson.theme ?? "mint",
    name: docsJson.name,
    ...(docsJson.logo ? { logo: docsJson.logo } : {}),
    ...(docsJson.favicon ? { favicon: docsJson.favicon } : {}),
    ...(docsJson.colors ? { colors: docsJson.colors } : {}),
    ...(navbar ? { navbar } : {}),
    ...(footerSocials && Object.keys(footerSocials).length > 0
      ? {
          footer: {
            socials: footerSocials
          }
        }
      : {}),
    navigation: buildNavigationConfig(docsJson, openApiRouteBySource, openapiBundles)
  };
}

function buildLlmsNavigationGroups(docsJson: DocsJson, openapiBundles: OpenApiBundle[]): LlmsNavigationGroup[] {
  const openApiRouteBySource = new Map<string, string>();
  for (const bundle of openapiBundles) {
    openApiRouteBySource.set(bundle.source, normalizePagePath(bundle.route));
  }

  const groups = docsJson.navigation
    .map((group) => convertNavigationGroup(group, openApiRouteBySource))
    .filter((group): group is MintNavGroup => Boolean(group));

  const referencedPages = new Set<string>();
  const llmsGroups: LlmsNavigationGroup[] = [];

  for (const group of groups) {
    const refs = new Set<string>();
    collectPageRefsFromNavItems(group.pages, refs);
    const normalizedRefs = [...refs].map((ref) => normalizeHref(ref));
    for (const ref of refs) {
      referencedPages.add(ref);
    }
    if (normalizedRefs.length > 0) {
      llmsGroups.push({
        group: group.group,
        pagePaths: normalizedRefs
      });
    }
  }

  const missingApiRoutes = openapiBundles
    .map((bundle) => normalizePagePath(bundle.route))
    .filter((route) => route && !referencedPages.has(route));

  if (missingApiRoutes.length > 0) {
    llmsGroups.push({
      group: "API",
      pagePaths: missingApiRoutes.map((route) => normalizeHref(route))
    });
  }

  return llmsGroups;
}

function renderLlmsTxt(
  siteName: string,
  navGroups: LlmsNavigationGroup[],
  pageMarkdownByPath: Record<string, string>,
  pageTitleByPath: Record<string, string>,
  siteMarkdownPath: string
): string {
  const lines: string[] = [
    `# ${siteName}`,
    "",
    "> LLM-friendly markdown exports for this documentation site.",
    ""
  ];

  for (const group of navGroups) {
    const entries = group.pagePaths
      .map((href) => ({
        href,
        markdownPath: pageMarkdownByPath[href],
        title: pageTitleByPath[href] ?? href
      }))
      .filter((entry) => Boolean(entry.markdownPath));

    if (entries.length === 0) {
      continue;
    }

    lines.push(`## ${group.group}`);
    for (const entry of entries) {
      lines.push(`- [${entry.title}](${entry.markdownPath})`);
    }
    lines.push("");
  }

  lines.push("## Optional");
  lines.push(`- [Full Site as Markdown](${siteMarkdownPath})`);
  lines.push("");

  return lines.join("\n");
}

function renderLlmsFull(
  siteName: string,
  navGroups: LlmsNavigationGroup[],
  pageTitleByPath: Record<string, string>,
  pageMarkdownContentByPath: Record<string, string>,
  site: string | undefined,
  base: string
): string {
  const lines: string[] = [
    `# ${siteName} — Full Markdown Export`,
    "",
    "This file aggregates markdown content for all navigable documentation pages.",
    ""
  ];

  const seen = new Set<string>();

  for (const group of navGroups) {
    const entries = group.pagePaths.filter((href) => {
      if (seen.has(href)) {
        return false;
      }
      if (!pageMarkdownContentByPath[href]) {
        return false;
      }
      seen.add(href);
      return true;
    });

    if (entries.length === 0) {
      continue;
    }

    lines.push(`## ${group.group}`);
    lines.push("");

    for (const href of entries) {
      lines.push(`### ${pageTitleByPath[href] ?? href}`);
      lines.push("");
      lines.push(`Canonical URL: ${toCanonicalPageUrl(site, base, href)}`);
      lines.push("");
      lines.push(pageMarkdownContentByPath[href].trim());
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd().concat("\n");
}

function renderOpenApiPlaygroundPage(bundle: OpenApiBundle, specUrl: string): string {
  return `---
title: "${bundle.title.replaceAll("\"", "\\\"")}"
description: "Interactive API playground"
openapiRoute: "${bundle.route}"
mode: "wide"
---

<ApiPlayground specUrl="${specUrl}" serverUrl="${bundle.serverUrl ?? ""}" />
`;
}

function renderMdxWrapperPage(params: {
  layoutImport: string;
  mdxImport: string;
  mdxComponentsImport: string;
  fallbackTitle: string;
  currentPath: string;
}): string {
  return `---
import PageShell from "${params.layoutImport}";
import { mdxComponents } from "${params.mdxComponentsImport}";
import Content, { frontmatter } from "${params.mdxImport}";
const title = (frontmatter?.title ?? ${JSON.stringify(params.fallbackTitle)}) as string;
const description = typeof frontmatter?.description === "string" ? frontmatter.description : undefined;
const api = typeof frontmatter?.api === "string" ? frontmatter.api : undefined;
const openapiRoute = typeof frontmatter?.openapiRoute === "string" ? frontmatter.openapiRoute : undefined;
const mode = typeof frontmatter?.mode === "string" ? frontmatter.mode : undefined;
const currentPath = ${JSON.stringify(params.currentPath)};
---
<PageShell title={title} description={description} currentPath={currentPath} api={api} openapiRoute={openapiRoute} mode={mode}>
  <Content components={mdxComponents} />
</PageShell>
`;
}

function extractResponseExample(response: any): string | undefined {
  if (!response || typeof response !== "object") {
    return undefined;
  }

  const content = response.content;
  if (!content || typeof content !== "object") {
    return undefined;
  }

  const preferred =
    content["application/json"] || content["application/problem+json"] || Object.values(content)[0];

  if (!preferred || typeof preferred !== "object") {
    return undefined;
  }

  if (preferred.example !== undefined) {
    return JSON.stringify(preferred.example, null, 2);
  }

  if (preferred.examples && typeof preferred.examples === "object") {
    const firstExample = Object.values(preferred.examples).find((entry: any) => entry && entry.value !== undefined) as
      | { value: unknown }
      | undefined;
    if (firstExample) {
      return JSON.stringify(firstExample.value, null, 2);
    }
  }

  if (preferred.schema?.example !== undefined) {
    return JSON.stringify(preferred.schema.example, null, 2);
  }

  return undefined;
}

async function buildOpenApiOperations(openapiBundles: OpenApiBundle[]): Promise<Record<string, GeneratedOperationInfo>> {
  const operations: Record<string, GeneratedOperationInfo> = {};

  for (const bundle of openapiBundles) {
    const raw = await fs.readFile(bundle.outputAbsolutePath, "utf8");
    const schema = JSON.parse(raw) as { paths?: Record<string, Record<string, any>> };

    for (const [pathKey, pathItem] of Object.entries(schema.paths ?? {})) {
      for (const method of HTTP_METHODS) {
        const operation = pathItem?.[method];
        if (!operation || typeof operation !== "object") {
          continue;
        }

        const responseCodes = Object.keys(operation.responses ?? {}).sort();
        const preferredStatus =
          responseCodes.find((code) => /^2\d\d$/.test(code)) ?? responseCodes.find((code) => code !== "default") ?? "200";

        const key = `${method.toUpperCase()} ${pathKey}`;
        operations[key] = {
          method: method.toUpperCase(),
          path: pathKey,
          summary:
            (typeof operation.summary === "string" && operation.summary.trim()) ||
            `${method.toUpperCase()} ${pathKey}`,
          serverUrl: bundle.serverUrl,
          responseStatus: preferredStatus,
          responseExample: extractResponseExample(operation.responses?.[preferredStatus]),
          openapiRoute: normalizeHref(normalizePagePath(bundle.route))
        };
      }
    }
  }

  return operations;
}

async function copyAssets(docsDir: string, destinationDocsDir: string): Promise<void> {
  const files = await fg(["**/*", "!**/*.mdx", "!docs.json", "!mint.json"], {
    cwd: docsDir,
    dot: false,
    onlyFiles: true
  });

  for (const relative of files) {
    const from = path.join(docsDir, relative);
    const to = path.join(destinationDocsDir, relative);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
  }
}

async function copyAbsoluteSnippetImports(docsDir: string, projectRoot: string): Promise<void> {
  const files = await fg(["snippets/**/*"], {
    cwd: docsDir,
    dot: false,
    onlyFiles: true
  });

  for (const relative of files) {
    const from = path.join(docsDir, relative);
    const to = path.join(projectRoot, relative);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
  }
}

export interface GenerateAstroProjectResult {
  projectRoot: string;
}

export async function generateAstroProject(
  workspace: PreparedWorkspace,
  config: SparkifyConfigV1
): Promise<GenerateAstroProjectResult> {
  const templateSkeletonRoot = getTemplateSkeletonRoot();
  const projectRoot = path.join(workspace.rootDir, "astro-site");
  const docsRoot = path.join(projectRoot, "docs");
  const pagesRoot = path.join(projectRoot, "src/pages");
  const publicRoot = path.join(projectRoot, "public");
  const mintlifyComponentsDir = path.join(projectRoot, ".mintlify", "components");

  await fs.cp(templateSkeletonRoot, projectRoot, { recursive: true });
  await fs.mkdir(docsRoot, { recursive: true });
  await fs.mkdir(pagesRoot, { recursive: true });
  await fs.mkdir(publicRoot, { recursive: true });
  await fs.mkdir(mintlifyComponentsDir, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    `${JSON.stringify({ name: "sparkify-generated-site", private: true, type: "module" }, null, 2)}\n`,
    "utf8"
  );
  await fs.symlink(getNodeModulesRoot(), path.join(projectRoot, "node_modules"), "junction");

  await copyAssets(workspace.docsDir, docsRoot);
  await copyAssets(workspace.docsDir, publicRoot);
  await copyAbsoluteSnippetImports(workspace.docsDir, projectRoot);

  const searchIndex: SearchIndexItem[] = [];
  const writtenPagePaths = new Set<string>();
  const titleMap: Record<string, string> = {};
  const pageMetaByHref: Record<string, PageMeta> = {};
  const llmsEnabled = config.llms.enabled;
  const llmsSiteMarkdownPath = "/llms-full.txt";
  const llmsPageMarkdownByPath: Record<string, string> = {};
  const llmsPageTitleByPath: Record<string, string> = {};
  const llmsPageMarkdownContentByPath: Record<string, string> = {};

  for (const page of workspace.pages) {
    if (writtenPagePaths.has(page.pagePath)) {
      continue;
    }

    const contentRaw = await fs.readFile(page.sourceAbsolutePath, "utf8");
    validateMdxComponents(contentRaw, page.relativePath);
    const frontmatter = extractFrontmatterMeta(contentRaw);

    const normalizedContent = normalizeCodeFenceLanguages(convertMermaidFences(escapeTemplateBraces(contentRaw)));
    const extractReactComponents = await loadExtractReactComponents();
    const destination = path.join(docsRoot, toRouteFileRelative(page.pagePath));
    const transformedContent = await extractReactComponents(
      normalizedContent,
      destination,
      mintlifyComponentsDir,
      page.pagePath,
      new Set<string>()
    );
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, transformedContent, "utf8");

    writtenPagePaths.add(page.pagePath);
    const pageHref = normalizeHref(page.pagePath);
    const navTitle = frontmatter.sidebarTitle || frontmatter.title || page.title;
    titleMap[page.pagePath] = navTitle;

    const pageMeta: PageMeta = {};
    if (frontmatter.icon) {
      pageMeta.icon = frontmatter.icon;
    }
    if (frontmatter.api) {
      pageMeta.api = frontmatter.api;
    }
    if (frontmatter.deprecated) {
      pageMeta.deprecated = true;
    }
    if (frontmatter.api) {
      const responseExample = extractFallbackResponseExample(contentRaw);
      if (responseExample) {
        pageMeta.responseStatus = "200";
        pageMeta.responseExample = responseExample;
      }
    }
    if (Object.keys(pageMeta).length > 0) {
      pageMetaByHref[pageHref] = pageMeta;
    }

    if (llmsEnabled) {
      const llmsMarkdown = toLlmsMarkdown(contentRaw, frontmatter.title || page.title).trimEnd();
      const llmsMarkdownPath = toLlmsMarkdownPathFromHref(pageHref);
      const llmsAbsolutePath = path.join(publicRoot, llmsMarkdownPath.replace(/^\/+/, ""));
      await fs.mkdir(path.dirname(llmsAbsolutePath), { recursive: true });
      await fs.writeFile(llmsAbsolutePath, `${llmsMarkdown}\n`, "utf8");
      llmsPageMarkdownByPath[pageHref] = llmsMarkdownPath;
      llmsPageTitleByPath[pageHref] = frontmatter.title || page.title;
      llmsPageMarkdownContentByPath[pageHref] = llmsMarkdown;
    }

    searchIndex.push({
      id: page.pagePath,
      href: pageHref,
      title: frontmatter.title || page.title,
      content: summarizeForSearch(transformedContent)
    });
  }

  const openApiPublicDir = path.join(docsRoot, "openapi");
  await fs.mkdir(openApiPublicDir, { recursive: true });

  for (const bundle of workspace.openapiBundles) {
    const specFilename = path.basename(bundle.outputAbsolutePath);
    const copiedSpecPath = path.join(openApiPublicDir, specFilename);
    await fs.copyFile(bundle.outputAbsolutePath, copiedSpecPath);

    const routePath = normalizePagePath(bundle.route) || "index";
    if (!writtenPagePaths.has(routePath)) {
      const mdx = renderOpenApiPlaygroundPage(bundle, `/openapi/${specFilename}`);
      const destination = path.join(docsRoot, toRouteFileRelative(routePath));
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, mdx, "utf8");

      writtenPagePaths.add(routePath);
      titleMap[routePath] = bundle.title;
      const routeHref = normalizeHref(routePath);
      searchIndex.push({
        id: routePath,
        href: routeHref,
        title: bundle.title,
        content: "Interactive API playground"
      });

      if (llmsEnabled) {
        const llmsMarkdown = toLlmsMarkdown(mdx, bundle.title).trimEnd();
        const llmsMarkdownPath = toLlmsMarkdownPathFromHref(routeHref);
        const llmsAbsolutePath = path.join(publicRoot, llmsMarkdownPath.replace(/^\/+/, ""));
        await fs.mkdir(path.dirname(llmsAbsolutePath), { recursive: true });
        await fs.writeFile(llmsAbsolutePath, `${llmsMarkdown}\n`, "utf8");
        llmsPageMarkdownByPath[routeHref] = llmsMarkdownPath;
        llmsPageTitleByPath[routeHref] = bundle.title;
        llmsPageMarkdownContentByPath[routeHref] = llmsMarkdown;
      }
    }
  }

  for (const pagePath of [...writtenPagePaths].sort((left, right) => left.localeCompare(right))) {
    const routeFilePath = toRouteFilePath(pagesRoot, pagePath);
    const routeDir = path.dirname(routeFilePath);
    const mdxAbsolutePath = path.join(docsRoot, toRouteFileRelative(pagePath));

    await fs.mkdir(routeDir, { recursive: true });
    await fs.writeFile(
      routeFilePath,
      renderMdxWrapperPage({
        layoutImport: toImportPath(routeDir, path.join(projectRoot, "src/layouts/PageShell.astro")),
        mdxImport: toImportPath(routeDir, mdxAbsolutePath),
        mdxComponentsImport: toImportPath(
          routeDir,
          path.join(projectRoot, "src/components/mdx-components-runtime.tsx")
        ),
        fallbackTitle: titleMap[pagePath] ?? pagePath,
        currentPath: normalizeHref(pagePath)
      }),
      "utf8"
    );
  }

  const docsConfig = buildDocsConfigForRenderer(workspace.docsJson, workspace.openapiBundles);
  await fs.writeFile(path.join(docsRoot, "docs.json"), `${JSON.stringify(docsConfig, null, 2)}\n`, "utf8");

  const siteMeta = buildSiteMeta(workspace.docsJson);
  const llmsNavigationGroups = buildLlmsNavigationGroups(workspace.docsJson, workspace.openapiBundles);
  const llmsIndex: LlmsIndexMeta = llmsEnabled
    ? {
        enabled: true,
        siteMarkdownPath: llmsSiteMarkdownPath,
        pageMarkdownByPath: llmsPageMarkdownByPath,
        pageTitleByPath: llmsPageTitleByPath
      }
    : {
        enabled: false,
        siteMarkdownPath: "",
        pageMarkdownByPath: {},
        pageTitleByPath: {}
      };

  if (llmsEnabled) {
    const llmsTxt = renderLlmsTxt(
      siteMeta.name,
      llmsNavigationGroups,
      llmsPageMarkdownByPath,
      llmsPageTitleByPath,
      llmsSiteMarkdownPath
    );
    const llmsFull = renderLlmsFull(
      siteMeta.name,
      llmsNavigationGroups,
      llmsPageTitleByPath,
      llmsPageMarkdownContentByPath,
      config.site,
      config.base
    );

    await fs.writeFile(path.join(publicRoot, "llms.txt"), llmsTxt, "utf8");
    await fs.writeFile(path.join(publicRoot, "llms-full.txt"), llmsFull, "utf8");
  }

  await fs.writeFile(
    path.join(projectRoot, "src/generated/site-meta.json"),
    `${JSON.stringify(siteMeta, null, 2)}\n`,
    "utf8"
  );

  await fs.writeFile(
    path.join(projectRoot, "src/generated/llms-index.json"),
    `${JSON.stringify(llmsIndex, null, 2)}\n`,
    "utf8"
  );

  const operations = await buildOpenApiOperations(workspace.openapiBundles);
  await fs.writeFile(
    path.join(projectRoot, "src/generated/openapi-operations.json"),
    `${JSON.stringify(operations, null, 2)}\n`,
    "utf8"
  );

  await fs.writeFile(
    path.join(projectRoot, "src/generated/title-map.json"),
    `${JSON.stringify(titleMap, null, 2)}\n`,
    "utf8"
  );

  await fs.writeFile(
    path.join(projectRoot, "src/generated/page-meta.json"),
    `${JSON.stringify(pageMetaByHref, null, 2)}\n`,
    "utf8"
  );

  await fs.writeFile(
    path.join(projectRoot, "src/generated/search-index.json"),
    `${JSON.stringify(searchIndex, null, 2)}\n`,
    "utf8"
  );

  return { projectRoot };
}
