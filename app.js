// ── CONSTANTS ──
const TOKEN_KEY = 'gist_token';
const GIST_ID_KEY = 'gist_id';
const FILE_KEY = 'gist_file';
const STORAGE_KEY = 'list_v2';

function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function getGistId() { return localStorage.getItem(GIST_ID_KEY) || ''; }
function getFileName() { return localStorage.getItem(FILE_KEY) || ''; }

// ── STATE ──
const lists = {
    green: { items: [], listUpdatedAt: 0 },
    blue: { items: [], listUpdatedAt: 0 }
};

let saveTimer = null;
let isDirty = false;
let isSyncing = false;
let sortables = {};
let currentTab = 'green';

// ── ORDER ──
function maxOrder(color) {
    const it = lists[color].items;
    return it.length ? Math.max(...it.map(i => i.order ?? 0)) : 0;
}
function ensureOrder(color) {
    lists[color].items.forEach((item, idx) => {
        if (item.order === undefined) item.order = idx * 10;
    });
}

// ── LOCAL STORAGE ──
function loadLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            for (const c of ['green', 'blue']) {
                if (p[c]) {
                    lists[c].items = p[c].items || [];
                    lists[c].listUpdatedAt = p[c].listUpdatedAt || 0;
                    ensureOrder(c);
                }
            }
        }
    } catch (e) { }
}
function saveLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

// ── RENDER ──
function render(color) {
    const l = lists[color];
    const active = l.items.filter(i => !i.done).sort((a, b) => a.order - b.order);
    const done = l.items.filter(i => i.done).sort((a, b) => a.order - b.order);

    renderSection(`active-${color}`, active, color);
    renderSection(`done-${color}`, done, color);

    document.getElementById(`divider-${color}`).classList.toggle('visible', done.length > 0);
    document.getElementById(`empty-${color}`).classList.toggle('visible', l.items.length === 0);

    const total = l.items.length;
    document.getElementById(`count-${color}`).textContent = `${done.length}/${total}`;
    // also update desktop header counter
    const dhCount = document.getElementById(`count-${color}-dh`);
    if (dhCount) dhCount.textContent = `${done.length}/${total}`;

    initSortable(color);
}

