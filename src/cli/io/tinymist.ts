import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";

export interface TinymistExportOptions {
  sourceFilePath: string;
  subtreeText: string;
  outputPath: string;
  format: "pdf" | "png";
  ppi?: number;
  extraImportsFile?: string;
}

export async function exportWithTinymist(
  options: TinymistExportOptions,
): Promise<void> {
  const available = await hasTinymistBinary();
  if (!available) {
    throw new Error(
      "tinymist CLI was not found. Install tinymist first, then rerun the export command.",
    );
  }

  const sourceDir = path.dirname(options.sourceFilePath);
  const tempFilePath = path.join(
    sourceDir,
    `.aht-export-${randomUUID()}.typ`,
  );

  try {
    const extraImports = options.extraImportsFile
      ? await fs.readFile(path.resolve(options.extraImportsFile), "utf8")
      : "";
    const payload = extraImports
      ? `${extraImports.trimEnd()}\n${options.subtreeText}`
      : options.subtreeText;
    await fs.writeFile(tempFilePath, payload, "utf8");

    const args =
      options.format === "png"
        ? [
            "compile",
            "--format",
            "png",
            "--ppi",
            String(options.ppi ?? 144),
            tempFilePath,
            path.resolve(options.outputPath),
          ]
        : ["compile", tempFilePath, path.resolve(options.outputPath)];
    await runTinymist(args, sourceDir);
  } finally {
    await fs.rm(tempFilePath, { force: true });
  }
}

async function hasTinymistBinary(): Promise<boolean> {
  try {
    await runTinymist(["--version"], process.cwd());
    return true;
  } catch {
    return false;
  }
}

async function runTinymist(args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tinymist", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          stderr.trim() || `tinymist exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}
