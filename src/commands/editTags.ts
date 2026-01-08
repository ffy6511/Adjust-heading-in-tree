import * as vscode from "vscode";
import { HeadingNode, HeadingProvider } from "../providers/headingProvider";
import { TagIndexService, TagDefinition } from "../services/tagIndexService";
import { parseHeadings } from "../providers/parser";
import { normalizeTagsAndRemark, updateLineWithComment } from "../utils/tagRemark";

/**
 * 验证标签名称是否合法（允许中文字符、标点符号，只要不是空格就行）
 */
function validateTagName(name: string): string | null {
  if (!name || !name.trim()) {
    return "Tag name cannot be empty";
  }
  if (/\s/.test(name)) {
    return "Tag name cannot contain spaces";
  }
  return null;
}

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
        vscode.window.showErrorMessage(
          "Could not parse heading at line " + (lineIndex + 1)
        );
        return;
      }

      const currentTags = matches[0].tags || [];
      const tagService = TagIndexService.getInstance();
      const allTagNames = tagService.getAllTags();
      const tagDefinitions = tagService.getTagsFromSettings();

      await handleQuickPickWithCreate(
        targetNode,
        currentTags,
        allTagNames,
        tagDefinitions
      );
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
    const items: vscode.QuickPickItem[] = allTags.map((tagName) => {
      const def = defs.find((d) => d.name === tagName);
      return {
        label: tagName,
        picked: pickedTags.has(tagName),
        alwaysShow: true, // we handle filtering manually if needed, or let VS Code do it
        description: def ? "(defined)" : undefined,
        iconPath: def?.icon ? new vscode.ThemeIcon(def.icon) : undefined,
      };
    });

    // 2. New Tag Creation
    // If filterValue is present and not an exact match, show a "Create" option
    if (filterValue) {
      const exactMatch = items.find((i) => i.label === filterValue);
      if (!exactMatch) {
        items.unshift({
          label: filterValue,
          picked: pickedTags.has(filterValue), // If user already picked this new tag in this session
          description: "Create new tag",
          alwaysShow: true,
          iconPath: new vscode.ThemeIcon("add"),
        });
      }
    }

    return items;
  };

  quickPick.items = generateItems();

  quickPick.onDidChangeValue((value) => {
    // Keep reference to all known items plus potentially the new one
    const baseItems: vscode.QuickPickItem[] = allTags.map((tagName) => {
      const def = defs.find((d) => d.name === tagName);
      return {
        label: tagName,
        picked: pickedTags.has(tagName),
        description: def ? "(defined)" : undefined,
        iconPath: def?.icon ? new vscode.ThemeIcon(def.icon) : undefined,
        alwaysShow: true,
      };
    });

    // Add the "Create" item if needed
    let finalItems = baseItems;
    if (value && !allTags.includes(value)) {
      finalItems = [
        {
          label: value,
          picked: pickedTags.has(value), // If user already picked this new tag in this session
          description: "Create new tag",
          alwaysShow: true,
          iconPath: new vscode.ThemeIcon("add"),
        },
        ...baseItems,
      ];
    }

    // Update items but try to preserve selection references if possible?
    // Actually, we can just set `selectedItems` again based on `pickedTags`.
    quickPick.items = finalItems;

    // Re-apply selection based on our tracked state
    const selectedItems = quickPick.items.filter((i) =>
      pickedTags.has(i.label)
    );

    // If there are no existing selections and there's a "Create new tag" option,
    // automatically select it for better user experience
    if (selectedItems.length === 0 && value && finalItems.length > 0) {
      const createItem = finalItems.find(
        (item) => item.description === "Create new tag"
      );
      if (createItem) {
        selectedItems.push(createItem);
      }
    }

    quickPick.selectedItems = selectedItems;
  });

  quickPick.onDidChangeSelection((selection) => {
    // Update our source of truth
    pickedTags.clear();
    selection.forEach((i) => pickedTags.add(i.label));
  });

  quickPick.onDidAccept(async () => {
    const selected = Array.from(pickedTags);

    // 验证新标签名的合法性
    const selectedItems = quickPick.selectedItems;
    const newTagItem = selectedItems.find(
      (item) => item.description === "Create new tag"
    );
    if (newTagItem) {
      const validationError = validateTagName(newTagItem.label);
      if (validationError) {
        vscode.window.showErrorMessage(validationError);
        return; // 不继续，保持QuickPick打开让用户修改
      }
    }

    quickPick.hide();
    await applyTags(node, selected, allTags);
    quickPick.dispose();
  });

  quickPick.onDidHide(() => quickPick.dispose());

  // 默认勾选已经存在的tags
  quickPick.selectedItems = quickPick.items.filter((item) => item.picked);

  quickPick.show();
}

async function applyTags(
  node: HeadingNode,
  tags: string[],
  allTagNames: string[]
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const doc = editor.document;
  const lineIndex = node.range.start.line;
  const lineText = doc.lineAt(lineIndex).text;
  const matches = parseHeadings(lineText);
  const existingRemark = matches[0]?.remark;

  const remarkTagName = TagIndexService.getInstance().getRemarkName();
  const { tags: normalizedTags, remark: normalizedRemark } =
    normalizeTagsAndRemark(tags, existingRemark, remarkTagName, {
      ensureRemarkTag: false,
    });
  const newLineText = updateLineWithComment(
    lineText,
    node.kind,
    normalizedTags,
    normalizedRemark
  );

  if (newLineText !== lineText) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, doc.lineAt(lineIndex).range, newLineText);
    await vscode.workspace.applyEdit(edit);

    // 立即注册新标签到设置中（使用默认图标"tag"）
    const tagService = TagIndexService.getInstance();
    // 等待文档更新，然后手动注册新标签
    setTimeout(async () => {
      await tagService.autoRegisterTagsForDocument(doc);

      // 强制刷新相关的view，确保新标签及其图标显示
      setTimeout(() => {
        // 触发tagService的事件，让所有监听器更新
        tagService.scanWorkspace();
      }, 50);
    }, 100);
  }
}
