import * as vscode from "vscode";
import { HeadingNode } from "../providers/headingProvider";

/**
 * Represents the computed subtree slice for a heading.
 */
export interface SubtreeSlice {
  range: vscode.Range;
  text: string;
}

/**
 * Computes the text range covered by a heading and its descendants.
 */
export function computeSubtreeSlice(
  document: vscode.TextDocument,
  root: HeadingNode,
  orderedNodes: HeadingNode[],
): SubtreeSlice {
  const range = computeSubtreeRange(document, root, orderedNodes);
  return {
    range,
    text: document.getText(range),
  };
}

/**
 * Sanitizes a heading title so it can be safely used in a filename.
 */
export function makeSafeFileComponent(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return "untitled";
  }

  return trimmed
    .replace(/[\s/\\:?*"<>|]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

function computeSubtreeRange(
  document: vscode.TextDocument,
  root: HeadingNode,
  orderedNodes: HeadingNode[],
): vscode.Range {
  const rootIndex = orderedNodes.findIndex((node) => node.id === root.id);
  if (rootIndex === -1) {
    return root.range;
  }

  const rootLevel = root.level;
  let endPosition: vscode.Position | undefined;
  for (let index = rootIndex + 1; index < orderedNodes.length; index++) {
    const candidate = orderedNodes[index];
    if (candidate.level <= rootLevel) {
      endPosition = candidate.range.start;
      break;
    }
  }

  if (!endPosition) {
    if (document.lineCount === 0) {
      endPosition = root.range.end;
    } else {
      endPosition = document.lineAt(document.lineCount - 1).range.end;
    }
  }

  return new vscode.Range(root.range.start, endPosition);
}
