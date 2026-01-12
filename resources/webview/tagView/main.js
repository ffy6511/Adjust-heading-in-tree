// Expect globals: vscode

let state = {
    tags: [],
    definitions: [],
    remarkDefinition: null,
    data: {},
    itemMap: new Map(),
    selectedTags: new Set(),
    selectedItems: new Set(),
    searchQuery: "",
    isGlobal: false,
    isMultiSelect: false,
    isEditMode: false,
    currentFileName: null,
    maxPinnedDisplay: 6
};

// UI Elements
const tagsContainer = document.getElementById('tags');
const blocksContainer = document.getElementById('blocks');
const searchInput = document.getElementById('search');
const selectBtn = document.getElementById('select-btn');
const scopeBtn = document.getElementById('scope-btn');
const batchDeleteBtn = document.getElementById('batch-delete-btn');
const createFileBtn = document.getElementById('create-file-btn');

// Message Handling
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'update':
            state.tags = message.tags;
            state.definitions = message.definitions;
            state.remarkDefinition = message.remarkDefinition || null;
            state.data = message.data;
            state.isGlobal = message.isGlobal;
            state.isMultiSelect = message.isMultiSelect;
            state.isEditMode = message.isEditMode;
            state.currentFileName = message.currentFileName;
            state.maxPinnedDisplay = Math.max(1, message.maxPinnedDisplay ?? 6);

            // Populate itemMap for efficient lookup
            state.itemMap.clear();
            Object.values(state.data).flat().forEach(item => {
                state.itemMap.set(`${item.uri}:${item.line}`, item);
            });

            updateScopeBtn();
            updateSelectBtn();
            updateEditMode();
            render();
            break;
        case 'scopeChanged':
            state.isGlobal = message.isGlobal;
            updateScopeBtn();
            break;
        case 'toggleMultiSelectFromExtension':
            state.isMultiSelect = message.enabled;
            updateSelectBtn();
            if (!state.isMultiSelect && state.selectedTags.size > 1) {
                const first = Array.from(state.selectedTags)[0];
                state.selectedTags.clear();
                state.selectedTags.add(first);
            }
            render();
            break;
        case 'toggleEditModeFromExtension':
            state.isEditMode = message.enabled;
            updateEditMode();
            if (!state.isEditMode) {
                state.selectedItems.clear();
            }
            render();
            break;
        case 'batchDeleteSuccess':
            state.selectedItems.clear();
            // No need to call render() here as a full 'update' will be triggered by the extension
            break;
    }
});

// Event Listeners
scopeBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'toggleScope' });
});

searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    renderTags();
});

selectBtn.addEventListener('click', () => {
    state.isMultiSelect = !state.isMultiSelect;
    updateSelectBtn();
    if (!state.isMultiSelect && state.selectedTags.size > 1) {
        const first = Array.from(state.selectedTags)[0];
        state.selectedTags.clear();
        state.selectedTags.add(first);
    }
    vscode.postMessage({ type: 'toggleMultiSelect', enabled: state.isMultiSelect });
    render();
});

batchDeleteBtn.addEventListener('click', () => {
    if (state.selectedItems.size === 0) {
        vscode.postMessage({ type: 'showInformationMessage', message: 'No items selected.' });
        return;
    }
    const itemsToDelete = [];
    state.selectedItems.forEach(id => {
        const block = state.itemMap.get(id);
        if (block) {
            itemsToDelete.push({
                uri: block.uri,
                line: block.line,
                tagNames: block.tags || []
            });
        }
    });
    vscode.postMessage({
        type: 'batchRemoveTags',
        items: itemsToDelete
    });
});

createFileBtn.addEventListener('click', () => {
    if (state.selectedItems.size === 0) {
        vscode.postMessage({ type: 'showInformationMessage', message: 'No items selected.' });
        return;
    }
    const itemsToCreate = Array.from(state.selectedItems).map(id => state.itemMap.get(id)).filter(Boolean);
    vscode.postMessage({
        type: 'createFileFromItems',
        items: itemsToCreate
    });
});


// UI Update Functions
function updateScopeBtn() {
    // ... (unchanged)
}

function updateSelectBtn() {
    // ... (unchanged)
}

function updateEditMode() {
    const editActions = document.getElementById('edit-mode-actions');
    editActions.style.display = state.isEditMode ? 'flex' : 'none';
}

function render() {
    renderTags();
    renderBlocks();
}

function renderTags() {
    tagsContainer.innerHTML = '';
    // ... (logic to determine tagsToRender)

    tagsToRender.forEach(tag => {
        const el = document.createElement('div');
        // ... (el setup)

        el.addEventListener('click', () => {
            if (state.isEditMode) {
                const itemsForTag = state.data[tag] || [];
                const allSelected = itemsForTag.every(item => state.selectedItems.has(`${item.uri}:${item.line}`));
                if (allSelected) {
                    itemsForTag.forEach(item => state.selectedItems.delete(`${item.uri}:${item.line}`));
                } else {
                    itemsForTag.forEach(item => state.selectedItems.add(`${item.uri}:${item.line}`));
                }
                renderBlocks();
            } else {
                // ... (existing multi-select and single-select logic)
            }
        });
        tagsContainer.appendChild(el);
    });
}

function renderBlocks() {
    blocksContainer.innerHTML = '';
    // ... (logic to get candidate blocks and group them)

    groups.forEach(group => {
        // ... (group rendering)
        group.blocks.forEach(block => {
            const itemUniqueId = `${block.uri}:${block.line}`;
            const isSelected = state.selectedItems.has(itemUniqueId);

            const el = document.createElement('div');
            // ... (el setup, add 'selected' class if isSelected)

            if (state.isEditMode) {
                // ... (create and append selectIcon)
            }
            // ... (append content)

            if (!state.isEditMode) {
                // ... (create and append hover actions)
            }

            el.addEventListener('click', () => {
                if (state.isEditMode) {
                    if (isSelected) {
                        state.selectedItems.delete(itemUniqueId);
                    } else {
                        state.selectedItems.add(itemUniqueId);
                    }
                    renderBlocks();
                } else {
                    vscode.postMessage({ type: 'openLocation', uri: block.uri, line: block.line });
                }
            });
            wrapper.appendChild(el);
        });
        blocksContainer.appendChild(wrapper);
    });
}

// Initial request
vscode.postMessage({ type: 'refresh' });
