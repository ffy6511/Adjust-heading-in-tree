import * as vscode from "vscode";
import { HeadingProvider, HeadingNode } from "../providers/headingProvider";
import { parseHeadings, HeadingKind } from "../providers/parser";
import { applyHeadingEdits, HeadingShiftEdit } from "../utils/textEditHelper";

const MARKDOWN_LIMIT = 6;
const TYPST_LIMIT = 6;

export function registerShiftCommands(
  provider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>,
): vscode.Disposable {
  const shiftUp = vscode.commands.registerCommand(
    "headingNavigator.shiftUp",
    async (item?: HeadingNode, selectedItems?: readonly HeadingNode[]) => {
      await performShift(provider, treeView, -1, item, selectedItems);
    },
  );

  const shiftDown = vscode.commands.registerCommand(
    "headingNavigator.shiftDown",
    async (item?: HeadingNode, selectedItems?: readonly HeadingNode[]) => {
      await performShift(provider, treeView, 1, item, selectedItems);
    },
  );

  return vscode.Disposable.from(shiftUp, shiftDown);
}

async function performShift(
  provider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>,
  offset: number,
  item?: HeadingNode,
  selectedItems?: readonly HeadingNode[],
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage(
      "Open a document to adjust headings.",
    );
    return;
  }

  const nodes = collectTreeNodes(treeView, item, selectedItems);
  const targets = resolveHeadingTargets(
    provider,
    treeView,
    nodes,
    editor.document,
    editor.selection,
  );
  if (targets.length === 0) {
    void vscode.window.showInformationMessage(
      "No headings to shift in the current selection.",
    );
    return;
  }

  const applied = await shiftHeadingsByOffset(editor, targets, offset);
  if (!applied) {
    void vscode.window.showInformationMessage(
      "No headings to shift in the current selection.",
    );
    return;
  }

  provider.refresh(editor.document);
}

interface HeadingTarget {
  kind: HeadingKind;
  level: number;
  line: number;
}

async function shiftHeadingsByOffset(
  editor: vscode.TextEditor,
  targets: HeadingTarget[],
  offset: number,
): Promise<boolean> {
  const document = editor.document;
  const edits: HeadingShiftEdit[] = [];
  const seen = new Set<number>();

  targets.forEach((target) => {
    if (seen.has(target.line)) {
      return;
    }
    seen.add(target.line);

    const newLevel = clampLevel(target.kind, target.level + offset);
    if (newLevel === target.level) {
      return;
    }

    const line = document.lineAt(target.line);
    const newText = rebuildHeadingLine(line.text, target.kind, newLevel);
    if (!newText) {
      return;
    }

    edits.push({
      range: line.range,
      replacement: newText,
    });
  });

  if (edits.length === 0) {
    return false;
  }

  await applyHeadingEdits(document, edits);
  return true;
}

function clampLevel(kind: HeadingKind, level: number): number {
  const min = 1;
  const max = kind === "markdown" ? MARKDOWN_LIMIT : TYPST_LIMIT;
  return Math.min(Math.max(level, min), max);
}

function rebuildHeadingLine(
  lineText: string,
  kind: HeadingKind,
  level: number,
): string | undefined {
  if (kind === "markdown") {
    const match = /^(#+)(\s+)(.*)$/.exec(lineText);
    if (!match) {
      return undefined;
    }

    const hashes = "#".repeat(level);
    const separator = match[2] || " ";
    const content = match[3] ?? "";
    return `${hashes}${separator}${content}`;
  }

  const match = /^(=+)(\s*)(.*)$/.exec(lineText);
  if (!match) {
    return undefined;
  }

  const markers = "=".repeat(level);
  const separator = match[2] || " ";
  const content = match[3] ?? "";
  const normalizedSeparator = separator.length > 0 ? separator : " ";
  return `${markers}${normalizedSeparator}${content}`;
}

function resolveHeadingTargets(
  provider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>,
  nodes: HeadingNode[],
  document: vscode.TextDocument,
  editorSelection: vscode.Selection,
): HeadingTarget[] {
  if (nodes.length > 0) {
    return collectFromNodes(provider, nodes);
  }

  if (treeView.selection.length > 0) {
    return collectFromNodes(provider, [...treeView.selection]);
  }

  const range = editorSelection.isEmpty
    ? document.lineAt(editorSelection.active.line).range
    : new vscode.Range(editorSelection.start, editorSelection.end);

  return collectFromDocumentRange(document, range);
}

function collectFromNodes(
  provider: HeadingProvider,
  nodes: HeadingNode[],
): HeadingTarget[] {
  const targets = new Map<number, HeadingTarget>();
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop()!;
    targets.set(node.range.start.line, {
      kind: node.kind,
      level: node.level,
      line: node.range.start.line,
    });

    stack.push(...node.children);
  }

  return Array.from(targets.values()).sort((a, b) => a.line - b.line);
}

function collectFromDocumentRange(
  document: vscode.TextDocument,
  range: vscode.Range,
): HeadingTarget[] {
  const headings = parseHeadings(document.getText());
  const startLine = range.start.line;
  const endLine = range.end.line;

  return headings
    .filter((heading) => heading.line >= startLine && heading.line <= endLine)
    .map((heading) => ({
      kind: heading.kind,
      level: heading.level,
      line: heading.line,
    }));
}

function collectTreeNodes(
  treeView: vscode.TreeView<HeadingNode>,
  item: HeadingNode | undefined,
  selectedItems: readonly HeadingNode[] | undefined,
): HeadingNode[] {
  if (item) {
    return [item];
  }

  if (selectedItems && selectedItems.length > 0) {
    return [...selectedItems];
  }

  if (treeView.selection.length > 0) {
    return [...treeView.selection];
  }

  return [];
}
