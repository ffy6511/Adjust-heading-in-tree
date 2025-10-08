import * as fs from "fs/promises";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { HeadingNode, HeadingProvider } from "../providers/headingProvider";
import {
  computeSubtreeSlice,
  makeSafeFileComponent,
  SubtreeSlice,
} from "../utils/subtree";

const EXTRA_IMPORTS_KEY = "headingNavigator.export.extraImports";
const PNG_PPI_KEY = "headingNavigator.export.pngPpi";
const TYPST_LANGUAGE_ID = "typst";

type ProgressReporter = vscode.Progress<{ message?: string }>;

class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

type ExportCommandContext = {
  provider: HeadingProvider;
  treeView: vscode.TreeView<HeadingNode>;
  extensionContext: vscode.ExtensionContext;
};

type ExportChoice = "pdf" | "png";

interface PdfSettings {
  outputUri: vscode.Uri;
  extraImports: string;
}

interface PngSettings extends PdfSettings {
  ppi: number;
}

export function registerExportCommands(
  provider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>,
  extensionContext: vscode.ExtensionContext,
): vscode.Disposable {
  const context: ExportCommandContext = { provider, treeView, extensionContext };

  const openMenu = vscode.commands.registerCommand(
    "headingNavigator.openExportMenu",
    async (item?: HeadingNode, selectedItems?: readonly HeadingNode[]) => {
      await handleExportMenu(context, item, selectedItems);
    },
  );

  return vscode.Disposable.from(openMenu);
}

async function handleExportMenu(
  ctx: ExportCommandContext,
  item?: HeadingNode,
  selectedItems?: readonly HeadingNode[],
): Promise<void> {
  const target = resolveTargetNode(ctx, item, selectedItems);
  if (!target) {
    void vscode.window.showInformationMessage(
      "Select a heading to export its subtree.",
    );
    return;
  }

  const choice = await vscode.window.showQuickPick<ExportQuickPickItem>(
    [
      {
        label: "$(file-pdf) Export as PDF",
        detail: "Generate a PDF for the selected Typst subtree using tinymist.",
        choice: "pdf",
      },
      {
        label: "$(file-media) Export as PNG",
        detail: "Render the subtree as a single PNG image.",
        choice: "png",
      },
    ],
    {
      placeHolder: `Export "${target.label}"`,
      ignoreFocusOut: true,
    },
  );

  if (!choice) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("Open a document before exporting.");
    return;
  }

  if (editor.document.isUntitled) {
    void vscode.window.showWarningMessage(
      "Save the document before exporting a subtree.",
    );
    return;
  }

  if (editor.document.languageId !== TYPST_LANGUAGE_ID) {
    void vscode.window.showWarningMessage(
      "Subtree export currently supports Typst documents only.",
    );
    return;
  }

  const orderedNodes = ctx.provider.getOrderedNodes();
  const slice = computeSubtreeSlice(editor.document, target, orderedNodes);
  if (!slice.text.trim()) {
    void vscode.window.showWarningMessage(
      "The selected subtree is empty. Nothing to export.",
    );
    return;
  }

  if (choice.choice === "pdf") {
    const settings = await configurePdfExport(ctx, editor.document, target);
    if (!settings) {
      return;
    }
    await exportSubtreeAsPdf(ctx, editor.document, target, slice, settings);
    return;
  }

  const settings = await configurePngExport(ctx, editor.document, target);
  if (!settings) {
    return;
  }
  await exportSubtreeAsPng(ctx, editor.document, target, slice, settings);
}

function resolveTargetNode(
  ctx: ExportCommandContext,
  item?: HeadingNode,
  selectedItems?: readonly HeadingNode[],
): HeadingNode | undefined {
  if (item) {
    return item;
  }

  if (selectedItems && selectedItems.length > 0) {
    return selectedItems[0];
  }

  if (ctx.treeView.selection.length > 0) {
    return ctx.treeView.selection[0];
  }

  return ctx.provider.getCurrentHeadingNode();
}

interface ExportQuickPickItem extends vscode.QuickPickItem {
  choice: ExportChoice;
}

interface ExportSettingPick extends vscode.QuickPickItem {
  action: ExportSettingAction;
}

type ExportSettingAction = "output" | "imports" | "confirm" | "ppi";

