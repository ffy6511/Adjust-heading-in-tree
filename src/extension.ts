import * as vscode from "vscode";
import { HeadingProvider, HeadingNode } from "./providers/headingProvider";
import { registerShiftCommands } from "./commands/shiftHeadings";
import { registerToggleCommand } from "./commands/toggleView";
import { registerTreeLevelCommand } from "./commands/treeLevelControl";
import { registerReorderCommands } from "./commands/reorderHeadings";
import { registerHelpCommand } from "./commands/showHelp";
import { HeadingDragAndDropController } from "./dnd/headingDragAndDrop";
import { registerExportCommands } from "./commands/exportSubtree";
import { HoverSettingsPanel } from "./webview/hoverSettings";
import { TagIndexService } from "./services/tagIndexService";
import { TagViewProvider } from "./webview/tagView";
import { registerEditTagsCommand } from "./commands/editTags";

export function activate(context: vscode.ExtensionContext): void {
  // Initialize Tag Service
  const tagService = TagIndexService.getInstance();

  // Register Tag View
  const tagViewProvider = new TagViewProvider(context.extensionUri, tagService);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TagViewProvider.viewType,
      tagViewProvider
    )
  );

  const headingProvider = new HeadingProvider();

  const dragAndDropController = new HeadingDragAndDropController(
    headingProvider
  );

  const treeView = vscode.window.createTreeView<HeadingNode>(
    "headingNavigator.headingTree",
    {
      treeDataProvider: headingProvider,
      canSelectMany: true,
      dragAndDropController,
    }
  );

  headingProvider.setTreeView(treeView);

  context.subscriptions.push(treeView);
  context.subscriptions.push(dragAndDropController);

  // Register Edit Tags Command
  context.subscriptions.push(
    registerEditTagsCommand(headingProvider, treeView)
  );

  // Register Refresh Tags Command
  context.subscriptions.push(
    vscode.commands.registerCommand("headingNavigator.refreshTags", () => {
      tagService.scanWorkspace();
    })
  );

  const updateHoverToolbar = async () => {
    // Since view.hoverToolbar is no longer available in settings UI,
    // use hardcoded default configuration
    const buttons = [
      "shiftUp",
      "shiftDown",
      "moveHeadingUp",
      "moveHeadingDown",
      "filterToSubtree",
      "openExportMenu",
    ];

    // We support up to 6 slots for now
    for (let i = 0; i < 6; i++) {
      const button = i < buttons.length ? buttons[i] : undefined;
      void vscode.commands.executeCommand(
        "setContext",
        `headingNavigator.hoverButton.${i}`,
        button
      );
    }
  };

  // Initial update
  updateHoverToolbar();

  // Listen for configuration changes from the webview (settings are still stored but not shown in UI)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("adjustHeadingInTree.view.hoverToolbar")) {
        // Read from webview settings and update toolbar
        const configuration = vscode.workspace.getConfiguration(
          "adjustHeadingInTree"
        );
        const buttons = configuration.get<string[]>("view.hoverToolbar", [
          "shiftUp",
          "shiftDown",
          "moveHeadingUp",
          "moveHeadingDown",
          "filterToSubtree",
          "openExportMenu",
        ]);

        for (let i = 0; i < 6; i++) {
          const button = i < buttons.length ? buttons[i] : undefined;
          void vscode.commands.executeCommand(
            "setContext",
            `headingNavigator.hoverButton.${i}`,
            button
          );
        }
      }
    })
  );

  const syncToEditor = (editor?: vscode.TextEditor) => {
    const activeEditor = editor ?? vscode.window.activeTextEditor;
    const line = activeEditor?.selection.active.line;
    headingProvider.setCurrentHeadingByLine(line);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "headingNavigator.filterToAncestor",
      async (...restArgs: any[]) => {
        console.log(
          "headingNavigator.filterToAncestor called with raw args:",
          restArgs
        );

        // 解析参数 - VSCode 可能会以不同的方式传递参数
        let args: { level: number } | undefined;

        if (restArgs.length > 0) {
          const firstArg = restArgs[0];
          if (
            typeof firstArg === "object" &&
            firstArg &&
            typeof firstArg.level === "number"
          ) {
            args = firstArg as { level: number };
          } else if (typeof firstArg === "number") {
            args = { level: firstArg };
          }
        }

        console.log("Parsed args:", args);

        // 如果仍然没有有效的参数，让用户输入
        if (!args || typeof args.level !== "number") {
          console.log("Need user input for level parameter");

          const levelInput = await vscode.window.showInputBox({
            prompt: "Enter the ancestor heading level to filter to (1-6)",
            placeHolder:
              "e.g., 1 for top-level headings, 2 for second level, etc.",
            validateInput: (value) => {
              const num = parseInt(value);
              if (isNaN(num) || num < 1 || num > 6) {
                return "Please enter a valid number between 1 and 6";
              }
              return undefined;
            },
          });

          if (!levelInput) {
            console.log("User cancelled input");
            return;
          }

          args = { level: parseInt(levelInput) };
          console.log("User provided level:", args.level);
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          console.log("No active editor");
          return;
        }

        const line = editor.selection.active.line;
        console.log("Current line:", line);
        const currentNode = headingProvider.setCurrentHeadingByLine(line);
        if (!currentNode) {
          console.log("No current node found at line", line);
          vscode.window.showInformationMessage(
            "No heading found at current cursor position"
          );
          return;
        }

        console.log(
          "Current node found:",
          currentNode.label,
          "level:",
          currentNode.level
        );

        const ancestor = headingProvider.findAncestorByLevel(
          currentNode,
          args.level
        );

        if (ancestor) {
          console.log(
            "Found ancestor:",
            ancestor.label,
            "level:",
            ancestor.level
          );
          headingProvider.filterToNode(ancestor);
        } else {
          console.log("No ancestor found for level", args.level);
          vscode.window.showInformationMessage(
            `No heading ancestor found at level ${args.level}`
          );
        }
      }
    )
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
    })
  );

  context.subscriptions.push(registerShiftCommands(headingProvider, treeView));
  context.subscriptions.push(
    registerReorderCommands(headingProvider, treeView)
  );
  context.subscriptions.push(registerToggleCommand());
  context.subscriptions.push(
    registerTreeLevelCommand(headingProvider, treeView)
  );
  context.subscriptions.push(registerExportCommands(headingProvider, treeView));
  context.subscriptions.push(registerHelpCommand());

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "headingNavigator.openHoverSettings",
      () => {
        HoverSettingsPanel.createOrShow(context.extensionUri);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "headingNavigator.filterToSubtree",
      (node: HeadingNode) => {
        headingProvider.filterToNode(node);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("headingNavigator.clearFilter", () => {
      headingProvider.clearFilter();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        syncToEditor(event.textEditor);
      }
    })
  );

  // 监听活动编辑器切换事件
  // 当用户切换到不同的文件时，重新解析新文件的标题结构并更新树形视图
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        // 切换到新的编辑器，刷新树形视图以显示新文件的目录结构
        headingProvider.refresh(editor.document);
        syncToEditor(editor);
      } else {
        // 没有活动编辑器（如关闭了所有文件），清空树形视图
        headingProvider.refresh(undefined);
      }
    })
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
    }
  );

  context.subscriptions.push(revealDisposable);
}

export function deactivate(): void {
  // 当前没有需要显式释放的资源。
}
