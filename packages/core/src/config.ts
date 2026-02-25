import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ExitCode, SparkifyError } from "./errors.js";
import type {
  ApiConfig,
  CompatConfig,
  ConfigOverrides,
  LlmsConfig,
  RendererConfig,
  SparkifyConfigV1
} from "./types.js";

const openApiSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  route: z.string().optional(),
  title: z.string().optional()
});

const configSchema = z.object({
  docsDir: z.string().optional(),
  outDir: z.string().optional(),
  site: z.string().url().optional(),
  base: z.string().optional(),
  autoNav: z.boolean().optional(),
  writeDocsJson: z.boolean().optional(),
  exclude: z.array(z.string()).optional(),
  dirTitleMap: z.record(z.string(), z.string()).optional(),
  openapi: z.array(openApiSchema).optional(),
  fastapi: z
    .object({
      app: z.string().min(1),
      exportPath: z.string().optional(),
      serverUrl: z.string().url().optional(),
      python: z.string().optional(),
      envFile: z.string().optional(),
      cwd: z.string().optional(),
      pythonPath: z.string().optional()
    })
    .optional(),
  compat: z
    .object({
      allowMintJson: z.boolean().optional(),
      preferDocsJson: z.boolean().optional()
    })
    .optional(),
  api: z
    .object({
      mode: z.enum(["endpoint-pages", "single-page"]).optional(),
      generateMissingEndpointPages: z.boolean().optional(),
      apiRoot: z.string().optional()
    })
    .optional(),
  renderer: z
    .object({
      engine: z.enum(["mintlify-astro", "legacy"]).optional(),
      fallbackLegacyRenderer: z.boolean().optional()
    })
    .optional(),
  llms: z
    .object({
      enabled: z.boolean().optional()
    })
    .optional(),
  playground: z
    .object({
      provider: z.literal("stoplight").optional(),
      tryItCorsProxy: z.string().url().optional(),
      serverUrl: z.string().url().optional(),
      auth: z
        .object({
          apiKey: z.boolean().optional(),
          bearer: z.boolean().optional(),
          basic: z.boolean().optional(),
          oauth2: z
            .object({
              enabled: z.boolean().optional(),
              flows: z.array(z.enum(["authorizationCodePkce", "deviceCode"])).optional(),
              tokenStorage: z.enum(["sessionStorage", "localStorage"]).optional()
            })
            .optional()
        })
        .optional()
    })
    .optional()
});

type SchemaConfig = z.infer<typeof configSchema>;

const DEFAULT_COMPAT: CompatConfig = {
  allowMintJson: true,
  preferDocsJson: true
};

const DEFAULT_API: ApiConfig = {
  mode: "endpoint-pages",
  generateMissingEndpointPages: true,
  apiRoot: "/api-reference"
};

const DEFAULT_RENDERER: RendererConfig = {
  engine: "mintlify-astro",
  fallbackLegacyRenderer: true
};

const DEFAULT_LLMS: LlmsConfig = {
  enabled: true
};

const DEFAULTS: SparkifyConfigV1 = {
  docsDir: "./docs",
  outDir: "./dist",
  base: "",
  autoNav: true,
  writeDocsJson: false,
  exclude: ["**/snippets/**", "**/_generated/**", "**/.*/**"],
  dirTitleMap: {},
  openapi: [],
  compat: DEFAULT_COMPAT,
  api: DEFAULT_API,
  renderer: DEFAULT_RENDERER,
  llms: DEFAULT_LLMS,
  playground: {
    provider: "stoplight",
    auth: {
      apiKey: true,
      bearer: true,
      basic: true,
      oauth2: {
        enabled: true,
        flows: ["authorizationCodePkce", "deviceCode"],
        tokenStorage: "sessionStorage"
      }
    }
  }
};

function normalizeBase(base: string | undefined): string {
  if (!base || base === "/") {
    return "";
  }

  const prefixed = base.startsWith("/") ? base : `/${base}`;
  return prefixed.endsWith("/") ? prefixed.slice(0, -1) : prefixed;
}

function normalizeRoute(route: string | undefined): string {
  if (!route || route.trim().length === 0) {
    return "/api";
  }

  const prefixed = route.startsWith("/") ? route : `/${route}`;
  return prefixed.endsWith("/") && prefixed !== "/" ? prefixed.slice(0, -1) : prefixed;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function resolvePath(cwd: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Partial<T> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      (output as Record<string, unknown>)[key] = value;
    }
  }
  return output;
}

function mergeConfig(base: SchemaConfig, incoming: ConfigOverrides): SchemaConfig {
  const {
    openapi,
    fastapi,
    playground,
    compat,
    api,
    renderer,
    llms,
    configPath,
    ...incomingTopLevel
  } = incoming;
  void configPath;

  const mergedFastapi = fastapi ? { ...(base.fastapi ?? {}), ...definedOnly(fastapi) } : base.fastapi;
  const normalizedFastapi =
    mergedFastapi && typeof mergedFastapi.app === "string"
      ? (mergedFastapi as NonNullable<SchemaConfig["fastapi"]>)
      : undefined;

  return {
    ...base,
    ...definedOnly(incomingTopLevel),
    fastapi: normalizedFastapi,
    compat: compat ? { ...(base.compat ?? {}), ...definedOnly(compat) } : base.compat,
    api: api ? { ...(base.api ?? {}), ...definedOnly(api) } : base.api,
    renderer: renderer ? { ...(base.renderer ?? {}), ...definedOnly(renderer) } : base.renderer,
    llms: llms ? { ...(base.llms ?? {}), ...definedOnly(llms) } : base.llms,
    playground: playground
      ? {
          ...(base.playground ?? {}),
          ...definedOnly(playground),
          auth: {
            ...(base.playground?.auth ?? {}),
            ...definedOnly(playground.auth ?? {}),
            oauth2: {
              ...(base.playground?.auth?.oauth2 ?? {}),
              ...definedOnly(playground.auth?.oauth2 ?? {})
            }
          }
        }
      : base.playground,
    openapi: openapi ?? base.openapi
  };
}

