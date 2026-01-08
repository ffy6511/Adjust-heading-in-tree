import * as vscode from "vscode";
import * as path from "path";
import { HeadingProvider } from "../providers/headingProvider";
import { TagIndexService } from "../services/tagIndexService";
import { ViewStateService } from "../services/viewStateService";

interface MindmapUpdatePayload {
  type: "update";
  headings: any[];
  expandedNodes: string[];
  docTitle: string;
}

export class MindmapViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "headingNavigator.mindmapView";

  private _view?: vscode.WebviewView;
  private _webviewReady = false;
  private _pendingUpdate: MindmapUpdatePayload | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _headingProvider: HeadingProvider,
    private readonly _tagService: TagIndexService,
    private readonly _viewStateService: ViewStateService
  ) {
    this._headingProvider.onDidChangeTreeData(() => {
      this.updateView();
    });
    this._tagService.onDidUpdateTags(() => {
        this.updateView();
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    this._webviewReady = false;

    webviewView.onDidDispose(() => {
      this._view = undefined;
      this._webviewReady = false;
    });

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "revealHeading":
          {
            const toPosition = (pos: any) => {
              if (!pos) {
                return undefined;
              }
              // VS Code Range serializes to {start, end}, but sometimes we may get {_start, _end}
              const candidate =
                pos.start || pos.anchor || pos._start || pos || pos.position;
              const line = typeof candidate.line === "number" ? candidate.line : candidate._line;
              const character =
                typeof candidate.character === "number"
                  ? candidate.character
                  : candidate._character;
              if (typeof line === "number" && typeof character === "number") {
                return new vscode.Position(line, character);
              }
              return undefined;
            };
            const toRange = (r: any) => {
              if (!r) {
                return undefined;
              }
              const start = toPosition(r.start) ?? toPosition(r._start);
              const end = toPosition(r.end) ?? toPosition(r._end) ?? start;
              if (start && end) {
                return new vscode.Range(start, end);
              }
              return undefined;
            };

            const range = toRange(data.range);
            if (range) {
              vscode.commands.executeCommand("headingNavigator.reveal", range);
            }
          }
          break;
        case "getHeadingContent":
          {
            const content = this.getHeadingContent(data.nodeId);
            if (this._view) {
              this._view.webview.postMessage({
                type: "headingContent",
                nodeId: data.nodeId,
                content: content,
              });
            }
          }
          break;
        case "editHeading":
          {
            const { nodeId, newText } = data;
            const node = this._headingProvider.findNodeById(nodeId);
            if (node) {
              const edit = new vscode.WorkspaceEdit();
              const editor = vscode.window.activeTextEditor;
              if (editor) {
                const document = editor.document;
                const originalText = document.lineAt(node.range.start.line)
                  .text;
                const newHeaderText = originalText.replace(
                  node.label,
                  newText
                );
                edit.replace(
                  document.uri,
                  node.range,
                  newHeaderText
                );
                vscode.workspace.applyEdit(edit);
              }
            }
          }
          break;
        case "setExpandedState":
          this._viewStateService.setExpanded(data.nodeId, data.expanded);
          break;
        case "toggleMindmapView":
            vscode.commands.executeCommand("headingNavigator.toggleMindmapView");
            break;
        case "mindmapReady":
          this._webviewReady = true;
          this.flushPendingUpdate();
          break;
      }
    });

    // Initial update
    this.updateView();
  }

  private updateView() {
    this._pendingUpdate = this.buildUpdatePayload();
    this.flushPendingUpdate();
  }

  private flushPendingUpdate() {
    if (!this._view || !this._webviewReady || !this._pendingUpdate) {
      return;
    }

    this._view.webview.postMessage(this._pendingUpdate);
    this._pendingUpdate = null;
  }

  private buildUpdatePayload(): MindmapUpdatePayload {
    const headings = this._headingProvider.getRootNodes();
    const activeEditor = vscode.window.activeTextEditor;
    const activeUri = activeEditor?.document.uri;

    const tagsByLine = new Map<number, string[]>();
    if (activeEditor && activeUri) {
      const tagsInFile = this._tagService.getTagsForFile(activeUri);
      for (const tag of tagsInFile) {
        const blocks = this._tagService.getBlocksForFile(activeUri, tag);
        for (const block of blocks) {
          const existing = tagsByLine.get(block.line) ?? [];
          existing.push(tag);
          tagsByLine.set(block.line, existing);
        }
      }
    }

    const serializeRange = (range: vscode.Range | undefined) => {
      if (!range) {
        return undefined;
      }
      return {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
      };
    };

    const annotateTags = (heading: any): any => {
      const children = heading.children?.map((child: any) => annotateTags(child)) ?? [];
      return {
        ...heading,
        range: serializeRange(heading.range),
        tags: tagsByLine.get(heading.range.start.line) ?? [],
        children,
      };
    };

    const headingsWithTags = headings.map((heading) => annotateTags(heading));

    return {
      type: "update",
      headings: headingsWithTags,
      expandedNodes: this._viewStateService.getExpandedNodes(),
      docTitle: activeUri
        ? path.basename(activeUri.fsPath)
        : "Mind Map",
    };
  }

  private getHeadingContent(nodeId: string): string {
    const node = this._headingProvider.findNodeById(nodeId);
    if (!node) {
      return "";
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return "";
    }

    const document = editor.document;
    const startLine = node.range.end.line + 1;
    let endLine = document.lineCount;

    const allNodes = this._headingProvider.getOrderedNodes();
    const nodeIndex = allNodes.findIndex((n) => n.id === nodeId);
    if (nodeIndex !== -1 && nodeIndex + 1 < allNodes.length) {
      endLine = allNodes[nodeIndex + 1].range.start.line;
    }

    if (startLine >= endLine) {
      return "";
    }

    const range = new vscode.Range(startLine, 0, endLine, 0);
    let content = document.getText(range);

    // Strip markdown/typst formatting
    content = content
      .replace(/^[=\s#]+|[=\s#]+$/g, "")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Links
      .replace(/[*_`]/g, ""); // Bold, italic, code

    return content.trim().substring(0, 200);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "webview", "mindmap", "main.js")
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "webview",
        "mindmap",
        "style.css"
      )
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet" />
    <title>Mind Map View</title>
</head>
<body>
    <div class="toolbar">
        <button id="back-to-toc">Back to TOC</button>
        <button id="reset-view">Reset View</button>
        <button id="fit-to-window">Fit to Window</button>
        <button id="export-png">Export as PNG</button>
        <button id="export-svg">Export as SVG</button>
        <input type="text" id="search-bar" placeholder="Filter by tag...">
    </div>
    <svg id="mindmap"></svg>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/canvg/dist/browser/canvg.min.js"></script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
