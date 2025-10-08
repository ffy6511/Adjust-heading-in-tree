import * as fs from "fs/promises";
import { randomUUID } from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import { HeadingNode, HeadingProvider } from "../providers/headingProvider";
import {
  computeSubtreeSlice,
  makeSafeFileComponent,
  SubtreeSlice,
} from "../utils/subtree";

const TYPST_LANGUAGE_ID = "typst";
const EXPORT_CONFIG_SECTION = "adjustHeadingInTree.export";
const CONFIG_EXTRA_IMPORTS_FILE = "extraImportsFile";
const CONFIG_PNG_PPI = "pngPpi";
const TINYMIST_EXTENSION_ID = "myriad-dreamin.tinymist";

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
};

type ExportChoice = "pdf" | "png" | "settings";

interface PdfSettings {
  outputUri: vscode.Uri;
  extraImportsFile?: string;
}

interface PngSettings extends PdfSettings {
  ppi: number;
}

export function registerExportCommands(
  provider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>,
): vscode.Disposable {
  const context: ExportCommandContext = { provider, treeView };

  const openMenu = vscode.commands.registerCommand(
    "headingNavigator.openExportMenu",
    async (item?: HeadingNode, selectedItems?: readonly HeadingNode[]) => {
      await handleExportMenu(context, item, selectedItems);
    },
  );

  const openSettings = vscode.commands.registerCommand(
    "headingNavigator.openExportSettings",
    openExportSettings,
  );

  const editImportsSetting = vscode.commands.registerCommand(
    "headingNavigator.editExtraImportsSetting",
    editExtraImportsSetting,
  );

  return vscode.Disposable.from(openMenu, openSettings, editImportsSetting);
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
        detail: "Generate a PDF for the selected Typst subtree using Tinymist.",
        choice: "pdf",
      },
      {
        label: "$(file-media) Export as PNG",
        detail: "Render the subtree as a single merged PNG image.",
        choice: "png",
      },
      {
        label: "$(settings-gear) Export Settings",
        detail: "Open export settings or edit shared extra imports.",
        choice: "settings",
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

  if (choice.choice === "settings") {
    await openExportSettings();
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
    const settings = await configurePdfExport(editor.document, target);
    if (!settings) {
      return;
    }
    await exportSubtreeAsPdf(editor.document, target, slice, settings);
    return;
  }

  const settings = await configurePngExport(editor.document, target);
  if (!settings) {
    return;
  }
  await exportSubtreeAsPng(editor.document, target, slice, settings);
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

interface ExportConfiguration {
  extraImportsFile?: string;
  pngPpi: number;
}

function getExportConfiguration(document: vscode.TextDocument): ExportConfiguration {
  const config = vscode.workspace.getConfiguration(
    EXPORT_CONFIG_SECTION,
    document.uri,
  );
  const extraImportsFile = config.get<string>(CONFIG_EXTRA_IMPORTS_FILE, "");
  const pngPpi = config.get<number>(CONFIG_PNG_PPI, 144);
  return {
    extraImportsFile: extraImportsFile?.trim() ? extraImportsFile.trim() : undefined,
    pngPpi,
  };
}

function resolveConfigurationTarget(
  _uri?: vscode.Uri,
): vscode.ConfigurationTarget {
  if (vscode.workspace.workspaceFolders?.length) {
    return vscode.ConfigurationTarget.Workspace;
  }

  return vscode.ConfigurationTarget.Global;
}

async function openExportSettings(): Promise<void> {
  const selection = await vscode.window.showQuickPick<
    vscode.QuickPickItem & { action: "settings" | "imports" | "ppi" }
  >(
    [
      {
        label: "$(gear) Open Settings UI",
        description: "Adjust export preferences via VS Code Settings.",
        action: "settings",
      },
      {
        label: "$(edit) Edit extra Typst imports",
        description: "Open an editor to modify the shared imports snippet.",
        action: "imports",
      },
      {
        label: "$(symbol-parameter) Set default PNG PPI",
        description: "Update the PNG rasterization resolution.",
        action: "ppi",
      },
    ],
    {
      placeHolder: "Adjust subtree export behavior",
      ignoreFocusOut: true,
    },
  );

  if (!selection) {
    return;
  }

  if (selection.action === "settings") {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      EXPORT_CONFIG_SECTION,
    );
    return;
  }

  if (selection.action === "imports") {
    await editExtraImportsSetting();
    return;
  }

  const currentValue =
    vscode.workspace
      .getConfiguration(EXPORT_CONFIG_SECTION)
      .get<number>(CONFIG_PNG_PPI, 144);
  const updated = await editImagePpi(currentValue);
  if (updated === undefined) {
    return;
  }
  await updateExportSetting(CONFIG_PNG_PPI, updated);
  void vscode.window.showInformationMessage(
    `Default PNG PPI set to ${updated}.`,
  );
}

