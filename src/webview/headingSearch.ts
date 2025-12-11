import * as vscode from "vscode";
import * as path from "path";
import { parseHeadings, HeadingMatch } from "../providers/parser";
import { TagIndexService, TagDefinition } from "../services/tagIndexService";

type SearchScope = "local" | "global";

export class HeadingSearchProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "headingNavigator.headingSearch";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _tagService: TagIndexService
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, "resources"),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "search": {
          await this.handleSearch(
            data.query ?? "",
            (data.scope as SearchScope) ?? "local"
          );
          break;
        }
        case "openLocation": {
          await this.openLocation(data.uri, data.line);
          break;
        }
      }
    });
  }

  /**
   * 处理搜索请求并回传结果
   */
  private async handleSearch(query: string, scope: SearchScope) {
    const trimmed = (query ?? "").trim();
    if (!this._view) {
      return;
    }

    if (trimmed.length === 0) {
      this._view.webview.postMessage({
        type: "results",
        scope,
        definitions: this.getTagDefinitions(),
        results: [],
      });
      return;
    }

    const results =
      scope === "global"
        ? await this.searchGlobal(trimmed)
        : await this.searchLocal(trimmed);

    this._view.webview.postMessage({
      type: "results",
      scope,
      definitions: this.getTagDefinitions(),
      results,
    });
  }

  /**
   * 搜索当前文件中的标题
   */
  private async searchLocal(query: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [];
    }

    const document = editor.document;
    const matches = parseHeadings(document.getText());
    const breadcrumbs = this.computeBreadcrumbs(matches);
    const lowerQuery = query.toLowerCase();

    return matches
      .filter((m) => (m.displayText ?? m.text).toLowerCase().includes(lowerQuery))
      .map((m) => ({
        text: m.displayText ?? m.text,
        line: m.line,
        level: m.level,
        uri: document.uri.toString(),
        fsPath: document.uri.fsPath,
        fileName: path.basename(document.uri.fsPath),
        breadcrumb: breadcrumbs.get(m.line) ?? [],
        tags: m.tags ?? [],
      }));
  }

  /**
   * 搜索工作区内的标题
   */
  private async searchGlobal(query: string) {
    const files = await vscode.workspace.findFiles("**/*.{md,typ}");
    const lowerQuery = query.toLowerCase();
    const results: Array<{
      text: string;
      line: number;
      level: number;
      uri: string;
      fsPath: string;
      fileName: string;
      breadcrumb: string[];
      tags: string[];
    }> = [];

    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const matches = parseHeadings(document.getText());
        const breadcrumbs = this.computeBreadcrumbs(matches);
        for (const match of matches) {
          if (
            (match.displayText ?? match.text)
              .toLowerCase()
              .includes(lowerQuery)
          ) {
            results.push({
              text: match.displayText ?? match.text,
              line: match.line,
              level: match.level,
              uri: document.uri.toString(),
              fsPath: document.uri.fsPath,
              fileName: path.basename(document.uri.fsPath),
              breadcrumb: breadcrumbs.get(match.line) ?? [],
              tags: match.tags ?? [],
            });
          }
        }
      } catch (err) {
        console.error("HeadingSearch: Failed to parse file", file.fsPath, err);
      }
    }

    return results;
  }

  /**
   * 计算面包屑路径
   */
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

  private getTagDefinitions(): TagDefinition[] {
    return this._tagService.getTagsFromSettings();
  }

  /**
   * 打开并定位到指定标题
   */
  private async openLocation(uriStr: string, line: number) {
    try {
      const uri = vscode.Uri.parse(uriStr);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const range = new vscode.Range(line, 0, line, 0);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(range.start, range.start);
    } catch (e) {
      vscode.window.showErrorMessage("Could not open file: " + e);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "node_modules",
        "@vscode/codicons",
        "dist",
        "codicon.css"
      )
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "webview",
        "headingSearch",
        "style.css"
      )
    );

    const tagStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "webview",
        "tagView",
        "style.css"
      )
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "webview",
        "headingSearch",
        "main.js"
      )
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${codiconsUri}" rel="stylesheet" />
    <link href="${tagStyleUri}" rel="stylesheet" />
    <link href="${styleUri}" rel="stylesheet" />
    <title>Heading Search</title>
</head>
<body>
    <div class="header heading-search-header">
        <input type="text" id="search" class="search-box" placeholder="Search headings..." />
        <div class="search-controls">
            <button class="toggle-btn" id="scope-btn" title="Toggle scope (current file / workspace)">
                <span class="codicon codicon-file toggle-btn-icon active" id="scope-icon-file"></span>
                <span class="codicon codicon-globe toggle-btn-icon" id="scope-icon-globe"></span>
            </button>
        </div>
    </div>
    <div id="results" class="results-container"></div>

    <script>
        const vscode = acquireVsCodeApi();
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
