export interface PreviewPayload {
  before: string;
  after: string;
}

export function formatPreview(payload: PreviewPayload): string {
  return [
    "Preview (use --write to apply)",
    "--- before ---",
    payload.before,
    "--- after ---",
    payload.after,
  ].join("\n");
}

export function formatHeadingsList(
  headings: Array<{
    line: number;
    level: number;
    kind: string;
    text: string;
    tags: string[];
    remark?: string;
    breadcrumb: string[];
  }>,
): string {
  return headings
    .map((heading) => {
      const prefix = `${heading.line}:${heading.level}:${heading.kind}`;
      const tags = heading.tags.length > 0 ? ` [${heading.tags.join(", ")}]` : "";
      const remark = heading.remark ? ` :: ${heading.remark}` : "";
      return `${prefix} ${heading.breadcrumb.join(" > ")}${tags}${remark}`;
    })
    .join("\n");
}