async function editExtraImportsSetting(): Promise<void> {
  const activeDocument = vscode.window.activeTextEditor?.document;
  const config = vscode.workspace.getConfiguration(
    EXPORT_CONFIG_SECTION,
    activeDocument?.uri,
  );
  const currentValue = config
    .get<string>(CONFIG_EXTRA_IMPORTS_FILE, "")
    ?.trim();
  const configured = await configureImportsFile(
    activeDocument,
    currentValue && currentValue.length > 0 ? currentValue : undefined,
  );
  if (!configured) {
    return;
  }

  await updateExportSetting(
    CONFIG_EXTRA_IMPORTS_FILE,
    configured,
    activeDocument?.uri,
  );
  void vscode.window.showInformationMessage(
    `Imports file set to ${configured}.`,
  );
}

async function updateExportSetting(
  key: string,
  value: unknown,
  uri?: vscode.Uri,
): Promise<void> {
  const target = resolveConfigurationTarget(uri);
  const config = vscode.workspace.getConfiguration(EXPORT_CONFIG_SECTION, uri);
  let sanitized = value;
  if (key === CONFIG_EXTRA_IMPORTS_FILE && typeof value === "string") {
    sanitized = value.trim();
  }
  await config.update(key, sanitized, target);
}

async function configureImportsFile(
  referenceDocument: vscode.TextDocument | undefined,
  currentStoredPath: string | undefined,
): Promise<string | undefined> {
  const workspaceBase = getWorkspaceBase(referenceDocument?.uri);
  const fallbackDir = referenceDocument
    ? path.dirname(referenceDocument.uri.fsPath)
    : workspaceBase;

  if (!workspaceBase && !fallbackDir) {
    void vscode.window.showErrorMessage(
      "Unable to determine a project folder for storing extra imports. Open a workspace or a Typst document first.",
    );
    return undefined;
  }

  if (currentStoredPath && currentStoredPath.length > 0) {
    const absolutePath = resolveImportsAbsolute(
      currentStoredPath,
      workspaceBase,
      fallbackDir,
    );
    await ensureImportsFileExists(absolutePath);
    await showImportsFile(absolutePath);
    return makeStoredImportsPath(absolutePath, workspaceBase);
  }

  const baseDir = workspaceBase ?? fallbackDir!;
  const defaultPath = path.join(baseDir, "subtree-imports.typ");
  await fs.mkdir(path.dirname(defaultPath), { recursive: true });

  const saveUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultPath),
    filters: { Typst: ["typ"] },
    saveLabel: "Choose Imports File",
  });

  if (!saveUri) {
    return undefined;
  }

  await ensureImportsFileExists(saveUri.fsPath);
  await showImportsFile(saveUri.fsPath);
  return makeStoredImportsPath(saveUri.fsPath, workspaceBase);
}

