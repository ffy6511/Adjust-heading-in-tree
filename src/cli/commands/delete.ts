import { deleteHeading } from "../../core/operations";
import { LoadedDocument } from "../io/document";
import { resolveSelector } from "../io/selectors";
import { writeOrPreview } from "./normalize";

export async function runDeleteCommand(options: {
  selector?: string;
  write?: boolean;
  interactive?: boolean;
  loadedDocument: LoadedDocument;
}): Promise<void> {
  const selector = await resolveSelector(
    options.selector,
    options.interactive,
    options.loadedDocument.document,
  );
  const result = deleteHeading(options.loadedDocument.content, selector);

  await writeOrPreview(
    options.loadedDocument.filePath,
    options.loadedDocument.content,
    result.content,
    options.write,
  );
}
