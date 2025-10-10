import { Position, Range } from "vscode";

export type HeadingKind = "markdown" | "typst";

export interface HeadingMatch {
  kind: HeadingKind;
  level: number;
  text: string;
  line: number;
  range: Range;
}

const markdownHeading = /^(#{1,6})\s+(.*)$/;
const typstHeading = /^(=+)/;

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
      const [, hashes, title] = markdownResult;
      matches.push(
        makeMatch(
          "markdown",
          lineNumber,
          hashes.length,
          title.trim(),
          line.length
        )
      );
      continue;
    }

    const typstResult = parseTypstHeading(line);
    if (typstResult) {
      const { level, text } = typstResult;
      matches.push(makeMatch("typst", lineNumber, level, text, line.length));
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

function parseTypstHeading(
  line: string
): { level: number; text: string } | undefined {
  const match = typstHeading.exec(line);
  if (!match) {
    return undefined;
  }

  const level = match[1].length;
  const text = line.slice(level).trim();
  if (!text) {
    return undefined;
  }

  return { level, text };
}

function makeMatch(
  kind: HeadingKind,
  line: number,
  level: number,
  text: string,
  lineLength: number
): HeadingMatch {
  const start = new Position(line, 0);
  const end = new Position(line, lineLength);
  return {
    kind,
    level,
    text,
    line,
    range: new Range(start, end),
  };
}