function getWorkspaceBase(uri?: vscode.Uri): string | undefined {
  if (uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) {
      return folder.uri.fsPath;
    }
  }
  const first = vscode.workspace.workspaceFolders?.[0];
  return first?.uri.fsPath;
}

function resolveImportsAbsolute(
  storedPath: string,
  workspaceBase?: string,
  fallbackDir?: string,
): string {
  if (path.isAbsolute(storedPath)) {
    return storedPath;
  }
  if (workspaceBase) {
    return path.join(workspaceBase, storedPath);
  }
  if (fallbackDir) {
    return path.join(fallbackDir, storedPath);
  }
  return path.resolve(storedPath);
}

function makeStoredImportsPath(
  absolutePath: string,
  workspaceBase?: string,
): string {
  if (workspaceBase) {
    const relative = path.relative(workspaceBase, absolutePath);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      return relative;
    }
  }
  return absolutePath;
}

async function ensureImportsFileExists(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    const banner = "// Typst imports for Adjust Heading in Tree\n";
    await fs.writeFile(filePath, banner, { encoding: "utf8" });
  }
}

async function showImportsFile(filePath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(filePath),
  );
  await vscode.window.showTextDocument(document, {
    preview: false,
    preserveFocus: false,
  });
}

async function loadImportsSnippet(
  document: vscode.TextDocument,
  storedPath: string | undefined,
): Promise<string> {
  if (!storedPath || storedPath.trim().length === 0) {
    return "";
  }

  const workspaceBase = getWorkspaceBase(document.uri);
  const absolutePath = resolveImportsAbsolute(
    storedPath,
    workspaceBase,
    path.dirname(document.uri.fsPath),
  );

  try {
    const content = await fs.readFile(absolutePath, { encoding: "utf8" });
    return normalizeNewlines(content);
  } catch (error) {
    throw new ExportError(
      `Failed to read imports file:\n${absolutePath}\n${String(error)}\nUse "Edit Extra Typst Imports" to recreate it.`,
    );
  }
}

async function configurePdfExport(
  document: vscode.TextDocument,
  node: HeadingNode,
): Promise<PdfSettings | undefined> {
  const config = getExportConfiguration(document);
  let extraImportsFile = config.extraImportsFile;
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
        label: extraImportsFile
          ? `$(edit) Imports file: ${extraImportsFile}`
          : "$(edit) Configure imports file…",
        description:
          "Edit the Typst snippet that will be prepended before export.",
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
      const configured = await configureImportsFile(document, extraImportsFile);
      if (configured) {
        extraImportsFile = configured;
        await updateExportSetting(
          CONFIG_EXTRA_IMPORTS_FILE,
          configured,
          document.uri,
        );
      }
      continue;
    }

    if (!outputUri) {
      void vscode.window.showWarningMessage(
        "Select a PDF output location before exporting.",
      );
      continue;
    }

    return { outputUri, extraImportsFile };
  }
}

async function configurePngExport(
  document: vscode.TextDocument,
  node: HeadingNode,
): Promise<PngSettings | undefined> {
  const config = getExportConfiguration(document);
  let extraImportsFile = config.extraImportsFile;
  let outputUri = await buildDefaultOutputUri(document, node, "png");
  let ppi = config.pngPpi;

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
        label: extraImportsFile
          ? `$(edit) Imports file: ${extraImportsFile}`
          : "$(edit) Configure imports file…",
        description:
          "Edit the Typst snippet that will be prepended before export.",
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
      const configured = await configureImportsFile(document, extraImportsFile);
      if (configured) {
        extraImportsFile = configured;
        await updateExportSetting(
          CONFIG_EXTRA_IMPORTS_FILE,
          configured,
          document.uri,
        );
      }
      continue;
    }

    if (selection.action === "ppi") {
      const edited = await editImagePpi(ppi);
      if (edited !== undefined) {
        ppi = edited;
        await updateExportSetting(CONFIG_PNG_PPI, ppi, document.uri);
      }
      continue;
    }

    if (!outputUri) {
      void vscode.window.showWarningMessage(
        "Select a PNG output location before exporting.",
      );
      continue;
    }

    return { outputUri, extraImportsFile, ppi };
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

