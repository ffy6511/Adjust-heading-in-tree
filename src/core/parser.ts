import { sanitizeHeadingForDisplay } from "../utils/headingDisplay";
import {
  extractStandaloneCommentContent,
  parseCommentContent,
} from "./tagComment";
import { HeadingKind, HeadingMatchCore } from "./types";

const markdownHeading = /^(#{1,6})\s+(.*)$/;
const typstHeading = /^(=+)/;
const markdownCommentRegex = /<!--\s*(.*?)\s*-->\s*$/;
const typstCommentRegex = /\/\/\s*(.*)$/;

interface FenceState {
  marker: "`" | "~";
  length: number;
}

export function parseHeadings(content: string): HeadingMatchCore[] {
  const lines = content.split(/\r?\n/);
  const matches: HeadingMatchCore[] = [];
  let fence: FenceState | undefined;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber];
    if (fence) {
      if (isFenceEnd(line, fence)) {
        fence = undefined;
      }
      continue;
    }

    const fenceStart = detectFenceStart(line);
    if (fenceStart) {
      fence = fenceStart;
      continue;
    }

    const markdownResult = markdownHeading.exec(line);
    if (markdownResult) {
      const [, hashes, rawText] = markdownResult;
      const inline = parseMarkdownTags(rawText);
      const nextLineComment = parseNextLineComment(lines, lineNumber, "markdown");
      const { text } = inline;
      const tags = nextLineComment?.tags ?? inline.tags;
      const remark = nextLineComment?.remark ?? inline.remark;
      const displayText = sanitizeHeadingForDisplay(text, "markdown");
      matches.push(
        makeMatch(
          "markdown",
          lineNumber,
          hashes.length,
          text,
          displayText,
          line.length,
          tags,
          remark,
        ),
      );
      continue;
    }

    const typstResult = parseTypstHeading(line);
    if (typstResult) {
      const nextLineComment = parseNextLineComment(lines, lineNumber, "typst");
      const { level, text } = typstResult;
      const tags = nextLineComment?.tags ?? typstResult.tags;
      const remark = nextLineComment?.remark ?? typstResult.remark;
      const displayText = sanitizeHeadingForDisplay(text, "typst");
      matches.push(
        makeMatch(
          "typst",
          lineNumber,
          level,
          text,
          displayText,
          line.length,
          tags,
          remark,
        ),
      );
    }
  }

  return matches;
}

function parseNextLineComment(
  lines: readonly string[],
  lineNumber: number,
  kind: HeadingKind,
): { tags: string[]; remark?: string } | undefined {
  const comment = extractStandaloneCommentContent(lines[lineNumber + 1], kind);
  return comment === undefined ? undefined : parseCommentContent(comment);
}

function detectFenceStart(line: string): FenceState | undefined {
  const normalized = normalizeFenceLine(line);
  if (!normalized) {
    return undefined;
  }

  const marker = matchFenceMarker(normalized);
  if (!marker) {
    return undefined;
  }

  const kind = marker[0] as FenceState["marker"];
  if (kind !== "`" && kind !== "~") {
    return undefined;
  }

  return { marker: kind, length: marker.length };
}

function isFenceEnd(line: string, fence: FenceState): boolean {
  const normalized = normalizeFenceLine(line);
  if (!normalized) {
    return false;
  }

  let markerLength = 0;
  while (
    markerLength < normalized.length &&
    normalized[markerLength] === fence.marker
  ) {
    markerLength++;
  }

  if (markerLength < fence.length) {
    return false;
  }

  return normalized.slice(markerLength).trim().length === 0;
}

function normalizeFenceLine(line: string): string {
  let index = 0;
  let spaces = 0;
  while (spaces < 3 && index < line.length && line[index] === " ") {
    index++;
    spaces++;
  }

  let normalized = line.slice(index);
  while (normalized.startsWith(">")) {
    normalized = normalized.slice(1);
    while (normalized.startsWith(" ")) {
      normalized = normalized.slice(1);
    }
  }

  return normalized;
}

function matchFenceMarker(line: string): string | undefined {
  if (!line.startsWith("```") && !line.startsWith("~~~")) {
    return undefined;
  }

  const markerChar = line[0];
  let length = 0;
  while (length < line.length && line[length] === markerChar) {
    length++;
  }

  return length >= 3 ? line.slice(0, length) : undefined;
}

function parseMarkdownTags(rawText: string): {
  text: string;
  tags: string[];
  remark?: string;
} {
  const match = markdownCommentRegex.exec(rawText);
  if (!match) {
    return { text: rawText.trim(), tags: [], remark: undefined };
  }

  const { tags, remark } = parseCommentContent(match[1]);
  const text = rawText.slice(0, match.index).trim();
  return { text, tags, remark };
}

function parseTypstHeading(
  line: string,
):
  | { level: number; text: string; tags: string[]; remark?: string }
  | undefined {
  const match = typstHeading.exec(line);
  if (!match) {
    return undefined;
  }

  const level = match[1].length;
  const content = line.slice(level);
  const commentMatch = typstCommentRegex.exec(content);
  if (commentMatch) {
    const { tags, remark } = parseCommentContent(commentMatch[1]);
    const text = content.slice(0, commentMatch.index).trim();
    if (!text) {
      return undefined;
    }
    return { level, text, tags, remark };
  }

  const text = content.trim();
  if (!text) {
    return undefined;
  }

  return { level, text, tags: [], remark: undefined };
}

function makeMatch(
  kind: HeadingKind,
  line: number,
  level: number,
  text: string,
  displayText: string,
  lineLength: number,
  tags: string[],
  remark?: string,
): HeadingMatchCore {
  return {
    kind,
    line,
    level,
    text,
    displayText,
    tags,
    remark,
    range: {
      start: { line, character: 0 },
      end: { line, character: lineLength },
    },
  };
}
