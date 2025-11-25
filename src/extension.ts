import * as vscode from "vscode";
import { HeadingProvider, HeadingNode } from "./providers/headingProvider";
import { registerShiftCommands } from "./commands/shiftHeadings";
import { registerToggleCommand } from "./commands/toggleView";
import { registerTreeLevelCommand } from "./commands/treeLevelControl";
import { registerReorderCommands } from "./commands/reorderHeadings";
import { registerHelpCommand } from "./commands/showHelp";
import { HeadingDragAndDropController } from "./dnd/headingDragAndDrop";
import { registerExportCommands } from "./commands/exportSubtree";

export function activate(context: vscode.ExtensionContext): void {
  const headingProvider = new HeadingProvider();

  const dragAndDropController = new HeadingDragAndDropController(
    headingProvider,
  );

  const treeView = vscode.window.createTreeView<HeadingNode>(
    "headingNavigator.headingTree",
    {
      treeDataProvider: headingProvider,
      canSelectMany: true,
      dragAndDropController,
    },
  );

  headingProvider.setTreeView(treeView);

  context.subscriptions.push(treeView);
  context.subscriptions.push(dragAndDropController);

  const updateHoverArrowsVisibility = () => {
    const configuration = vscode.workspace.getConfiguration(
      "adjustHeadingInTree",
    );
    const shouldShow = configuration.get<boolean>(
      "view.showHoverArrows",
      true,
    );
    void vscode.commands.executeCommand(
      "setContext",
      "headingNavigator.showHoverArrows",
      shouldShow,
    );
  };

  updateHoverArrowsVisibility();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(
          "adjustHeadingInTree.view.showHoverArrows",
        )
      ) {
        updateHoverArrowsVisibility();
      }
    }),
  );

  const syncToEditor = (editor?: vscode.TextEditor) => {
    const activeEditor = editor ?? vscode.window.activeTextEditor;
    const line = activeEditor?.selection.active.line;
    headingProvider.setCurrentHeadingByLine(line);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      headingProvider.refresh(editor?.document);
      syncToEditor(editor ?? undefined);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "headingNavigator.filterToAncestor",
      async (args: { level: number }) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }

        const line = editor.selection.active.line;
        const currentNode = headingProvider.setCurrentHeadingByLine(line);
        if (!currentNode) {
          return;
        }

        const ancestor = headingProvider.findAncestorByLevel(
          currentNode,
          args.level,
        );

        if (ancestor) {
          headingProvider.filterToNode(ancestor);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const activeDocument = vscode.window.activeTextEditor?.document;
      if (
        activeDocument &&
        event.document.uri.toString() === activeDocument.uri.toString()
      ) {
        headingProvider.refresh(activeDocument);
        syncToEditor();
      }
    }),
  );

  context.subscriptions.push(registerShiftCommands(headingProvider, treeView));
  context.subscriptions.push(
    registerReorderCommands(headingProvider, treeView),
  );
  context.subscriptions.push(registerToggleCommand());
  context.subscriptions.push(
    registerTreeLevelCommand(headingProvider, treeView),
  );
  context.subscriptions.push(
    registerExportCommands(headingProvider, treeView),
  );
  context.subscriptions.push(registerHelpCommand());

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "headingNavigator.filterToSubtree",
      (node: HeadingNode) => {
        headingProvider.filterToNode(node);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "headingNavigator.clearFilter",
      () => {
        headingProvider.clearFilter();
      },
    ),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        syncToEditor(event.textEditor);
      }
    }),
  );

  syncToEditor();

  const revealDisposable = vscode.commands.registerCommand(
    "headingNavigator.reveal",
    (range: vscode.Range) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      editor.selection = new vscode.Selection(range.start, range.start);
      editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    },
  );

  context.subscriptions.push(revealDisposable);
}

export function deactivate(): void {
  // 当前没有需要显式释放的资源。
}
