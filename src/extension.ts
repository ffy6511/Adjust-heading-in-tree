import * as vscode from 'vscode';
import { HeadingProvider, HeadingTreeItem } from './providers/headingProvider';
import { registerShiftCommands } from './commands/shiftHeadings';
import { registerToggleCommand } from './commands/toggleView';
import { registerCollapseCommand } from './commands/collapseLevel';

export function activate(context: vscode.ExtensionContext): void {
  const headingProvider = new HeadingProvider();

  const treeView = vscode.window.createTreeView<HeadingTreeItem>('headingNavigator.headingTree', {
    treeDataProvider: headingProvider,
    showCollapseAll: true,
    canSelectMany: true
  });

  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => headingProvider.refresh())
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const activeDocument = vscode.window.activeTextEditor?.document;
      if (activeDocument && event.document.uri.toString() === activeDocument.uri.toString()) {
        headingProvider.refresh(activeDocument);
      }
    })
  );

  context.subscriptions.push(registerShiftCommands(headingProvider, treeView));
  context.subscriptions.push(registerToggleCommand());
  context.subscriptions.push(registerCollapseCommand(headingProvider));

  const revealDisposable = vscode.commands.registerCommand('headingNavigator.reveal', (range: vscode.Range) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
  });

  context.subscriptions.push(revealDisposable);
}

export function deactivate(): void {
  // 当前没有需要显式释放的资源。
}
