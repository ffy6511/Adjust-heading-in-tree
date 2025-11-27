import * as vscode from "vscode";
import { TagIndexService, TaggedHeading, TagDefinition } from "../services/tagIndexService";
import * as path from "path";

export class TagViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "headingNavigator.tagView";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _tagService: TagIndexService
  ) {
    // Listen for updates
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
      localResourceRoots: [
        this._extensionUri
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "openLocation": {
          this.openLocation(data.uri, data.line);
          break;
        }
        case "refresh": {
            this._tagService.scanWorkspace();
            break;
        }
      }
    });

    // Initial update
    this.updateView();
  }

  private updateView() {
    if (this._view) {
      const allTags = this._tagService.getAllTags();
      const defs = this._tagService.getTagsFromSettings();

      const payload: any = {};

      for (const tag of allTags) {
          const blocks = this._tagService.getBlocksByTag(tag);
          payload[tag] = blocks.map(b => ({
              text: b.text,
              line: b.line,
              level: b.level,
              uri: b.uri.toString(), // Serialize URI
              fsPath: b.uri.fsPath,
              fileName: path.basename(b.uri.fsPath)
          }));
      }

      this._view.webview.postMessage({
        type: "update",
        tags: allTags,
        definitions: defs,
        data: payload
      });
    }
  }

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

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${codiconsUri}" rel="stylesheet" />
    <title>Tag View</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 10px;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
        }
        .header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 10px;
        }
        .search-box {
            flex: 1;
            padding: 6px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            box-sizing: border-box;
        }
        .icon-btn {
            background: none;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .icon-btn:hover {
            color: var(--vscode-icon-foreground);
            background-color: var(--vscode-toolbar-hoverBackground);
            border-radius: 4px;
        }
        .tags-container {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        .tag-chip {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 12px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            cursor: pointer;
            border: 1px solid transparent;
            font-size: 0.9em;
            opacity: 0.7;
        }
        .tag-chip:hover {
            opacity: 1;
        }
        .tag-chip.selected {
            opacity: 1;
            border-color: var(--vscode-focusBorder);
            font-weight: bold;
        }
        .block-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .block-item {
            padding: 8px;
            border-radius: 4px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            cursor: pointer;
        }
        .block-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .block-header {
            display: flex;
            justify-content: space-between;
            font-size: 0.85em;
            opacity: 0.8;
            margin-bottom: 4px;
        }
        .block-content {
            font-weight: 500;
        }
        .empty-state {
            text-align: center;
            opacity: 0.6;
            margin-top: 20px;
        }
        /* Codicon override */
        .codicon { vertical-align: middle; }
    </style>
</head>
<body>
    <div class="header">
        <input type="text" id="search" class="search-box" placeholder="Search tags...">
        <button id="refresh-btn" class="icon-btn" title="Refresh">
            <span class="codicon codicon-refresh"></span>
        </button>
    </div>
    <div id="tags" class="tags-container"></div>
    <div id="blocks" class="block-list"></div>

    <script>
        const vscode = acquireVsCodeApi();

        let state = {
            tags: [], // list of tag names
            definitions: [], // list of definitions
            data: {}, // map tag -> blocks
            selectedTags: new Set(),
            searchQuery: ""
        };

        // UI Elements
        const tagsContainer = document.getElementById('tags');
        const blocksContainer = document.getElementById('blocks');
        const searchInput = document.getElementById('search');
        const refreshBtn = document.getElementById('refresh-btn');

        // Initial Load
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                console.log('TagView: Received update', message);
                state.tags = message.tags;
                state.definitions = message.definitions;
                state.data = message.data;
                render();
            }
        });

        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.toLowerCase();
            renderTags();
        });

        refreshBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'refresh' });
        });

        function getTagStyle(tagName) {
            const def = state.definitions.find(d => d.name === tagName);
            return def;
        }

        function render() {
            renderTags();
            renderBlocks();
        }

        function renderTags() {
            tagsContainer.innerHTML = '';

            const filteredTags = state.tags.filter(t => t.toLowerCase().includes(state.searchQuery));

            if (filteredTags.length === 0) {
                 tagsContainer.innerHTML = '<span style="opacity:0.6; font-size:0.9em; padding:4px;">No tags found</span>';
                 return;
            }

            filteredTags.forEach(tag => {
                const el = document.createElement('div');
                el.className = 'tag-chip';
                if (state.selectedTags.has(tag)) {
                    el.classList.add('selected');
                }

                const def = getTagStyle(tag);
                let iconHtml = '';
                if (def && def.icon) {
                    iconHtml = '<span class="codicon codicon-' + def.icon + '"></span> ';
                }

                el.innerHTML = iconHtml + tag;
                el.title = tag;

                el.addEventListener('click', () => {
                    if (state.selectedTags.has(tag)) {
                        state.selectedTags.delete(tag);
                    } else {
                        state.selectedTags.add(tag);
                    }
                    render(); // Re-render everything
                });

                tagsContainer.appendChild(el);
            });
        }

        function renderBlocks() {
            blocksContainer.innerHTML = '';

            if (state.selectedTags.size === 0) {
                blocksContainer.innerHTML = '<div class="empty-state">Select a tag to see blocks</div>';
                return;
            }

            // Find blocks that have ALL selected tags
            const selectedArray = Array.from(state.selectedTags);

            // Start with blocks from the first tag
            let candidates = state.data[selectedArray[0]] || [];

            // Intersect with subsequent tags
            for (let i = 1; i < selectedArray.length; i++) {
                const nextTagBlocks = state.data[selectedArray[i]] || [];
                const nextSet = new Set(nextTagBlocks.map(b => b.uri + ':' + b.line));
                candidates = candidates.filter(b => nextSet.has(b.uri + ':' + b.line));
            }

            if (candidates.length === 0) {
                blocksContainer.innerHTML = '<div class="empty-state">No blocks found with all selected tags</div>';
                return;
            }

            candidates.forEach(block => {
                const el = document.createElement('div');
                el.className = 'block-item';

                const header = document.createElement('div');
                header.className = 'block-header';
                header.innerHTML = '<span>' + block.fileName + ':' + (block.line + 1) + '</span>';

                const content = document.createElement('div');
                content.className = 'block-content';
                content.textContent = block.text; // Text content

                el.appendChild(header);
                el.appendChild(content);

                el.addEventListener('click', () => {
                    vscode.postMessage({
                        type: 'openLocation',
                        uri: block.uri,
                        line: block.line
                    });
                });

                blocksContainer.appendChild(el);
            });
        }

        // Initial request (optional if backend pushes on connect)
        vscode.postMessage({ type: 'refresh' });

    </script>
</body>
</html>`;
  }
}
