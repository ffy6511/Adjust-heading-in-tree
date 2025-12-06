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

function resolveColorToken(color) {
    if (!color) {
        return "var(--vscode-descriptionForeground)";
    }
    if (color.includes(".")) {
        return `var(--vscode-${color.replace(/\./g, "-")})`;
    }
    return color;
}

function getTagStyle(tagName) {
    const def = state.definitions.find(d => d.name === tagName);
    return def;
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
    if (state.selectedTags.size > 0) {
        const selected = Array.from(state.selectedTags)[0];
        const def = getTagStyle(selected);
        return resolveColorToken(def?.color);
    }

    const tags = getTagNamesForBlock(block);
    const firstTag = tags[0];
    const def = firstTag ? getTagStyle(firstTag) : undefined;
    return resolveColorToken(def?.color);
}

function renderTags() {
    tagsContainer.innerHTML = '';

    const baseTags = state.tags;
    let tagsToRender = [];

    if (state.searchQuery) {
        tagsToRender = baseTags.filter(t => t.toLowerCase().includes(state.searchQuery));
    } else {
        const pinnedSet = new Set(
            state.definitions.filter(def => def.pinned).map(def => def.name)
        );
        const pinnedTags = [];
        for (const tag of baseTags) {
            if (pinnedSet.has(tag)) {
                pinnedTags.push(tag);
                if (pinnedTags.length >= 6) {
                    break;
                }
            }
        }
        if (pinnedTags.length > 0) {
            tagsToRender = pinnedTags;
        } else {
            tagsToRender = baseTags;
        }
    }

    if (tagsToRender.length === 0) {
            tagsContainer.innerHTML = '<span style="opacity:0.6; font-size:0.9em; padding:4px;">No tags found</span>';
            return;
    }

    tagsToRender.forEach(tag => {
        const el = document.createElement('div');
        el.className = 'tag-chip';
        if (state.selectedTags.has(tag)) {
            el.classList.add('selected');
        }

        const def = getTagStyle(tag);
        let iconHtml = '';
        if (def && def.icon) {
            iconHtml = '<span class="codicon codicon-' + def.icon + '" style="color:' + resolveColorToken(def.color) + '"></span> ';
        }

        el.innerHTML = iconHtml + tag;
        el.title = tag;
        el.style.color = resolveColorToken(def?.color);

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

    // 根据选中情况决定要展示的 block 列表
    let candidates = [];

    if (state.selectedTags.size === 0) {
        // 没有选中标签时，展示当前作用域内的所有 block（需要去重）
        const seen = new Set();
        for (const tag of Object.keys(state.data)) {
            const blocks = state.data[tag] || [];
            for (const block of blocks) {
                const key = `${block.uri}:${block.line}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    candidates.push(block);
                }
            }
        }
    } else {
        // Find blocks that have ALL selected tags
        const selectedArray = Array.from(state.selectedTags);

        // Start with blocks from the first tag
        // 注意：这里的 state.data[tag] 是一组 blocks
        candidates = state.data[selectedArray[0]] || [];

        // Intersect with subsequent tags
        for (let i = 1; i < selectedArray.length; i++) {
            const nextTagBlocks = state.data[selectedArray[i]] || [];
            // 我们通过 uri 和 line 唯一标识 block (或者差不多唯一)
            const nextSet = new Set(nextTagBlocks.map(b => b.uri + ':' + b.line));
            candidates = candidates.filter(b => nextSet.has(b.uri + ':' + b.line));
        }
    }

    if (candidates.length === 0) {
        const emptyText = state.selectedTags.size === 0
            ? '当前范围内没有可显示的区块'
            : 'No blocks found with all selected tags';
        blocksContainer.innerHTML = `<div class="empty-state">${emptyText}</div>`;
        return;
    }

    // 分组（全局模式下按文件分组）
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

    groups.forEach((group, groupIndex) => {
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
            const el = document.createElement('div');
            el.className = 'block-item';
            el.style.borderLeft = `3px solid color-mix(in srgb, ${getColorForBlock(block)} 60%, transparent)`;

            const content = document.createElement('div');
            content.className = 'block-content';
            content.textContent = block.text;
            el.appendChild(content);

            if (block.breadcrumb && block.breadcrumb.length > 1) {
                const trail = block.breadcrumb.slice(0, -1);
                const breadcrumb = document.createElement('div');
                breadcrumb.className = 'block-breadcrumb';
                breadcrumb.textContent = trail.join(' > ');
                if (trail.length > 0) {
                    el.appendChild(breadcrumb);
                }
            }

            // 删除按钮：无论是否选择标签都可使用
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
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

            el.appendChild(deleteBtn);

            el.addEventListener('click', () => {
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
