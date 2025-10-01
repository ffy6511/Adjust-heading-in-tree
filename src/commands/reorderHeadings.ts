import * as vscode from "vscode";
import { HeadingProvider, HeadingNode } from "../providers/headingProvider";
import { computeHeadingRange } from "../dnd/headingDragAndDrop";

export function registerReorderCommands(
  provider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>
): vscode.Disposable {
  const moveUp = vscode.commands.registerCommand(
    "headingNavigator.moveHeadingUp",
    async (item?: HeadingNode, selectedItems?: readonly HeadingNode[]) => {
      await moveWithinParent(provider, treeView, item, selectedItems, -1);
    }
  );

  const moveDown = vscode.commands.registerCommand(
    "headingNavigator.moveHeadingDown",
    async (item?: HeadingNode, selectedItems?: readonly HeadingNode[]) => {
      await moveWithinParent(provider, treeView, item, selectedItems, 1);
    }
  );

  return vscode.Disposable.from(moveUp, moveDown);
}

async function moveWithinParent(
  provider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>,
  item: HeadingNode | undefined,
  selectedItems: readonly HeadingNode[] | undefined,
  offset: number
): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    void vscode.window.showWarningMessage(
      "Open a document before reordering headings."
    );
    return;
  }

  const nodes = collectTargetNodes(provider, treeView, item, selectedItems);
  if (nodes.length === 0) {
    return;
  }

  nodes.sort((a, b) => a.range.start.line - b.range.start.line);

  const parent = provider.getParent(nodes[0]);
  const parentKey = parent ? parent.id : "__root__";
  const mixedParent = nodes.some((node) => {
    const nodeParent = provider.getParent(node);
    const nodeKey = nodeParent ? nodeParent.id : "__root__";
    return nodeKey !== parentKey;
  });
  if (mixedParent) {
    void vscode.window.showWarningMessage(
      "Select headings within the same parent to reorder."
    );
    return;
  }

  const siblings = parent ? [...parent.children] : provider.getRootNodes();

  const indices = nodes.map((node) =>
    siblings.findIndex((sibling) => sibling.id === node.id)
  );
  if (indices.some((index) => index === -1)) {
    return;
  }

  const minIndex = Math.min(...indices);
  const maxIndex = Math.max(...indices);
  const newIndex = offset < 0 ? minIndex + offset : maxIndex + offset;
  if (newIndex < 0 || newIndex >= siblings.length) {
    return;
  }

  const document = activeEditor.document;
  const ordered = provider.getOrderedNodes();
  const blocks = nodes.map((node) => {
    const range = computeHeadingRange(document, ordered, node);
    return {
      node,
      range,
      startOffset: document.offsetAt(range.start),
      endOffset: document.offsetAt(range.end),
      text: document.getText(range),
    };
  });
  const insertionReference = siblings[newIndex];
  const referenceRange = computeHeadingRange(
    document,
    ordered,
    insertionReference
  );
  const targetOffset =
    offset < 0
      ? document.offsetAt(referenceRange.start)
      : document.offsetAt(referenceRange.end);
  const targetAfterSelection =
    targetOffset > Math.max(...blocks.map((block) => block.endOffset));

  const edit = new vscode.WorkspaceEdit();
  for (const block of [...blocks].sort(
    (a, b) => b.startOffset - a.startOffset
  )) {
    edit.delete(document.uri, block.range);
  }

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    return;
  }

  const updatedDoc = vscode.window.activeTextEditor?.document;
  if (!updatedDoc) {
    return;
  }

  const adjustedOffset = adjustOffsetAfterRemoval(
    targetOffset,
    blocks,
    targetAfterSelection
  );
  const insertPosition = updatedDoc.positionAt(Math.max(0, adjustedOffset));
  const combinedText = blocks.map((block) => block.text).join("");

  await vscode.window.activeTextEditor?.edit((builder) => {
    builder.insert(insertPosition, combinedText);
  });

  provider.refresh(updatedDoc);
  const refreshedNode = provider.setCurrentHeadingByLine(insertPosition.line);
  if (refreshedNode) {
    try {
      await treeView.reveal(refreshedNode, {
        expand: true,
        focus: true,
        select: true,
      });
    } catch (error) {
      console.error('Failed to reveal heading after reordering', error);
    }
  }
}

function collectTargetNodes(
  provider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>,
  item: HeadingNode | undefined,
  selectedItems: readonly HeadingNode[] | undefined
): HeadingNode[] {
  if (item) {
    return [item];
  }

  if (selectedItems && selectedItems.length > 0) {
    return [...selectedItems];
  }

  if (treeView.selection.length > 0) {
    return [...treeView.selection];
  }

  return [];
}

function adjustOffsetAfterRemoval(
  targetOffset: number,
  blocks: Array<{ startOffset: number; endOffset: number }>,
  targetOriginallyAfterSelection: boolean
): number {
  let adjustedOffset = targetOffset;

  if (targetOriginallyAfterSelection) {
    let removedBeforeTarget = 0;
    for (const block of blocks) {
      if (block.startOffset < targetOffset) {
        removedBeforeTarget += block.endOffset - block.startOffset;
      }
    }
    adjustedOffset -= removedBeforeTarget;
  }

  return Math.max(0, adjustedOffset);
}
