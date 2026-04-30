import {
  HeadingCommentFormatResult,
  formatHeadingInlineComments as formatHeadingInlineCommentsCore,
} from "../core/headingCommentFormat";
import { HeadingKind } from "../core/types";

export type { HeadingCommentFormatResult };

export function formatHeadingInlineComments(
  content: string,
  kind: HeadingKind,
): HeadingCommentFormatResult {
  return formatHeadingInlineCommentsCore(content, kind);
}
