import * as fs from "node:fs/promises";
import * as path from "node:path";
import { buildHeadingTree } from "../../core/tree";
import { parseHeadings } from "../../core/parser";
import { HeadingDocument, HeadingKind } from "../../core/types";

export interface LoadedDocument {
  filePath: string;
  content: string;
  kind: HeadingKind;
  document: HeadingDocument;
}

export async function loadDocument(filePath: string): Promise<LoadedDocument> {
  const resolvedPath = path.resolve(filePath);
  const content = await fs.readFile(resolvedPath, "utf8");
  const kind = inferDocumentKind(resolvedPath);
  const document = buildHeadingTree(parseHeadings(content));
  return {
    filePath: resolvedPath,
    content,
    kind,
    document,
  };
}

export async function writeDocument(
  filePath: string,
  content: string,
): Promise<void> {
  await fs.writeFile(path.resolve(filePath), content, "utf8");
}

export function inferDocumentKind(filePath: string): HeadingKind {
  return filePath.toLowerCase().endsWith(".typ") ? "typst" : "markdown";
}
