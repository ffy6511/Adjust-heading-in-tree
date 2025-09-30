import * as vscode from 'vscode';
import { HeadingProvider } from '../providers/headingProvider';

export function registerShiftCommands(provider: HeadingProvider): vscode.Disposable {
  const shiftUp = vscode.commands.registerCommand('headingNavigator.shiftUp', async () => {
    const selection = await pickSelection();
    if (!selection) {
      return;
    }

    void vscode.window.showInformationMessage('Shift headings up is not implemented yet.');
    provider.refresh();
  });

  const shiftDown = vscode.commands.registerCommand('headingNavigator.shiftDown', async () => {
    const selection = await pickSelection();
    if (!selection) {
      return;
    }

    void vscode.window.showInformationMessage('Shift headings down is not implemented yet.');
    provider.refresh();
  });

  return vscode.Disposable.from(shiftUp, shiftDown);
}

async function pickSelection(): Promise<vscode.Range | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage('Open a document to adjust headings.');
    return undefined;
  }

  // Placeholder prompt until we have a UI-driven selection.
  return editor.selection.isEmpty ? editor.document.lineAt(editor.selection.active.line).range : editor.selection;
}
