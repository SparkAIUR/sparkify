export type PlaygroundProvider = "stoplight";

export type OAuth2BrowserFlow = "authorizationCodePkce" | "deviceCode";
export type DocsConfigSourceType = "docs.json" | "mint.json" | "generated";
export type ApiMode = "endpoint-pages" | "single-page";
export type RendererEngine = "mintlify-astro" | "legacy";

export interface OpenApiConfigEntry {
  id: string;
  source: string;
  route?: string;
  title?: string;
}

export interface FastApiConfig {
  app: string;
  exportPath?: string;
  serverUrl?: string;
  python?: string;
  envFile?: string;
  cwd?: string;
  pythonPath?: string;
}

export interface CompatConfig {
  allowMintJson: boolean;
  preferDocsJson: boolean;
}

export interface ApiConfig {
  mode: ApiMode;
  generateMissingEndpointPages: boolean;
  apiRoot: string;
}

export interface RendererConfig {
  engine: RendererEngine;
  fallbackLegacyRenderer: boolean;
}

export interface SparkifyConfigV1 {
  docsDir: string;
  outDir: string;
  site?: string;
  base: string;
  autoNav: boolean;
  writeDocsJson: boolean;
  exclude: string[];
  dirTitleMap: Record<string, string>;
  openapi: OpenApiConfigEntry[];
  fastapi?: FastApiConfig;
  compat: CompatConfig;
  api: ApiConfig;
  renderer: RendererConfig;
  playground: {
    provider: PlaygroundProvider;
    tryItCorsProxy?: string;
    serverUrl?: string;
    auth: {
      apiKey: boolean;
      bearer: boolean;
      basic: boolean;
      oauth2: {
        enabled: boolean;
        flows: OAuth2BrowserFlow[];
        tokenStorage: "sessionStorage" | "localStorage";
      };
    };
  };
}

export interface ConfigOverrides
  extends Partial<Omit<SparkifyConfigV1, "openapi" | "playground" | "fastapi" | "compat" | "api" | "renderer">> {
  configPath?: string;
  openapi?: OpenApiConfigEntry[];
  fastapi?: Partial<FastApiConfig>;
  playground?: Partial<SparkifyConfigV1["playground"]>;
  compat?: Partial<CompatConfig>;
  api?: Partial<ApiConfig>;
  renderer?: Partial<RendererConfig>;
}

export type DocsNavigationItem = string | DocsNavigationGroup;

export interface DocsNavigationGroup {
  group: string;
  pages?: DocsNavigationItem[];
  openapi?: string;
}

export interface DocsColorAnchors {
  from?: string;
  to?: string;
}

export interface DocsColors {
  primary?: string;
  light?: string;
  dark?: string;
  anchors?: DocsColorAnchors;
}

export interface DocsLogo {
  light?: string;
  dark?: string;
  href?: string;
}

export interface DocsTopbarLink {
  name: string;
  url: string;
}

export interface DocsTopbarCtaButton {
  name: string;
  url: string;
}

export interface DocsNavbarLink {
  label: string;
  href: string;
  icon?: string;
}

export interface DocsNavbarPrimaryButton {
  type: "button";
  href: string;
  label: string;
}

export interface DocsNavbarPrimaryGithub {
  type: "github";
  href: string;
}

export type DocsNavbarPrimary = DocsNavbarPrimaryButton | DocsNavbarPrimaryGithub;

export interface DocsNavbar {
  links?: DocsNavbarLink[];
  primary?: DocsNavbarPrimary;
}

export interface DocsTab {
  name: string;
  url: string;
}

export interface DocsAnchor {
  name: string;
  icon?: string;
  url?: string;
}

export type DocsFooterSocials = Record<string, string>;

export interface DocsFooter {
  socials?: DocsFooterSocials;
}

export interface DocsJson {
  $schema?: string;
  theme: string;
  name: string;
  logo?: string | DocsLogo;
  favicon?: string;
  colors?: DocsColors;
  topbarLinks?: DocsTopbarLink[];
  topbarCtaButton?: DocsTopbarCtaButton;
  navbar?: DocsNavbar;
  tabs?: DocsTab[];
  anchors?: DocsAnchor[];
  footerSocials?: DocsFooterSocials;
  footer?: DocsFooter;
  navigation: DocsNavigationGroup[];
  configSource?: DocsConfigSourceType;
  configPath?: string;
  warnings?: string[];
  unknownFields?: string[];
}

export interface DocsConfigLoadResult {
  config: DocsJson | null;
  source: DocsConfigSourceType;
  sourcePath?: string;
  warnings: string[];
  unknownFields: string[];
}

export interface WorkspacePage {
  sourceAbsolutePath: string;
  relativePath: string;
  pagePath: string;
  title: string;
  generated?: boolean;
  methodBadge?: string;
}

export interface OpenApiOperation {
  id: string;
  method: string;
  path: string;
  summary: string;
  description?: string;
  tag: string;
  pagePath: string;
}

export interface OpenApiBundle {
  id: string;
  source: string;
  route: string;
  title: string;
  outputAbsolutePath: string;
  operations: number;
  operationPages: OpenApiOperation[];
  serverUrl?: string;
}

export interface PreparedWorkspace {
  rootDir: string;
  docsDir: string;
  docsJson: DocsJson;
  docsConfigSource: DocsConfigSourceType;
  docsConfigPath?: string;
  docsConfigWarnings: string[];
  pages: WorkspacePage[];
  openapiBundles: OpenApiBundle[];
}

export interface BuildOptions {
  strict?: boolean;
  debug?: boolean;
}

export interface DevOptions {
  port: number;
  open?: boolean;
  debug?: boolean;
}

export interface DoctorReport {
  warnings: string[];
  errors: string[];
  info: string[];
}
