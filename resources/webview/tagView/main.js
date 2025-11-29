// Expect globals: vscode

let state = {
    tags: [],
    definitions: [],
    data: {},
    selectedTags: new Set(),
    searchQuery: "",
    isGlobal: false,
    isMultiSelect: false,
    currentFileName: null
};

// UI Elements
const tagsContainer = document.getElementById('tags');
const blocksContainer = document.getElementById('blocks');
const searchInput = document.getElementById('search');
const selectBtn = document.getElementById('select-btn');
const scopeBtn = document.getElementById('scope-btn');

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
        state.data = message.data;
        state.isGlobal = message.isGlobal;
        state.isMultiSelect = message.isMultiSelect;
        state.currentFileName = message.currentFileName;
        
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

    if (state.selectedTags.size === 0) {
        blocksContainer.innerHTML = '<div class="empty-state">Select a tag to see blocks</div>';
        return;
    }

    // Find blocks that have ALL selected tags
    const selectedArray = Array.from(state.selectedTags);

    // Start with blocks from the first tag
    // 注意：这里的 state.data[tag] 是一组 blocks
    let candidates = state.data[selectedArray[0]] || [];

    // Intersect with subsequent tags
    for (let i = 1; i < selectedArray.length; i++) {
        const nextTagBlocks = state.data[selectedArray[i]] || [];
        // 我们通过 uri 和 line 唯一标识 block (或者差不多唯一)
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

    // Create delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<span class="codicon codicon-close"></span>';
    deleteBtn.title = 'Click to delete this tag reference';

    // Handle delete button clicks
    let confirmTimeout = null;
    let originalIconHTML = deleteBtn.innerHTML;
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering the main click handler

        if (deleteBtn.classList.contains('confirm')) {
            // Second click - confirmed, delete all selected tag references from this block
            clearTimeout(confirmTimeout);
            vscode.postMessage({
                type: 'removeTagReferences',
                uri: block.uri,
                line: block.line,
                tagNames: Array.from(state.selectedTags) // Pass all currently selected tags
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

    el.appendChild(header);
    el.appendChild(content);
    el.appendChild(deleteBtn);

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
