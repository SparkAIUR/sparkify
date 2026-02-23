import fs from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import chokidar from "chokidar";
import { generateAstroProject } from "./astro-project.js";
import { ExitCode, SparkifyError } from "./errors.js";
import { createLogger, type Logger } from "./logger.js";
import type { BuildOptions, DevOptions, SparkifyConfigV1 } from "./types.js";
import { cleanupWorkspace, prepareWorkspace } from "./workspace.js";

const ASTRO_REACT_OPTS_LOADER_SOURCE = `const SPECIFIER = "astro:react:opts";
const PAYLOAD = "data:text/javascript,export default { experimentalReactChildren: false, experimentalDisableStreaming: false };";

export async function resolve(specifier, context, defaultResolve) {
  if (specifier === SPECIFIER) {
    return { url: PAYLOAD, shortCircuit: true };
  }
  return defaultResolve(specifier, context, defaultResolve);
}
`;

const ASTRO_REACT_OPTS_REGISTER_SOURCE = `import { register } from "node:module";

register(new URL("./astro-react-opts-loader.mjs", import.meta.url).href, import.meta.url);
`;

function npxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function nodeMajorVersion(): number {
  const [major] = process.versions.node.split(".");
  return Number.parseInt(major ?? "0", 10);
}

function shouldPinAstroNodeRuntime(): boolean {
  const major = nodeMajorVersion();
  return Number.isFinite(major) && major >= 23;
}

function getAstroCliPath(): string {
  const require = createRequire(import.meta.url);
  const astroPkgPath = require.resolve("astro/package.json");
  return path.join(path.dirname(astroPkgPath), "astro.js");
}

function astroInvocation(subcommand: "build" | "dev", args: string[]): { command: string; args: string[] } {
  if (shouldPinAstroNodeRuntime()) {
    return {
      command: npxCommand(),
      args: ["-y", "node@22", getAstroCliPath(), subcommand, ...args]
    };
  }

  return {
    command: npxCommand(),
    args: ["astro", subcommand, ...args]
  };
}

async function spawnCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    logger?: Logger;
  }
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "inherit", "inherit"]
    });

    child.on("error", (error) => {
      reject(new SparkifyError(error.message, ExitCode.BuildFailure));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new SparkifyError(
          `${command} ${args.join(" ")} failed with exit code ${code}.`,
          ExitCode.BuildFailure
        )
      );
    });
  });
}

function parseLocalLinks(html: string): string[] {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  return links.filter((href) => href && !href.startsWith("http") && !href.startsWith("mailto:"));
}

function stripBaseFromHref(href: string, base: string): string {
  if (!base) {
    return href;
  }

  if (href === base) {
    return "/";
  }

  if (href.startsWith(`${base}/`)) {
    return href.slice(base.length);
  }

  return href;
}

async function validateInternalLinks(outDir: string, base: string): Promise<void> {
  const htmlFiles: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile() && entry.name.endsWith(".html")) {
        htmlFiles.push(absolute);
      }
    }
  };

  await walk(outDir);

  for (const htmlFile of htmlFiles) {
    const html = await fs.readFile(htmlFile, "utf8");
    const hrefs = parseLocalLinks(html);
    for (const href of hrefs) {
      if (href.startsWith("#") || href.startsWith("javascript:")) {
        continue;
      }

      const noQuery = stripBaseFromHref(href.split("?")[0].split("#")[0], base);
      const resolved = noQuery.startsWith("/")
        ? path.join(outDir, noQuery)
        : path.resolve(path.dirname(htmlFile), noQuery);

      const candidates = [resolved, `${resolved}.html`, path.join(resolved, "index.html")];
      const exists = await Promise.any(
        candidates.map(async (candidate) => {
          await fs.access(candidate);
          return true;
        })
      ).catch(() => false);

      if (!exists) {
        throw new SparkifyError(
          `Broken internal link '${href}' in ${path.relative(outDir, htmlFile)}.`,
          ExitCode.BuildFailure
        );
      }
    }
  }
}

async function ensureAstroReactOptsShim(projectRoot: string): Promise<string> {
  const shimDir = path.join(projectRoot, ".sparkify");
  await fs.mkdir(shimDir, { recursive: true });

  const loaderPath = path.join(shimDir, "astro-react-opts-loader.mjs");
  const registerPath = path.join(shimDir, "astro-react-opts-register.mjs");

  await Promise.all([
    fs.writeFile(loaderPath, ASTRO_REACT_OPTS_LOADER_SOURCE, "utf8"),
    fs.writeFile(registerPath, ASTRO_REACT_OPTS_REGISTER_SOURCE, "utf8")
  ]);

  return registerPath;
}

function appendNodeOption(existing: string | undefined, option: string): string {
  if (!existing || !existing.trim()) {
    return option;
  }

  if (existing.includes(option)) {
    return existing;
  }

  return `${existing} ${option}`;
}

function buildAstroEnv(config: SparkifyConfigV1, registerPath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (config.site) {
    env.SPARKIFY_SITE = config.site;
  }
  if (config.base) {
    env.SPARKIFY_BASE = config.base;
  }
  const registerImport = `--import=${pathToFileURL(registerPath).href}`;
  env.NODE_OPTIONS = appendNodeOption(env.NODE_OPTIONS, registerImport);
  return env;
}

