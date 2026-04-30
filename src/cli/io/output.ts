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
  const renderItems = headings.map((heading) => ({
    heading,
    depth: 0,
    parentIndex: -1,
  }));
  const stack: Array<{ breadcrumb: string[]; renderIndex: number }> = [];

  for (let index = 0; index < renderItems.length; index++) {
    const item = renderItems[index];
    while (
      stack.length > 0 &&
      !isAncestorBreadcrumb(
        stack[stack.length - 1].breadcrumb,
        item.heading.breadcrumb,
      )
    ) {
      stack.pop();
    }

    item.depth = stack.length;
    item.parentIndex = stack.length > 0 ? stack[stack.length - 1].renderIndex : -1;
    stack.push({ breadcrumb: item.heading.breadcrumb, renderIndex: index });
  }

  for (let index = 0; index < renderItems.length; index++) {
    const item = renderItems[index];
    const nextSiblingIndex = findNextSiblingIndex(renderItems, index);
    const hasNextSibling = nextSiblingIndex !== -1;
    const indentGuides = buildIndentGuides(renderItems, index);

    const indentation = buildIndentation(indentGuides);
    const branch = item.depth === 0 ? "" : hasNextSibling ? "├─ " : "└─ ";
    const label = formatHeadingLabel(item.heading, { showPosition, colorEnabled });
    lines.push(`${indentation}${branch}${label}`);
  }

  return lines.join("\n");
}

function buildIndentation(guides: boolean[]): string {
  if (guides.length === 0) {
    return "";
  }

  return guides
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

function isAncestorBreadcrumb(
  maybeAncestor: string[],
  breadcrumb: string[],
): boolean {
  if (maybeAncestor.length >= breadcrumb.length) {
    return false;
  }

  return maybeAncestor.every((segment, index) => segment === breadcrumb[index]);
}

function findNextSiblingIndex(
  items: Array<{ depth: number; parentIndex: number }>,
  index: number,
): number {
  const current = items[index];
  for (let candidateIndex = index + 1; candidateIndex < items.length; candidateIndex++) {
    const candidate = items[candidateIndex];
    if (candidate.depth < current.depth) {
      return -1;
    }
    if (
      candidate.depth === current.depth &&
      candidate.parentIndex === current.parentIndex
    ) {
      return candidateIndex;
    }
  }
  return -1;
}

function buildIndentGuides(
  items: Array<{ depth: number; parentIndex: number }>,
  index: number,
): boolean[] {
  const guides: boolean[] = [];
  let currentParentIndex = items[index].parentIndex;
  const ancestors: number[] = [];

  while (currentParentIndex !== -1) {
    ancestors.unshift(currentParentIndex);
    currentParentIndex = items[currentParentIndex].parentIndex;
  }

  for (const ancestorIndex of ancestors) {
    guides.push(findNextSiblingIndex(items, ancestorIndex) !== -1);
  }

  return guides.slice(0, -1);
}
