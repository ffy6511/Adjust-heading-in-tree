import { parseHeadings } from "./parser";
import { HeadingKind } from "./types";
import {
  buildCommentLine,
  extractCommentContent,
  hasStandaloneComment,
  stripLineComment,
} from "./tagComment";

export interface HeadingCommentFormatResult {
  content: string;
  changedCount: number;
}

export function formatHeadingInlineComments(
  content: string,
  kind: HeadingKind,
): HeadingCommentFormatResult {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const hasTrailingEol = content.endsWith("\n");
  const lines = content.split(/\r?\n/);
  if (hasTrailingEol) {
    lines.pop();
  }

  let changedCount = 0;
  const matches = parseHeadings(content)
    .filter((match) => match.kind === kind)
    .sort((a, b) => b.line - a.line);

  for (const match of matches) {
    const lineText = lines[match.line];
    if (lineText === undefined) {
      continue;
    }

    const inlineComment = extractCommentContent(lineText, kind);
    if (inlineComment === undefined) {
      continue;
    }

    lines[match.line] = stripLineComment(lineText, kind).trimEnd();
    if (!hasStandaloneComment(lines[match.line + 1], kind)) {
      const commentLine = buildCommentLine(kind, match.tags, match.remark);
      if (commentLine) {
        lines.splice(match.line + 1, 0, commentLine);
      }
    }

    changedCount += 1;
  }

  return {
    content: lines.join(eol) + (hasTrailingEol ? eol : ""),
    changedCount,
  };
}
