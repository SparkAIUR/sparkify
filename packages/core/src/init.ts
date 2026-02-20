import fs from "node:fs/promises";
import path from "node:path";
import type { SparkifyConfigV1 } from "./types.js";

export interface InitOptions {
  docsDir: string;
  projectName: string;
  primaryColor?: string;
  withOpenApi?: string;
  fastapi?: string;
}

function defaultIndexContent(projectName: string): string {
  return `---
title: "${projectName}"
description: "Developer documentation"
---

# ${projectName}

Welcome to your sparkify documentation.
`;
}

function defaultDocsJson(projectName: string, primaryColor: string): string {
  return `${JSON.stringify(
    {
      $schema: "https://mintlify.com/schema/docs.json",
      theme: "mint",
      name: projectName,
      colors: { primary: primaryColor },
      navigation: [
        {
          group: "Getting Started",
          pages: ["index"]
        }
      ]
    },
    null,
    2
  )}\n`;
}

function defaultConfigFile(options: InitOptions): string {
  const payload: Record<string, unknown> = {
    docsDir: path.relative(process.cwd(), options.docsDir) || "./docs"
  };

  if (options.withOpenApi) {
    payload.openapi = [
      {
        id: "api",
        source: options.withOpenApi,
        route: "/api-reference",
        title: "API Reference"
      }
    ];
  }

  if (options.fastapi) {
    payload.fastapi = {
      app: options.fastapi,
      exportPath: `${path.relative(process.cwd(), options.docsDir) || "./docs"}/openapi.json`
    };
  }

  return `${JSON.stringify(payload, null, 2)}\n`;
}

export async function initializeProject(options: InitOptions): Promise<void> {
  await fs.mkdir(options.docsDir, { recursive: true });

  const indexPath = path.join(options.docsDir, "index.mdx");
  try {
    await fs.access(indexPath);
  } catch {
    await fs.writeFile(indexPath, defaultIndexContent(options.projectName), "utf8");
  }

  const docsJsonPath = path.join(options.docsDir, "docs.json");
  try {
    await fs.access(docsJsonPath);
  } catch {
    await fs.writeFile(docsJsonPath, defaultDocsJson(options.projectName, options.primaryColor ?? "#2563eb"), "utf8");
  }

  if (options.withOpenApi) {
    const openApiPath = path.isAbsolute(options.withOpenApi)
      ? options.withOpenApi
      : path.join(process.cwd(), options.withOpenApi);

    try {
      await fs.access(openApiPath);
    } catch {
      await fs.writeFile(
        openApiPath,
        `${JSON.stringify({ openapi: "3.1.0", info: { title: "API", version: "1.0.0" }, paths: {} }, null, 2)}\n`,
        "utf8"
      );
    }
  }

  const configPath = path.join(process.cwd(), "sparkify.config.json");
  try {
    await fs.access(configPath);
  } catch {
    await fs.writeFile(configPath, defaultConfigFile(options), "utf8");
  }
}

export function configFromInitOptions(options: InitOptions): SparkifyConfigV1 {
  return {
    docsDir: options.docsDir,
    outDir: path.join(process.cwd(), "dist"),
    base: "",
    autoNav: true,
    writeDocsJson: false,
    exclude: ["**/snippets/**", "**/_generated/**", "**/.*/**"],
    dirTitleMap: {},
    openapi: options.withOpenApi
      ? [
          {
            id: "api",
            source: options.withOpenApi,
            route: "/api-reference",
            title: "API Reference"
          }
        ]
      : [],
    fastapi: options.fastapi
      ? {
          app: options.fastapi,
          exportPath: path.join(options.docsDir, "openapi.json")
        }
      : undefined,
    compat: {
      allowMintJson: true,
      preferDocsJson: true
    },
    api: {
      mode: "endpoint-pages",
      generateMissingEndpointPages: true,
      apiRoot: "/api-reference"
    },
    renderer: {
      engine: "mintlify-astro",
      fallbackLegacyRenderer: true
    },
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
}
