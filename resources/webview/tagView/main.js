// Expect globals: vscode

let state = {
    tags: [],
    definitions: [],
    remarkDefinition: null,
    data: {},
    selectedTags: new Set(),
    selectedItems: new Map(),
    batchSelectedTags: new Set(),
    blockIndex: new Map(),
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
const editBtn = document.getElementById('edit-btn');
const batchToolbar = document.getElementById('batch-toolbar');
const batchCount = document.getElementById('batch-count');
const batchHint = document.getElementById('batch-hint');
const batchDeleteBtn = document.getElementById('batch-delete-btn');
const batchNewFileBtn = document.getElementById('batch-newfile-btn');
const batchInputRow = document.getElementById('batch-input-row');
const batchInput = document.getElementById('batch-input');
const batchInputCancel = document.getElementById('batch-input-cancel');
const batchInputConfirm = document.getElementById('batch-input-confirm');
const batchInputHint = document.getElementById('batch-input-hint');

// 消息处理
window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'update') {
        // 当 tags 列表更新时，如果当前选择的 tags 里已不存在于新列表中（比如被删除了），应该清理一下吗？
        // 暂时先不清理选中状态，除非它真的不存在了。
        // 为了安全起见，我们重新计算 selectedTags 的有效性，或者直接保留用户之前的选择（假设用户知道自己在做什么，或者等 UI 更新后用户自己取消）
        // 这里简单直接使用新数据
        state.tags = message.tags;
        state.definitions = message.definitions;
        state.remarkDefinition = message.remarkDefinition || null;
        state.data = message.data;
        state.isGlobal = message.isGlobal;
        state.isMultiSelect = message.isMultiSelect;
        state.currentFileName = message.currentFileName;
        state.maxPinnedDisplay = Math.max(1, message.maxPinnedDisplay ?? 6);
        state.blockIndex = buildBlockIndex(message.data);
        state.selectedItems = reconcileSelectedItems(state.selectedItems, state.blockIndex);
        document.body.classList.toggle('edit-mode', state.isEditMode);

        // 确保 selectedTags 只包含存在的 tags
        // let validTags = new Set();
        // state.selectedTags.forEach(t => {
        //     if (state.tags.includes(t)) {
        //         validTags.add(t);
        //     }
        // });
        // state.selectedTags = validTags;

        updateScopeBtn();
        updateSelectBtn();
        updateEditBtn();
        updateBatchToolbar();
        render();
    } else if (message.type === 'scopeChanged') {
        state.isGlobal = message.isGlobal;
        updateScopeBtn();
        // Scope 改变通常会伴随后续的 update 消息来更新 tags 数据
    } else if (message.type === 'toggleMultiSelectFromExtension') {
        state.isMultiSelect = message.enabled;
        updateSelectBtn();
        // 切换到单选模式时，只保留第一个选中的标签
        if (!state.isMultiSelect && state.selectedTags.size > 1) {
            const first = Array.from(state.selectedTags)[0];
            state.selectedTags.clear();
            state.selectedTags.add(first);
        }
        render();
    }
});

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
    // 切换到单选模式时，只保留第一个选中的标签
    if (!state.isMultiSelect && state.selectedTags.size > 1) {
        const first = Array.from(state.selectedTags)[0];
        state.selectedTags.clear();
        state.selectedTags.add(first);
    }
    vscode.postMessage({ type: 'toggleMultiSelect', enabled: state.isMultiSelect });
    render();
});

editBtn.addEventListener('click', () => {
    setEditMode(!state.isEditMode);
});

batchDeleteBtn.addEventListener('click', () => {
    const selectedItems = getSelectedItemsInOrder();
    if (selectedItems.length === 0) {
        return;
    }
    vscode.postMessage({
        type: 'batchRemoveTagReferences',
        items: selectedItems.map(item => ({
            uri: item.uri,
            line: item.line
        })),
        tagNames: Array.from(state.batchSelectedTags)
    });
});

batchNewFileBtn.addEventListener('click', () => {
    if (batchInputRow.classList.contains('hidden')) {
        batchInputRow.classList.remove('hidden');
        batchInputHint.classList.remove('hidden');
        batchInput.focus();
        return;
    }
    submitBatchInput();
});

