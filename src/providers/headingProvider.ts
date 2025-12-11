import * as vscode from "vscode";
import * as path from "path";
import { parseHeadings, HeadingMatch } from "./parser";

export interface HeadingNode {
  id: string;
  label: string;
  level: number;
  kind: HeadingMatch["kind"];
  range: vscode.Range;
  children: HeadingNode[];
}

const MAX_LABEL_LENGTH = 40;
const LEVEL_ICON_DIR = path.join(
  __dirname,
  "..",
  "..",
  "resources",
  "icons",
  "levels"
);

const levelIconCache = new Map<
  string,
  { light: vscode.Uri; dark: vscode.Uri }
>();

export class HeadingProvider implements vscode.TreeDataProvider<HeadingNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    HeadingNode | HeadingNode[] | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private treeView: vscode.TreeView<HeadingNode> | undefined;
  private readonly nodes: HeadingNode[] = [];
  private readonly nodeIndex = new Map<string, HeadingNode>();
  private orderedNodes: HeadingNode[] = [];
  private expandedLevel: number | null | undefined;
  private currentHeadingId: string | undefined;
  private isFiltered = false;
  private filterRootNode: HeadingNode | null = null;

  constructor() {
    // 如果当前编辑器已有文档，则立即解析一次。
    this.refresh();
  }

  setTreeView(treeView: vscode.TreeView<HeadingNode>): void {
    this.treeView = treeView;
  }

  getTreeItem(element: HeadingNode): vscode.TreeItem {
    return this.createTreeItem(element);
  }

  getChildren(element?: HeadingNode): HeadingNode[] {
    if (this.isFiltered) {
      if (!this.filterRootNode) {
        return [];
      }
      if (!element) {
        return [this.filterRootNode];
      }
      return element.children;
    }

    if (!element) {
      return this.filteredChildren(this.nodes, 1);
    }

    return this.filteredChildren(element.children, element.level + 1);
  }

  getParent(element: HeadingNode): HeadingNode | null {
    if (this.isFiltered) {
      if (!this.filterRootNode || this.filterRootNode.id === element.id) {
        return null;
      }
      return findParent([this.filterRootNode], element) ?? null;
    }

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

    if (
      this.isFiltered &&
      this.filterRootNode &&
      !this.nodeIndex.has(this.filterRootNode.id)
    ) {
      this.clearFilter();
    } else {
      this._onDidChangeTreeData.fire();
    }
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

    if (
      this.isFiltered &&
      this.filterRootNode &&
      node &&
      !isDescendant(this.filterRootNode, node)
    ) {
      const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
      if (config.get<boolean>("behavior.autoClearFilterOnCursorMove", true)) {
        this.clearFilter();
      }
    }

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
      // 仅在侧边栏已可见时才自动滚动，避免切换文件时强制聚焦 AHT 面板
      if (this.treeView?.visible) {
        void this.treeView.reveal(node, {
          expand: true,
          select: false,
          focus: false,
        });
      }
    }

    return node;
  }

  getCurrentHeadingNode(): HeadingNode | undefined {
    if (!this.currentHeadingId) {
      return undefined;
    }

    return this.nodeIndex.get(this.currentHeadingId);
  }

  filterToNode(node: HeadingNode): void {
    this.isFiltered = true;
    this.filterRootNode = node;
    void vscode.commands.executeCommand(
      "setContext",
      "headingNavigator.isFiltered",
      true
    );
    this._onDidChangeTreeData.fire();
  }

  clearFilter(): void {
    this.isFiltered = false;
    this.filterRootNode = null;
    void vscode.commands.executeCommand(
      "setContext",
      "headingNavigator.isFiltered",
      false
    );
    this._onDidChangeTreeData.fire();
  }

  isFilteredToNode(node: HeadingNode): boolean {
    return this.isFiltered && this.filterRootNode?.id === node.id;
  }

  private createTreeItem(node: HeadingNode): HeadingTreeItem {
    const collapsibleState =
      node.children.length === 0
        ? vscode.TreeItemCollapsibleState.None
        : this.resolveCollapsibleState(node.level);
    const isCurrent = node.id === this.currentHeadingId;
    const isFilterRoot = this.isFilteredToNode(node);
    const displayLabel = formatLabel(node);
    const contextValue = `headingNavigator.heading${
      isFilterRoot ? ".isFilterRoot" : ""
    }`;

    return new HeadingTreeItem(
      node,
      collapsibleState,
      displayLabel,
      isCurrent,
      getLevelIcon(node.level, isCurrent),
      contextValue
    );
  }

  private resolveCollapsibleState(
    level: number
  ): vscode.TreeItemCollapsibleState {
    if (this.expandedLevel === undefined) {
      return vscode.TreeItemCollapsibleState.Collapsed;
    }

    if (this.expandedLevel === 0) {
      return vscode.TreeItemCollapsibleState.Collapsed;
    }

    if (this.expandedLevel === null) {
      return vscode.TreeItemCollapsibleState.Expanded;
    }

    return level < this.expandedLevel
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed;
  }

  private rebuildIndex(): void {
    this.nodeIndex.clear();

    const ordered: HeadingNode[] = [];
    flattenNodes(this.nodes, ordered);
    this.orderedNodes = ordered;

    for (const node of ordered) {
      this.nodeIndex.set(node.id, node);
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

  findAncestorByLevel(
    startNode: HeadingNode,
    level: number
  ): HeadingNode | null {
    let currentNode: HeadingNode | null = startNode;

    // 如果当前节点就是目标level或更小，返回它
    if (currentNode.level <= level) {
      return currentNode;
    }

    // 向上查找最近的level === target或level < target的祖先
    while (currentNode) {
      const parent = this.getParent(currentNode);
      if (parent) {
        if (parent.level <= level) {
          return parent;
        }
        currentNode = parent;
      } else {
        break;
      }
    }

    return null;
  }

  getRootNodes(): HeadingNode[] {
    return [...this.nodes];
  }

  private filteredChildren(
    children: HeadingNode[],
    _level: number
  ): HeadingNode[] {
    return children;
  }
}

class HeadingTreeItem extends vscode.TreeItem {
  constructor(
    readonly node: HeadingNode,
    collapsibleState: vscode.TreeItemCollapsibleState,
    label: string,
    isCurrent: boolean,
    iconSet: { light: vscode.Uri; dark: vscode.Uri },
    contextValue: string
  ) {
    super(label, collapsibleState);
    this.description = undefined;
    this.command = {
      command: "headingNavigator.reveal",
      title: "Reveal Heading",
      arguments: [node.range],
    };
    this.contextValue = contextValue;
    this.iconPath = iconSet;
    this.tooltip = `${node.label}\nLevel: ${node.level}\nType: ${
      node.kind === "markdown" ? "Markdown" : "Typst"
    }\nDrag anywhere on the row to reorder.`;
    this.id = node.id;
  }
}

function buildTree(matches: HeadingMatch[]): HeadingNode[] {
  const roots: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  matches.forEach((match, index) => {
    const node: HeadingNode = {
      id: `${match.line}-${index}`,
      label: match.displayText,
      level: match.level,
      kind: match.kind,
      range: match.range,
      children: [],
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

function findParent(
  haystack: HeadingNode[],
  target: HeadingNode
): HeadingNode | undefined {
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
  const base = node.label.trim() === "" ? "(Untitled)" : node.label;
  return base.length > MAX_LABEL_LENGTH
    ? `${base.slice(0, MAX_LABEL_LENGTH - 1)}…`
    : base;
}

function flattenNodes(nodes: HeadingNode[], receiver: HeadingNode[]): void {
  for (const node of nodes) {
    receiver.push(node);
    if (node.children.length > 0) {
      flattenNodes(node.children, receiver);
    }
  }
}

function getLevelIcon(
  level: number,
  isCurrent: boolean
): { light: vscode.Uri; dark: vscode.Uri } {
  const clampedLevel = Math.max(1, Math.min(6, level));
  const key = `${clampedLevel}-${isCurrent ? "current" : "default"}`;
  const cached = levelIconCache.get(key);
  if (cached) {
    return cached;
  }

  const fileName = `level-${clampedLevel}${isCurrent ? "-current" : ""}.svg`;
  const iconPath = path.join(LEVEL_ICON_DIR, fileName);
  const uri = vscode.Uri.file(iconPath);
  const iconSet = { light: uri, dark: uri };
  levelIconCache.set(key, iconSet);
  return iconSet;
}

function isDescendant(parent: HeadingNode, child: HeadingNode): boolean {
  if (parent.id === child.id) {
    return true;
  }
  for (const directChild of parent.children) {
    if (isDescendant(directChild, child)) {
      return true;
    }
  }
  return false;
}
