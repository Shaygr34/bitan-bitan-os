/**
 * Content Engine runner — isolated bridge to the Python DOCX→PDF pipeline.
 *
 * Keeps all engine invocation details in one place so swapping to a
 * queue / microservice later is a single-file change.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

// ── Constants ──

const PYTHON_BIN = process.env.PYTHON_BIN || "python3";

/**
 * Resolve the engine directory.
 * Supports explicit override via env var, otherwise walks up from CWD.
 */
function resolveEngineDir(): string {
  if (process.env.CONTENT_ENGINE_DIR) {
    return process.env.CONTENT_ENGINE_DIR;
  }

  // Try relative to CWD (works in both dev and Railway when CWD = apps/os-hub)
  const fromCwd = path.resolve(process.cwd(), "..", "..", "engines", "content-engine");
  if (fs.existsSync(path.join(fromCwd, "engine.py"))) {
    return fromCwd;
  }

  // Fallback: try monorepo root if CWD is the monorepo root itself
  const fromRoot = path.resolve(process.cwd(), "engines", "content-engine");
  if (fs.existsSync(path.join(fromRoot, "engine.py"))) {
    return fromRoot;
  }

  throw new Error(
    "Cannot locate content-engine. Set CONTENT_ENGINE_DIR env var."
  );
}

const ENGINE_TIMEOUT_MS = 30_000; // 30s hard cap

// ── Types ──

export interface RunResult {
  pdfPath: string;
  durationMs: number;
  blockCount?: number;
}

export interface RunError {
  code: "ENGINE_NOT_FOUND" | "ENGINE_TIMEOUT" | "ENGINE_FAILED" | "ENGINE_CRASH";
  message: string;
  stderr?: string;
}

// ── Runner ──

export async function runDocxToPdf(opts: {
  inputPath: string;
  outputPath: string;
  jobId: string;
}): Promise<RunResult> {
  const { inputPath, outputPath, jobId } = opts;
  const engineDir = resolveEngineDir();
  const engineScript = path.join(engineDir, "engine.py");

  if (!fs.existsSync(engineScript)) {
    const err: RunError = {
      code: "ENGINE_NOT_FOUND",
      message: `engine.py not found at ${engineScript}`,
    };
    throw err;
  }

  const start = Date.now();

  return new Promise<RunResult>((resolve, reject) => {
    const proc = execFile(
      PYTHON_BIN,
      [engineScript, inputPath, outputPath],
      {
        timeout: ENGINE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024, // 1MB stdout/stderr
        cwd: engineDir,
        env: cleanEnvForEngine(),
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - start;

        // Log structured output for Railway
        const logEntry = {
          event: "content_engine_run",
          jobId,
          durationMs,
          success: !error,
          inputSize: safeFileSize(inputPath),
          outputSize: safeFileSize(outputPath),
        };

        if (error) {
          const isTimeout = error.killed || error.code === "ETIMEDOUT";
          const runError: RunError = {
            code: isTimeout ? "ENGINE_TIMEOUT" : "ENGINE_FAILED",
            message: isTimeout
              ? `Engine timed out after ${ENGINE_TIMEOUT_MS}ms`
              : `Engine exited with code ${error.code}`,
            stderr: stderr?.slice(0, 2000),
          };
          console.error(JSON.stringify({ ...logEntry, error: runError }));
          reject(runError);
          return;
        }

        if (!fs.existsSync(outputPath)) {
          const runError: RunError = {
            code: "ENGINE_CRASH",
            message: "Engine completed but no PDF was produced",
            stderr: stderr?.slice(0, 2000),
          };
          console.error(JSON.stringify({ ...logEntry, error: runError }));
          reject(runError);
          return;
        }

        // Parse block count from stdout if available
        const blockMatch = stdout.match(/Normalize — (\d+) blocks/);
        const blockCount = blockMatch ? parseInt(blockMatch[1], 10) : undefined;

        console.info(JSON.stringify({ ...logEntry, blockCount }));
        resolve({ pdfPath: outputPath, durationMs, blockCount });
      }
    );

    // Safety: kill on unexpected hang
    proc.on("error", (err) => {
      const runError: RunError = {
        code: "ENGINE_CRASH",
        message: `Failed to spawn engine: ${err.message}`,
      };
      console.error(JSON.stringify({ event: "content_engine_spawn_error", jobId, error: runError }));
      reject(runError);
    });
  });
}

// ── Helpers ──

const PROXY_KEYS = [
  "http_proxy", "HTTP_PROXY",
  "https_proxy", "HTTPS_PROXY",
  "no_proxy", "NO_PROXY",
  "all_proxy", "ALL_PROXY",
];

/**
 * Build a clean env for the child process.
 * Inherits everything from process.env but strips proxy vars
 * that confuse Chromium's headless shell.
 */
function cleanEnvForEngine(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !PROXY_KEYS.includes(k)) {
      out[k] = v;
    }
  }
  // Ensure critical vars are present
  if (!out.HOME) out.HOME = "/root";
  if (!out.PATH) out.PATH = "/usr/bin:/usr/local/bin";
  return out;
}

function safeFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}
