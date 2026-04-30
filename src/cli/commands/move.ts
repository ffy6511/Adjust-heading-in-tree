import { moveHeading } from "../../core/operations";
import { LoadedDocument } from "../io/document";
import { parseSelectorOrThrow, resolveSelector } from "../io/selectors";
import { writeOrPreview } from "./normalize";

export async function runMoveCommand(options: {
  selector?: string;
  before?: string;
  after?: string;
  write?: boolean;
  interactive?: boolean;
  loadedDocument: LoadedDocument;
}): Promise<void> {
  const selector = await resolveSelector(
    options.selector,
    options.interactive,
    options.loadedDocument.document,
  );
  const placement = options.before ? "before" : "after";
  const targetSelectorValue = options.before ?? options.after;
  if (!targetSelectorValue) {
    throw new Error("Either --before or --after is required");
  }

  const result = moveHeading(
    options.loadedDocument.content,
    selector,
    parseSelectorOrThrow(targetSelectorValue),
    placement,
  );

  await writeOrPreview(
    options.loadedDocument.filePath,
    options.loadedDocument.content,
    result.content,
    options.write,
  );
}
