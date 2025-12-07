import { Position, Range } from "vscode";
import { sanitizeHeadingForDisplay } from "../utils/headingDisplay";

export type HeadingKind = "markdown" | "typst";

export interface HeadingMatch {
  kind: HeadingKind;
  level: number;
  text: string;
  displayText: string;
  line: number;
  range: Range;
  tags: string[];
}

const markdownHeading = /^(#{1,6})\s+(.*)$/;
const typstHeading = /^(=+)/;

// Tag extraction regexes
// Markdown: <!-- #tag1 #tag2 --> at the end of the line
const markdownTagRegex = /<!--\s*((?:#[\w\u4e00-\u9fff\-]+\s*)+)-->\s*$/;
// Typst: // #tag1 #tag2 at the end of the line
const typstTagRegex = /\/\/\s*((?:#[\w\u4e00-\u9fff\-]+\s*)+)$/;

/**
 * 解析 Markdown（`#`）与 Typst（`=`）标题，返回标题命中的结果列表。
 */
export function parseHeadings(content: string): HeadingMatch[] {
  const lines = content.split(/\r?\n/);
  const matches: HeadingMatch[] = [];
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
      const { text, tags } = parseMarkdownTags(rawText);
      const displayText = sanitizeHeadingForDisplay(text, "markdown");
      matches.push(
        makeMatch(
          "markdown",
          lineNumber,
          hashes.length,
          text,
          displayText,
          line.length,
          tags
        )
      );
      continue;
    }

    const typstResult = parseTypstHeading(line);
    if (typstResult) {
      const { level, text, tags } = typstResult;
      const displayText = sanitizeHeadingForDisplay(text, "typst");
      matches.push(
        makeMatch(
          "typst",
          lineNumber,
          level,
          text,
          displayText,
          line.length,
          tags
        )
      );
    }
  }

  return matches;
}

interface FenceState {
  marker: "`" | "~";
  length: number;
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

  const trailing = normalized.slice(markerLength);
  return trailing.trim().length === 0;
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

  if (length < 3) {
    return undefined;
  }

  return line.slice(0, length);
}

function parseMarkdownTags(rawText: string): { text: string; tags: string[] } {
  const match = markdownTagRegex.exec(rawText);
  if (match) {
    const tagString = match[1];
    const tags = extractTags(tagString);
    const text = rawText.slice(0, match.index).trim();
    return { text, tags };
  }
  return { text: rawText.trim(), tags: [] };
}

function parseTypstHeading(
  line: string
): { level: number; text: string; tags: string[] } | undefined {
  const match = typstHeading.exec(line);
  if (!match) {
    return undefined;
  }

  const level = match[1].length;
  const content = line.slice(level);

  // Check for tags
  const tagMatch = typstTagRegex.exec(content);
  if (tagMatch) {
    const tagString = tagMatch[1];
    const tags = extractTags(tagString);
    const text = content.slice(0, tagMatch.index).trim();
    return { level, text, tags };
  }

  const text = content.trim();
  if (!text) {
    return undefined;
  }

  return { level, text, tags: [] };
}

function extractTags(tagString: string): string[] {
  return tagString
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.startsWith("#"))
    .map((t) => t.slice(1));
}

function makeMatch(
  kind: HeadingKind,
  line: number,
  level: number,
  text: string,
  displayText: string,
  lineLength: number,
  tags: string[]
): HeadingMatch {
  const start = new Position(line, 0);
  const end = new Position(line, lineLength);
  return {
    kind,
    level,
    text,
    displayText,
    line,
    range: new Range(start, end),
    tags,
  };
}
