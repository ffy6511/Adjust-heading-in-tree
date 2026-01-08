import * as vscode from "vscode";
import { HeadingNode, HeadingProvider } from "../providers/headingProvider";
import { TagIndexService } from "../services/tagIndexService";
import { parseHeadings } from "../providers/parser";
import { normalizeTagsAndRemark, updateLineWithComment } from "../utils/tagRemark";

export function registerEditRemarkCommand(
  headingProvider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "headingNavigator.editRemark",
    async (node?: HeadingNode) => {
      let targetNode = node;

      if (!targetNode) {
        const selection = treeView.selection;
        if (selection.length > 0) {
          targetNode = selection[0];
        } else {
          targetNode = headingProvider.getCurrentHeadingNode();
        }
      }

      if (!targetNode) {
        vscode.window.showInformationMessage(
          "No heading selected or found at cursor."
        );
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const doc = editor.document;
      const lineIndex = targetNode.range.start.line;
      const lineText = doc.lineAt(lineIndex).text;
      const matches = parseHeadings(lineText);
      if (matches.length === 0) {
        vscode.window.showErrorMessage(
          "Could not parse heading at line " + (lineIndex + 1)
        );
        return;
      }

      const currentRemark = matches[0].remark ?? "";
      const input = await vscode.window.showInputBox({
        prompt: "Edit remark for this heading",
        value: currentRemark,
        placeHolder: "Enter remark...",
      });

      if (input === undefined) {
        return;
      }

      const nextRemark = input.trim().length > 0 ? input.trim() : undefined;
      const remarkTagName = TagIndexService.getInstance().getRemarkName();
      const { tags: normalizedTags, remark: normalizedRemark } =
        normalizeTagsAndRemark(matches[0].tags ?? [], nextRemark, remarkTagName);
      const newLineText = updateLineWithComment(
        lineText,
        targetNode.kind,
        normalizedTags,
        normalizedRemark
      );

      if (newLineText !== lineText) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, doc.lineAt(lineIndex).range, newLineText);
        await vscode.workspace.applyEdit(edit);
      }
    }
  );
}