export async function buildSite(config: SparkifyConfigV1, options: BuildOptions = {}): Promise<void> {
  const logger = createLogger(options.debug);
  const workspace = await prepareWorkspace(config, { mode: "build", debug: options.debug });

  try {
    logger.info(
      `Using docs config source: ${workspace.docsConfigSource}${workspace.docsConfigPath ? ` (${workspace.docsConfigPath})` : ""}`
    );
    for (const warning of workspace.docsConfigWarnings) {
      logger.info(`Config compatibility warning: ${warning}`);
    }

    const project = await generateAstroProject(workspace, config);
    const astroRegisterPath = await ensureAstroReactOptsShim(project.projectRoot);

    logger.info(`Building site with Astro from ${project.projectRoot}`);
    if (shouldPinAstroNodeRuntime()) {
      logger.info(`Detected Node ${process.versions.node}; using Node 22 runtime for Astro.`);
    }
    const buildInvocation = astroInvocation("build", [
      "--root",
      project.projectRoot,
      "--outDir",
      config.outDir
    ]);

    await spawnCommand(buildInvocation.command, buildInvocation.args, {
      env: buildAstroEnv(config, astroRegisterPath),
      logger
    });

    if (options.strict) {
      logger.info("Running strict internal link checks");
      await validateInternalLinks(config.outDir, config.base);
    }

    logger.info(`Build complete: ${config.outDir}`);
  } finally {
    if (!options.debug) {
      await cleanupWorkspace(workspace.rootDir);
    } else {
      logger.debug(`Debug mode enabled; workspace retained at ${workspace.rootDir}`);
    }
  }
}

interface DevState {
  workspaceRoot?: string;
  child?: ChildProcess;
  projectRoot?: string;
}

export async function startDevServer(config: SparkifyConfigV1, options: DevOptions): Promise<void> {
  const logger = createLogger(options.debug);
  const state: DevState = {};
  let restarting = false;
  let pendingRestart = false;

  const launch = async (): Promise<void> => {
    const workspace = await prepareWorkspace(config, { mode: "dev", debug: options.debug });
    const project = await generateAstroProject(workspace, config);
    const astroRegisterPath = await ensureAstroReactOptsShim(project.projectRoot);

    state.workspaceRoot = workspace.rootDir;
    state.projectRoot = project.projectRoot;

    logger.info(
      `Using docs config source: ${workspace.docsConfigSource}${workspace.docsConfigPath ? ` (${workspace.docsConfigPath})` : ""}`
    );
    for (const warning of workspace.docsConfigWarnings) {
      logger.info(`Config compatibility warning: ${warning}`);
    }
    logger.info(`Starting dev server on port ${options.port}`);
    if (shouldPinAstroNodeRuntime()) {
      logger.info(`Detected Node ${process.versions.node}; using Node 22 runtime for Astro dev.`);
    }

    const devInvocation = astroInvocation("dev", [
      "--root",
      project.projectRoot,
      "--port",
      String(options.port),
      "--host"
    ]);

    state.child = spawn(devInvocation.command, devInvocation.args, {
      env: buildAstroEnv(config, astroRegisterPath),
      stdio: "inherit"
    });

    state.child.on("close", async (code) => {
      if (code !== null && code !== 0 && !restarting) {
        logger.error(`Dev server exited with code ${code}`);
      }
    });
  };

  const stop = async (): Promise<void> => {
    if (state.child && !state.child.killed) {
      state.child.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!state.child.killed) {
        state.child.kill("SIGKILL");
      }
    }
    state.child = undefined;

    if (state.workspaceRoot) {
      await cleanupWorkspace(state.workspaceRoot);
      state.workspaceRoot = undefined;
      state.projectRoot = undefined;
    }
  };

  const restart = async (): Promise<void> => {
    if (restarting) {
      pendingRestart = true;
      return;
    }

    restarting = true;
    logger.info("Changes detected, reloading dev workspace...");

    try {
      await stop();
      await launch();
    } finally {
      restarting = false;
      if (pendingRestart) {
        pendingRestart = false;
        await restart();
      }
    }
  };

  await launch();

  const watcherPaths = [config.docsDir];
  if (config.fastapi?.cwd) {
    watcherPaths.push(config.fastapi.cwd);
  }

  const watcher = chokidar.watch(watcherPaths, {
    ignoreInitial: true,
    ignored: ["**/node_modules/**", "**/.git/**", "**/.venv/**", "**/__pycache__/**"]
  });

  const debouncedRestart = (() => {
    let timer: NodeJS.Timeout | undefined;
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        void restart();
      }, 300);
    };
  })();

  watcher.on("all", (_, changedPath) => {
    if (
      changedPath.startsWith(config.docsDir) ||
      (config.fastapi?.cwd && changedPath.startsWith(config.fastapi.cwd) && changedPath.endsWith(".py"))
    ) {
      debouncedRestart();
    }
  });

  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      await watcher.close();
      await stop();
      resolve();
    };

    process.on("SIGINT", () => {
      void shutdown();
    });
    process.on("SIGTERM", () => {
      void shutdown();
    });
  });
}
