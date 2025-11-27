import * as vscode from "vscode";

interface HelpItem extends vscode.QuickPickItem {
  commandId?: string;
}

interface TagViewHelpItem extends vscode.QuickPickItem {
  action: string;
}

const HELP_ITEMS: HelpItem[] = [
  {
    label: "Shift heading level up",
    description: "Cmd/Ctrl + Shift + Left Arrow",
    detail: "Decrease heading level by one.",
    commandId: "headingNavigator.shiftUp",
  },
  {
    label: "Shift heading level down",
    description: "Cmd/Ctrl + Shift + Right Arrow",
    detail: "Increase heading level by one.",
    commandId: "headingNavigator.shiftDown",
  },
  {
    label: "Move heading up within parent",
    description: "Cmd/Ctrl + Shift + Up Arrow",
    detail: "Reorder heading earlier under the same parent.",
    commandId: "headingNavigator.moveHeadingUp",
  },
  {
    label: "Move heading down within parent",
    description: "Cmd/Ctrl + Shift + Down Arrow",
    detail: "Reorder heading later under the same parent.",
    commandId: "headingNavigator.moveHeadingDown",
  },
  {
    label: "Toggle navigator visibility",
    description: "Cmd/Ctrl + Shift + T",
    detail: "Show or hide the Adjust Heading Tree view.",
    commandId: "headingNavigator.toggle",
  },
  {
    label: "Open keybindings editor…",
    description: "Customize shortcuts globally in VS Code.",
  },
];

const TAG_VIEW_HELP_ITEMS: TagViewHelpItem[] = [
  {
    label: "🌐 Toggle scope",
    description: "between global workspace and current file. ",
    detail: "This will decide your tagged item chosen from where.",
    action: "toggleScope",
  },
  {
    label: "🎯 Toggle selection mode",
    description: "between single-select and multi-select",
    detail:
      "If this is multi mode, searched tagged item should own all of the selected tags.",
    action: "toggleSelection",
  },
];

export function registerHelpCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    "headingNavigator.showHelp",
    async () => {
      const selection = await vscode.window.showQuickPick(HELP_ITEMS, {
        title: "Adjust Heading Tree – Shortcuts",
        placeHolder: "Choose a shortcut to open keybindings and customize it.",
      });

      if (!selection) {
        return;
      }

      if (!selection.commandId) {
        await openKeybindingsEditor();
        return;
      }

      await openKeybindingsEditor(selection.commandId);
    }
  );
}

export function registerTagViewHelpCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    "headingNavigator.showTagViewHelp",
    async () => {
      const selection = await vscode.window.showQuickPick(TAG_VIEW_HELP_ITEMS, {
        title: "Tag View Quick Actions",
        placeHolder: "Choose an action to perform.",
      });

      if (!selection) {
        return;
      }

      if (selection.action === "toggleScope") {
        await vscode.commands.executeCommand("headingNavigator.toggleTagScope");
      } else if (selection.action === "toggleSelection") {
        // We need to toggle the selection mode. Since we don't have direct access,
        // we'll send a message to the webview to trigger the toggle
        await vscode.commands.executeCommand(
          "headingNavigator.toggleTagSelection"
        );
      }
    }
  );
}

async function openKeybindingsEditor(commandId?: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      "workbench.action.openGlobalKeybindings"
    );
    await delay(150);
    if (commandId) {
      await vscode.commands.executeCommand("keybindings.search", commandId);
    }
  } catch (error) {
    console.error("Failed to open keybindings editor.", error);
    await vscode.commands.executeCommand(
      "workbench.action.openGlobalKeybindings"
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
