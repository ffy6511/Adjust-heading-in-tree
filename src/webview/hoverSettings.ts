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

    // Provide Codicons mapping for webview
    // We will use VS Code's built-in CSS for codicons if available in webview context,
    // or we can just use the codicon font via a CDN or local resource.
    // Actually, VS Code webviews have access to codicons by default if we use the right CSS.
    // Let's use the pattern from VS Code docs:
    const codiconsUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "node_modules",
        "@vscode/codicons",
        "dist",
        "codicon.css"
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
          desc: "Add or remove tags for this heading"
      }
    ];

    const availableItemsJSON = JSON.stringify(items);
    const currentItemsJSON = JSON.stringify(currentItems);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${codiconsUri}" rel="stylesheet" />
    <title>Hover Toolbar Settings</title>
    <style>
        :root {
            --container-paddding: 20px;
            --input-padding-vertical: 6px;
            --input-padding-horizontal: 4px;
            --input-margin-vertical: 4px;
            --input-margin-horizontal: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
            user-select: none;
        }

        h2 {
            font-size: 1.2em;
            margin-bottom: 20px;
            font-weight: 500;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
        }

        .toolbar-preview {
            display: flex;
            align-items: center;
            gap: 4px;
            min-height: 40px;
            padding: 10px;
            background-color: var(--vscode-editor-snippetFinalTabstopHighlightBorder); 
            /* Just a slight background distinction */
            background-color: var(--vscode-editorWidget-background);
            border: 1px dashed var(--vscode-editorGroup-border);
            border-radius: 6px;
            margin-bottom: 30px;
            overflow-x: auto;
        }

        .toolbar-preview.drag-over {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-editor-snippetTabstopHighlightBackground);
        }
        
        .toolbar-item {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 4px;
            cursor: grab;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            position: relative;
        }
        
        .toolbar-item:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .toolbar-item:active {
            cursor: grabbing;
        }

        .codicon {
            font-size: 16px;
        }

        .available-items {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 12px;
        }

        .item-card {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            cursor: grab;
            transition: border-color 0.2s;
        }

        .item-card:hover {
            border-color: var(--vscode-focusBorder);
        }

        .item-card:active {
            cursor: grabbing;
        }

        /* 已选中项的禁用样式：降低透明度，显示禁止拖拽的视觉提示 */
        .item-card.disabled {
            opacity: 0.5;
            cursor: not-allowed;
            pointer-events: auto;
        }

        .item-card.disabled:hover {
            border-color: var(--vscode-widget-border);
            cursor: not-allowed;
        }

        .item-card.disabled:active {
            cursor: not-allowed;
        }

        .item-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background-color: var(--vscode-keybindingLabel-background);
            border: 1px solid var(--vscode-keybindingLabel-border);
            color: var(--vscode-keybindingLabel-foreground);
            border-radius: 4px;
            flex-shrink: 0;
        }

        .item-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
            overflow: hidden;
        }

        .item-title {
            font-weight: 600;
            font-size: 0.9em;
        }

        .item-desc {
            font-size: 0.8em;
            opacity: 0.8;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .trash-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            margin-top: -16px; /* 向上偏移，平衡底部文字 */
        }

        .trash-zone {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border: 1px dashed var(--vscode-errorForeground);
            border-radius: 4px;
            color: var(--vscode-errorForeground);
            transition: all 0.2s;
            cursor: default;
        }

        .trash-zone.drag-over {
            background-color: var(--vscode-inputValidation-errorBackground);
            border-style: solid;
        }

        .trash-label {
            font-size: 0.75em;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            line-height: 1.2;
            max-width: 60px;
            word-wrap: break-word;
        }
        
        .empty-placeholder {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            font-size: 0.9em;
            pointer-events: none;
        }

        .actions {
            margin-top: 20px;
            display: flex;
            justify-content: flex-end;
        }

        button.save-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 2px;
            cursor: pointer;
            font-family: inherit;
        }

        button.save-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
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
        
        const activeListEl = document.getElementById('active-list');
        const availableListEl = document.getElementById('available-list');
        const trashEl = document.getElementById('trash');
        const saveBtn = document.getElementById('save-btn');

        let draggedItem = null;
        let draggedFrom = null; // 'active' or 'available'
        let draggedIndex = -1;

        // Render Functions
        function renderActiveList() {
            activeListEl.innerHTML = '';
            
            if (currentItems.length === 0) {
                const placeholder = document.createElement('div');
                placeholder.className = 'empty-placeholder';
                placeholder.textContent = 'Drag items here from below...';
                activeListEl.appendChild(placeholder);
                return;
            }

            currentItems.forEach((itemId, index) => {
                const itemDef = availableItemsMap.find(i => i.id === itemId);
                if (!itemDef) return;

                const el = document.createElement('div');
                el.className = 'toolbar-item';
                el.draggable = true;
                el.dataset.index = index;
                el.dataset.id = itemId;
                el.title = itemDef.label;
                
                // Add icon span with codicon class
                const icon = document.createElement('span');
                icon.className = 'codicon codicon-' + itemDef.icon;
                el.appendChild(icon);

                addDragEvents(el, 'active');
                activeListEl.appendChild(el);
            });
        }

        function renderAvailableList() {
            availableListEl.innerHTML = '';
            availableItemsMap.forEach(item => {
                const navId = item.id;
                // 检查该项是否已经在已选列表中
                const isAlreadySelected = currentItems.includes(navId);

                const card = document.createElement('div');
                card.className = 'item-card';
                // 如果已选中，则禁用拖拽并添加禁用样式
                if (isAlreadySelected) {
                    card.classList.add('disabled');
                    card.draggable = false;
                    card.title = 'This item is already in the active toolbar';
                } else {
                    card.draggable = true;
                }
                card.dataset.id = navId;

                const iconBox = document.createElement('div');
                iconBox.className = 'item-icon';
                const icon = document.createElement('span');
                icon.className = 'codicon codicon-' + item.icon;
                iconBox.appendChild(icon);

                const infoBox = document.createElement('div');
                infoBox.className = 'item-info';

                const title = document.createElement('div');
                title.className = 'item-title';
                title.textContent = item.label;

                const desc = document.createElement('div');
                desc.className = 'item-desc';
                desc.textContent = item.desc;

                infoBox.appendChild(title);
                infoBox.appendChild(desc);

                card.appendChild(iconBox);
                card.appendChild(infoBox);

                // 只有未选中的项才能点击添加和拖拽
                if (!isAlreadySelected) {
                    // Add click to add functionality
                    card.addEventListener('click', () => {
                       if (currentItems.length < 6) {
                           currentItems.push(navId);
                           renderActiveList();
                           // 重新渲染可用列表以更新禁用状态
                           renderAvailableList();
                       }
                    });

                    addDragEvents(card, 'available');
                }
                availableListEl.appendChild(card);
            });
        }

        // Drag & Drop Logic
        function addDragEvents(el, source) {
            el.addEventListener('dragstart', (e) => {
                draggedItem = el.dataset.id;
                draggedFrom = source;
                if (source === 'active') {
                    draggedIndex = parseInt(el.dataset.index);
                }
                e.dataTransfer.effectAllowed = 'move';
                el.style.opacity = '0.5';
            });

            el.addEventListener('dragend', (e) => {
                el.style.opacity = '1';
                removeDragOverClasses();
            });
        }

        // Active List Drop Zone
        activeListEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            activeListEl.classList.add('drag-over');
            e.dataTransfer.dropEffect = 'move';
        });

        activeListEl.addEventListener('dragleave', () => {
            activeListEl.classList.remove('drag-over');
        });

        activeListEl.addEventListener('drop', (e) => {
            e.preventDefault();
            activeListEl.classList.remove('drag-over');

            if (!draggedItem) return;

            // Determine drop index
            // Simple heuristic to drop at the end, or we can find closest child
            // For simplicity, let's just append or reorder.
            // Better: find element under cursor?

            // To make it precise (insert between items), we'd need more complex logic.
            // Let's implement a swap or append logic.

            if (draggedFrom === 'available') {
                if (currentItems.length >= 6) return; // Limit to 6
                currentItems.push(draggedItem);
            } else if (draggedFrom === 'active') {
                // Remove from old index
                currentItems.splice(draggedIndex, 1);
                // Put at end for now, or finding target index logic:
                // Since this is a simple row, let's assume dropping anywhere adds to end
                // unless we implement precise dropping.
                // Let's implement precise dropping based on mouse X position

                const afterElement = getDragAfterElement(activeListEl, e.clientX);
                if (afterElement == null) {
                    currentItems.push(draggedItem);
                } else {
                    const targetIndex = parseInt(afterElement.dataset.index);
                    currentItems.splice(targetIndex, 0, draggedItem);
                }
            } else {
                 const afterElement = getDragAfterElement(activeListEl, e.clientX);
                 if (currentItems.length < 6) {
                     if (afterElement == null) {
                        currentItems.push(draggedItem);
                    } else {
                        const targetIndex = parseInt(afterElement.dataset.index);
                        currentItems.splice(targetIndex, 0, draggedItem);
                    }
                 }
            }

            renderActiveList();
            // 重新渲染可用列表，更新已选中项的禁用状态
            renderAvailableList();
        });

        // Helper to find insert position
        function getDragAfterElement(container, x) {
            const draggableElements = [...container.querySelectorAll('.toolbar-item:not(.dragging)')];
            
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = x - box.left - box.width / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }

        // 垃圾桶拖拽区域
        // 用户可以将已激活工具栏中的 item 拖拽到垃圾桶按钮处来删除该 item
        // 拖拽删除的交互逻辑：
        // 1. 当用户从 active list 拖拽一个 item 时，可以将其拖到垃圾桶区域
        // 2. 垃圾桶区域会高亮显示，提示用户可以释放鼠标来删除
        // 3. 释放后，该 item 会从 active list 中移除，同时 available list 中对应的 item 恢复可拖拽状态
        trashEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            trashEl.classList.add('drag-over');
        });

        trashEl.addEventListener('dragleave', () => {
            trashEl.classList.remove('drag-over');
        });

        trashEl.addEventListener('drop', (e) => {
            e.preventDefault();
            trashEl.classList.remove('drag-over');

            // 只有从 active list 拖拽的 item 才能被删除
            if (draggedFrom === 'active' && draggedIndex > -1) {
                currentItems.splice(draggedIndex, 1);
                renderActiveList();
                // 重新渲染可用列表，被删除的项在 available list 中恢复可拖拽状态
                renderAvailableList();
            }
        });

        function removeDragOverClasses() {
            activeListEl.classList.remove('drag-over');
            trashEl.classList.remove('drag-over');
        }

        // Save
        saveBtn.addEventListener('click', () => {
            vscode.postMessage({
                command: 'saveSettings',
                items: currentItems
            });
        });

        // Init
        renderActiveList();
        renderAvailableList();

    </script>
</body>
</html>`;
  }
}
