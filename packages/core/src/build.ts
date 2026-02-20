import fs from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import chokidar from "chokidar";
import { generateAstroProject } from "./astro-project.js";
import { ExitCode, SparkifyError } from "./errors.js";
import { createLogger, type Logger } from "./logger.js";
import type { BuildOptions, DevOptions, SparkifyConfigV1 } from "./types.js";
import { cleanupWorkspace, prepareWorkspace } from "./workspace.js";

function npxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
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

function buildAstroEnv(config: SparkifyConfigV1): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (config.site) {
    env.SPARKIFY_SITE = config.site;
  }
  if (config.base) {
    env.SPARKIFY_BASE = config.base;
  }
  return env;
}

export async function buildSite(config: SparkifyConfigV1, options: BuildOptions = {}): Promise<void> {
  const logger = createLogger(options.debug);
  const workspace = await prepareWorkspace(config, { mode: "build", debug: options.debug });

  try {
    const project = await generateAstroProject(workspace, config);

    logger.info(`Building site with Astro from ${project.projectRoot}`);
    await spawnCommand(
      npxCommand(),
      ["astro", "build", "--root", project.projectRoot, "--outDir", config.outDir],
      {
        env: buildAstroEnv(config),
        logger
      }
    );

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

    state.workspaceRoot = workspace.rootDir;
    state.projectRoot = project.projectRoot;

    logger.info(`Starting dev server on port ${options.port}`);

    state.child = spawn(
      npxCommand(),
      [
        "astro",
        "dev",
        "--root",
        project.projectRoot,
        "--port",
        String(options.port),
        "--host"
      ],
      {
        env: buildAstroEnv(config),
        stdio: "inherit"
      }
    );

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
