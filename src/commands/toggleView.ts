import * as vscode from 'vscode';

export function registerToggleCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('headingNavigator.toggle', async () => {
    await vscode.commands.executeCommand('workbench.view.extension.headingNavigator');
  });
}
