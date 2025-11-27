import * as vscode from "vscode";
import { HeadingMatch, parseHeadings } from "../providers/parser";

export interface TagDefinition {
  name: string;
  color?: string;
  icon?: string;
}

export interface TaggedHeading extends HeadingMatch {
  uri: vscode.Uri;
  id: string; // Unique ID for keying (fsPath + line)
}

export class TagIndexService {
  private static instance: TagIndexService;
  private tagIndex: Map<string, TaggedHeading[]> = new Map();
  private _onDidUpdateTags = new vscode.EventEmitter<void>();
  public readonly onDidUpdateTags = this._onDidUpdateTags.event;

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
    const uri = document.uri;

    // First, remove all existing entries for this file
    this.removeEntriesForFile(uri);

    // Then add new ones
    for (const match of matches) {
      if (match.tags && match.tags.length > 0) {
        for (const tag of match.tags) {
          const nodes = this.tagIndex.get(tag) || [];

          const node: TaggedHeading = {
            ...match,
            uri: uri,
            id: `${uri.fsPath}:${match.line}`,
          };

          nodes.push(node);
          this.tagIndex.set(tag, nodes);
        }
      }
    }
  }

  private removeEntriesForFile(uri: vscode.Uri) {
    for (const [tag, nodes] of this.tagIndex.entries()) {
      const filtered = nodes.filter((n) => n.uri.toString() !== uri.toString());
      if (filtered.length === 0) {
        this.tagIndex.delete(tag);
      } else {
        this.tagIndex.set(tag, filtered);
      }
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
    // Ensure defaults exist
    const defaults = [
      { name: "todo", color: "charts.orange", icon: "circle-large-outline" },
      { name: "review", color: "charts.yellow", icon: "eye" },
      { name: "highlight", color: "charts.blue", icon: "star" },
    ];

    // Merge: if name exists in user config, override default.
    const merged = [...defs];
    for (const d of defaults) {
      if (!merged.find((m) => m.name === d.name)) {
        merged.push(d);
      }
    }
    return merged;
  }
}
