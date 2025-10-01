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
  "levels",
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

  private readonly nodes: HeadingNode[] = [];
  private readonly nodeIndex = new Map<string, HeadingNode>();
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
      return this.filteredChildren(this.nodes, 1);
    }

    return this.filteredChildren(element.children, element.level + 1);
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
    const collapsibleState =
      node.children.length === 0
        ? vscode.TreeItemCollapsibleState.None
        : this.resolveCollapsibleState(node.level);
    const isCurrent = node.id === this.currentHeadingId;
    const displayLabel = formatLabel(node);
    return new HeadingTreeItem(
      node,
      collapsibleState,
      displayLabel,
      isCurrent,
      getLevelIcon(node.level, isCurrent),
    );
  }

  private resolveCollapsibleState(
    level: number,
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

  getRootNodes(): HeadingNode[] {
    return [...this.nodes];
  }

  private filteredChildren(children: HeadingNode[], level: number): HeadingNode[] {
    if (this.expandedLevel === 0) {
      return [];
    }

    if (this.expandedLevel !== undefined && this.expandedLevel !== null) {
      if (level > this.expandedLevel) {
        return [];
      }
    }

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
  ) {
    super(label, collapsibleState);
    this.description = undefined;
    this.command = {
      command: "headingNavigator.reveal",
      title: "Reveal Heading",
      arguments: [node.range],
    };
    this.contextValue = "headingNavigator.heading";
    this.iconPath = iconSet;
    this.tooltip = `${node.label}\nLevel: ${node.level}\nType: ${node.kind === "markdown" ? "Markdown" : "Typst"}\nDrag anywhere on the row to reorder.`;
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
  target: HeadingNode,
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
  isCurrent: boolean,
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
