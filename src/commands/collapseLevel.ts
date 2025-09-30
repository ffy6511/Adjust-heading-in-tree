import * as vscode from 'vscode';
import { HeadingProvider } from '../providers/headingProvider';

/**
 * 注册按层级批量折叠/展开标题树的命令。
 */
export function registerCollapseCommand(provider: HeadingProvider): vscode.Disposable {
  return vscode.commands.registerCommand('headingNavigator.collapseToLevel', async () => {
    if (!provider.hasHeadings()) {
      void vscode.window.showInformationMessage('No headings available in the current document.');
      return;
    }

    const level = await pickTargetLevel();
    if (level === undefined) {
      return;
    }

    if (level === 0) {
      provider.setExpandedLevel(0);
      provider.refresh();
      void vscode.window.showInformationMessage('Collapsed all headings.');
      return;
    }

    provider.setExpandedLevel(level);
    provider.refresh();
    void vscode.window.showInformationMessage(`Expanded headings up to level ${level}.`);
  });
}

/**
 * 通过快速选择面板让用户挑选折叠深度。
 */
async function pickTargetLevel(): Promise<number | undefined> {
  const items: Array<vscode.QuickPickItem & { level: number }> = [
    { label: 'Collapse all', description: 'Hide all heading levels in the tree view.', level: 0 },
    { label: 'Level 1', description: 'Show only top-level headings.', level: 1 },
    { label: 'Level 2', description: 'Expand headings up to level 2.', level: 2 },
    { label: 'Level 3', description: 'Expand headings up to level 3.', level: 3 },
    { label: 'Level 4', description: 'Expand headings up to level 4.', level: 4 },
    { label: 'Level 5', description: 'Expand headings up to level 5.', level: 5 },
    { label: 'Level 6', description: 'Expand headings up to level 6.', level: 6 }
  ];

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select the maximum heading level to expand in the tree.'
  });

  return selection?.level;
}
