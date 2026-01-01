import * as vscode from "vscode";
import * as path from "path";
import { HeadingProvider } from "../providers/headingProvider";
import { TagIndexService } from "../services/tagIndexService";
import { ViewStateService } from "../services/viewStateService";

export class MindmapViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "headingNavigator.mindmapView";

  private _view?: vscode.WebviewView;

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

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "revealHeading":
          vscode.commands.executeCommand("headingNavigator.reveal", data.range);
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
        case "toggleMindmapView":
            vscode.commands.executeCommand("headingNavigator.toggleMindmapView");
            break;
      }
    });

    // Initial update
    this.updateView();
  }

  private updateView() {
    if (!this._view) {
      return;
    }

    const headings = this._headingProvider.getRootNodes();
    const activeEditor = vscode.window.activeTextEditor;
    const tagsInFile = activeEditor
      ? this._tagService.getTagsForFile(activeEditor.document.uri)
      : [];

    const annotateTags = (heading: any): any => {
      const tags: string[] = [];
      if (activeEditor) {
        for (const tag of tagsInFile) {
          const blocks = this._tagService.getBlocksForFile(
            activeEditor.document.uri,
            tag
          );
          if (blocks.some((b) => b.line === heading.range.start.line)) {
            tags.push(tag);
          }
        }
      }
      const children = heading.children?.map((child: any) => annotateTags(child)) ?? [];
      return {
        ...heading,
        tags,
        children,
      };
    };

    const headingsWithTags = headings.map((heading) => annotateTags(heading));

    if (this._view) {
      this._view.webview.postMessage({
        type: "update",
        headings: headingsWithTags,
        expandedNodes: this._viewStateService.getExpandedNodes(),
        docTitle: activeEditor
          ? path.basename(activeEditor.document.uri.fsPath)
          : "Mind Map",
      });
    }
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
