import * as vscode from 'vscode';

export interface HeadingShiftEdit {
  range: vscode.Range;
  replacement: string;
}

/**
 * 通过 WorkspaceEdit 一次性应用所有标题替换。
 */
export async function applyHeadingEdits(document: vscode.TextDocument, edits: HeadingShiftEdit[]): Promise<void> {
  if (edits.length === 0) {
    return;
  }

  const workspaceEdit = new vscode.WorkspaceEdit();
  const uri = document.uri;

  for (const edit of edits) {
    workspaceEdit.replace(uri, edit.range, edit.replacement);
  }

  await vscode.workspace.applyEdit(workspaceEdit);
}
