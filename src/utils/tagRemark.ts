import * as vscode from "vscode";
import {
  HeadingCommentEdit,
  buildCommentContent,
  buildCommentLine,
  escapeRemark,
  extractCommentContent,
  extractHeadingCommentContent,
  extractStandaloneCommentContent,
  hasStandaloneComment,
  normalizeTagsAndRemark,
  parseCommentContent,
  stripLineComment,
  unescapeRemark,
  updateHeadingWithComment,
} from "../core/tagComment";

export type CommentKind = "markdown" | "typst";

export {
  HeadingCommentEdit,
  buildCommentContent,
  buildCommentLine,
  escapeRemark,
  extractCommentContent,
  extractHeadingCommentContent,
  extractStandaloneCommentContent,
  hasStandaloneComment,
  normalizeTagsAndRemark,
  parseCommentContent,
  stripLineComment,
  unescapeRemark,
  updateHeadingWithComment,
};

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
