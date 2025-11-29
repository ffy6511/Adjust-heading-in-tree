// Expect globals: vscode, availableItemsMap, currentItems

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
