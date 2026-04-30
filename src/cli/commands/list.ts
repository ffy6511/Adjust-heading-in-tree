import { LoadedDocument } from "../io/document";
import { formatHeadingsList } from "../io/output";
import { resolveSelector } from "../io/selectors";

export async function runListCommand(options: {
  json?: boolean;
  interactive?: boolean;
  showPosition?: boolean;
  tagged?: boolean;
  tagFilter?: string[];
  tagOnly?: boolean;
  loadedDocument: LoadedDocument;
}): Promise<void> {
  const headings = options.loadedDocument.document.orderedNodes.map((node) => ({
    line: node.line,
    level: node.level,
    kind: node.kind,
    text: node.text,
    tags: node.tags,
    remark: node.remark,
    breadcrumb: node.breadcrumb,
  }));
  const filteredHeadings = filterHeadings(headings, {
    tagged: options.tagged,
    tagFilter: options.tagFilter,
    tagOnly: options.tagOnly,
  });

  if (options.interactive) {
    const selector = await resolveSelector(
      undefined,
      true,
      options.loadedDocument.document,
    );
    const line = selector.type === "line" ? selector.line : -1;
    const selected = filteredHeadings.find((heading) => heading.line === line);
    if (!selected) {
      throw new Error("Interactive selection did not resolve to a heading");
    }
    const payload = [selected];
    process.stdout.write(
      options.json
        ? JSON.stringify(payload, null, 2)
        : formatHeadingsList(payload, {
            showPosition: options.showPosition,
            color: shouldUseColor(),
          }),
    );
    process.stdout.write("\n");
    return;
  }

  process.stdout.write(
    options.json
      ? JSON.stringify(filteredHeadings, null, 2)
      : formatHeadingsList(filteredHeadings, {
          showPosition: options.showPosition,
          color: shouldUseColor(),
        }),
  );
  process.stdout.write("\n");
}

function shouldUseColor(): boolean {
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") {
    return true;
  }

  if (process.env.NO_COLOR) {
    return false;
  }

  return !!process.stdout.isTTY;
}

function filterHeadings(
  headings: Array<{
    line: number;
    level: number;
    kind: string;
    text: string;
    tags: string[];
    remark?: string;
    breadcrumb: string[];
  }>,
  options: {
    tagged?: boolean;
    tagFilter?: string[];
    tagOnly?: boolean;
  },
) {
  const normalizedTags = (options.tagFilter ?? []).filter(Boolean);
  const filteringByTag = options.tagged || normalizedTags.length > 0;
  if (!filteringByTag) {
    return headings;
  }

  const matched = headings.map((heading) => matchesTagFilter(heading, normalizedTags));
  if (options.tagOnly) {
    return headings.filter((_, index) => matched[index]);
  }

  const visible: typeof headings = [];
  const activeMatchDepths: number[] = [];

  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    const depth = heading.breadcrumb.length;
    while (
      activeMatchDepths.length > 0 &&
      activeMatchDepths[activeMatchDepths.length - 1] >= depth
    ) {
      activeMatchDepths.pop();
    }

    if (matched[index]) {
      visible.push(heading);
      activeMatchDepths.push(depth);
      continue;
    }

    if (activeMatchDepths.length > 0) {
      visible.push(heading);
    }
  }

  return visible;
}

function matchesTagFilter(
  heading: { tags: string[] },
  normalizedTags: string[],
): boolean {
  if (normalizedTags.length === 0) {
    return heading.tags.length > 0;
  }

  return normalizedTags.some((tag) => heading.tags.includes(tag));
}