batchInputCancel.addEventListener('click', () => {
    hideBatchInput();
});

batchInputConfirm.addEventListener('click', () => {
    submitBatchInput();
});

batchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        submitBatchInput();
    } else if (event.key === 'Escape') {
        event.preventDefault();
        hideBatchInput();
    }
});

function updateScopeBtn() {
    if (state.isGlobal) {
        document.getElementById('scope-icon-globe').classList.add('active');
        document.getElementById('scope-icon-file').classList.remove('active');
    } else {
        document.getElementById('scope-icon-file').classList.add('active');
        document.getElementById('scope-icon-globe').classList.remove('active');
    }
}

function updateSelectBtn() {
    if (state.isMultiSelect) {
        document.getElementById('select-icon-mult').classList.add('active');
        document.getElementById('select-icon-single').classList.remove('active');
    } else {
        document.getElementById('select-icon-single').classList.add('active');
        document.getElementById('select-icon-mult').classList.remove('active');
    }
}

function updateEditBtn() {
    if (state.isEditMode) {
        document.getElementById('edit-icon-on').classList.add('active');
        document.getElementById('edit-icon-off').classList.remove('active');
    } else {
        document.getElementById('edit-icon-off').classList.add('active');
        document.getElementById('edit-icon-on').classList.remove('active');
    }
}

function setEditMode(enabled) {
    state.isEditMode = enabled;
    document.body.classList.toggle('edit-mode', enabled);
    if (!enabled) {
        state.selectedItems.clear();
        state.batchSelectedTags.clear();
        hideBatchInput();
    }
    updateEditBtn();
    updateBatchToolbar();
    render();
}

function resolveColorToken(color) {
    if (!color) {
        return "var(--vscode-descriptionForeground)";
    }
    if (color.includes(".")) {
        return `var(--vscode-${color.replace(/\./g, "-")})`;
    }
    return color;
}

function getBlockKey(block) {
    return `${block.uri}:${block.line}`;
}

function buildBlockIndex(data) {
    const index = new Map();
    Object.values(data || {}).forEach((blocks) => {
        (blocks || []).forEach((block) => {
            const key = getBlockKey(block);
            if (!index.has(key)) {
                index.set(key, block);
            }
        });
    });
    return index;
}

function reconcileSelectedItems(selectedItems, blockIndex) {
    const next = new Map();
    selectedItems.forEach((value, key) => {
        if (blockIndex.has(key)) {
            next.set(key, blockIndex.get(key));
        }
    });
    return next;
}

function getTagStyle(tagName) {
    const def = state.definitions.find(d => d.name === tagName);
    return def;
}

function getRemarkIcon() {
    const icon = state.remarkDefinition && state.remarkDefinition.icon;
    return icon || 'comment';
}

function render() {
    renderTags();
    renderBlocks();
}

// 计算某个区块关联的标签集合：有选中标签时直接使用选中的，否则聚合所有包含该区块的标签
function getTagNamesForBlock(block) {
    if (state.selectedTags.size > 0) {
        return Array.from(state.selectedTags);
    }

    const tagSet = new Set();
    Object.entries(state.data).forEach(([tagName, blocks]) => {
        const list = blocks || [];
        if (list.some(b => b.uri === block.uri && b.line === block.line)) {
            tagSet.add(tagName);
        }
    });

    if (tagSet.size === 0 && block.tagName) {
        tagSet.add(block.tagName);
    }

    return Array.from(tagSet);
}

function getColorForBlock(block) {
    // 优先使用当前选中的标签颜色
    if (!state.isEditMode && state.selectedTags.size > 0) {
        const selected = Array.from(state.selectedTags)[0];
        const def = getTagStyle(selected);
        return resolveColorToken(def?.color);
    }

    const tags = getTagNamesForBlock(block);
    const firstTag = tags[0];
    const def = firstTag ? getTagStyle(firstTag) : undefined;
    return resolveColorToken(def?.color);
}