async function exportSubtreeAsPdf(
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
        await performPdfExport(document, slice.text, settings, progress);
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
        await performPngExport(document, slice.text, settings, progress);
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
  document: vscode.TextDocument,
  subtreeText: string,
  settings: PdfSettings,
  progress: ProgressReporter,
): Promise<void> {
  const importsText = await loadImportsSnippet(
    document,
    settings.extraImportsFile,
  );
  await ensureOutputDirectory(settings.outputUri);
  progress.report({ message: "Writing temporary Typst document…" });
  const temp = await createTemporaryTypstDocument(
    document,
    subtreeText,
    importsText,
  );

  let shouldCleanup = true;
  try {
    progress.report({ message: "Running Tinymist export…" });
    const exportedPath = await runTinymistExport("Pdf", temp.filePath);
    await finalizeExportedFile(exportedPath, settings.outputUri);
  } catch (error) {
    shouldCleanup = false;
    throw enrichExportError(error, temp.filePath);
  } finally {
    if (shouldCleanup) {
      await temp.cleanup();
    }
  }
}

interface TemporaryTypstDocument {
  filePath: string;
  cleanup: () => Promise<void>;
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

async function performPngExport(
  document: vscode.TextDocument,
  subtreeText: string,
  settings: PngSettings,
  progress: ProgressReporter,
): Promise<void> {
  const importsText = await loadImportsSnippet(
    document,
    settings.extraImportsFile,
  );
  await ensureOutputDirectory(settings.outputUri);
  progress.report({ message: "Writing temporary Typst document…" });
  const temp = await createTemporaryTypstDocument(
    document,
    subtreeText,
    importsText,
  );

  let shouldCleanup = true;
  try {
    progress.report({ message: "Running Tinymist export…" });
    const exportedPath = await runTinymistExport("Png", temp.filePath, {
      ppi: settings.ppi,
      page: { merged: { gap: "0pt" } },
    });
    await finalizeExportedFile(exportedPath, settings.outputUri);
  } catch (error) {
    shouldCleanup = false;
    throw enrichExportError(error, temp.filePath);
  } finally {
    if (shouldCleanup) {
      await temp.cleanup();
    }
  }
}

async function runTinymistExport(
  kind: "Pdf" | "Png",
  tempFilePath: string,
  options?: Record<string, unknown>,
): Promise<string> {
  await ensureTinymistActivated();

  try {
    const exportedPath = await runTinymistCommand(kind, tempFilePath, options);
    return ensureExportPath(exportedPath, kind);
  } catch (primaryError) {
    if (!(primaryError instanceof ExportError)) {
      throw primaryError;
    }

    try {
      const fallbackPath = await runTinymistExportWithEditor(
        kind,
        tempFilePath,
        options,
      );
      return ensureExportPath(fallbackPath, kind);
    } catch (fallbackError) {
      if (fallbackError instanceof ExportError) {
        throw new ExportError(
          `${primaryError.message}\nFallback attempt failed:\n${fallbackError.message}`,
        );
      }
      throw fallbackError;
    }
  }
}

async function finalizeExportedFile(
  sourcePath: string,
  targetUri: vscode.Uri,
): Promise<void> {
  await waitForFile(sourcePath);

  const resolvedSource = path.resolve(sourcePath);
  const resolvedTarget = path.resolve(targetUri.fsPath);

  if (resolvedSource !== resolvedTarget) {
    await fs.copyFile(resolvedSource, resolvedTarget);
    await safeRemove(resolvedSource);
  }
}

async function waitForFile(
  filePath: string,
  attempts = 10,
  intervalMs = 150,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await fs.stat(filePath);
      return;
    } catch (error) {
      lastError = error;
      await delay(intervalMs);
    }
  }
  throw new ExportError(
    `Tinymist did not produce the expected file:\n${filePath}\n${String(lastError)}`,
  );
}