async function configurePdfExport(
  ctx: ExportCommandContext,
  document: vscode.TextDocument,
  node: HeadingNode,
): Promise<PdfSettings | undefined> {
  const storedExtraImports =
    ctx.extensionContext.workspaceState.get<string>(EXTRA_IMPORTS_KEY) ?? "";

  let extraImports = storedExtraImports;
  let outputUri = await buildDefaultOutputUri(document, node, "pdf");

  while (true) {
    const items: ExportSettingPick[] = [
      {
        label: outputUri
          ? `$(file) Output: ${outputUri.fsPath}`
          : "$(file) Select output file…",
        description: "Choose where to save the generated PDF.",
        action: "output",
      },
      {
        label: extraImports
          ? "$(edit) Extra imports (configured)"
          : "$(edit) Extra imports (optional)",
        description:
          "Append Typst import directives before the exported subtree.",
        action: "imports",
      },
      {
        label: "$(check) Start export",
        description: "Generate the PDF with the current settings.",
        action: "confirm",
      },
    ];

    const selection = await vscode.window.showQuickPick(items, {
      title: "Export subtree as PDF",
      placeHolder: "Configure export options",
      ignoreFocusOut: true,
    });

    if (!selection) {
      return undefined;
    }

    if (selection.action === "output") {
      const uri = await pickOutputUri(document, node, "pdf", outputUri);
      if (uri) {
        outputUri = uri;
      }
      continue;
    }

    if (selection.action === "imports") {
      const edited = await editExtraImports(document, extraImports);
      if (edited !== undefined) {
        extraImports = edited;
        await ctx.extensionContext.workspaceState.update(
          EXTRA_IMPORTS_KEY,
          extraImports,
        );
      }
      continue;
    }

    if (selection.action === "ppi") {
      continue;
    }

    if (!outputUri) {
      void vscode.window.showWarningMessage(
        "Select a PDF output location before exporting.",
      );
      continue;
    }

    return { outputUri, extraImports };
  }
}

async function configurePngExport(
  ctx: ExportCommandContext,
  document: vscode.TextDocument,
  node: HeadingNode,
): Promise<PngSettings | undefined> {
  const storedExtraImports =
    ctx.extensionContext.workspaceState.get<string>(EXTRA_IMPORTS_KEY) ?? "";
  let extraImports = storedExtraImports;
  let outputUri = await buildDefaultOutputUri(document, node, "png");
  let ppi =
    ctx.extensionContext.workspaceState.get<number>(PNG_PPI_KEY) ?? 144;

  while (true) {
    const items: ExportSettingPick[] = [
      {
        label: outputUri
          ? `$(file) Output: ${outputUri.fsPath}`
          : "$(file) Select output file…",
        description: "Choose where to save the rendered PNG.",
        action: "output",
      },
      {
        label: `$(symbol-parameter) Raster DPI (ppi): ${ppi}`,
        description: "Controls the resolution of the rendered image.",
        action: "ppi",
      },
      {
        label: extraImports
          ? "$(edit) Extra imports (configured)"
          : "$(edit) Extra imports (optional)",
        description:
          "Append Typst import directives before the exported subtree.",
        action: "imports",
      },
      {
        label: "$(check) Start export",
        description: "Render the PNG with the current settings.",
        action: "confirm",
      },
    ];

    const selection = await vscode.window.showQuickPick(items, {
      title: "Export subtree as PNG",
      placeHolder: "Configure export options",
      ignoreFocusOut: true,
    });

    if (!selection) {
      return undefined;
    }

    if (selection.action === "output") {
      const uri = await pickOutputUri(document, node, "png", outputUri);
      if (uri) {
        outputUri = uri;
      }
      continue;
    }

    if (selection.action === "imports") {
      const edited = await editExtraImports(document, extraImports);
      if (edited !== undefined) {
        extraImports = edited;
        await ctx.extensionContext.workspaceState.update(
          EXTRA_IMPORTS_KEY,
          extraImports,
        );
      }
      continue;
    }

    if (selection.action === "ppi") {
      const edited = await editImagePpi(ppi);
      if (edited !== undefined) {
        ppi = edited;
        await ctx.extensionContext.workspaceState.update(PNG_PPI_KEY, ppi);
      }
      continue;
    }

    if (!outputUri) {
      void vscode.window.showWarningMessage(
        "Select a PNG output location before exporting.",
      );
      continue;
    }

    return { outputUri, extraImports, ppi };
  }
}

async function pickOutputUri(
  document: vscode.TextDocument,
  node: HeadingNode,
  extension: "pdf" | "png",
  current?: vscode.Uri,
): Promise<vscode.Uri | undefined> {
  const defaultUri =
    current ??
    (await buildDefaultOutputUri(document, node, extension));

  const uri = await vscode.window.showSaveDialog({
    defaultUri,
    filters:
      extension === "pdf"
        ? { PDF: ["pdf"] }
        : { PNG: ["png"] },
    saveLabel: extension === "pdf" ? "Export PDF" : "Export PNG",
  });

  return uri;
}

