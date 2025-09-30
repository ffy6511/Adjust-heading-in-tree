import * as vscode from 'vscode';
import { parseHeadings, HeadingMatch } from './parser';

export interface HeadingNode {
  id: string;
  label: string;
  level: number;
  kind: HeadingMatch['kind'];
  range: vscode.Range;
  children: HeadingNode[];
}

export class HeadingProvider implements vscode.TreeDataProvider<HeadingTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<HeadingTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly nodes: HeadingNode[] = [];
  private expandedLevel: number | undefined;

  constructor() {
    // 如果当前编辑器已有文档，则立即解析一次。
    this.refresh();
  }

  getTreeItem(element: HeadingTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HeadingTreeItem): HeadingTreeItem[] {
    if (!element) {
      return this.nodes.map((node) => this.createTreeItem(node));
    }

    return element.node.children.map((node) => this.createTreeItem(node));
  }

  getParent?(element: HeadingTreeItem): HeadingTreeItem | null {
    const parent = findParent(this.nodes, element.node);
    return parent ? this.createTreeItem(parent) : null;
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

  /**
   * 设置导航树自动展开的最大层级（0 表示完全折叠）。
   */
  setExpandedLevel(level: number | undefined): void {
    this.expandedLevel = level;
    this._onDidChangeTreeData.fire();
  }

  /**
   * 判断当前是否存在标题节点。
   */
  hasHeadings(): boolean {
    return this.nodes.length > 0;
  }

  private createTreeItem(node: HeadingNode): HeadingTreeItem {
    const collapsibleState = node.children.length === 0 ? vscode.TreeItemCollapsibleState.None : this.resolveCollapsibleState(node.level);
    return new HeadingTreeItem(node, collapsibleState);
  }

  private resolveCollapsibleState(level: number): vscode.TreeItemCollapsibleState {
    if (this.expandedLevel === undefined) {
      return vscode.TreeItemCollapsibleState.Collapsed;
    }

    if (this.expandedLevel === 0) {
      return vscode.TreeItemCollapsibleState.Collapsed;
    }

    return level < this.expandedLevel ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
  }
}

export class HeadingTreeItem extends vscode.TreeItem {
  constructor(readonly node: HeadingNode, collapsibleState: vscode.TreeItemCollapsibleState) {
    super(node.label, collapsibleState);
    this.description = `Level ${node.level}`;
    this.command = {
      command: 'headingNavigator.reveal',
      title: 'Reveal Heading',
      arguments: [node.range]
    };
    this.contextValue = 'headingNavigator.heading';
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
      kind: match.kind,
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
