import { normalizeHeadingComments } from "../../core/operations";
import { LoadedDocument, writeDocument } from "../io/document";
import { formatPreview } from "../io/output";

export async function runNormalizeCommand(options: {
  kind?: "markdown" | "typst";
  write?: boolean;
  loadedDocument: LoadedDocument;
}): Promise<void> {
  const kind = options.kind ?? options.loadedDocument.kind;
  const result = normalizeHeadingComments(options.loadedDocument.content, kind);
  await writeOrPreview(
    options.loadedDocument.filePath,
    options.loadedDocument.content,
    result.content,
    options.write,
  );
}

export async function writeOrPreview(
  filePath: string,
  before: string,
  after: string,
  write?: boolean,
): Promise<void> {
  if (before === after) {
    process.stdout.write("No changes\n");
    return;
  }

  if (write) {
    await writeDocument(filePath, after);
    process.stdout.write(`Updated ${filePath}\n`);
    return;
  }

  process.stdout.write(formatPreview({ before, after }));
  process.stdout.write("\n");
}
