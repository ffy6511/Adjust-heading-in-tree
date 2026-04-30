import { HeadingDocument, HeadingNodeCore } from "./types";

export type HeadingSelector =
  | { type: "line"; line: number; raw: string }
  | { type: "text"; text: string; raw: string }
  | { type: "tag"; tag: string; raw: string }
  | { type: "path"; segments: string[]; raw: string }
  | { type: "current"; raw: string };

export function parseHeadingSelector(raw: string): HeadingSelector {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Selector cannot be empty");
  }

  if (trimmed === "current") {
    return { type: "current", raw: trimmed };
  }

  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex === -1) {
    throw new Error(`Unsupported selector: ${raw}`);
  }

  const kind = trimmed.slice(0, separatorIndex).trim();
  const value = trimmed.slice(separatorIndex + 1).trim();
  if (!value) {
    throw new Error(`Selector value is missing: ${raw}`);
  }

  switch (kind) {
    case "line": {
      const line = Number.parseInt(value, 10);
      if (!Number.isInteger(line) || line < 0) {
        throw new Error(`Invalid line selector: ${raw}`);
      }
      return { type: "line", line, raw: trimmed };
    }
    case "text":
      return { type: "text", text: value, raw: trimmed };
    case "tag":
      return { type: "tag", tag: value, raw: trimmed };
    case "path":
      return {
        type: "path",
        segments: value.split(">").map((segment) => segment.trim()).filter(Boolean),
        raw: trimmed,
      };
    default:
      throw new Error(`Unsupported selector: ${raw}`);
  }
}

export function selectHeadings(
  document: HeadingDocument,
  selector: HeadingSelector,
): HeadingNodeCore[] {
  switch (selector.type) {
    case "line": {
      const node = document.nodeByLine.get(selector.line);
      return node ? [node] : [];
    }
    case "text":
      return document.orderedNodes.filter((node) => node.text === selector.text);
    case "tag":
      return document.orderedNodes.filter((node) => node.tags.includes(selector.tag));
    case "path":
      return document.orderedNodes.filter(
        (node) =>
          node.breadcrumb.length === selector.segments.length &&
          node.breadcrumb.every((segment, index) => segment === selector.segments[index]),
      );
    case "current":
      throw new Error("The current selector is not supported in the CLI yet");
  }
}

export function selectHeading(
  document: HeadingDocument,
  selector: HeadingSelector,
): HeadingNodeCore {
  const matches = selectHeadings(document, selector);
  if (matches.length === 0) {
    throw new Error(`Selector did not match any heading: ${selector.raw}`);
  }
  if (matches.length > 1) {
    throw new Error(`Selector matched multiple headings: ${selector.raw}`);
  }
  return matches[0];
}