function getBlockCandidates() {
    let candidates = [];

    if (!state.isEditMode && state.selectedTags.size > 0) {
        const selectedArray = Array.from(state.selectedTags);
        candidates = state.data[selectedArray[0]] || [];

        for (let i = 1; i < selectedArray.length; i++) {
            const nextTagBlocks = state.data[selectedArray[i]] || [];
            const nextSet = new Set(nextTagBlocks.map(b => b.uri + ':' + b.line));
            candidates = candidates.filter(b => nextSet.has(b.uri + ':' + b.line));
        }
    } else {
        const seen = new Set();
        for (const tag of Object.keys(state.data)) {
            const blocks = state.data[tag] || [];
            for (const block of blocks) {
                const key = getBlockKey(block);
                if (!seen.has(key)) {
                    seen.add(key);
                    candidates.push(block);
                }
            }
        }
    }

    return candidates;
}

function buildBlockGroups(candidates) {
    const groups = [];
    if (state.isGlobal) {
        const map = new Map();
        for (const block of candidates) {
            const key = block.fsPath || block.fileName || block.uri;
            if (!map.has(key)) {
                map.set(key, {
                    fileName: block.fileName || "Untitled",
                    blocks: []
                });
            }
            map.get(key).blocks.push(block);
        }
        for (const value of map.values()) {
            value.blocks.sort((a, b) => a.line - b.line);
            groups.push(value);
        }
        groups.sort((a, b) => a.fileName.localeCompare(b.fileName));
    } else {
        groups.push({
            fileName: null,
            blocks: candidates.sort((a, b) => a.line - b.line)
        });
    }
    return groups;
}

function getVisibleBlocks() {
    const candidates = getBlockCandidates();
    const groups = buildBlockGroups(candidates);
    const ordered = [];
    groups.forEach(group => {
        group.blocks.forEach(block => {
            ordered.push(block);
        });
    });
    return { groups, ordered };
}

function getSelectedItemsInOrder() {
    const { ordered } = getVisibleBlocks();
    return ordered.filter(block => state.selectedItems.has(getBlockKey(block)));
}

function toggleItemSelection(block) {
    const key = getBlockKey(block);
    if (state.selectedItems.has(key)) {
        state.selectedItems.delete(key);
    } else {
        state.selectedItems.set(key, block);
    }
    updateBatchToolbar();
    renderBlocks();
}

function toggleBatchSelectionForTag(tag) {
    const blocks = state.data[tag] || [];
    if (blocks.length === 0) {
        return;
    }

    const keys = blocks.map(block => getBlockKey(block));
    const allSelected = keys.every(key => state.selectedItems.has(key));

    if (allSelected) {
        keys.forEach(key => state.selectedItems.delete(key));
        state.batchSelectedTags.delete(tag);
    } else {
        blocks.forEach(block => state.selectedItems.set(getBlockKey(block), block));
        state.batchSelectedTags.add(tag);
    }

    updateBatchToolbar();
    renderBlocks();
}

function updateBatchToolbar() {
    if (!state.isEditMode) {
        batchToolbar.classList.add('hidden');
        return;
    }

    batchToolbar.classList.remove('hidden');
    const count = state.selectedItems.size;
    batchCount.textContent = `${count} selected`;
    batchDeleteBtn.disabled = count === 0;
    batchNewFileBtn.disabled = count === 0;

    if (count === 0) {
        batchHint.textContent = 'Select tags or items to start.';
        hideBatchInput();
    } else {
        batchHint.textContent = 'Ready to apply batch actions.';
    }
}

function hideBatchInput() {
    batchInputRow.classList.add('hidden');
    batchInputHint.classList.add('hidden');
    batchInput.value = '';
}

function submitBatchInput() {
    const selectedItems = getSelectedItemsInOrder();
    if (selectedItems.length === 0) {
        return;
    }

    vscode.postMessage({
        type: 'createFileFromSelection',
        items: selectedItems.map(item => ({
            uri: item.uri,
            line: item.line,
            text: item.text,
            level: item.level
        })),
        title: batchInput.value.trim()
    });
    hideBatchInput();
}

