import * as vscode from "vscode";

export class HoverSettingsPanel {
  public static currentPanel: HoverSettingsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.html = this._getWebviewContent();

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "saveSettings":
            await vscode.workspace
              .getConfiguration("adjustHeadingInTree")
              .update(
                "view.hoverToolbar",
                message.items,
                vscode.ConfigurationTarget.Global
              );
            vscode.window.showInformationMessage(
              "Hover toolbar settings saved!"
            );
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (HoverSettingsPanel.currentPanel) {
      HoverSettingsPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "hoverSettings",
      "Hover Toolbar Settings",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "resources"),
          vscode.Uri.joinPath(extensionUri, "node_modules"),
        ],
      }
    );

    HoverSettingsPanel.currentPanel = new HoverSettingsPanel(
      panel,
      extensionUri
    );
  }

  public dispose() {
    HoverSettingsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getWebviewContent() {
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const currentItems = config.get<string[]>("view.hoverToolbar", []);

    const codiconsUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "node_modules",
        "@vscode/codicons",
        "dist",
        "codicon.css"
      )
    );

    const styleUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "webview",
        "hoverSettings",
        "style.css"
      )
    );

    const scriptUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "webview",
        "hoverSettings",
        "main.js"
      )
    );

    // Initial state
    const items = [
      {
        id: "shiftUp",
        icon: "triangle-left",
        label: "Shift Up",
        desc: "Increase heading level (e.g. h2 -> h1)",
      },
      {
        id: "shiftDown",
        icon: "triangle-right",
        label: "Shift Down",
        desc: "Decrease heading level (e.g. h1 -> h2)",
      },
      {
        id: "moveHeadingUp",
        icon: "fold-up",
        label: "Move Up",
        desc: "Move heading up within same parent",
      },
      {
        id: "moveHeadingDown",
        icon: "fold-down",
        label: "Move Down",
        desc: "Move heading down within same parent",
      },
      {
        id: "filterToSubtree",
        icon: "filter",
        label: "Filter Subtree",
        desc: "Show only this heading and children",
      },
      {
        id: "openExportMenu",
        icon: "file-pdf",
        label: "Export",
        desc: "Open export options",
      },
      {
        id: "editTags",
        icon: "tag",
        label: "Edit Tags",
        desc: "Add or remove tags for this heading",
      },
    ];

    const availableItemsJSON = JSON.stringify(items);
    const currentItemsJSON = JSON.stringify(currentItems);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${codiconsUri}" rel="stylesheet" />
    <link href="${styleUri}" rel="stylesheet" />
    <title>Hover Toolbar Settings</title>
</head>
<body>
    <div class="container">
        <h2>Active Hover Toolbar</h2>
        <div style="display: flex; gap: 15px; align-items: center;">
            <div id="active-list" class="toolbar-preview">
                <!-- Toolbar items will be injected here -->
                <div class="empty-placeholder">Drag items here...</div>
            </div>

            <!-- 垃圾桶区域：用户可以将 item 拖拽到此处来删除该 item -->
            <div class="trash-container">
                <div id="trash" class="trash-zone" title="Drag here to remove">
                    <span class="codicon codicon-trash"></span>
                </div>
                <div class="trash-label">Drop to remove</div>
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h2 style="margin: 0;">Available Items</h2>
            <button id="save-btn" class="save-btn">Save Changes</button>
        </div>
        <div id="available-list" class="available-items">
            <!-- Available items will be injected here -->
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const availableItemsMap = ${availableItemsJSON};
        let currentItems = ${currentItemsJSON};
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
