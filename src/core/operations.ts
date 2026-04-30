import { formatHeadingInlineComments } from "./headingCommentFormat";
import { parseHeadings } from "./parser";
import { HeadingSelector, selectHeading } from "./selector";
import { computeHeadingBlockRange } from "./subtree";
import {
  HeadingCommentEdit,
  normalizeTagsAndRemark,
  updateHeadingWithComment,
} from "./tagComment";
import { buildHeadingTree } from "./tree";
import { HeadingDocument, HeadingNodeCore } from "./types";

export interface OperationResult {
  content: string;
  document: HeadingDocument;
}

export function normalizeHeadingComments(
  content: string,
  kind: "markdown" | "typst",
): OperationResult {
  const result = formatHeadingInlineComments(content, kind);
  return buildOperationResult(result.content);
}

export function setHeadingTags(
  content: string,
  selector: HeadingSelector,
  tags: string[],
  remarkTagName: string,
): OperationResult {
  const parsed = parseDocument(content);
  const node = selectHeading(parsed.document, selector);
  const normalized = normalizeTagsAndRemark(tags, node.remark, remarkTagName, {
    ensureRemarkTag: false,
  });
  return applyHeadingCommentEdit(content, node, normalized.tags, normalized.remark);
}

export function setHeadingRemark(
  content: string,
  selector: HeadingSelector,
  remark: string | undefined,
  remarkTagName: string,
): OperationResult {
  const parsed = parseDocument(content);
  const node = selectHeading(parsed.document, selector);
  const normalized = normalizeTagsAndRemark(node.tags, remark, remarkTagName);
  return applyHeadingCommentEdit(content, node, normalized.tags, normalized.remark);
}

export function shiftHeading(
  content: string,
  selector: HeadingSelector,
  offset: number,
): OperationResult {
  const { document, lines, eol, hasTrailingEol } = parseDocument(content);
  const node = selectHeading(document, selector);
  const targets = [node, ...collectDescendants(node)];

  for (const target of targets) {
    lines[target.line] = rebuildHeadingLine(
      lines[target.line],
      target.kind,
      clampLevel(target.kind, target.level + offset),
    );
  }

  return buildOperationResult(joinLines(lines, eol, hasTrailingEol));
}

export function moveHeading(
  content: string,
  selector: HeadingSelector,
  targetSelector: HeadingSelector,
  placement: "before" | "after",
): OperationResult {
  const { document } = parseDocument(content);
  const source = selectHeading(document, selector);
  const target = selectHeading(document, targetSelector);

  if (source.id === target.id) {
    return buildOperationResult(content);
  }

  const sourceRange = computeHeadingBlockRange(content, document, source);
  const targetRange = computeHeadingBlockRange(content, document, target);

  if (
    targetRange.startOffset >= sourceRange.startOffset &&
    targetRange.startOffset < sourceRange.endOffset
  ) {
    throw new Error("Cannot move a heading into its own subtree");
  }

  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  let blockText = content.slice(sourceRange.startOffset, sourceRange.endOffset);
  let working = content.slice(0, sourceRange.startOffset) + content.slice(sourceRange.endOffset);
  let insertOffset =
    placement === "before" ? targetRange.startOffset : targetRange.endOffset;
  if (insertOffset > sourceRange.startOffset) {
    insertOffset -= sourceRange.endOffset - sourceRange.startOffset;
  }

  if (insertOffset < working.length && !blockText.endsWith("\n")) {
    blockText += eol;
  }

  working = working.slice(0, insertOffset) + blockText + working.slice(insertOffset);
  if (!content.endsWith("\n") && working.endsWith(eol)) {
    working = working.slice(0, -eol.length);
  }
  return buildOperationResult(working);
}

export function deleteHeading(
  content: string,
  selector: HeadingSelector,
): OperationResult {
  const { document } = parseDocument(content);
  const node = selectHeading(document, selector);
  const range = computeHeadingBlockRange(content, document, node);
  const nextContent =
    content.slice(0, range.startOffset) + content.slice(range.endOffset);
  return buildOperationResult(trimLeadingBlankLines(nextContent));
}

function applyHeadingCommentEdit(
  content: string,
  node: HeadingNodeCore,
  tags: string[],
  remark?: string,
): OperationResult {
  const { lines, eol, hasTrailingEol } = splitContent(content);
  const edit = updateHeadingWithComment(lines, node.line, node.kind, tags, remark);
  applyLineEdit(lines, edit);
  return buildOperationResult(joinLines(lines, eol, hasTrailingEol));
}

function applyLineEdit(lines: string[], edit: HeadingCommentEdit): void {
  lines.splice(edit.startLine, edit.deleteLineCount, ...edit.lines);
}

function buildOperationResult(content: string): OperationResult {
  return {
    content,
    document: buildHeadingTree(parseHeadings(content)),
  };
}

function parseDocument(content: string): {
  document: HeadingDocument;
  lines: string[];
  eol: string;
  hasTrailingEol: boolean;
} {
  const document = buildHeadingTree(parseHeadings(content));
  const { lines, eol, hasTrailingEol } = splitContent(content);
  return { document, lines, eol, hasTrailingEol };
}

function splitContent(content: string): {
  lines: string[];
  eol: string;
  hasTrailingEol: boolean;
} {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const hasTrailingEol = content.endsWith("\n");
  const lines = content.split(/\r?\n/);
  if (hasTrailingEol) {
    lines.pop();
  }
  return { lines, eol, hasTrailingEol };
}

function joinLines(lines: string[], eol: string, hasTrailingEol: boolean): string {
  return lines.join(eol) + (hasTrailingEol ? eol : "");
}

function collectDescendants(node: HeadingNodeCore): HeadingNodeCore[] {
  const descendants: HeadingNodeCore[] = [];
  const stack = [...node.children];

  while (stack.length > 0) {
    const current = stack.pop()!;
    descendants.push(current);
    stack.push(...current.children);
  }

  return descendants;
}

function clampLevel(kind: HeadingNodeCore["kind"], level: number): number {
  return Math.min(Math.max(level, 1), kind === "markdown" ? 6 : 6);
}

function rebuildHeadingLine(
  lineText: string,
  kind: HeadingNodeCore["kind"],
  level: number,
): string {
  if (kind === "markdown") {
    const match = /^(#+)(\s+)(.*)$/.exec(lineText);
    if (!match) {
      return lineText;
    }
    return `${"#".repeat(level)}${match[2] || " "}${match[3] ?? ""}`;
  }

  const match = /^(=+)(\s*)(.*)$/.exec(lineText);
  if (!match) {
    return lineText;
  }
  const separator = match[2] && match[2].length > 0 ? match[2] : " ";
  return `${"=".repeat(level)}${separator}${match[3] ?? ""}`;
}

function trimLeadingBlankLines(content: string): string {
  return content.replace(/^\s*\n/, "");
}
