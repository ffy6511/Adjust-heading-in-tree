import { setHeadingTags } from "../../core/operations";
import { LoadedDocument } from "../io/document";
import { resolveSelector } from "../io/selectors";
import { writeOrPreview } from "./normalize";

export async function runTagsSetCommand(options: {
  selector?: string;
  tags: string;
  write?: boolean;
  interactive?: boolean;
  loadedDocument: LoadedDocument;
}): Promise<void> {
  const selector = await resolveSelector(
    options.selector,
    options.interactive,
    options.loadedDocument.document,
  );
  const result = setHeadingTags(
    options.loadedDocument.content,
    selector,
    options.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    "remark",
  );

  await writeOrPreview(
    options.loadedDocument.filePath,
    options.loadedDocument.content,
    result.content,
    options.write,
  );
}
