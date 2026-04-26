import * as vscode from "vscode";
import { HeadingNode, HeadingProvider } from "../providers/headingProvider";
import { TagIndexService } from "../services/tagIndexService";
import { parseHeadings } from "../providers/parser";
import {
  createHeadingCommentReplacement,
  normalizeTagsAndRemark,
} from "../utils/tagRemark";

export function registerEditRemarkCommand(
  headingProvider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>,
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
          "No heading selected or found at cursor.",
        );
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const doc = editor.document;
      const lineIndex = targetNode.range.start.line;
      const match = parseHeadings(doc.getText()).find(
        (item) => item.line === lineIndex,
      );
      if (!match) {
        vscode.window.showErrorMessage(
          "Could not parse heading at line " + (lineIndex + 1),
        );
        return;
      }

      const currentRemark = match.remark ?? "";
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
        normalizeTagsAndRemark(match.tags ?? [], nextRemark, remarkTagName);
      const replacement = createHeadingCommentReplacement(
        doc,
        lineIndex,
        targetNode.kind,
        normalizedTags,
        normalizedRemark,
      );

      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, replacement.range, replacement.text);
      await vscode.workspace.applyEdit(edit);
    },
  );
}
