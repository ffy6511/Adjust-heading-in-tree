import * as vscode from 'vscode';
import { parseHeadings, HeadingMatch } from './parser';

export interface HeadingNode {
  id: string;
  label: string;
  level: number;
  range: vscode.Range;
  children: HeadingNode[];
}

export class HeadingProvider implements vscode.TreeDataProvider<HeadingTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<HeadingTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly nodes: HeadingNode[] = [];

  constructor() {
    // Start with current editor if available.
    this.refresh();
  }

  getTreeItem(element: HeadingTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HeadingTreeItem): HeadingTreeItem[] {
    if (!element) {
      return this.nodes.map((node) => new HeadingTreeItem(node));
    }

    return element.node.children.map((node) => new HeadingTreeItem(node));
  }

  getParent?(element: HeadingTreeItem): HeadingTreeItem | null {
    const parent = findParent(this.nodes, element.node);
    return parent ? new HeadingTreeItem(parent) : null;
  }

  refresh(document?: vscode.TextDocument): void {
    const source = document ?? vscode.window.activeTextEditor?.document;

    this.nodes.length = 0;

    if (!source) {
      this._onDidChangeTreeData.fire();
      return;
    }

    const matches = parseHeadings(source.getText());
    const tree = buildTree(matches);
    this.nodes.push(...tree);
    this._onDidChangeTreeData.fire();
  }
}

export class HeadingTreeItem extends vscode.TreeItem {
  constructor(readonly node: HeadingNode) {
    super(node.label, node.children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.description = `Level ${node.level}`;
    this.command = {
      command: 'headingNavigator.reveal',
      title: 'Reveal Heading',
      arguments: [node.range]
    };
    this.id = node.id;
  }
}

function buildTree(matches: HeadingMatch[]): HeadingNode[] {
  const roots: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  matches.forEach((match, index) => {
    const node: HeadingNode = {
      id: `${match.line}-${index}`,
      label: match.text,
      level: match.level,
      range: match.range,
      children: []
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  });

  return roots;
}

function findParent(haystack: HeadingNode[], target: HeadingNode): HeadingNode | undefined {
  for (const node of haystack) {
    if (node.children.includes(target)) {
      return node;
    }

    const nested = findParent(node.children, target);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}