function renderTags() {
    tagsContainer.innerHTML = '';

    const baseTags = state.tags;
    let tagsToRender = [];

    if (state.searchQuery) {
        tagsToRender = baseTags.filter(t => t.toLowerCase().includes(state.searchQuery));
    } else {
        // 无搜索时：先展示 Pin 标签，不足上限时用其他可用标签补齐
        const maxDisplay = Math.max(1, state.maxPinnedDisplay || 6);
        const pinnedSet = new Set(
            state.definitions.filter(def => def.pinned).map(def => def.name)
        );
        const pinnedTags = [];
        const otherTags = [];

        for (const tag of baseTags) {
            if (pinnedSet.has(tag)) {
                pinnedTags.push(tag);
            } else {
                otherTags.push(tag);
            }
        }

        const combined = [];
        for (const tag of pinnedTags) {
            if (combined.length >= maxDisplay) {
                break;
            }
            combined.push(tag);
        }
        if (combined.length < maxDisplay) {
            for (const tag of otherTags) {
                if (combined.length >= maxDisplay) {
                    break;
                }
                combined.push(tag);
            }
        }

        tagsToRender = combined.length > 0 ? combined : baseTags;
    }

    if (tagsToRender.length === 0) {
            tagsContainer.innerHTML = '<span style="opacity:0.6; font-size:0.9em; padding:4px;">No tags found</span>';
            return;
    }

    tagsToRender.forEach(tag => {
        const el = document.createElement('div');
        el.className = 'tag-chip';
        if (!state.isEditMode && state.selectedTags.has(tag)) {
            el.classList.add('selected');
        }

        const def = getTagStyle(tag);
        let iconHtml = '';
        if (def && def.icon) {
            iconHtml = '<span class="codicon codicon-' + def.icon + ' tag-color-icon"></span> ';
        }

        el.innerHTML = iconHtml + tag;
        el.title = tag;
        el.style.setProperty('--tag-color', resolveColorToken(def?.color));
        el.style.color = 'var(--vscode-foreground)';

        el.addEventListener('click', () => {
            if (state.isEditMode) {
                toggleBatchSelectionForTag(tag);
                return;
            }
            if (state.isMultiSelect) {
                // 多选模式：切换选中状态
                if (state.selectedTags.has(tag)) {
                    state.selectedTags.delete(tag);
                } else {
                    state.selectedTags.add(tag);
                }
            } else {
                // 单选模式：点击已选中的取消选中，否则替换选中
                if (state.selectedTags.has(tag)) {
                    state.selectedTags.clear();
                } else {
                    state.selectedTags.clear();
                    state.selectedTags.add(tag);
                }
            }
            render();
        });

        tagsContainer.appendChild(el);
    });
}

