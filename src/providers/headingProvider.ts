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
const INDENT_UNIT = '   ';

export class HeadingProvider implements vscode.TreeDataProvider<HeadingNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<HeadingNode | HeadingNode[] | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly nodes: HeadingNode[] = [];
  private readonly nodeIndex = new Map<string, HeadingNode>();
  private readonly checkedIds = new Set<string>();
  private orderedNodes: HeadingNode[] = [];
  private expandedLevel: number | null | undefined;
  private currentHeadingId: string | undefined;

  constructor() {
    // 如果当前编辑器已有文档，则立即解析一次。
    this.refresh();
  }

  getTreeItem(element: HeadingNode): vscode.TreeItem {
    return this.createTreeItem(element);
  }

  getChildren(element?: HeadingNode): HeadingNode[] {
    if (!element) {
      return this.nodes;
    }

    return element.children;
  }

  getParent(element: HeadingNode): HeadingNode | null {
    const parent = findParent(this.nodes, element);
    return parent ?? null;
  }

  refresh(document?: vscode.TextDocument): void {
    const source = document ?? vscode.window.activeTextEditor?.document;

    this.nodes.length = 0;

    if (!source) {
      this.rebuildIndex();
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
   * 设置导航树默认展开的最大层级（0 表示全部折叠，null 表示全部展开）。
   */
  setExpandedLevel(level: number | null | undefined): void {
    this.expandedLevel = level;
    this._onDidChangeTreeData.fire();
  }

  /**
   * 判断是否存在标题。
   */
  hasHeadings(): boolean {
    return this.nodes.length > 0;
  }

  /**
   * 判断是否存在通过复选框选中的节点。
   */
  hasCheckedNodes(): boolean {
    return this.checkedIds.size > 0;
  }

  /**
   * 返回当前复选框选中的标题节点。
   */
  getCheckedNodes(): HeadingNode[] {
    return Array.from(this.checkedIds)
      .map((id) => this.nodeIndex.get(id))
      .filter((node): node is HeadingNode => Boolean(node));
  }

  /**
   * 根据复选框状态变化更新内部缓存。
   */
  updateCheckboxState(changes: ReadonlyArray<[HeadingNode, vscode.TreeItemCheckboxState]>): void {
    let mutated = false;

    for (const [node, state] of changes) {
      const affectedIds = collectNodeIds(node);

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

  /**
   * 依据编辑器当前行更新高亮标题。
   */
  setCurrentHeadingByLine(line: number | undefined): HeadingNode | undefined {
    const previousId = this.currentHeadingId;

    if (line === undefined) {
      this.currentHeadingId = undefined;
      if (previousId) {
        const previousNode = this.nodeIndex.get(previousId);
        if (previousNode) {
          this._onDidChangeTreeData.fire(previousNode);
        }
      }
      return undefined;
    }

    const node = this.findNearestNode(line);
    if (!node) {
      if (previousId) {
        const previousNode = this.nodeIndex.get(previousId);
        this.currentHeadingId = undefined;
        if (previousNode) {
          this._onDidChangeTreeData.fire(previousNode);
        }
      }
    } else if (node.id !== previousId) {
      this.currentHeadingId = node.id;
      const changed: HeadingNode[] = [];
      if (previousId) {
        const previousNode = this.nodeIndex.get(previousId);
        if (previousNode) {
          changed.push(previousNode);
        }
      }
      changed.push(node);
      this._onDidChangeTreeData.fire(changed);
    }

    return node;
  }

  getCurrentHeadingNode(): HeadingNode | undefined {
    if (!this.currentHeadingId) {
      return undefined;
    }

    return this.nodeIndex.get(this.currentHeadingId);
  }

  private createTreeItem(node: HeadingNode): HeadingTreeItem {
    const collapsibleState = node.children.length === 0 ? vscode.TreeItemCollapsibleState.None : this.resolveCollapsibleState(node.level);
    const isCurrent = node.id === this.currentHeadingId;
    const displayLabel = formatLabel(node);
    const isChecked = this.checkedIds.has(node.id);
    return new HeadingTreeItem(node, collapsibleState, displayLabel, isChecked, isCurrent);
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

    return level <= this.expandedLevel ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
  }

  private rebuildIndex(): void {
    this.nodeIndex.clear();

    const ordered: HeadingNode[] = [];
    flattenNodes(this.nodes, ordered);
    this.orderedNodes = ordered;

    for (const node of ordered) {
      this.nodeIndex.set(node.id, node);
    }

    for (const id of Array.from(this.checkedIds)) {
      if (!this.nodeIndex.has(id)) {
        this.checkedIds.delete(id);
      }
    }

    if (this.currentHeadingId && !this.nodeIndex.has(this.currentHeadingId)) {
      this.currentHeadingId = undefined;
    }
  }

  private findNearestNode(line: number): HeadingNode | undefined {
    let candidate: HeadingNode | undefined;

    for (const node of this.orderedNodes) {
      if (node.range.start.line <= line) {
        candidate = node;
      } else {
        break;
      }
    }

    return candidate;
  }

  findNodeById(id: string): HeadingNode | undefined {
    return this.nodeIndex.get(id);
  }

  getOrderedNodes(): HeadingNode[] {
    return [...this.orderedNodes];
  }

  getRootNodes(): HeadingNode[] {
    return [...this.nodes];
  }

  isNodeChecked(id: string): boolean {
    return this.checkedIds.has(id);
  }
}

class HeadingTreeItem extends vscode.TreeItem {
  constructor(
    readonly node: HeadingNode,
    collapsibleState: vscode.TreeItemCollapsibleState,
    label: string,
    checked: boolean,
    isCurrent: boolean
  ) {
    super(label, collapsibleState);
    this.description = `Level ${node.level}${isCurrent ? ' • current' : ''}`;
    this.command = {
      command: 'headingNavigator.reveal',
      title: 'Reveal Heading',
      arguments: [node.range]
    };
    this.contextValue = 'headingNavigator.heading';
    this.checkboxState = checked ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
    this.iconPath = isCurrent
      ? new vscode.ThemeIcon('record', new vscode.ThemeColor('charts.green'))
      : new vscode.ThemeIcon('grabber');
    this.tooltip = `${node.label}\nLevel: ${node.level}\nType: ${node.kind === 'markdown' ? 'Markdown' : 'Typst'}\n拖拽任意位置可重新排序。`;
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

function flattenNodes(nodes: HeadingNode[], receiver: HeadingNode[]): void {
  for (const node of nodes) {
    receiver.push(node);
    if (node.children.length > 0) {
      flattenNodes(node.children, receiver);
    }
  }
}
