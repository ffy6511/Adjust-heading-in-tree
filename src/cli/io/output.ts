export interface PreviewPayload {
  before: string;
  after: string;
}

interface HeadingListItem {
  line: number;
  level: number;
  kind: string;
  text: string;
  tags: string[];
  remark?: string;
  breadcrumb: string[];
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
  headings: HeadingListItem[],
  options?: { showPosition?: boolean; color?: boolean },
): string {
  if (headings.length === 0) {
    return "";
  }

  const lines: string[] = [];
  const colorEnabled = options?.color ?? false;
  const showPosition = options?.showPosition ?? false;
  const stack: number[] = [];

  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    const currentDepth = Math.max(heading.breadcrumb.length - 1, 0);
    stack.length = currentDepth;
    const next = headings[index + 1];
    const nextDepth = next ? Math.max(next.breadcrumb.length - 1, 0) : -1;
    const hasNextSibling = !!next && nextDepth === currentDepth;

    const indentation = buildIndentation(stack);
    const branch = currentDepth === 0 ? "" : hasNextSibling ? "├─ " : "└─ ";
    const label = formatHeadingLabel(heading, { showPosition, colorEnabled });
    lines.push(`${indentation}${branch}${label}`);

    if (currentDepth > 0) {
      stack[currentDepth - 1] = hasNextSibling ? 1 : 0;
    }
  }

  return lines.join("\n");
}

function buildIndentation(stack: number[]): string {
  if (stack.length === 0) {
    return "";
  }

  return stack
    .slice(0, -1)
    .map((hasSibling) => (hasSibling ? "│  " : "   "))
    .join("");
}

function formatHeadingLabel(
  heading: HeadingListItem,
  options: { showPosition: boolean; colorEnabled: boolean },
): string {
  const title = colorize(
    heading.text,
    heading.level,
    options.colorEnabled,
  );
  const tags = heading.tags.length > 0 ? ` [${heading.tags.join(", ")}]` : "";
  const remark = heading.remark ? ` :: ${heading.remark}` : "";
  const position = options.showPosition
    ? ` [line ${heading.line}, level ${heading.level}, ${heading.kind}]`
    : "";

  return `${title}${tags}${remark}${position}`;
}

function colorize(text: string, level: number, enabled: boolean): string {
  if (!enabled) {
    return text;
  }

  const palette = [36, 33, 32, 35, 34, 31];
  const color = palette[(Math.max(level, 1) - 1) % palette.length];
  return `\u001b[${color}m${text}\u001b[0m`;
}
