import { setHeadingRemark } from "../../core/operations";
import { LoadedDocument } from "../io/document";
import { resolveSelector } from "../io/selectors";
import { writeOrPreview } from "./normalize";

export async function runRemarkSetCommand(options: {
  selector?: string;
  text: string;
  write?: boolean;
  interactive?: boolean;
  loadedDocument: LoadedDocument;
}): Promise<void> {
  const selector = await resolveSelector(
    options.selector,
    options.interactive,
    options.loadedDocument.document,
  );
  const normalizedText = options.text.trim();
  const result = setHeadingRemark(
    options.loadedDocument.content,
    selector,
    normalizedText.length > 0 ? normalizedText : undefined,
    "remark",
  );

  await writeOrPreview(
    options.loadedDocument.filePath,
    options.loadedDocument.content,
    result.content,
    options.write,
  );
}
