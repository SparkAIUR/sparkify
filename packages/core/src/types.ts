export type PlaygroundProvider = "stoplight";

export type OAuth2BrowserFlow = "authorizationCodePkce" | "deviceCode";

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

export interface ConfigOverrides extends Partial<Omit<SparkifyConfigV1, "openapi" | "playground" | "fastapi">> {
  configPath?: string;
  openapi?: OpenApiConfigEntry[];
  fastapi?: Partial<FastApiConfig>;
  playground?: Partial<SparkifyConfigV1["playground"]>;
}

export type DocsNavigationItem = string | DocsNavigationGroup;

export interface DocsNavigationGroup {
  group: string;
  pages?: DocsNavigationItem[];
  openapi?: string;
}

export interface DocsJson {
  $schema?: string;
  theme: string;
  name: string;
  colors?: {
    primary?: string;
  };
  navigation: DocsNavigationGroup[];
}

export interface WorkspacePage {
  sourceAbsolutePath: string;
  relativePath: string;
  pagePath: string;
  title: string;
}

export interface OpenApiBundle {
  id: string;
  source: string;
  route: string;
  title: string;
  outputAbsolutePath: string;
  operations: number;
  serverUrl?: string;
}

export interface PreparedWorkspace {
  rootDir: string;
  docsDir: string;
  docsJson: DocsJson;
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
