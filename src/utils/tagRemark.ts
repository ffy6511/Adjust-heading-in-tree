import * as vscode from "vscode";

export type CommentKind = "markdown" | "typst";

export function escapeRemark(value: string): string {
  return value.replace(/::/g, "\\:\\:");
}

export function unescapeRemark(value: string): string {
  return value.replace(/\\:\\:/g, "::");
}

export function extractCommentContent(
  lineText: string,
  kind: CommentKind
): string | undefined {
  if (kind === "markdown") {
    const match = /<!--\s*(.*?)\s*-->\s*$/.exec(lineText);
    return match ? match[1] : undefined;
  }

  const match = /\/\/\s*(.*)$/.exec(lineText);
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

export function stripLineComment(
  lineText: string,
  kind: CommentKind
): string {
  if (kind === "markdown") {
    return lineText.replace(/\s*<!--\s*.*?-->\s*$/, "");
  }

  return lineText.replace(/\s*\/\/.*$/, "");
}

export function updateLineWithComment(
  lineText: string,
  kind: CommentKind,
  tags: string[],
  remark?: string
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
  options?: { ensureRemarkTag?: boolean }
): { tags: string[]; remark?: string } {
  // Normalize remark/tag relationship; optionally keep auto-adding remark tag.
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
    const otherTags = normalizedTags.filter((tag) => tag !== remarkTagName);
    if (otherTags.length === 0) {
      if (ensureRemarkTag && remarkTagName) {
        normalizedTags = [remarkTagName];
      } else {
        normalizedTags = normalizedTags.filter((tag) => tag === remarkTagName);
      }
    } else {
      normalizedTags = otherTags;
    }
  } else {
    normalizedTags = normalizedTags.filter((tag) => tag !== remarkTagName);
  }

  if (normalizedTags.length === 0) {
    normalizedRemark = undefined;
  }

  return { tags: normalizedTags, remark: normalizedRemark };
}

export function getCommentKindForDocument(
  document: vscode.TextDocument
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