function renderSection(containerId, sectionItems, color) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    sectionItems.forEach(item => {
        const el = document.createElement('div');
        el.className = 'item' + (item.done ? ' done' : '');
        el.dataset.id = item.id;
        const arrowRight = `<svg width="14" height="14" viewBox="0 0 14 14"><polyline points="4,2 10,7 4,12"/></svg>`;
        const arrowLeft = `<svg width="14" height="14" viewBox="0 0 14 14"><polyline points="10,2 4,7 10,12"/></svg>`;
        el.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <div class="check" data-check></div>
        <div class="item-text" contenteditable="true" spellcheck="false">${escHtml(item.text)}</div>
        <button class="del-btn" title="Удалить">×</button>
        <button class="move-btn" title="Переместить в другой список">${color === 'green' ? arrowRight : arrowLeft}</button>
      `;
        el.querySelector('.drag-handle').addEventListener('mousedown', () => {
            // Disable all contenteditable in this list during drag
            document.querySelectorAll('.item-text').forEach(t => t.contentEditable = 'false');
            const restore = () => {
                document.querySelectorAll('.item-text').forEach(t => t.contentEditable = 'true');
                window.removeEventListener('mouseup', restore);
            };
            window.addEventListener('mouseup', restore);
        });
        el.querySelector('[data-check]').addEventListener('click', () => toggleDone(color, item.id));
        el.querySelector('.del-btn').addEventListener('click', () => deleteItem(color, item.id));
        el.querySelector('.move-btn').addEventListener('click', () => moveItem(color, item.id));
        const textEl = el.querySelector('.item-text');
        textEl.addEventListener('blur', () => {
            const t = textEl.textContent.trim();
            if (!t) { deleteItem(color, item.id); return; }
            if (t !== item.text) { item.text = t; scheduleSave(); }
            if (textEl.textContent !== t) textEl.textContent = t;
        });
        textEl.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // Trim and save current item before creating new
                const t = textEl.textContent.trim();
                if (!t) { deleteItem(color, item.id); return; }
                if (t !== item.text) { item.text = t; }
                if (textEl.textContent !== t) textEl.textContent = t;
                scheduleSave();
                // Insert new item after current
                const sectionItems = lists[color].items
                    .filter(i => i.done === item.done)
                    .sort((a, b) => a.order - b.order);
                const idx = sectionItems.findIndex(i => i.id === item.id);
                const next = sectionItems[idx + 1];
                const newOrder = next
                    ? (item.order + next.order) / 2
                    : item.order + 10;
                const newId = Date.now().toString();
                lists[color].items.push({ id: newId, text: '', done: item.done, order: newOrder });
                render(color);
                // Focus new item
                setTimeout(() => {
                    const newEl = document.querySelector(`[data-id="${newId}"] .item-text`);
                    if (newEl) { newEl.focus(); }
                }, 0);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                textEl.blur(); // blur handles: delete if empty, save if not
            }
        });
        container.appendChild(el);
    });
}

function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderAll() { render('green'); render('blue'); }

// ── ACTIONS ──
function addItem(color, text) {
    if (!text.trim()) return;
    lists[color].items.push({ id: Date.now().toString(), text: text.trim(), done: false, order: maxOrder(color) + 10 });
    scheduleSave(); render(color);
}
function toggleDone(color, id) {
    const item = lists[color].items.find(i => i.id === id);
    if (item) { item.done = !item.done; scheduleSave(); render(color); }
}
function deleteItem(color, id) {
    lists[color].items = lists[color].items.filter(i => i.id !== id);
    scheduleSave(); render(color);
}
function moveItem(fromColor, id) {
    const toColor = fromColor === 'green' ? 'blue' : 'green';
    const idx = lists[fromColor].items.findIndex(i => i.id === id);
    if (idx === -1) return;
    const [item] = lists[fromColor].items.splice(idx, 1);
    item.done = false; // сбрасываем галочку при перемещении
    if (fromColor === 'green') {
        // зелёный → синий: в начало (минимальный order - 10)
        const minOrder = lists[toColor].items.length
            ? Math.min(...lists[toColor].items.map(i => i.order ?? 0))
            : 10;
        item.order = minOrder - 10;
    } else {
        // синий → зелёный: в конец (максимальный order + 10)
        item.order = maxOrder(toColor) + 10;
    }
    lists[toColor].items.push(item);
    scheduleSave();
    render(fromColor);
    render(toColor);
}

function scheduleSave() {
    const now = Date.now();
    lists.green.listUpdatedAt = now;
    lists.blue.listUpdatedAt = now;
    saveLocal();
    isDirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        if (isDirty && getToken() && getGistId()) sync();
    }, 2000);
}

// ── SORTABLE ──
function initSortable(color) {
    ['active', 'done'].forEach(section => {
        const key = `${section}-${color}`;
        if (sortables[key]) { sortables[key].destroy(); delete sortables[key]; }
        const el = document.getElementById(key);
        if (!window.Sortable || el.children.length === 0) return;
        const isDoneSection = section === 'done';
        const isDesktop = window.matchMedia('(min-width: 1081px)').matches;
        const otherColor = color === 'green' ? 'blue' : 'green';
        sortables[key] = Sortable.create(el, {
            handle: '.drag-handle',
            animation: 120,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            forceFallback: true,
            fallbackTolerance: isDesktop ? 3 : 0,
            group: isDesktop ? `list-${section}` : key,
            onStart(evt) {
                document.querySelectorAll('.item-text').forEach(node => {
                    node.dataset.wasEditable = node.contentEditable;
                    node.contentEditable = 'false';
                });
            },
            onAdd(evt) {
                // Item dragged from another list into this one
                const itemEl = evt.item;
                const itemId = itemEl.dataset.id;
                const newIndex = evt.newIndex;

                // Find which color it came from
                const fromColor = otherColor;
                const fromIdx = lists[fromColor].items.findIndex(i => i.id === itemId);
                if (fromIdx === -1) { renderAll(); return; }

                const [item] = lists[fromColor].items.splice(fromIdx, 1);
                item.done = isDoneSection;

                // Calculate order based on drop position
                const sectionItems = lists[color].items
                    .filter(i => i.done === isDoneSection)
                    .sort((a, b) => a.order - b.order);
                const prev = sectionItems[newIndex - 1];
                const next = sectionItems[newIndex];
                if (prev && next) item.order = (prev.order + next.order) / 2;
                else if (prev) item.order = prev.order + 10;
                else if (next) item.order = next.order - 10;
                else item.order = 10;

                lists[color].items.push(item);
                scheduleSave();
                renderAll();
            },
            onEnd(evt) {
                document.querySelectorAll('[contenteditable="false"]').forEach(node => {
                    if (node.dataset.wasEditable) {
                        node.contentEditable = node.dataset.wasEditable;
                        delete node.dataset.wasEditable;
                    }
                });
                // Only handle same-list reorder (cross-list is handled by onAdd)
                if (evt.from !== evt.to) return;
                const { oldIndex, newIndex } = evt;
                if (oldIndex === newIndex) return;
                const sec = lists[color].items.filter(i => i.done === isDoneSection).sort((a, b) => a.order - b.order);
                const moved = sec[oldIndex];
                if (!moved) return;
                sec.splice(oldIndex, 1);
                sec.splice(newIndex, 0, moved);
                sec.forEach((item, idx) => { item.order = (idx + 1) * 10; });
                scheduleSave(); render(color);
            }
        });
    });
}

// ── SWIPE ──
// direction: 'left' = finger moves left (current slides left, next comes from right)
//            'right' = finger moves right (current slides right, next comes from left)
function switchTab(color, direction) {
    if (color === currentTab) return;
    const fromPanel = document.getElementById(`panel-${currentTab}`);
    const toPanel = document.getElementById(`panel-${color}`);

    const outX = direction === 'left' ? '-100%' : '100%';
    const inX = direction === 'left' ? '100%' : '-100%';

    // Position target instantly (no transition)
    toPanel.style.transition = 'none';
    toPanel.style.transform = `translateX(${inX})`;

    // Force reflow so the above takes effect immediately
    toPanel.offsetHeight; // eslint-disable-line

    // Now animate both
    const t = 'transform 0.3s cubic-bezier(.4,0,.2,1)';
    fromPanel.style.transition = t;
    toPanel.style.transition = t;
    fromPanel.style.transform = `translateX(${outX})`;
    toPanel.style.transform = 'translateX(0)';

    currentTab = color;
}

// Touch swipe detection
let touchStartX = 0, touchStartY = 0;

document.getElementById('swipe-container').addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: true });

document.getElementById('swipe-container').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    // Only horizontal swipe, ignore vertical scroll
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        const direction = dx < 0 ? 'left' : 'right';
        const target = currentTab === 'green' ? 'blue' : 'green';
        switchTab(target, direction);
    }
}, { passive: true });

// ── SYNC ──
function updateSyncBtn(state) {
    ['sync-btn', 'sync-btn-m', 'sync-btn-blue'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.classList.remove('active', 'syncing');
        if (state === 'connected') { btn.textContent = '✓ Gist'; btn.classList.add('active'); }
        else if (state === 'syncing') { btn.textContent = '⇅ Gist'; btn.classList.add('syncing'); }
        else { btn.textContent = '⇅ Sync'; }
    });
}

async function sync() {
    if (isSyncing) return;
    const token = getToken(), gistId = getGistId();
    if (!token || !gistId) return;
    isSyncing = true;
    updateSyncBtn('syncing');
    try {
        const res = await fetch(`https://api.github.com/gists/${gistId}?t=${Date.now()}`, {
            keepalive: true,
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            const err = await res.json();
            toast(`Ошибка ${res.status}: ${err.message}`);
            updateSyncBtn(''); return;
        }
        const data = await res.json();
        const fileName = Object.keys(data.files)[0];
        const content = data.files?.[fileName]?.content;
        let shouldUpload = isDirty;

        if (content) {
            let remote;
            try { remote = JSON.parse(content); } catch (e) { toast('Ошибка формата данных'); updateSyncBtn(''); return; }
            let changed = false;
            for (const color of ['green', 'blue']) {
                const rem = remote[color];
                if (!rem) continue;
                if ((rem.listUpdatedAt ?? 0) > (lists[color].listUpdatedAt ?? 0)) {
                    lists[color].items = rem.items || [];
                    lists[color].listUpdatedAt = rem.listUpdatedAt;
                    ensureOrder(color);
                    changed = true;
                }
            }
            if (changed) { saveLocal(); renderAll(); shouldUpload = isDirty; }
        }

        if (shouldUpload) {
            await fetch(`https://api.github.com/gists/${gistId}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: { [fileName]: { content: JSON.stringify(lists) } } })
            });
            isDirty = false;
        }
        updateSyncBtn('connected');
    } catch (e) {
        toast('Ошибка сети');
        updateSyncBtn('');
    } finally {
        isSyncing = false;
    }
}

// ── MODAL ──
function showModal() {
    const cfg = [getToken(), getGistId()].filter(Boolean).join('\n');
    document.getElementById('input-config').value = cfg;
    document.getElementById('modal-overlay').classList.add('show');
    setTimeout(() => document.getElementById('input-config').focus(), 50);
}
document.getElementById('modal-cancel').addEventListener('click', () => {
    document.getElementById('modal-overlay').classList.remove('show');
});
document.getElementById('modal-save').addEventListener('click', async () => {
    const lines = document.getElementById('input-config').value.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { toast('Нужно две строки'); return; }
    localStorage.setItem(TOKEN_KEY, lines[0]);
    localStorage.setItem(GIST_ID_KEY, lines[1]);
    document.getElementById('modal-overlay').classList.remove('show');
    toast('Настройки сохранены');
    await sync();
});
document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('show');
});

// ── TOAST ──
let toastTimer;
function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── INIT ──
loadLocal();
renderAll();

if (getToken() && getGistId()) { updateSyncBtn('syncing'); sync(); }

function setupBottomInput(id, color) {
    const input = document.getElementById(id);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!input.value.trim()) { input.blur(); return; }
            addItem(color, input.value.trim());
            input.value = '';
        } else if (e.key === 'Escape') {
            e.preventDefault();
            input.blur(); // blur handles save-or-discard
        }
        // Backspace/Delete on empty: default browser behaviour (nothing to delete)
    });
    input.addEventListener('blur', () => {
        // empty on blur: just clear (bottom row always stays, nothing to delete)
        if (!input.value.trim()) { input.value = ''; return; }
        addItem(color, input.value.trim());
        input.value = '';
    });
}
setupBottomInput('input-green', 'green');
setupBottomInput('input-blue', 'blue');

// Arrow key navigation between items
document.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const active = document.activeElement;
    if (!active || !active.classList.contains('item-text')) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Find all item-text elements in the same panel
    const panel = active.closest('.list-panel');
    if (!panel) return;
    const allTexts = Array.from(panel.querySelectorAll('.item-text'));
    const idx = allTexts.indexOf(active);

    if (e.key === 'ArrowUp' && idx > 0) {
        const elRect = active.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(active).lineHeight) || 20;
        if (rect.top - elRect.top < lineHeight) {
            e.preventDefault();
            const prev = allTexts[idx - 1];
            prev.focus();
            // Place cursor at end
            if (sel.modify) {
                sel.modify('move', 'forward', 'documentboundary');
                sel.modify('move', 'backward', 'lineboundary');
                sel.modify('move', 'forward', 'documentboundary');
            } else {
                const r = document.createRange();
                r.selectNodeContents(prev);
                r.collapse(false);
                sel.removeAllRanges();
                sel.addRange(r);
            }
        }
    } else if (e.key === 'ArrowDown' && idx < allTexts.length - 1) {
        const elRect = active.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(active).lineHeight) || 20;
        if (elRect.bottom - rect.bottom < lineHeight) {
            e.preventDefault();
            const next = allTexts[idx + 1];
            next.focus();
            // Place cursor at start
            if (sel.modify) {
                sel.modify('move', 'backward', 'documentboundary');
            } else {
                const r = document.createRange();
                r.selectNodeContents(next);
                r.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r);
            }
        }
    }
});

// Desktop buttons
document.getElementById('sync-btn').addEventListener('click', () => {
    if (!getToken() || !getGistId()) { showModal(); return; }
    sync();
});
document.getElementById('settings-btn').addEventListener('click', showModal);
// Mobile buttons
document.getElementById('sync-btn-m').addEventListener('click', () => {
    if (!getToken() || !getGistId()) { showModal(); return; }
    sync();
});
document.getElementById('settings-btn-m').addEventListener('click', showModal);
document.getElementById('sync-btn-blue').addEventListener('click', () => {
    if (!getToken() || !getGistId()) { showModal(); return; }
    sync();
});
document.getElementById('settings-btn-blue').addEventListener('click', showModal);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getToken() && getGistId()) sync();
});
window.addEventListener('online', () => { if (getToken() && getGistId()) sync(); });
window.addEventListener('focus', () => { if (getToken() && getGistId()) sync(); });

// Android back button — exit edit mode
function isEditableField(el) {
    if (!el) return false;
    return el.classList.contains('item-text') ||
        el.classList.contains('new-item-input') ||
        el.id === 'input-config';
}

let editingHistoryPushed = false;

document.addEventListener('focusin', e => {
    if (isEditableField(e.target) && !editingHistoryPushed) {
        history.pushState({ editing: true }, '');
        editingHistoryPushed = true;
    }
});

document.addEventListener('focusout', e => {
    if (isEditableField(e.target)) {
        editingHistoryPushed = false;
    }
});

if (window.visualViewport) {
    let lastViewportHeight = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', () => {
        const newHeight = window.visualViewport.height;
        const keyboardHidden = newHeight > lastViewportHeight + 100;
        lastViewportHeight = newHeight;
        if (keyboardHidden && isEditableField(document.activeElement)) {
            document.activeElement.blur();
        }
    });
}

window.addEventListener('popstate', e => {
    if (e.state?.editing) {
        const active = document.activeElement;
        if (isEditableField(active)) {
            active.blur();
        }
        editingHistoryPushed = false;
    }
});

const sortableScript = document.createElement('script');
sortableScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js';
sortableScript.onload = () => renderAll();
document.head.appendChild(sortableScript);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/list/sw.js');