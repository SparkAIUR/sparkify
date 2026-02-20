import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import fg from "fast-glob";
import { buildStoplightAstroPage } from "@sparkify/playground-stoplight";
import { ExitCode, SparkifyError } from "./errors.js";
import type { DocsJson, OpenApiBundle, PreparedWorkspace, SparkifyConfigV1, WorkspacePage } from "./types.js";

interface NavLink {
  title: string;
  path: string;
  href: string;
  methodBadge?: string;
}

interface NavGroup {
  group: string;
  links: NavLink[];
}

interface SiteChrome {
  name: string;
  logo?: DocsJson["logo"];
  favicon?: string;
  colors?: DocsJson["colors"];
  topbarLinks?: DocsJson["topbarLinks"];
  topbarCtaButton?: DocsJson["topbarCtaButton"];
  tabs?: DocsJson["tabs"];
  anchors?: DocsJson["anchors"];
  footerSocials?: DocsJson["footerSocials"];
}

interface NavigationModel {
  site: SiteChrome;
  groups: NavGroup[];
}

const SUPPORTED_MDX_COMPONENTS = new Set([
  "Alert",
  "AlertDescription",
  "AlertTitle",
  "Badge",
  "Cards",
  "Card",
  "CardGroup",
  "Steps",
  "Step",
  "CodeGroup",
  "Tabs",
  "Tab",
  "Accordion",
  "AccordionGroup",
  "Expandable",
  "Frame",
  "ParamField",
  "ResponseField",
  "Info",
  "Tip",
  "Warning",
  "Note",
  "Table"
]);

const CODE_FENCE_LANGUAGE_ALIASES: Record<string, string> = {
  env: "bash"
};

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function toRouteFilePath(pagesDir: string, pagePath: string): string {
  if (pagePath === "index") {
    return path.join(pagesDir, "index.astro");
  }

  if (pagePath.endsWith("/index")) {
    return path.join(pagesDir, `${pagePath}.astro`);
  }

  return path.join(pagesDir, `${pagePath}.astro`);
}

