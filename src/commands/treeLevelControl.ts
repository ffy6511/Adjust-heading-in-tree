import * as vscode from "vscode";
import { HeadingProvider, HeadingNode } from "../providers/headingProvider";

/**
 * 注册折叠/展开层级控制命令：通过输入框决定最大展开层级。
 */
export function registerTreeLevelCommand(
  provider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "headingNavigator.adjustTreeLevel",
    async () => {
      if (!provider.hasHeadings()) {
        void vscode.window.showInformationMessage(
          "No headings available in the current document.",
        );
        return;
      }

      const value = await vscode.window.showInputBox({
        prompt:
          "Enter a heading level to expand (0=collapse all, empty=expand all).",
        placeHolder:
          "Empty for expand all, 0 to collapse, 1-6 for a specific depth",
        validateInput: (input) => validateLevelInput(input),
      });

      if (value === undefined) {
        return;
      }

      const trimmed = value.trim();
      if (trimmed === "") {
        provider.setExpandedLevel(null);
        await expandToLevel(treeView, provider, null);
        void vscode.window.showInformationMessage(
          "Expanded all heading levels.",
        );
        return;
      }

      const level = Number.parseInt(trimmed, 10);

      if (level <= 0) {
        provider.setExpandedLevel(0);
        await collapseAllTreeItems();
        void vscode.window.showInformationMessage("Collapsed all headings.");
        return;
      }

      provider.setExpandedLevel(level);
      await expandToLevel(treeView, provider, level);
      void vscode.window.showInformationMessage(
        `Expanded headings up to level ${level}.`,
      );
    },
  );
}

function validateLevelInput(input: string): string | undefined {
  const trimmed = input.trim();
  if (trimmed === "") {
    return undefined;
  }

  const value = Number.parseInt(trimmed, 10);
  if (Number.isNaN(value)) {
    return "Please enter a number between 0 and 6, or leave empty to expand all headings.";
  }

  if (value < 0 || value > 6) {
    return "Supported range is 0-6.";
  }

  return undefined;
}

async function expandToLevel(
  treeView: vscode.TreeView<HeadingNode>,
  provider: HeadingProvider,
  level: number | null,
): Promise<void> {
  await collapseAllTreeItems();

  if (level === 0) {
    return;
  }

  const roots = provider.getRootNodes();
  const queue: Array<{ node: HeadingNode; depth: number }> = roots.map(
    (node) => ({ node, depth: 1 }),
  );

  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;

    const shouldExpand = level === null || depth < level;
    if (shouldExpand) {
      try {
        await treeView.reveal(node, {
          expand: true,
          select: false,
          focus: false,
        });
      } catch (error) {
        console.error("Failed to reveal node during expandToLevel", error);
      }
    }

    if (level === null || depth < level) {
      for (const child of node.children) {
        queue.push({ node: child, depth: depth + 1 });
      }
    }
  }
}

async function collapseAllTreeItems(): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      "workbench.actions.treeView.headingNavigator.headingTree.collapseAll",
    );
  } catch (error) {
    console.error("Failed to collapse heading tree", error);
  }
}
