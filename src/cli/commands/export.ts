import { selectHeading } from "../../core/selector";
import { computeSubtreeSlice } from "../../core/subtree";
import { LoadedDocument } from "../io/document";
import { parseSelectorOrThrow, resolveSelector } from "../io/selectors";
import { exportWithTinymist } from "../io/tinymist";

export async function runExportCommand(options: {
  selector?: string;
  format: "pdf" | "png";
  output: string;
  ppi?: number;
  extraImports?: string;
  interactive?: boolean;
  loadedDocument: LoadedDocument;
}): Promise<void> {
  if (options.loadedDocument.kind !== "typst") {
    throw new Error("Export currently supports Typst documents only");
  }

  const selector =
    options.interactive
      ? await resolveSelector(undefined, true, options.loadedDocument.document)
      : parseSelectorOrThrow(options.selector ?? "");
  const node = selectHeading(options.loadedDocument.document, selector);
  const slice = computeSubtreeSlice(
    options.loadedDocument.content,
    options.loadedDocument.document,
    node,
  );

  await exportWithTinymist({
    sourceFilePath: options.loadedDocument.filePath,
    subtreeText: slice.text,
    outputPath: options.output,
    format: options.format,
    ppi: options.ppi,
    extraImportsFile: options.extraImports,
  });

  process.stdout.write(`Exported ${options.output}\n`);
}
