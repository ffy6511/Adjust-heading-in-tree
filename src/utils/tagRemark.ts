import * as vscode from "vscode";

export type CommentKind = "markdown" | "typst";

export interface HeadingCommentEdit {
  startLine: number;
  deleteLineCount: number;
  lines: string[];
}

export function escapeRemark(value: string): string {
  return value.replace(/::/g, "\\:\\:");
}

export function unescapeRemark(value: string): string {
  return value.replace(/\\:\\:/g, "::");
}

export function extractCommentContent(
  lineText: string,
  kind: CommentKind,
): string | undefined {
  if (kind === "markdown") {
    const match = /<!--\s*(.*?)\s*-->\s*$/.exec(lineText);
    return match ? match[1] : undefined;
  }

  const match = /\/\/\s*(.*)$/.exec(lineText);
  return match ? match[1] : undefined;
}

export function extractHeadingCommentContent(
  lines: readonly string[],
  headingLine: number,
  kind: CommentKind,
): string | undefined {
  const nextLine = lines[headingLine + 1];
  const nextLineComment =
    nextLine === undefined
      ? undefined
      : extractStandaloneCommentContent(nextLine, kind);
  if (nextLineComment !== undefined) {
    return nextLineComment;
  }

  const headingText = lines[headingLine];
  return headingText === undefined
    ? undefined
    : extractCommentContent(headingText, kind);
}

export function extractStandaloneCommentContent(
  lineText: string | undefined,
  kind: CommentKind,
): string | undefined {
  if (lineText === undefined) {
    return undefined;
  }

  if (kind === "markdown") {
    const match = /^\s*<!--\s*(.*?)\s*-->\s*$/.exec(lineText);
    return match ? match[1] : undefined;
  }

  const match = /^\s*\/\/\s*(.*?)\s*$/.exec(lineText);
  return match ? match[1] : undefined;
}

export function parseCommentContent(comment: string): {
  tags: string[];
  remark?: string;
} {
  const remarkMatch = /::(.*?)::/.exec(comment);
  let remark: string | undefined;
  let remaining = comment;

  if (remarkMatch) {
    remark = unescapeRemark(remarkMatch[1].trim());
    remaining = (
      comment.slice(0, remarkMatch.index) +
      comment.slice(remarkMatch.index + remarkMatch[0].length)
    ).trim();
  }

  return { tags: extractTagsFromComment(remaining), remark };
}

export function buildCommentContent(tags: string[], remark?: string): string {
  const cleanTags = tags.map((tag) => tag.trim()).filter(Boolean);
  const tagPart =
    cleanTags.length > 0 ? cleanTags.map((tag) => `#${tag}`).join(" ") : "";
  const remarkValue = remark?.trim();
  const remarkPart =
    remarkValue && remarkValue.length > 0
      ? `:: ${escapeRemark(remarkValue)} ::`
      : "";

  return [tagPart, remarkPart].filter(Boolean).join(" ").trim();
}

export function stripLineComment(lineText: string, kind: CommentKind): string {
  if (kind === "markdown") {
    return lineText.replace(/\s*<!--\s*.*?-->\s*$/, "");
  }

  return lineText.replace(/\s*\/\/.*$/, "");
}

export function hasStandaloneComment(
  lineText: string | undefined,
  kind: CommentKind,
): boolean {
  return extractStandaloneCommentContent(lineText, kind) !== undefined;
}

export function buildCommentLine(
  kind: CommentKind,
  tags: string[],
  remark?: string,
): string | undefined {
  const content = buildCommentContent(tags, remark);
  if (!content) {
    return undefined;
  }

  return kind === "markdown" ? `<!-- ${content} -->` : `// ${content}`;
}

export function updateHeadingWithComment(
  lines: readonly string[],
  headingLine: number,
  kind: CommentKind,
  tags: string[],
  remark?: string,
): HeadingCommentEdit {
  const headingText = lines[headingLine] ?? "";
  const base = stripLineComment(headingText, kind).trimEnd();
  const nextLineHasComment = hasStandaloneComment(lines[headingLine + 1], kind);
  const deleteLineCount = nextLineHasComment ? 2 : 1;
  const comment = buildCommentLine(kind, tags, remark);

  return {
    startLine: headingLine,
    deleteLineCount,
    lines: comment ? [base, comment] : [base],
  };
}

export function createHeadingCommentReplacement(
  document: vscode.TextDocument,
  headingLine: number,
  kind: CommentKind,
  tags: string[],
  remark?: string,
): { range: vscode.Range; text: string } {
  const lines = Array.from(
    { length: document.lineCount },
    (_, index) => document.lineAt(index).text,
  );
  const edit = updateHeadingWithComment(lines, headingLine, kind, tags, remark);
  const endLine = Math.min(
    edit.startLine + edit.deleteLineCount,
    document.lineCount,
  );
  const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
  const hasFollowingLine = endLine < document.lineCount;

  return {
    range: new vscode.Range(edit.startLine, 0, endLine, 0),
    text: edit.lines.join(eol) + (hasFollowingLine ? eol : ""),
  };
}

export function updateLineWithComment(
  lineText: string,
  kind: CommentKind,
  tags: string[],
  remark?: string,
): string {
  const base = stripLineComment(lineText, kind).trimEnd();
  const content = buildCommentContent(tags, remark);
  if (!content) {
    return base;
  }

  const comment = kind === "markdown" ? `<!-- ${content} -->` : `// ${content}`;
  return `${base} ${comment}`.trimEnd();
}

export function normalizeTagsAndRemark(
  tags: string[],
  remark: string | undefined,
  remarkTagName: string,
  options?: { ensureRemarkTag?: boolean },
): { tags: string[]; remark?: string } {
  // Normalize remark/tag relationship; optionally add remark tag.
  const ensureRemarkTag = options?.ensureRemarkTag ?? true;
  const uniqueTags: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) {
      continue;
    }
    if (!uniqueTags.includes(trimmed)) {
      uniqueTags.push(trimmed);
    }
  }

  const remarkValue = remark?.trim();
  const hasRemark = !!(remarkValue && remarkValue.length > 0);
  let normalizedTags = uniqueTags;
  let normalizedRemark = hasRemark ? remarkValue : undefined;

  if (hasRemark) {
    if (ensureRemarkTag && remarkTagName) {
      if (!normalizedTags.includes(remarkTagName)) {
        normalizedTags = [...normalizedTags, remarkTagName];
      }
    }
  } else {
    normalizedTags = normalizedTags.filter((tag) => tag !== remarkTagName);
  }

  // Drop remark when remark tag is removed.
  if (!ensureRemarkTag && !normalizedTags.includes(remarkTagName)) {
    normalizedRemark = undefined;
  }

  return { tags: normalizedTags, remark: normalizedRemark };
}

export function getCommentKindForDocument(
  document: vscode.TextDocument,
): CommentKind {
  if (document.languageId === "typst") {
    return "typst";
  }
  if (document.uri.fsPath.toLowerCase().endsWith(".typ")) {
    return "typst";
  }
  return "markdown";
}

function extractTagsFromComment(comment: string): string[] {
  return comment
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.startsWith("#") && token.length > 1)
    .map((token) => token.slice(1));
}