function toHref(pagePath: string): string {
  if (pagePath === "index") {
    return "index";
  }
  if (pagePath.endsWith("/index")) {
    return `${pagePath.slice(0, -"index".length)}`;
  }
  return pagePath;
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

function buildNavigation(
  docsJson: DocsJson,
  pages: WorkspacePage[],
  openapiBundles: OpenApiBundle[]
): NavigationModel {
  const titleMap = new Map<string, string>(pages.map((page) => [page.pagePath, page.title]));
  const methodBadgeMap = new Map<string, string>(
    pages.filter((page) => page.methodBadge).map((page) => [page.pagePath, page.methodBadge as string])
  );
  const routeSet = new Map<string, string>();

  for (const page of pages) {
    routeSet.set(page.pagePath, toHref(page.pagePath));
  }

  for (const bundle of openapiBundles) {
    const routePath = bundle.route.replace(/^\//, "");
    routeSet.set(routePath, routePath);
    titleMap.set(routePath, bundle.title);
  }

  const groups: NavGroup[] = [];

  const walkItems = (items: Array<string | Record<string, unknown>> | undefined, links: NavLink[]): void => {
    if (!items) {
      return;
    }

    for (const item of items) {
      if (typeof item === "string") {
        if (isOperationReference(item)) {
          continue;
        }

        const href = routeSet.get(item);
        if (!href) {
          continue;
        }

        links.push({
          title: titleMap.get(item) ?? toTitleCase(item.split("/").at(-1) ?? item),
          path: item,
          href,
          methodBadge: methodBadgeMap.get(item)
        });
        continue;
      }

      walkItems((item as { pages?: Array<string | Record<string, unknown>> }).pages, links);
    }
  };

  for (const group of docsJson.navigation) {
    const links: NavLink[] = [];
    walkItems(group.pages as Array<string | Record<string, unknown>> | undefined, links);

    if (group.openapi) {
      for (const bundle of openapiBundles) {
        if (bundle.source === group.openapi) {
          const routePath = bundle.route.replace(/^\//, "");
          links.push({
            title: bundle.title,
            path: routePath,
            href: routePath
          });
        }
      }
    }

    if (links.length > 0) {
      groups.push({
        group: group.group,
        links
      });
    }
  }

  const linkedPaths = new Set(groups.flatMap((group) => group.links.map((link) => link.path)));
  const apiOnlyLinks = openapiBundles
    .map((bundle) => bundle.route.replace(/^\//, ""))
    .filter((routePath) => !linkedPaths.has(routePath))
    .map((routePath) => ({
      title: titleMap.get(routePath) ?? "API Reference",
      path: routePath,
      href: routePath
    }));

  if (apiOnlyLinks.length > 0) {
    groups.push({
      group: "API",
      links: apiOnlyLinks
    });
  }

  return {
    site: {
      name: docsJson.name,
      logo: docsJson.logo,
      favicon: docsJson.favicon,
      colors: docsJson.colors,
      topbarLinks: docsJson.topbarLinks,
      topbarCtaButton: docsJson.topbarCtaButton,
      tabs: docsJson.tabs,
      anchors: docsJson.anchors,
      footerSocials: docsJson.footerSocials
    },
    groups
  };
}

function renderMdxWrapperPage(params: {
  title: string;
  currentPath: string;
  layoutImport: string;
  navImport: string;
  mdxImport: string;
  mdxComponentsImport: string;
}): string {
  return `---
import DocsLayout from "${params.layoutImport}";
import nav from "${params.navImport}";
import mdxComponents from "${params.mdxComponentsImport}";
import Content from "${params.mdxImport}";
const currentPath = ${JSON.stringify(params.currentPath)};
---
<DocsLayout title=${JSON.stringify(params.title)} nav={nav} currentPath={currentPath}>
  <Content components={mdxComponents} />
</DocsLayout>
`;
}

async function copyAssets(docsDir: string, publicDir: string): Promise<void> {
  const files = await fg(["**/*", "!**/*.mdx", "!docs.json", "!mint.json"], {
    cwd: docsDir,
    dot: false,
    onlyFiles: true
  });

  for (const relative of files) {
    const from = path.join(docsDir, relative);
    const to = path.join(publicDir, relative);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
  }
}

function getTemplateSkeletonRoot(): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("@sparkify/template-astro/package.json");
  return path.join(path.dirname(pkgPath), "skeleton");
}

function getNodeModulesRoot(): string {
  const require = createRequire(import.meta.url);
  const astroPkgPath = require.resolve("astro/package.json");
  return path.resolve(path.dirname(astroPkgPath), "..");
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

  await fs.cp(templateSkeletonRoot, projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    `${JSON.stringify({ name: "sparkify-generated-site", private: true, type: "module" }, null, 2)}\n`,
    "utf8"
  );
  await fs.symlink(getNodeModulesRoot(), path.join(projectRoot, "node_modules"), "junction");

  const generatedPagesRoot = path.join(projectRoot, "src/generated/pages");
  const pagesRoot = path.join(projectRoot, "src/pages");
  const generatedOpenApiRoot = path.join(projectRoot, "public/openapi");
  await fs.mkdir(generatedPagesRoot, { recursive: true });
  await fs.mkdir(pagesRoot, { recursive: true });
  await fs.mkdir(generatedOpenApiRoot, { recursive: true });

  for (const page of workspace.pages) {
    const destinationMdxPath = path.join(generatedPagesRoot, page.relativePath);
    await fs.mkdir(path.dirname(destinationMdxPath), { recursive: true });
    const mdxContent = await fs.readFile(page.sourceAbsolutePath, "utf8");
    validateMdxComponents(mdxContent, page.relativePath);
    await fs.writeFile(
      destinationMdxPath,
      normalizeCodeFenceLanguages(escapeTemplateBraces(mdxContent)),
      "utf8"
    );

    const routePath = page.pagePath;
    const routeFilePath = toRouteFilePath(pagesRoot, routePath);
    await fs.mkdir(path.dirname(routeFilePath), { recursive: true });

    const layoutImport = path.relative(path.dirname(routeFilePath), path.join(projectRoot, "src/layouts/DocsLayout.astro"));
    const navImport = path.relative(path.dirname(routeFilePath), path.join(projectRoot, "src/generated/navigation.json"));
    const mdxImport = path.relative(path.dirname(routeFilePath), destinationMdxPath);
    const mdxComponentsImport = path.relative(
      path.dirname(routeFilePath),
      path.join(projectRoot, "src/components/mdx-components.ts")
    );

    await fs.writeFile(
      routeFilePath,
      renderMdxWrapperPage({
        title: page.title,
        currentPath: routePath,
        layoutImport: layoutImport.startsWith(".") ? layoutImport : `./${layoutImport}`,
        navImport: navImport.startsWith(".") ? navImport : `./${navImport}`,
        mdxImport: mdxImport.startsWith(".") ? mdxImport : `./${mdxImport}`,
        mdxComponentsImport: mdxComponentsImport.startsWith(".") ? mdxComponentsImport : `./${mdxComponentsImport}`
      }),
      "utf8"
    );
  }

  for (const bundle of workspace.openapiBundles) {
    const routePath = bundle.route.replace(/^\//, "");
    const routeFilePath = path.join(pagesRoot, `${routePath}.astro`);
    const specFilename = path.basename(bundle.outputAbsolutePath);
    const outputBundlePath = path.join(generatedOpenApiRoot, specFilename);
    await fs.mkdir(path.dirname(routeFilePath), { recursive: true });

    await fs.copyFile(bundle.outputAbsolutePath, outputBundlePath);

    const layoutImport = path.relative(path.dirname(routeFilePath), path.join(projectRoot, "src/layouts/DocsLayout.astro"));
    const navImport = path.relative(path.dirname(routeFilePath), path.join(projectRoot, "src/generated/navigation.json"));

    await fs.writeFile(
      routeFilePath,
      buildStoplightAstroPage({
        title: bundle.title,
        specUrl: `/openapi/${specFilename}`,
        proxyUrl: config.playground.tryItCorsProxy,
        serverUrl: bundle.serverUrl,
        currentPath: routePath,
        layoutImportPath: layoutImport.startsWith(".") ? layoutImport : `./${layoutImport}`,
        navigationImportPath: navImport.startsWith(".") ? navImport : `./${navImport}`
      }),
      "utf8"
    );
  }

  const navModel = buildNavigation(workspace.docsJson, workspace.pages, workspace.openapiBundles);
  await fs.writeFile(
    path.join(projectRoot, "src/generated/navigation.json"),
    `${JSON.stringify(navModel, null, 2)}\n`,
    "utf8"
  );

  await copyAssets(workspace.docsDir, path.join(projectRoot, "public"));

  return { projectRoot };
}
