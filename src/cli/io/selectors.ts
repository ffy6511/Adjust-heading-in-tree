import { select } from "@inquirer/prompts";
import {
  HeadingSelector,
  parseHeadingSelector,
} from "../../core/selector";
import { HeadingDocument, HeadingNodeCore } from "../../core/types";

export function parseSelectorOrThrow(raw: string): HeadingSelector {
  return parseHeadingSelector(raw);
}

export async function resolveSelector(
  rawSelector: string | undefined,
  interactive: boolean | undefined,
  document: HeadingDocument,
): Promise<HeadingSelector> {
  if (interactive) {
    return chooseSelectorInteractive(document);
  }

  if (!rawSelector) {
    throw new Error("A selector is required unless --interactive is used");
  }

  return parseHeadingSelector(rawSelector);
}

async function chooseSelectorInteractive(
  document: HeadingDocument,
): Promise<HeadingSelector> {
  const value = await select({
    message: "Choose a heading",
    choices: document.orderedNodes.map((node) => ({
      name: formatInteractiveLabel(node),
      value: `line:${node.line}`,
    })),
  });

  return parseHeadingSelector(value);
}

function formatInteractiveLabel(node: HeadingNodeCore): string {
  const tags = node.tags.length > 0 ? ` [${node.tags.join(", ")}]` : "";
  return `${node.line}: ${node.breadcrumb.join(" > ")}${tags}`;
}
