import path from "node:path";
import { Command } from "commander";
import {
  ExitCode,
  buildSite,
  exportOpenApiFromFastApi,
  initializeProject,
  resolveConfig,
  runDoctor,
  startDevServer,
  toExitCode
} from "@sparkify/core";

function parseNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }

  return parsed;
}

export async function runCli(argv: string[] = process.argv): Promise<number> {
  const program = new Command();

  program
    .name("sparkify")
    .description("Static Mintlify-style docs generator for GitHub Pages")
    .version("0.1.0");

  program
    .command("init")
    .description("Scaffold a sparkify docs setup")
    .option("--docs-dir <path>", "Docs directory", "./docs")
    .option("--project-name <name>", "Project name")
    .option("--primary-color <hex>", "Primary color", "#2563eb")
    .option("--with-openapi <pathOrUrl>", "OpenAPI source to include")
    .option("--fastapi <module:app>", "FastAPI app target")
    .action(async (options) => {
      const docsDir = path.resolve(options.docsDir as string);
      const projectName =
        (options.projectName as string | undefined) ?? path.basename(path.resolve(docsDir, ".."));

      await initializeProject({
        docsDir,
        projectName,
        primaryColor: options.primaryColor as string,
        withOpenApi: options.withOpenapi as string | undefined,
        fastapi: options.fastapi as string | undefined
      });

      console.log(`Initialized sparkify docs in ${docsDir}`);
    });

  program
    .command("dev")
    .description("Run local docs preview")
    .option("--config <path>", "Config file path")
    .option("--docs-dir <path>", "Docs directory")
    .option("--port <number>", "Port", parseNumber, 4321)
    .option("--base <path>", "Base path")
    .option("--debug", "Enable debug logs", false)
    .action(async (options) => {
      const config = await resolveConfig({
        overrides: {
          configPath: options.config,
          docsDir: options.docsDir,
          base: options.base
        }
      });

      await startDevServer(config, {
        port: options.port,
        open: false,
        debug: options.debug
      });
    });

  program
    .command("build")
    .description("Build static docs output")
    .option("--config <path>", "Config file path")
    .option("--docs-dir <path>", "Docs directory")
    .option("--out <path>", "Output directory")
    .option("--site <url>", "Site URL")
    .option("--base <path>", "Base path")
    .option("--strict", "Fail on warnings")
    .option("--debug", "Enable debug logs")
    .action(async (options) => {
      const config = await resolveConfig({
        overrides: {
          configPath: options.config,
          docsDir: options.docsDir,
          outDir: options.out,
          site: options.site,
          base: options.base
        }
      });

      await buildSite(config, {
        strict: options.strict,
        debug: options.debug
      });
    });

  program
    .command("doctor")
    .description("Run environment and config diagnostics")
    .option("--config <path>", "Config file path")
    .option("--docs-dir <path>", "Docs directory")
    .action(async (options) => {
      const config = await resolveConfig({
        overrides: {
          configPath: options.config,
          docsDir: options.docsDir
        }
      });

      const report = await runDoctor(config);
      for (const line of report.info) {
        console.log(`[info] ${line}`);
      }
      for (const line of report.warnings) {
        console.warn(`[warn] ${line}`);
      }
      for (const line of report.errors) {
        console.error(`[error] ${line}`);
      }

      if (report.errors.length > 0) {
        process.exitCode = ExitCode.GeneralFailure;
      }
    });

  program
    .command("export-openapi")
    .description("Export OpenAPI schema from a FastAPI app")
    .requiredOption("--fastapi <module:app>", "FastAPI app target")
    .option("--out <path>", "Output path", "./docs/openapi.json")
    .option("--server-url <url>", "Override OpenAPI servers[0].url")
    .option("--python <path>", "Python executable", "python")
    .option("--env-file <path>", "Environment file")
    .option("--cwd <path>", "Working directory")
    .option("--pythonpath <path>", "PYTHONPATH prefix")
    .action(async (options) => {
      await exportOpenApiFromFastApi({
        app: options.fastapi,
        outPath: path.resolve(options.out),
        serverUrl: options.serverUrl,
        python: options.python,
        envFile: options.envFile ? path.resolve(options.envFile) : undefined,
        cwd: options.cwd ? path.resolve(options.cwd) : process.cwd(),
        pythonPath: options.pythonpath
      });

      console.log(`OpenAPI exported to ${path.resolve(options.out)}`);
    });

  try {
    await program.parseAsync(argv);
    return ExitCode.Success;
  } catch (error) {
    const exitCode = toExitCode(error);
    console.error((error as Error).message);
    return exitCode;
  }
}
