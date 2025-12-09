import * as vscode from "vscode";
import { HeadingMatch, parseHeadings } from "../providers/parser";

export interface TagDefinition {
  name: string;
  color?: string;
  icon?: string;
  pinned?: boolean;
}

export interface TaggedHeading extends HeadingMatch {
  uri: vscode.Uri;
  id: string; // Unique ID for keying (fsPath + line)
  rawText?: string;
  breadcrumb?: string[];
}

export class TagIndexService {
  private static instance: TagIndexService;
  private tagIndex: Map<string, TaggedHeading[]> = new Map();
  private headingBreadcrumbs: Map<string, Map<number, string[]>> = new Map();
  private _onDidUpdateTags = new vscode.EventEmitter<void>();
  public readonly onDidUpdateTags = this._onDidUpdateTags.event;
  private readonly defaultTagColor = "#808080";

  private constructor() {
    this.initialize();
  }

  public static getInstance(): TagIndexService {
    if (!TagIndexService.instance) {
      TagIndexService.instance = new TagIndexService();
    }
    return TagIndexService.instance;
  }

  private initialize() {
    // Initial scan
    this.scanWorkspace();

    // Watch for file changes
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.{md,typ}");
    watcher.onDidChange((uri) => this.updateFile(uri));
    watcher.onDidCreate((uri) => this.updateFile(uri));
    watcher.onDidDelete((uri) => this.removeFile(uri));

    // Also listen for document changes (for unsaved changes in active editors)
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (
        e.document.languageId === "markdown" ||
        e.document.languageId === "typst"
      ) {
        // We debounce this slightly in a real app, but for now direct update is fine for small files
        this.updateDocument(e.document);
      }
    });
  }

  public async scanWorkspace() {
    const files = await vscode.workspace.findFiles("**/*.{md,typ}");
    this.tagIndex.clear();

    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        this.updateDocumentIndex(document);
      } catch (e) {
        console.error(`Failed to parse file ${file.fsPath}:`, e);
      }
    }
    this._onDidUpdateTags.fire();
  }

  private async updateFile(uri: vscode.Uri) {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      this.updateDocument(document);
    } catch (e) {
      console.error(`Failed to update file ${uri.fsPath}:`, e);
    }
  }

  private removeFile(uri: vscode.Uri) {
    this.removeEntriesForFile(uri);
    this._onDidUpdateTags.fire();
  }

  private updateDocument(document: vscode.TextDocument) {
    this.updateDocumentIndex(document);
    this._onDidUpdateTags.fire();
  }

  private updateDocumentIndex(document: vscode.TextDocument) {
    const matches = parseHeadings(document.getText());
    const tags = new Set<string>();

    // First, remove all existing entries for this file
    this.removeEntriesForFile(document.uri);

    const breadcrumbs = this.computeBreadcrumbs(matches);
    this.headingBreadcrumbs.set(document.uri.toString(), breadcrumbs);

    // Then add new ones
    for (const match of matches) {
      if (match.tags && match.tags.length > 0) {
        for (const tag of match.tags) {
          const nodes = this.tagIndex.get(tag) || [];

          const node: TaggedHeading = {
            ...match,
            uri: document.uri,
            id: `${document.uri.fsPath}:${match.line}`,
            breadcrumb: breadcrumbs.get(match.line),
            rawText: match.text,
          };

          nodes.push(node);
          this.tagIndex.set(tag, nodes);
          tags.add(tag);
        }
      }
    }

    // 更新index就行了，不要在此处注册标签，在保存时才注册
    this._onDidUpdateTags.fire();
  }

  private removeEntriesForFile(uri?: vscode.Uri): void {
    if (uri) {
      for (const [tag, nodes] of this.tagIndex.entries()) {
        const filtered = nodes.filter(
          (n) => n.uri.toString() !== uri.toString()
        );
        if (filtered.length === 0) {
          this.tagIndex.delete(tag);
        } else {
          this.tagIndex.set(tag, filtered);
        }
      }
      this.headingBreadcrumbs.delete(uri.toString());
    } else {
      this.tagIndex.clear();
      this.headingBreadcrumbs.clear();
    }
  }

  private computeBreadcrumbs(matches: HeadingMatch[]): Map<number, string[]> {
    const breadcrumbs = new Map<number, string[]>();
    const stack: HeadingMatch[] = [];

    for (const match of matches) {
      while (stack.length > 0 && stack[stack.length - 1].level >= match.level) {
        stack.pop();
      }

      stack.push(match);
      breadcrumbs.set(
        match.line,
        stack.map((item) => item.displayText)
      );
    }

    return breadcrumbs;
  }

  public getBreadcrumb(uri: vscode.Uri, line: number): string[] | undefined {
    return this.headingBreadcrumbs.get(uri.toString())?.get(line);
  }

  private normalizeDefinitions(defs: TagDefinition[] = []): TagDefinition[] {
    return defs.map((def) => ({
      ...def,
      pinned: !!def.pinned,
      color: def.color ?? this.defaultTagColor,
    }));
  }

  private countPinned(defs: TagDefinition[]): number {
    return defs.filter((def) => def.pinned).length;
  }

  /**
   * 从配置中读取标签视图的最大展示数量，用于限制自动 Pin 的数量
   */
  private getMaxPinnedDisplay(): number {
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const maxPinned = config.get<number>("tags.maxPinnedDisplay", 6);
    return Math.max(1, maxPinned);
  }

  /**
   * 文档保存时自动注册新标签
   * @param document 被保存的文档
   */
  public async autoRegisterTagsForDocument(document: vscode.TextDocument) {
    const matches = parseHeadings(document.getText());
    const tags = new Set<string>();

    for (const match of matches) {
      if (match.tags && match.tags.length > 0) {
        for (const tag of match.tags) {
          tags.add(tag);
        }
      }
    }

    if (tags.size > 0) {
      await this.autoRegisterNewTags(tags);
    }
  }

  /**
   * 自动注册新发现的标签到设置中
   */
  private async autoRegisterNewTags(tags: Set<string>) {
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const existingDefs = this.normalizeDefinitions(
      config.get<TagDefinition[]>("tags.definitions", [])
    );
    const existingNames = new Set(existingDefs.map((d) => d.name));
    let pinnedCount = this.countPinned(existingDefs);
    const maxPinnedDisplay = this.getMaxPinnedDisplay();

    const newDefs: TagDefinition[] = [];

    for (const tag of tags) {
      // 只跳过已存在的标签，不再有保留的预设标签概念
      if (existingNames.has(tag)) {
        continue;
      }

      // 验证标签名称格式，且长度至少为 2（只排除空格）
      if (/^[^ ]{2,}$/.test(tag)) {
        const shouldPin = pinnedCount < maxPinnedDisplay;
        if (shouldPin) {
          pinnedCount++;
        }
        newDefs.push({
          name: tag,
          icon: "tag",
          color: this.defaultTagColor,
          pinned: shouldPin,
        });
      }
    }

    if (newDefs.length > 0) {
      const updatedDefs = [...existingDefs, ...newDefs];
      await config.update(
        "tags.definitions",
        updatedDefs,
        vscode.ConfigurationTarget.Global
      );
      console.log(
        `TagIndexService: Auto-registered ${
          newDefs.length
        } new tag(s): ${newDefs.map((d) => d.name).join(", ")}`
      );
    }
  }

  public getAllTags(): string[] {
    const fromIndex = Array.from(this.tagIndex.keys());
    const fromSettings = this.getTagsFromSettings().map((t) => t.name);
    return Array.from(new Set([...fromIndex, ...fromSettings])).sort();
  }

  public getBlocksByTag(tag: string): TaggedHeading[] {
    return this.tagIndex.get(tag) || [];
  }

  /**
   * 获取指定文件中的所有标签
   * @param uri 文件 URI
   * @returns 该文件中使用的所有标签名称
   */
  public getTagsForFile(uri: vscode.Uri): string[] {
    const tagsInFile = new Set<string>();
    for (const [tag, nodes] of this.tagIndex.entries()) {
      for (const node of nodes) {
        if (node.uri.toString() === uri.toString()) {
          tagsInFile.add(tag);
          break;
        }
      }
    }
    return Array.from(tagsInFile).sort();
  }

  /**
   * 获取指定文件中带标签的标题块
   * @param uri 文件 URI
   * @param tag 可选的标签过滤
   * @returns 该文件中带标签的标题块
   */
  public getBlocksForFile(uri: vscode.Uri, tag?: string): TaggedHeading[] {
    const blocks: TaggedHeading[] = [];
    const seenIds = new Set<string>();

    if (tag) {
      // 只获取特定标签的块
      const tagBlocks = this.tagIndex.get(tag) || [];
      for (const block of tagBlocks) {
        if (block.uri.toString() === uri.toString() && !seenIds.has(block.id)) {
          seenIds.add(block.id);
          blocks.push(block);
        }
      }
    } else {
      // 获取所有带标签的块
      for (const [, nodes] of this.tagIndex.entries()) {
        for (const node of nodes) {
          if (node.uri.toString() === uri.toString() && !seenIds.has(node.id)) {
            seenIds.add(node.id);
            blocks.push(node);
          }
        }
      }
    }

    return blocks.sort((a, b) => a.line - b.line);
  }

  public getTagsFromSettings(): TagDefinition[] {
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const defs = config.get<TagDefinition[]>("tags.definitions", []);

    // 预设标签只用于首次初始化，不应该在删除后自动恢复
    // 用户删除标签应该真正删除，不再显示
    return this.normalizeDefinitions(defs);
  }
}
