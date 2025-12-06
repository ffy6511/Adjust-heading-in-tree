import * as vscode from "vscode";
import { HeadingProvider, HeadingNode } from "../providers/headingProvider";
import { computeHeadingRange } from "../dnd/headingDragAndDrop";

/**
 * 删除所选标题块（含内容）
 */
export function registerDeleteHeadingCommand(
  provider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>
): vscode.Disposable {
  const deleteHeading = vscode.commands.registerCommand(
    "headingNavigator.deleteHeading",
    async (item?: HeadingNode, selectedItems?: readonly HeadingNode[]) => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        void vscode.window.showWarningMessage(
          "Open a document before deleting headings."
        );
        return;
      }

      const nodes = collectTargetNodes(provider, treeView, item, selectedItems);
      if (nodes.length === 0) {
        return;
      }

      const document = activeEditor.document;
      const orderedNodes = provider.getOrderedNodes();
      const uniqueNodes = filterNestedSelections(
        document,
        orderedNodes,
        nodes
      );

      if (uniqueNodes.length === 0) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        "Delete the selected heading block(s)?",
        { modal: true },
        "Delete"
      );
      if (confirm !== "Delete") {
        return;
      }

      const blocks = uniqueNodes.map((node) => {
        const range = computeHeadingRange(document, orderedNodes, node);
        return {
          node,
          range,
          start: document.offsetAt(range.start),
        };
      });

      const edit = new vscode.WorkspaceEdit();
      for (const block of [...blocks].sort((a, b) => b.start - a.start)) {
        edit.delete(document.uri, block.range);
      }

      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) {
        return;
      }

      const updatedDoc = vscode.window.activeTextEditor?.document;
      if (updatedDoc) {
        provider.refresh(updatedDoc);
        const fallbackLine = Math.max(
          0,
          Math.min(updatedDoc.lineCount - 1, blocks[0].range.start.line)
        );
        provider.setCurrentHeadingByLine(fallbackLine);
      } else {
        provider.refresh(document);
      }
    }
  );

  return deleteHeading;
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

function filterNestedSelections(
  document: vscode.TextDocument,
  orderedNodes: HeadingNode[],
  nodes: HeadingNode[]
): HeadingNode[] {
  const sorted = [...nodes].sort(
    (a, b) => a.range.start.line - b.range.start.line
  );
  const result: HeadingNode[] = [];

  for (const node of sorted) {
    const nodeRange = computeHeadingRange(document, orderedNodes, node);
    const isNested = result.some((existing) => {
      const existingRange = computeHeadingRange(
        document,
        orderedNodes,
        existing
      );
      return existingRange.contains(nodeRange);
    });

    if (!isNested) {
      result.push(node);
    }
  }

  return result;
}
