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

const MAX_LABEL_LENGTH = 40;
const INDENT_UNIT = '\u2003'; // 额外缩进使用全角空格，确保在树视图中可见

export class HeadingProvider implements vscode.TreeDataProvider<HeadingTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<HeadingTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly nodes: HeadingNode[] = [];
  private readonly nodeIndex = new Map<string, HeadingNode>();
  private readonly checkedIds = new Set<string>();
  private expandedLevel: number | null | undefined;

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
    this.rebuildIndex();
    this._onDidChangeTreeData.fire();
  }

  /**
   * 设置导航树自动展开的最大层级（0 表示完全折叠）。
   */
  setExpandedLevel(level: number | null | undefined): void {
    this.expandedLevel = level;
    this._onDidChangeTreeData.fire();
  }

  /**
   * 判断当前是否存在标题节点。
   */
  hasHeadings(): boolean {
    return this.nodes.length > 0;
  }

  /**
   * 是否存在被选中的标题复选框。
   */
  hasCheckedNodes(): boolean {
    return this.checkedIds.size > 0;
  }

  /**
   * 返回当前通过复选框选中的标题节点列表。
   */
  getCheckedNodes(): HeadingNode[] {
    return Array.from(this.checkedIds)
      .map((id) => this.nodeIndex.get(id))
      .filter((node): node is HeadingNode => Boolean(node));
  }

  /**
   * 根据复选框事件更新选中状态。
   */
  updateCheckboxState(changes: ReadonlyArray<[HeadingTreeItem, vscode.TreeItemCheckboxState]>): void {
    let mutated = false;

    for (const [item, state] of changes) {
      const affectedIds = collectNodeIds(item.node);

      if (state === vscode.TreeItemCheckboxState.Checked) {
        for (const id of affectedIds) {
          if (!this.checkedIds.has(id)) {
            this.checkedIds.add(id);
            mutated = true;
          }
        }
      } else if (state === vscode.TreeItemCheckboxState.Unchecked) {
        for (const id of affectedIds) {
          if (this.checkedIds.delete(id)) {
            mutated = true;
          }
        }
      }
    }

    if (mutated) {
      this._onDidChangeTreeData.fire();
    }
  }

  /**
   * 清除所有复选框状态。
   */
  clearCheckedNodes(): void {
    if (this.checkedIds.size === 0) {
      return;
    }

    this.checkedIds.clear();
    this._onDidChangeTreeData.fire();
  }

  private createTreeItem(node: HeadingNode): HeadingTreeItem {
    const collapsibleState = node.children.length === 0 ? vscode.TreeItemCollapsibleState.None : this.resolveCollapsibleState(node.level);
    const displayLabel = formatLabel(node);
    const isChecked = this.checkedIds.has(node.id);
    return new HeadingTreeItem(node, collapsibleState, displayLabel, isChecked);
  }

  private resolveCollapsibleState(level: number): vscode.TreeItemCollapsibleState {
    if (this.expandedLevel === undefined) {
      return vscode.TreeItemCollapsibleState.Collapsed;
    }

    if (this.expandedLevel === 0) {
      return vscode.TreeItemCollapsibleState.Collapsed;
    }

    if (this.expandedLevel === null) {
      return vscode.TreeItemCollapsibleState.Expanded;
    }

    return level < this.expandedLevel ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
  }

  private rebuildIndex(): void {
    this.nodeIndex.clear();

    const stack = [...this.nodes];
    while (stack.length > 0) {
      const node = stack.pop()!;
      this.nodeIndex.set(node.id, node);
      stack.push(...node.children);
    }

    for (const id of Array.from(this.checkedIds)) {
      if (!this.nodeIndex.has(id)) {
        this.checkedIds.delete(id);
      }
    }
  }
}

export class HeadingTreeItem extends vscode.TreeItem {
  constructor(
    readonly node: HeadingNode,
    collapsibleState: vscode.TreeItemCollapsibleState,
    label: string,
    checked: boolean
  ) {
    super(label, collapsibleState);
    this.description = `Level ${node.level}`;
    this.command = {
      command: 'headingNavigator.reveal',
      title: 'Reveal Heading',
      arguments: [node.range]
    };
    this.contextValue = 'headingNavigator.heading';
    this.checkboxState = checked ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
    this.tooltip = `${node.label}\nLevel: ${node.level}\nType: ${node.kind === 'markdown' ? 'Markdown' : 'Typst'}`;
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

function formatLabel(node: HeadingNode): string {
  const indent = node.level > 1 ? INDENT_UNIT.repeat(node.level - 1) : '';
  const base = node.label.trim() === '' ? '(Untitled)' : node.label;
  const truncated = base.length > MAX_LABEL_LENGTH ? `${base.slice(0, MAX_LABEL_LENGTH - 1)}…` : base;
  return `${indent}${truncated}`;
}

function collectNodeIds(node: HeadingNode): string[] {
  const ids: string[] = [];
  const stack = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;
    ids.push(current.id);
    stack.push(...current.children);
  }

  return ids;
}
