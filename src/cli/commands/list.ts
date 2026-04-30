import { LoadedDocument } from "../io/document";
import { formatHeadingsList } from "../io/output";
import { resolveSelector } from "../io/selectors";

export async function runListCommand(options: {
  json?: boolean;
  interactive?: boolean;
  showPosition?: boolean;
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

  if (options.interactive) {
    const selector = await resolveSelector(
      undefined,
      true,
      options.loadedDocument.document,
    );
    const line = selector.type === "line" ? selector.line : -1;
    const selected = headings.find((heading) => heading.line === line);
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
      ? JSON.stringify(headings, null, 2)
      : formatHeadingsList(headings, {
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
