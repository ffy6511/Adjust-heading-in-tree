import { HeadingDocument, HeadingNodeCore } from "./types";

export interface HeadingBlockRange {
  startLine: number;
  endLineExclusive: number;
  startOffset: number;
  endOffset: number;
}

export interface SubtreeSlice {
  range: HeadingBlockRange;
  text: string;
}

export function computeHeadingBlockRange(
  content: string,
  document: HeadingDocument,
  node: HeadingNodeCore,
): HeadingBlockRange {
  const lines = content.split(/\r?\n/);
  const lineStarts = computeLineStarts(content);
  const startLine = node.line;
  let endLineExclusive = lines.length;

  for (const candidate of document.orderedNodes) {
    if (candidate.line <= startLine) {
      continue;
    }
    if (candidate.level <= node.level) {
      endLineExclusive = candidate.line;
      break;
    }
  }

  const startOffset = lineStarts[startLine] ?? 0;
  const endOffset =
    endLineExclusive < lineStarts.length
      ? lineStarts[endLineExclusive]
      : content.length;

  return { startLine, endLineExclusive, startOffset, endOffset };
}

export function computeSubtreeSlice(
  content: string,
  document: HeadingDocument,
  node: HeadingNodeCore,
): SubtreeSlice {
  const range = computeHeadingBlockRange(content, document, node);
  return {
    range,
    text: content.slice(range.startOffset, range.endOffset),
  };
}

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

function computeLineStarts(content: string): number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index++) {
    if (content[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}
