import { shiftHeading } from "../../core/operations";
import { LoadedDocument } from "../io/document";
import { resolveSelector } from "../io/selectors";
import { writeOrPreview } from "./normalize";

export async function runShiftCommand(options: {
  selector?: string;
  by: number;
  write?: boolean;
  interactive?: boolean;
  loadedDocument: LoadedDocument;
}): Promise<void> {
  const selector = await resolveSelector(
    options.selector,
    options.interactive,
    options.loadedDocument.document,
  );
  const result = shiftHeading(
    options.loadedDocument.content,
    selector,
    options.by,
  );

  await writeOrPreview(
    options.loadedDocument.filePath,
    options.loadedDocument.content,
    result.content,
    options.write,
  );
}