async function ensureTinymistActivated(): Promise<void> {
  const extension = vscode.extensions.getExtension(TINYMIST_EXTENSION_ID);
  if (!extension) {
    throw new ExportError(
      'Tinymist extension is required. Install "Tinymist Typst" to enable subtree export.',
    );
  }

  if (!extension.isActive) {
    try {
      await extension.activate();
    } catch (error) {
      throw new ExportError(
        `Failed to activate Tinymist extension:\n${String(error)}`,
      );
    }
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function safeRemove(filePath: string): Promise<void> {
  try {
    await fs.rm(filePath, { force: true });
  } catch {
    // ignore cleanup failure
  }
}

async function runTinymistCommand(
  kind: "Pdf" | "Png",
  inputPath: string,
  options?: Record<string, unknown>,
): Promise<unknown> {
  try {
    const commandId =
      kind === "Pdf" ? "tinymist.exportPdf" : "tinymist.exportPng";

    if (options) {
      return await vscode.commands.executeCommand<unknown>(
        commandId,
        inputPath,
        options,
      );
    }
    return await vscode.commands.executeCommand<unknown>(commandId, inputPath);
  } catch (error) {
    throw new ExportError(formatTinymistError(error));
  }
}

function formatTinymistError(error: unknown): string {
  if (error instanceof Error) {
    const message = (error.message ?? String(error)).trim();
    return `Tinymist reported an error while exporting:\n${message}`;
  }

  if (typeof error === "string") {
    return `Tinymist reported an error while exporting:\n${error.trim()}`;
  }

  try {
    return `Tinymist reported an error while exporting:\n${JSON.stringify(error)}`;
  } catch {
    return `Tinymist reported an error while exporting:\n${String(error)}`;
  }
}

async function runTinymistExportWithEditor(
  kind: "Pdf" | "Png",
  tempFilePath: string,
  options?: Record<string, unknown>,
): Promise<unknown> {
  const previousEditor = vscode.window.activeTextEditor;
  const previousDocument = previousEditor?.document;
  const previousSelections = previousEditor
    ? [...previousEditor.selections]
    : undefined;
  const previousViewColumn = previousEditor?.viewColumn;

  const tempDocument = await vscode.workspace.openTextDocument(tempFilePath);
  await vscode.window.showTextDocument(tempDocument, {
    preview: false,
    preserveFocus: false,
    viewColumn: previousViewColumn ?? vscode.ViewColumn.Active,
  });

  try {
    if (options) {
      return await vscode.commands.executeCommand<unknown>(
        "tinymist.export",
        kind,
        options,
      );
    }
    return await vscode.commands.executeCommand<unknown>(
      "tinymist.export",
      kind,
    );
  } catch (error) {
    throw new ExportError(formatTinymistError(error));
  } finally {
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

    if (previousDocument) {
      try {
        const editor = await vscode.window.showTextDocument(
          previousDocument,
          previousViewColumn,
        );
        if (previousSelections) {
          editor.selections = previousSelections;
        }
      } catch {
        // ignore restore failures
      }
    }
  }
}

function ensureExportPath(
  result: unknown,
  kind: "Pdf" | "Png",
): string {
  if (typeof result === "string" && result.trim() !== "") {
    return result;
  }
  throw new ExportError(
    `Tinymist did not return an output path while exporting ${kind}.`,
  );
}

function enrichExportError(error: unknown, tempFilePath: string): ExportError {
  const note = `Temporary Typst file preserved for inspection:\n${tempFilePath}`;
  if (error instanceof ExportError) {
    return new ExportError(`${error.message}\n${note}`);
  }
  return new ExportError(`${String(error)}\n${note}`);
}