async function loadConfigFile(cwd: string, configPath?: string): Promise<SchemaConfig> {
  const resolvedPath = resolvePath(cwd, configPath ?? "sparkify.config.json");

  try {
    const raw = await fs.readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    const result = configSchema.safeParse(parsed);

    if (!result.success) {
      throw new SparkifyError(
        `Invalid config file at ${resolvedPath}: ${result.error.issues.map((issue) => issue.message).join(", "
        )}`,
        ExitCode.InvalidConfig
      );
    }

    return result.data;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return {};
    }

    if (error instanceof SparkifyError) {
      throw error;
    }

    throw new SparkifyError(`Unable to read config file: ${err.message}`, ExitCode.InvalidConfig);
  }
}

function toConfigAbsolute(cwd: string, config: SchemaConfig): SparkifyConfigV1 {
  const docsDir = resolvePath(cwd, config.docsDir ?? DEFAULTS.docsDir);
  const outDir = resolvePath(cwd, config.outDir ?? DEFAULTS.outDir);
  const compat: CompatConfig = {
    allowMintJson: config.compat?.allowMintJson ?? DEFAULTS.compat.allowMintJson,
    preferDocsJson: config.compat?.preferDocsJson ?? DEFAULTS.compat.preferDocsJson
  };
  const api: ApiConfig = {
    mode: config.api?.mode ?? DEFAULTS.api.mode,
    generateMissingEndpointPages:
      config.api?.generateMissingEndpointPages ?? DEFAULTS.api.generateMissingEndpointPages,
    apiRoot: normalizeRoute(config.api?.apiRoot ?? DEFAULTS.api.apiRoot)
  };
  const renderer: RendererConfig = {
    engine: config.renderer?.engine ?? DEFAULTS.renderer.engine,
    fallbackLegacyRenderer:
      config.renderer?.fallbackLegacyRenderer ?? DEFAULTS.renderer.fallbackLegacyRenderer
  };
  const llms: LlmsConfig = {
    enabled: config.llms?.enabled ?? DEFAULTS.llms.enabled
  };
  const defaultOpenApiRoute = api.mode === "single-page" ? "/api" : api.apiRoot;

  return {
    docsDir,
    outDir,
    site: config.site,
    base: normalizeBase(config.base ?? DEFAULTS.base),
    autoNav: config.autoNav ?? DEFAULTS.autoNav,
    writeDocsJson: config.writeDocsJson ?? DEFAULTS.writeDocsJson,
    exclude: config.exclude ?? DEFAULTS.exclude,
    dirTitleMap: config.dirTitleMap ?? DEFAULTS.dirTitleMap,
    openapi: (config.openapi ?? DEFAULTS.openapi).map((entry) => ({
      ...entry,
      source: isHttpUrl(entry.source) ? entry.source : resolvePath(cwd, entry.source),
      route: normalizeRoute(entry.route ?? defaultOpenApiRoute)
    })),
    fastapi: config.fastapi
      ? {
          ...config.fastapi,
          exportPath: config.fastapi.exportPath
            ? resolvePath(cwd, config.fastapi.exportPath)
            : path.join(docsDir, "openapi.json"),
          envFile: config.fastapi.envFile ? resolvePath(cwd, config.fastapi.envFile) : undefined,
          cwd: config.fastapi.cwd ? resolvePath(cwd, config.fastapi.cwd) : cwd
        }
      : undefined,
    compat,
    api,
    renderer,
    llms,
    playground: {
      provider: config.playground?.provider ?? DEFAULTS.playground.provider,
      tryItCorsProxy: config.playground?.tryItCorsProxy,
      serverUrl: config.playground?.serverUrl,
      auth: {
        apiKey: config.playground?.auth?.apiKey ?? DEFAULTS.playground.auth.apiKey,
        bearer: config.playground?.auth?.bearer ?? DEFAULTS.playground.auth.bearer,
        basic: config.playground?.auth?.basic ?? DEFAULTS.playground.auth.basic,
        oauth2: {
          enabled: config.playground?.auth?.oauth2?.enabled ?? DEFAULTS.playground.auth.oauth2.enabled,
          flows: config.playground?.auth?.oauth2?.flows ?? DEFAULTS.playground.auth.oauth2.flows,
          tokenStorage:
            config.playground?.auth?.oauth2?.tokenStorage ??
            DEFAULTS.playground.auth.oauth2.tokenStorage
        }
      }
    }
  };
}

export interface ResolveConfigOptions {
  cwd?: string;
  overrides?: ConfigOverrides;
}

export async function resolveConfig(options: ResolveConfigOptions = {}): Promise<SparkifyConfigV1> {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const overrides = options.overrides ?? {};

  const fileConfig = await loadConfigFile(cwd, overrides.configPath);
  const merged = mergeConfig(fileConfig, overrides);
  const parsed = configSchema.safeParse(merged);

  if (!parsed.success) {
    throw new SparkifyError(
      `Invalid configuration: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
      ExitCode.InvalidConfig
    );
  }

  return toConfigAbsolute(cwd, parsed.data);
}
