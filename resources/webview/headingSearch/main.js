// Expect globals: vscode

const state = {
    results: [],
    definitions: [],
    scope: 'local',
    query: ''
};

const resultsContainer = document.getElementById('results');
const searchInput = document.getElementById('search');
const scopeBtn = document.getElementById('scope-btn');
const scopeIconFile = document.getElementById('scope-icon-file');
const scopeIconGlobe = document.getElementById('scope-icon-globe');

const DEFAULT_COLOR = "var(--vscode-descriptionForeground)";

// 消息处理
window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'results') {
        state.results = message.results || [];
        state.definitions = message.definitions || [];
        state.scope = message.scope || 'local';
        render();
    }
});

// 防抖，避免频繁搜索
let debounceTimer = null;
function debounceSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerSearch, 200);
}

searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    debounceSearch();
});

scopeBtn.addEventListener('click', () => {
    state.scope = state.scope === 'local' ? 'global' : 'local';
    updateScopeBtn();
    triggerSearch();
});

function updateScopeBtn() {
    if (state.scope === 'global') {
        scopeIconGlobe.classList.add('active');
        scopeIconFile.classList.remove('active');
    } else {
        scopeIconFile.classList.add('active');
        scopeIconGlobe.classList.remove('active');
    }
}

function triggerSearch() {
    vscode.postMessage({
        type: 'search',
        query: state.query,
        scope: state.scope
    });
}

function resolveColorToken(color) {
    if (!color) {
        return DEFAULT_COLOR;
    }
    if (color.includes(".")) {
        return `var(--vscode-${color.replace(/\./g, "-")})`;
    }
    return color;
}

function getTagStyle(tagName) {
    return state.definitions.find(d => d.name === tagName);
}

// 获取块的展示颜色：优先使用第一个标签颜色，否则使用默认
function getColorForBlock(block) {
    const tag = (block.tags || [])[0];
    const def = tag ? getTagStyle(tag) : undefined;
    return resolveColorToken(def?.color);
}

function render() {
    updateScopeBtn();
    resultsContainer.innerHTML = '';

    if (!state.query || state.query.trim().length === 0) {
        resultsContainer.innerHTML = `<div class="empty-state">Type to search headings.</div>`;
        return;
    }

    if (!state.results || state.results.length === 0) {
        resultsContainer.innerHTML = `<div class="empty-state">No matches.</div>`;
        return;
    }

    if (state.scope === 'global') {
        renderGlobalResults();
    } else {
        renderLocalResults();
    }
}

function renderLocalResults() {
    const list = document.createElement('div');
    list.className = 'block-list';

    state.results.forEach(block => {
        list.appendChild(renderBlock(block));
    });

    resultsContainer.appendChild(list);
}

function renderGlobalResults() {
    const groups = new Map();
    for (const block of state.results) {
        const key = block.fsPath || block.fileName || block.uri;
        if (!groups.has(key)) {
            groups.set(key, {
                fileName: block.fileName || "Untitled",
                blocks: []
            });
        }
        groups.get(key).blocks.push(block);
    }

    const sortedGroups = Array.from(groups.values()).sort((a, b) =>
        a.fileName.localeCompare(b.fileName)
    );

    for (const group of sortedGroups) {
        const wrapper = document.createElement('div');
        wrapper.className = 'file-group';

        const title = document.createElement('div');
        title.className = 'file-title';
        const displayName = group.fileName.replace(/\.[^.]+$/, '');
        title.textContent = displayName;
        wrapper.appendChild(title);

        const list = document.createElement('div');
        list.className = 'block-list';
        group.blocks
            .sort((a, b) => a.line - b.line)
            .forEach(block => list.appendChild(renderBlock(block)));

        wrapper.appendChild(list);
        resultsContainer.appendChild(wrapper);
    }
}

function renderBlock(block) {
    const el = document.createElement('div');
    el.className = 'block-item';
    const color = getColorForBlock(block);
    // 复用 Tag View 的色条样式
    el.style.borderLeft = `3px solid color-mix(in srgb, ${color} 60%, transparent)`;

    const content = document.createElement('div');
    content.className = 'block-content';
    content.textContent = block.text;
    el.appendChild(content);

    if (block.breadcrumb && block.breadcrumb.length > 1) {
        const bc = document.createElement('div');
        bc.className = 'block-breadcrumb';
        bc.textContent = block.breadcrumb.slice(0, -1).join(' > ');
        el.appendChild(bc);
    }

    el.title = block.breadcrumb ? block.breadcrumb.join(' > ') : block.text;

    el.addEventListener('click', () => {
        vscode.postMessage({
            type: 'openLocation',
            uri: block.uri,
            line: block.line
        });
    });

    return el;
}

// 初始状态展示提示
render();
