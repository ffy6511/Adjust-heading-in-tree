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

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber];
    const markdownResult = markdownHeading.exec(line);

    if (markdownResult) {
      const [, hashes, title] = markdownResult;
      matches.push(
        makeMatch(
          "markdown",
          lineNumber,
          hashes.length,
          title.trim(),
          line.length,
        ),
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

function parseTypstHeading(
  line: string,
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
  lineLength: number,
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
