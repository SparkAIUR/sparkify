import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { ExitCode, SparkifyError } from "./errors.js";

export interface ExportFastApiOptions {
  app: string;
  outPath: string;
  python?: string;
  serverUrl?: string;
  envFile?: string;
  cwd?: string;
  pythonPath?: string;
}

const EXPORT_SCRIPT = String.raw`
import importlib
import json
import os
import pathlib
import sys


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)

if len(sys.argv) < 3:
    fail("Usage: <module:app> <out-path> [server-url]")

target = sys.argv[1]
out_path = pathlib.Path(sys.argv[2])
server_url = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None

if ":" not in target:
    fail(f"Invalid --fastapi target: {target}. Expected module:app")

module_name, app_name = target.split(":", 1)

try:
    module = importlib.import_module(module_name)
except Exception as exc:
    fail(f"Failed to import module '{module_name}': {exc}")

if not hasattr(module, app_name):
    fail(f"Module '{module_name}' does not contain attribute '{app_name}'")

app = getattr(module, app_name)
if not hasattr(app, "openapi"):
    fail(f"Attribute '{app_name}' does not expose .openapi()")

try:
    schema = app.openapi()
except Exception as exc:
    fail(f"Failed to run app.openapi(): {exc}")

if server_url:
    schema["servers"] = [{"url": server_url}]

out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
`;

function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }

  return env;
}

async function loadEnvOverrides(envFile?: string): Promise<Record<string, string>> {
  if (!envFile) {
    return {};
  }

  try {
    const raw = await fs.readFile(envFile, "utf8");
    return parseEnvFile(raw);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    throw new SparkifyError(`Unable to read env file ${envFile}: ${err.message}`, ExitCode.GeneralFailure);
  }
}

export async function exportOpenApiFromFastApi(options: ExportFastApiOptions): Promise<void> {
  const pythonCommand = options.python ?? "python";
  const outPath = path.resolve(options.outPath);
  const envOverrides = await loadEnvOverrides(options.envFile);
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...envOverrides
  };

  if (options.pythonPath) {
    childEnv.PYTHONPATH = childEnv.PYTHONPATH
      ? `${options.pythonPath}${path.delimiter}${childEnv.PYTHONPATH}`
      : options.pythonPath;
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      pythonCommand,
      ["-c", EXPORT_SCRIPT, options.app, outPath, options.serverUrl ?? ""],
      {
        cwd: options.cwd ?? process.cwd(),
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new SparkifyError(
          `Failed to run python command '${pythonCommand}': ${error.message}`,
          ExitCode.GeneralFailure
        )
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new SparkifyError(
          `FastAPI OpenAPI export failed. ${stderr.trim() || "Unknown python error."}`,
          ExitCode.GeneralFailure
        )
      );
    });
  });
}
