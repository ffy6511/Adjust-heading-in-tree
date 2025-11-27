import * as vscode from "vscode";
import { HeadingNode, HeadingProvider } from "../providers/headingProvider";
import { TagIndexService, TagDefinition } from "../services/tagIndexService";
import { parseHeadings } from "../providers/parser";

export function registerEditTagsCommand(
  headingProvider: HeadingProvider,
  treeView: vscode.TreeView<HeadingNode>
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "headingNavigator.editTags",
    async (node?: HeadingNode) => {
      let targetNode = node;

      // If no node provided (e.g. keybinding or command palette), use current selection or cursor
      if (!targetNode) {
        const selection = treeView.selection;
        if (selection.length > 0) {
          targetNode = selection[0];
        } else {
          // Fallback to cursor position
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
        vscode.window.showErrorMessage("Could not parse heading at line " + (lineIndex + 1));
        return;
      }

      const currentTags = matches[0].tags || [];
      const tagService = TagIndexService.getInstance();
      const allTagNames = tagService.getAllTags();
      const tagDefinitions = tagService.getTagsFromSettings();

      await handleQuickPickWithCreate(targetNode, currentTags, allTagNames, tagDefinitions);
    }
  );
}

async function handleQuickPickWithCreate(
  node: HeadingNode,
  currentTags: string[],
  allTags: string[],
  defs: TagDefinition[]
) {
  const quickPick = vscode.window.createQuickPick();
  quickPick.canSelectMany = true;
  quickPick.placeholder = "Select tags or type to create a new one";
  quickPick.title = `Edit Tags: ${node.label}`;

  // Track currently selected tags (starts with tags already in file)
  let pickedTags = new Set(currentTags);

  const generateItems = (filterValue: string = ""): vscode.QuickPickItem[] => {
    // 1. Existing Tags from Index/Settings
    const items: vscode.QuickPickItem[] = allTags.map(tagName => {
      const def = defs.find(d => d.name === tagName);
      return {
        label: tagName,
        picked: pickedTags.has(tagName),
        alwaysShow: true, // we handle filtering manually if needed, or let VS Code do it
        description: def ? "(defined)" : undefined,
        iconPath: def?.icon ? new vscode.ThemeIcon(def.icon) : undefined
      };
    });

    // 2. New Tag Creation
    // If filterValue is present and not an exact match, show a "Create" option
    if (filterValue) {
        const exactMatch = items.find(i => i.label === filterValue);
        if (!exactMatch) {
            items.unshift({
                label: filterValue,
                picked: pickedTags.has(filterValue), // If user already picked this new tag in this session
                description: "Create new tag",
                alwaysShow: true,
                iconPath: new vscode.ThemeIcon("add")
            });
        }
    }

    return items;
  };

  quickPick.items = generateItems();

  quickPick.onDidChangeValue(value => {
    // Keep reference to all known items plus potentially the new one
    const baseItems: vscode.QuickPickItem[] = allTags.map(tagName => {
        const def = defs.find(d => d.name === tagName);
        return {
          label: tagName,
          picked: pickedTags.has(tagName),
          description: def ? "(defined)" : undefined,
          iconPath: def?.icon ? new vscode.ThemeIcon(def.icon) : undefined,
          alwaysShow: true
        };
    });

    // Add the "Create" item if needed
    let finalItems = baseItems;
    if (value && !allTags.includes(value)) {
        finalItems = [{
            label: value,
            picked: pickedTags.has(value),
            description: "Create new tag",
            alwaysShow: true,
            iconPath: new vscode.ThemeIcon("add")
        }, ...baseItems];
    }

    // Update items but try to preserve selection references if possible?
    // Actually, we can just set `selectedItems` again based on `pickedTags`.
    quickPick.items = finalItems;

    // Re-apply selection based on our tracked state
    quickPick.selectedItems = quickPick.items.filter(i => pickedTags.has(i.label));
  });

  quickPick.onDidChangeSelection(selection => {
      // Update our source of truth
      pickedTags.clear();
      selection.forEach(i => pickedTags.add(i.label));
  });

  quickPick.onDidAccept(async () => {
    const selected = Array.from(pickedTags);
    quickPick.hide();
    await applyTags(node, selected);
    quickPick.dispose();
  });

  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}

async function applyTags(node: HeadingNode, tags: string[]) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const doc = editor.document;
  const lineIndex = node.range.start.line;
  const lineText = doc.lineAt(lineIndex).text;

  let newLineText = lineText;
  const kind = node.kind; // "markdown" or "typst"

  const tagString = tags.length > 0 ? tags.map(t => `#${t}`).join(' ') : '';

  if (kind === 'markdown') {
      const markdownTagRegex = /<!--\s*((?:#[a-zA-Z0-9_\-]+\s*)+)-->\s*$/;
      const match = markdownTagRegex.exec(lineText);
      if (match) {
          if (tags.length > 0) {
            newLineText = lineText.slice(0, match.index) + `<!-- ${tagString} -->`;
          } else {
            newLineText = lineText.slice(0, match.index).trimEnd();
          }
      } else {
          if (tags.length > 0) {
            newLineText = `${lineText.trimEnd()} <!-- ${tagString} -->`;
          }
      }
  } else { // typst
      const typstTagRegex = /\/\/\s*((?:#[a-zA-Z0-9_\-]+\s*)+)$/;
      const match = typstTagRegex.exec(lineText);
      if (match) {
           if (tags.length > 0) {
            newLineText = lineText.slice(0, match.index) + `// ${tagString}`;
          } else {
            newLineText = lineText.slice(0, match.index).trimEnd();
          }
      } else {
           if (tags.length > 0) {
            newLineText = `${lineText.trimEnd()} // ${tagString}`;
          }
      }
  }

  if (newLineText !== lineText) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, doc.lineAt(lineIndex).range, newLineText);
    await vscode.workspace.applyEdit(edit);
  }
}
