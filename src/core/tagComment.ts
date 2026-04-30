import { HeadingKind } from "./types";

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
  kind: HeadingKind,
): string | undefined {
  if (kind === "markdown") {
    const match = /<!--\s*(.*?)\s*-->\s*$/.exec(lineText);
    return match ? match[1] : undefined;
  }

  const match = /\/\/\s*(.*)$/.exec(lineText);
  return match ? match[1] : undefined;
}

export function extractStandaloneCommentContent(
  lineText: string | undefined,
  kind: HeadingKind,
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

export function extractHeadingCommentContent(
  lines: readonly string[],
  headingLine: number,
  kind: HeadingKind,
): string | undefined {
  const nextLine = lines[headingLine + 1];
  const nextLineComment = extractStandaloneCommentContent(nextLine, kind);
  if (nextLineComment !== undefined) {
    return nextLineComment;
  }

  const headingText = lines[headingLine];
  return headingText === undefined
    ? undefined
    : extractCommentContent(headingText, kind);
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

export function stripLineComment(lineText: string, kind: HeadingKind): string {
  if (kind === "markdown") {
    return lineText.replace(/\s*<!--\s*.*?-->\s*$/, "");
  }

  return lineText.replace(/\s*\/\/.*$/, "");
}

export function hasStandaloneComment(
  lineText: string | undefined,
  kind: HeadingKind,
): boolean {
  return extractStandaloneCommentContent(lineText, kind) !== undefined;
}

export function buildCommentLine(
  kind: HeadingKind,
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
  kind: HeadingKind,
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

export function normalizeTagsAndRemark(
  tags: string[],
  remark: string | undefined,
  remarkTagName: string,
  options?: { ensureRemarkTag?: boolean },
): { tags: string[]; remark?: string } {
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
    if (ensureRemarkTag && remarkTagName && !normalizedTags.includes(remarkTagName)) {
      normalizedTags = [...normalizedTags, remarkTagName];
    }
  } else {
    normalizedTags = normalizedTags.filter((tag) => tag !== remarkTagName);
  }

  if (!ensureRemarkTag && !normalizedTags.includes(remarkTagName)) {
    normalizedRemark = undefined;
  }

  return { tags: normalizedTags, remark: normalizedRemark };
}

function extractTagsFromComment(comment: string): string[] {
  return comment
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.startsWith("#") && token.length > 1)
    .map((token) => token.slice(1));
}
