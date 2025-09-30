import * as vscode from 'vscode';
import { HeadingProvider, HeadingNode } from '../providers/headingProvider';

const TREE_MIME = 'application/vnd.code.tree.headingnavigator.headingtree';
const CUSTOM_MIME = 'application/vnd.adjust-heading.nodes';

interface HeadingBlock {
  node: HeadingNode;
  range: vscode.Range;
  text: string;
  startOffset: number;
  endOffset: number;
}

export class HeadingDragAndDropController implements vscode.TreeDragAndDropController<HeadingNode>, vscode.Disposable {
  readonly dropMimeTypes = [TREE_MIME, CUSTOM_MIME];
  readonly dragMimeTypes = [CUSTOM_MIME];

  constructor(private readonly provider: HeadingProvider) {}

  handleDrag(source: readonly HeadingNode[], dataTransfer: vscode.DataTransfer): void {
    const ids = Array.from(new Set(source.map((node) => node.id)));
    dataTransfer.set(CUSTOM_MIME, new vscode.DataTransferItem(JSON.stringify(ids)));
  }

  async handleDrop(target: HeadingNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      void vscode.window.showWarningMessage('Open a document before reordering headings.');
      return;
    }

    const item = dataTransfer.get(CUSTOM_MIME);
    if (!item) {
      return;
    }

    const serialized = await item.asString();
    let ids: string[] = [];
    try {
      ids = JSON.parse(serialized);
    } catch (error) {
      console.error('Failed to parse heading drag payload', error);
      return;
    }
    const nodes = ids
      .map((id) => this.provider.findNodeById(id))
      .filter((value): value is HeadingNode => Boolean(value));

    if (nodes.length === 0) {
      return;
    }

    if (target && nodes.some((node) => node.id === target.id)) {
      // Dropping onto one of the moved nodes is a no-op.
      return;
    }

    const document = activeEditor.document;
    const orderedNodes = this.provider.getOrderedNodes();

    const blocks = this.computeBlocks(document, orderedNodes, nodes);
    if (blocks.length === 0) {
      return;
    }

    const targetInfo = this.resolveTargetInfo(document, orderedNodes, target, blocks);
    if (!targetInfo) {
      return;
    }

    // Remove source blocks from document (from bottom to top to keep offsets valid).
    const edit = new vscode.WorkspaceEdit();
    for (const block of [...blocks].sort((a, b) => b.startOffset - a.startOffset)) {
      edit.delete(document.uri, block.range);
    }

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      return;
    }

    // After removal, compute new insert position.
    const updatedDocument = activeEditor.document;
    const insertionOffset = this.adjustOffsetAfterRemoval(targetInfo.offset, blocks, targetInfo.isTargetAfterSelection);
    const insertionPosition = updatedDocument.positionAt(insertionOffset);
    const insertText = blocks.map((block) => block.text).join('');

    await activeEditor.edit((builder) => {
      builder.insert(insertionPosition, insertText);
    });

    this.provider.clearCheckedNodes();
    this.provider.refresh(updatedDocument);

    const revealNode = this.provider.setCurrentHeadingByLine(insertionPosition.line);
    if (revealNode) {
      void vscode.commands.executeCommand('headingNavigator.reveal', revealNode.range);
    }
  }

  dispose(): void {
    // Nothing to dispose.
  }

  private computeBlocks(
    document: vscode.TextDocument,
    orderedNodes: HeadingNode[],
    nodes: HeadingNode[]
  ): HeadingBlock[] {
    const uniqueNodes = this.filterNestedSelections(document, orderedNodes, nodes);
    const blocks: HeadingBlock[] = [];

    for (const node of uniqueNodes) {
      const range = computeHeadingRange(document, orderedNodes, node);
      const text = document.getText(range);
      blocks.push({
        node,
        range,
        text,
        startOffset: document.offsetAt(range.start),
        endOffset: document.offsetAt(range.end)
      });
    }

    return blocks.sort((a, b) => a.startOffset - b.startOffset);
  }

  private filterNestedSelections(
    document: vscode.TextDocument,
    orderedNodes: HeadingNode[],
    nodes: HeadingNode[]
  ): HeadingNode[] {
    const sorted = [...nodes].sort((a, b) => a.range.start.line - b.range.start.line);
    const result: HeadingNode[] = [];

    for (const node of sorted) {
      const nodeRange = computeHeadingRange(document, orderedNodes, node);
      const isNested = result.some((existing) => {
        const existingRange = computeHeadingRange(document, orderedNodes, existing);
        return existingRange.contains(nodeRange);
      });

      if (!isNested) {
        result.push(node);
      }
    }

    return result;
  }

  private resolveTargetInfo(
    document: vscode.TextDocument,
    orderedNodes: HeadingNode[],
    target: HeadingNode | undefined,
    blocks: HeadingBlock[]
  ): { offset: number; isTargetAfterSelection: boolean } | undefined {
    if (!target) {
      return { offset: document.getText().length, isTargetAfterSelection: true };
    }

    const targetRange = computeHeadingRange(document, orderedNodes, target);
    const targetOffset = document.offsetAt(targetRange.start);

    // Prevent dropping into own subtree.
    for (const block of blocks) {
      if (block.range.contains(targetRange) || targetRange.contains(block.range)) {
        return undefined;
      }
    }

    const lastBlock = blocks[blocks.length - 1];

    const isTargetAfterSelection = targetOffset > lastBlock.endOffset;
    return { offset: targetOffset, isTargetAfterSelection };
  }

  private adjustOffsetAfterRemoval(
    targetOffset: number,
    blocks: HeadingBlock[],
    targetOriginallyAfterSelection: boolean
  ): number {
    let adjustedOffset = targetOffset;

    if (targetOriginallyAfterSelection) {
      let totalRemovedBeforeTarget = 0;
      for (const block of blocks) {
        if (block.startOffset < targetOffset) {
          totalRemovedBeforeTarget += block.endOffset - block.startOffset;
        }
      }
      adjustedOffset -= totalRemovedBeforeTarget;
    }

    return Math.max(0, adjustedOffset);
  }
}

function computeHeadingRange(
  document: vscode.TextDocument,
  orderedNodes: HeadingNode[],
  node: HeadingNode
): vscode.Range {
  const startLine = node.range.start.line;
  let endLine = document.lineCount - 1;

  for (const candidate of orderedNodes) {
    if (candidate.range.start.line <= startLine) {
      continue;
    }

    if (candidate.level <= node.level) {
      endLine = candidate.range.start.line - 1;
      break;
    }
  }

  if (endLine < startLine) {
    endLine = startLine;
  }

  const start = new vscode.Position(startLine, 0);
  const end = endLine + 1 < document.lineCount
    ? new vscode.Position(endLine + 1, 0)
    : document.lineAt(endLine).range.end;

  return new vscode.Range(start, end);
}