async function buildDefaultOutputUri(
  document: vscode.TextDocument,
  node: HeadingNode,
  extension: "pdf" | "png",
): Promise<vscode.Uri | undefined> {
  if (document.isUntitled) {
    return undefined;
  }

  const docPath = document.uri.fsPath;
  const parsed = path.parse(docPath);
  const sanitized = makeSafeFileComponent(node.label);
  const defaultName = `${parsed.name}-${sanitized || "subtree"}.${extension}`;
  const defaultPath = path.join(parsed.dir, defaultName);
  return vscode.Uri.file(defaultPath);
}

async function editExtraImports(
  document: vscode.TextDocument,
  currentValue: string,
): Promise<string | undefined> {
  const snippet = buildDocumentSnippet(document);
  if (snippet) {
    try {
      const preview = await vscode.workspace.openTextDocument({
        content: snippet,
        language: document.languageId,
      });
      void vscode.window.showTextDocument(preview, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: true,
        preserveFocus: true,
      });
    } catch {
      // best effort preview; ignore failures
    }
  }

  const updated = await vscode.window.showInputBox({
    title: "Extra Typst imports",
    value: currentValue,
    prompt:
      "Paste Typst import directives to prepend to the exported subtree.",
    valueSelection: [0, currentValue.length],
    ignoreFocusOut: true,
    placeHolder: "Example: #import \"./components.typ\": example",
  });

  return updated === undefined ? undefined : updated;
}

async function editImagePpi(current: number): Promise<number | undefined> {
  const updated = await vscode.window.showInputBox({
    title: "PNG resolution (ppi)",
    value: current.toString(),
    prompt: "Enter a positive integer value for rasterization ppi.",
    ignoreFocusOut: true,
    validateInput: (value) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return "Enter a positive integer.";
      }
      if (parsed > 1200) {
        return "PPI too high; choose a value up to 1200.";
      }
      return undefined;
    },
  });

  if (updated === undefined) {
    return undefined;
  }

  return Number(updated);
}

function buildDocumentSnippet(document: vscode.TextDocument): string | undefined {
  if (document.lineCount === 0) {
    return undefined;
  }

  const snippetLineCount = Math.min(40, document.lineCount);
  const range = new vscode.Range(
    new vscode.Position(0, 0),
    document.lineAt(snippetLineCount - 1).range.end,
  );
  return document.getText(range);
}

async function exportSubtreeAsPdf(
  ctx: ExportCommandContext,
  document: vscode.TextDocument,
  node: HeadingNode,
  slice: SubtreeSlice,
  settings: PdfSettings,
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Exporting "${node.label}" as PDF`,
      },
      async (progress) => {
        progress.report({ message: "Preparing content…" });
        await performPdfExport(ctx, document, slice.text, settings, progress);
      },
    );
    void vscode.window.showInformationMessage(
      `PDF exported to ${settings.outputUri.fsPath}`,
    );
  } catch (error) {
    handleExportError("PDF", error);
  }
}

async function exportSubtreeAsPng(
  ctx: ExportCommandContext,
  document: vscode.TextDocument,
  node: HeadingNode,
  slice: SubtreeSlice,
  settings: PngSettings,
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Exporting "${node.label}" as PNG`,
      },
      async (progress) => {
        progress.report({ message: "Preparing content…" });
        await performPngExport(ctx, document, slice.text, settings, progress);
      },
    );
    void vscode.window.showInformationMessage(
      `PNG exported to ${settings.outputUri.fsPath}`,
    );
  } catch (error) {
    handleExportError("PNG", error);
  }
}

function handleExportError(target: "PDF" | "PNG", error: unknown): void {
  if (error instanceof ExportError) {
    void vscode.window.showErrorMessage(error.message);
    return;
  }

  console.error(`Failed to export ${target}:`, error);
  void vscode.window.showErrorMessage(
    `Failed to export ${target}. Check the developer console for details.`,
  );
}

async function performPdfExport(
  ctx: ExportCommandContext,
  document: vscode.TextDocument,
  subtreeText: string,
  settings: PdfSettings,
  progress: ProgressReporter,
): Promise<void> {
  await ensureOutputDirectory(settings.outputUri);
  progress.report({ message: "Writing temporary Typst document…" });
  const temp = await createTemporaryTypstDocument(
    document,
    subtreeText,
    settings.extraImports,
  );

  try {
    progress.report({ message: "Running Typst compiler…" });
    await runTypstCompile(temp.filePath, settings.outputUri, {
      format: "pdf",
    });
  } finally {
    await temp.cleanup();
  }
}

