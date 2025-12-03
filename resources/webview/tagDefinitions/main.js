// Expect globals: vscode

let definitions = [];
let allIcons = [];
let editingTag = null;
let iconPickerCallback = null;
let searchValue = "";

// 请求初始数据
vscode.postMessage({ command: 'getDefinitions' });

window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'definitions') {
        definitions = msg.data;
        allIcons = msg.icons;
        renderTags();
    } else if (msg.type === 'renameComplete') {
        // 重命名完成
    }
});

function renderTags() {
    const container = document.getElementById('tagList');
    container.innerHTML = '';

    let hasRendered = false;
    definitions.forEach((def, index) => {
        if (searchValue && !def.name.toLowerCase().includes(searchValue)) {
            return;
        }
        hasRendered = true;
        const card = document.createElement('div');
        card.className = 'tag-card';
        card.innerHTML = `
            <div class="tag-icon" data-index="${index}" title="Click to change icon">
                <span class="codicon codicon-${def.icon || 'tag'}"></span>
            </div>
            <div class="tag-info">
                <div class="tag-name">
                    <input type="text" value="${def.name}" data-index="${index}" data-original="${def.name}">
                </div>
            </div>
            <div class="tag-actions">
                <button class="icon-btn pin-btn ${def.pinned ? 'pinned' : ''}" data-index="${index}" title="${def.pinned ? 'Unpin this tag' : 'Pin this tag (max 6)'}">
                    <span class="codicon ${def.pinned ? 'codicon-pinned' : 'codicon-pin'}"></span>
                </button>
                <button class="icon-btn save-btn" data-index="${index}" title="Save changes">
                    <span class="codicon codicon-pass"></span>
                </button>
                <button class="icon-btn delete-btn" data-index="${index}" title="Delete tag">
                    <span class="codicon codicon-close"></span>
                </button>
            </div>
        `;
        container.appendChild(card);
    });

    if (!hasRendered) {
        container.innerHTML = '<div class="empty-state">No tags match your search.</div>';
    }

    // 绑定事件
    document.querySelectorAll('.tag-icon').forEach(el => {
        el.addEventListener('click', () => openIconPicker(parseInt(el.dataset.index)));
    });
    document.querySelectorAll('.save-btn').forEach(el => {
        el.addEventListener('click', () => saveTag(parseInt(el.dataset.index)));
    });
    document.querySelectorAll('.pin-btn').forEach(el => {
        el.addEventListener('click', () => togglePin(parseInt(el.dataset.index)));
    });
    document.querySelectorAll('.delete-btn').forEach(el => {
        el.addEventListener('click', () => deleteTag(parseInt(el.dataset.index)));
    });
}

function openIconPicker(index) {
    editingTag = index;
    const picker = document.getElementById('iconPicker');
    const overlay = document.getElementById('overlay');
    const grid = document.getElementById('iconGrid');

    renderIconGrid(allIcons);

    picker.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.getElementById('iconSearch').value = '';
    document.getElementById('iconSearch').focus();
}

function renderIconGrid(icons) {
    const grid = document.getElementById('iconGrid');
    grid.innerHTML = '';
    icons.forEach(icon => {
        const el = document.createElement('div');
        el.className = 'icon-option';
        el.innerHTML = `<span class="codicon codicon-${icon}"></span>`;
        el.title = icon;
        el.addEventListener('click', () => selectIcon(icon));
        grid.appendChild(el);
    });
}

function selectIcon(icon) {
    if (editingTag !== null) {
        definitions[editingTag].icon = icon;
        renderTags();
        // 立即保存图标更改
        const def = definitions[editingTag];
        vscode.postMessage({ command: 'saveDefinition', definition: def });
    }
    closeIconPicker();
}

function closeIconPicker() {
    document.getElementById('iconPicker').classList.add('hidden');
    document.getElementById('overlay').classList.add('hidden');
    editingTag = null;
}

document.getElementById('closeIconPicker').addEventListener('click', closeIconPicker);
document.getElementById('overlay').addEventListener('click', closeIconPicker);
document.getElementById('iconSearch').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allIcons.filter(i => i.includes(query));
    renderIconGrid(filtered);
});

const tagSearchInput = document.getElementById('tagSearch');
if (tagSearchInput) {
    tagSearchInput.addEventListener('input', (e) => {
        searchValue = e.target.value.toLowerCase();
        renderTags();
    });
}

function saveTag(index) {
    console.log('saveTag called, index:', index);
    const input = document.querySelector(`input[data-index="${index}"]`);
    if (!input) {
        console.error('Input not found for index:', index);
        return;
    }
    const newName = input.value.trim();
    const oldName = input.dataset.original;

    console.log('Saving tag:', { newName, oldName, index });

    if (!newName) {
        // 使用 VS Code 原生方式显示错误
        vscode.postMessage({ command: 'showError', message: 'Tag name cannot be empty' });
        return;
    }

    const def = { ...definitions[index], name: newName };

    // 如果名称变化，使用扩展端确认对话框
    if (oldName && oldName !== newName) {
        vscode.postMessage({ command: 'confirmRename', definition: def, oldName, newName });
    } else {
        vscode.postMessage({ command: 'saveDefinition', definition: def });
    }
}

function deleteTag(index) {
    console.log('deleteTag called, index:', index);
    const def = definitions[index];
    // 使用扩展端确认对话框
    vscode.postMessage({ command: 'confirmDelete', name: def.name });
}

function togglePin(index) {
    const def = { ...definitions[index] };
    const pinnedCount = definitions.filter(d => d.pinned).length;

    if (!def.pinned && pinnedCount >= 6) {
        vscode.postMessage({ command: 'showError', message: 'Maximum 6 pinned tags allowed' });
        return;
    }

    def.pinned = !def.pinned;
    definitions[index] = def;
    renderTags();
    vscode.postMessage({ command: 'saveDefinition', definition: def, oldName: def.name });
}

document.getElementById('addBtn').addEventListener('click', () => {
    console.log('Add button clicked');
    // 使用扩展端输入框
    vscode.postMessage({ command: 'addNewTag' });
});