function renderBlocks() {
    blocksContainer.innerHTML = '';

    const { groups, ordered } = getVisibleBlocks();
    if (ordered.length === 0) {
        let emptyText = 'No blocks found';
        if (state.isEditMode) {
            emptyText = 'No items available';
        } else if (state.selectedTags.size > 0) {
            emptyText = 'No blocks found with all selected tags';
        }
        blocksContainer.innerHTML = `<div class="empty-state">${emptyText}</div>`;
        return;
    }

    groups.forEach((group) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'file-group';

        if (state.isGlobal && group.fileName) {
            const title = document.createElement('div');
            title.className = 'file-title';
            const displayName = group.fileName.replace(/\.[^.]+$/, '');
            title.textContent = displayName;
            wrapper.appendChild(title);
        }

        group.blocks.forEach(block => {
            const key = getBlockKey(block);
            const el = document.createElement('div');
            el.className = 'block-item';
            if (state.isEditMode && state.selectedItems.has(key)) {
                el.classList.add('selected');
            }
            el.style.borderLeft = `3px solid color-mix(in srgb, ${getColorForBlock(block)} 60%, transparent)`;

            if (state.isEditMode) {
                const indicator = document.createElement('div');
                indicator.className = 'select-indicator';
                indicator.innerHTML = '<span class="codicon codicon-check"></span>';
                el.appendChild(indicator);
            }

            const main = document.createElement('div');
            main.className = 'block-main';

            const content = document.createElement('div');
            content.className = 'block-content';
            content.textContent = block.text;
            main.appendChild(content);

            if (block.remark) {
                const remark = document.createElement('div');
                remark.className = 'block-remark';
                const remarkIcon = document.createElement('span');
                remarkIcon.className = `codicon codicon-${getRemarkIcon()} remark-icon`;
                remark.appendChild(remarkIcon);
                const remarkText = document.createElement('span');
                remarkText.className = 'remark-text';
                remarkText.textContent = block.remark;
                remark.appendChild(remarkText);
                main.appendChild(remark);
            }

            if (block.breadcrumb && block.breadcrumb.length > 1) {
                const trail = block.breadcrumb.slice(0, -1);
                const breadcrumb = document.createElement('div');
                breadcrumb.className = 'block-breadcrumb';
                if (trail.length > 0) {
                    const breadcrumbIcon = document.createElement('span');
                    breadcrumbIcon.className = 'codicon codicon-list-tree breadcrumb-icon';
                    breadcrumb.appendChild(breadcrumbIcon);
                    const breadcrumbText = document.createElement('span');
                    breadcrumbText.className = 'breadcrumb-text';
                    breadcrumbText.textContent = trail.join(' > ');
                    breadcrumb.appendChild(breadcrumbText);
                    main.appendChild(breadcrumb);
                }
            }

            el.appendChild(main);

            const actions = document.createElement('div');
            actions.className = 'block-actions';

            const editTagsBtn = document.createElement('button');
            editTagsBtn.className = 'action-btn edit-tags-btn';
            editTagsBtn.innerHTML = '<span class="codicon codicon-tag"></span>';
            editTagsBtn.title = 'Edit tags';
            editTagsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({
                    type: 'editTags',
                    uri: block.uri,
                    line: block.line
                });
            });

            const editRemarkBtn = document.createElement('button');
            editRemarkBtn.className = 'action-btn edit-remark-btn';
            editRemarkBtn.innerHTML = '<span class="codicon codicon-comment"></span>';
            editRemarkBtn.title = 'Edit remark';
            editRemarkBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({
                    type: 'editRemark',
                    uri: block.uri,
                    line: block.line
                });
            });

            // 删除按钮：无论是否选择标签都可使用
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete-btn';
            deleteBtn.innerHTML = '<span class="codicon codicon-close"></span>';
            deleteBtn.title = 'Remove tag reference(s) from this block';

            // Handle delete button clicks
            let confirmTimeout = null;
            const originalIconHTML = deleteBtn.innerHTML;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering the main click handler

                if (deleteBtn.classList.contains('confirm')) {
                    // Second click - confirmed, delete tag references
                    clearTimeout(confirmTimeout);
                    const tagNames = getTagNamesForBlock(block);
                    if (tagNames.length === 0) {
                        return;
                    }
                    vscode.postMessage({
                        type: 'removeTagReferences',
                        uri: block.uri,
                        line: block.line,
                        tagNames: tagNames
                    });
                } else {
                    // First click - show confirmation
                    deleteBtn.classList.add('confirm');
                    deleteBtn.innerHTML = ''; // Clear the icon when showing text

                    // Auto-revert after 2 seconds if not clicked
                    confirmTimeout = setTimeout(() => {
                        deleteBtn.classList.remove('confirm');
                        deleteBtn.innerHTML = originalIconHTML;
                    }, 2000);
                }
            });

            actions.appendChild(editTagsBtn);
            actions.appendChild(editRemarkBtn);
            actions.appendChild(deleteBtn);
            el.appendChild(actions);

            el.addEventListener('click', () => {
                if (state.isEditMode) {
                    toggleItemSelection(block);
                    return;
                }
                vscode.postMessage({
                    type: 'openLocation',
                    uri: block.uri,
                    line: block.line
                });
            });

            wrapper.appendChild(el);
        });

        blocksContainer.appendChild(wrapper);
        const divider = document.createElement('div');
        divider.className = 'file-divider';
        blocksContainer.appendChild(divider);
    });
}

// Initial request (optional if backend pushes on connect)
vscode.postMessage({ type: 'refresh' });