interface TemporaryTypstDocument {
  filePath: string;
  cleanup: () => Promise<void>;
}

interface CompileOptions {
  format: "pdf" | "png";
  ppi?: number;
}

async function ensureOutputDirectory(outputUri: vscode.Uri): Promise<void> {
  const directory = path.dirname(outputUri.fsPath);
  try {
    await fs.mkdir(directory, { recursive: true });
  } catch (error) {
    throw new ExportError(
      `Unable to create the output directory:\n${directory}\n${String(error)}`,
    );
  }
}

async function createTemporaryTypstDocument(
  document: vscode.TextDocument,
  subtreeText: string,
  extraImports: string,
): Promise<TemporaryTypstDocument> {
  if (document.isUntitled) {
    throw new ExportError("Save the document before exporting.");
  }

  const documentPath = document.uri.fsPath;
  const directory = path.dirname(documentPath);
  const extension = path.extname(documentPath) || ".typ";
  const tempName = `.aht-export-${randomUUID()}${extension}`;
  const tempPath = path.join(directory, tempName);
  const content = composeTypstContent(subtreeText, extraImports);

  try {
    await fs.writeFile(tempPath, content, { encoding: "utf8" });
  } catch (error) {
    throw new ExportError(
      `Failed to create a temporary Typst file in:\n${directory}\n${String(error)}`,
    );
  }

  return {
    filePath: tempPath,
    cleanup: async () => {
      try {
        await fs.rm(tempPath, { force: true });
      } catch {
        // ignore cleanup failures
      }
    },
  };
}

async function runTypstCompile(
  inputPath: string,
  outputUri: vscode.Uri,
  options: CompileOptions,
): Promise<void> {
  const command = getCompilerCommand();
  const args = ["compile", inputPath, outputUri.fsPath, `--format=${options.format}`];

  if (options.format === "png" && options.ppi) {
    args.push(`--ppi=${options.ppi}`);
  }

  const cwd = path.dirname(inputPath);
  const result = await spawnWithCapture(command, args, cwd);

  if (result.code !== 0) {
    const output = result.stderr.trim() || result.stdout.trim();
    throw new ExportError(
      `Compiler exited with code ${result.code}.\n${truncate(output, 600)}`,
    );
  }
}

function composeTypstContent(
  subtreeText: string,
  extraImports: string,
): string {
  const normalizedImports = normalizeNewlines(extraImports).trim();
  const normalizedSubtree = normalizeNewlines(subtreeText).trimStart();

  const parts = [];
  if (normalizedImports.length > 0) {
    parts.push(normalizedImports);
  }
  parts.push(normalizedSubtree);

  let combined = parts.join("\n\n");
  if (!combined.endsWith("\n")) {
    combined += "\n";
  }
  return combined;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function getCompilerCommand(): string {
  const configured =
    vscode.workspace
      .getConfiguration("adjustHeadingInTree.export")
      .get<string>("typstCommand")
      ?.trim() ?? "";
  return configured.length > 0 ? configured : "tinymist";
}

async function spawnWithCapture(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    console.log(`Running command: ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        reject(
          new ExportError(
            `Compiler command "${command}" was not found. Set "adjustHeadingInTree.export.typstCommand" to the tinymist or typst executable.`,
          ),
        );
        return;
      }
      reject(
        new ExportError(
          `Failed to start compiler "${command}": ${nodeError.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (stdout) {
        console.log(stdout);
      }
      if (stderr) {
        console.error(stderr);
      }
      resolve({ code, stdout, stderr });
    });
  });
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}
async function performPngExport(
  ctx: ExportCommandContext,
  document: vscode.TextDocument,
  subtreeText: string,
  settings: PngSettings,
  progress: ProgressReporter,
): Promise<void> {
  await ensureOutputDirectory(settings.outputUri);
  progress.report({ message: "Writing temporary Typst document…" });
  const temp = await createTemporaryTypstDocument(
    document,
    subtreeText,
    settings.extraImports,
  );

  try {
    progress.report({ message: "Running Typst compiler…" });
    await runTypstCompile(temp.filePath, settings.outputUri, {
      format: "png",
      ppi: settings.ppi,
    });
  } finally {
    await temp.cleanup();
  }
}
