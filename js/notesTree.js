/**
 * notesTree.js — Folder tree UI, context menu, drag & drop, breadcrumbs.
 *
 * Renders the tree from the data model in notesStore.js.
 * Handles all interactions: expand/collapse, select, rename,
 * context menu, drag-and-drop reordering, keyboard navigation,
 * and the "Move to" modal.
 */

import * as Store from './notesStore.js';

/* ============================================================
   Module state
   ============================================================ */

let selectedItemId = null;       // Currently selected item in the tree
let contextMenu = null;          // The context menu DOM element
let renamingItemId = null;       // Item currently being renamed (null if none)

/* Callbacks that other modules (editor) can register */
let onNoteSelectCallback = null;
let onNoteDeleteCallback = null;

/* ============================================================
   Public API — registration hooks
   ============================================================ */

/** Register a callback fired when a note is selected. */
export function onNoteSelect(callback) {
  onNoteSelectCallback = callback;
}

/** Register a callback fired when the active note is deleted. */
export function onNoteDelete(callback) {
  onNoteDeleteCallback = callback;
}

/** Get the currently selected item ID. */
export function getSelectedId() {
  return selectedItemId;
}

/* ============================================================
   SVG icon helpers
   ============================================================ */

const ICONS = {
  folderClosed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>`,
  folderOpen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1"/>
    <path d="M3 10h18l-2 9H5z"/>
  </svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18l6-6-6-6"/>
  </svg>`,
  dots: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
  </svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`,
  newNote: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="12" y1="11" x2="12" y2="17"/>
    <line x1="9" y1="14" x2="15" y2="14"/>
  </svg>`,
  newFolder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    <line x1="12" y1="11" x2="12" y2="17"/>
    <line x1="9" y1="14" x2="15" y2="14"/>
  </svg>`,
  rename: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`,
  move: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
  </svg>`,
  duplicate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 17v5"/><path d="M9 11l-4 4h14l-4-4V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v7z"/>
  </svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
  </svg>`,
  breadcrumbSep: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M9 18l6-6-6-6"/>
  </svg>`
};

/* ============================================================
   Rendering — build the tree DOM
   ============================================================ */

/**
 * Render the entire notes sidebar UI.
 * Called on init and after any data mutation.
 */
export function renderTree() {
  const treeEl = document.getElementById('notes-tree');
  if (!treeEl) return;

  const treeData = Store.getTree(null);

  // Preserve scroll position during re-render
  const scrollTop = treeEl.scrollTop;
  treeEl.innerHTML = '';

  if (treeData.length === 0) {
    treeEl.innerHTML = `
      <div class="empty-state" style="padding: var(--space-8) var(--space-4);">
        <p class="empty-state__title">No notes yet</p>
        <p class="empty-state__description">Create your first note or folder using the buttons above.</p>
        <button type="button" id="notes-tree-empty-add-btn" class="btn btn--primary btn--sm" style="margin-top: var(--space-3);">+ New Note</button>
      </div>`;
    document.getElementById('notes-tree-empty-add-btn')?.addEventListener('click', () => createNewNote());
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of treeData) {
    fragment.appendChild(createTreeItemEl(item));
  }
  treeEl.appendChild(fragment);
  treeEl.scrollTop = scrollTop;
}

/**
 * Create a single tree item element (recursive for folders).
 * @param {Object} item - Tree node from Store.getTree()
 * @returns {HTMLElement}
 */
function createTreeItemEl(item) {
  const isFolder = item.type === 'folder';
  const isExpanded = isFolder && Store.isExpanded(item.id);
  const isActive = item.id === selectedItemId;

  // Outer wrapper
  const li = document.createElement('li');
  li.className = 'tree-item';
  li.dataset.id = item.id;
  li.dataset.type = item.type;
  li.setAttribute('role', 'treeitem');
  if (isFolder) {
    li.setAttribute('aria-expanded', String(isExpanded));
  }

  // The visible row
  const row = document.createElement('div');
  row.className = 'tree-item__row' + (isActive ? ' active' : '');
  row.setAttribute('tabindex', '0');
  row.setAttribute('draggable', 'true');

  // Expand toggle (only for folders; invisible spacer for notes)
  const toggle = document.createElement('button');
  toggle.className = 'tree-item__toggle' + (isFolder ? '' : ' invisible');
  toggle.setAttribute('tabindex', '-1');
  toggle.setAttribute('aria-label', isExpanded ? 'Collapse folder' : 'Expand folder');
  toggle.innerHTML = ICONS.chevron;
  if (isExpanded) toggle.classList.add('expanded');
  row.appendChild(toggle);

  // Icon
  const icon = document.createElement('span');
  icon.className = 'tree-item__icon';
  if (isFolder) {
    icon.innerHTML = isExpanded ? ICONS.folderOpen : ICONS.folderClosed;
  } else {
    icon.innerHTML = ICONS.file;
  }
  row.appendChild(icon);

  // Name
  const nameEl = document.createElement('span');
  nameEl.className = 'tree-item__name';
  nameEl.textContent = item.name;
  row.appendChild(nameEl);

  // Pin indicator
  if (item.pinned) {
    const pinBadge = document.createElement('span');
    pinBadge.className = 'tree-item__pin';
    pinBadge.innerHTML = ICONS.pin;
    pinBadge.title = 'Pinned';
    row.appendChild(pinBadge);
  }

  // Three-dot actions button
  const actionsBtn = document.createElement('button');
  actionsBtn.className = 'tree-item__actions';
  actionsBtn.setAttribute('tabindex', '-1');
  actionsBtn.setAttribute('aria-label', 'Actions');
  actionsBtn.innerHTML = ICONS.dots;
  row.appendChild(actionsBtn);

  li.appendChild(row);

  // Children (only for folders)
  if (isFolder) {
    const childrenUl = document.createElement('ul');
    childrenUl.className = 'tree-item__children' + (isExpanded ? ' expanded' : '');
    childrenUl.setAttribute('role', 'group');
    childrenUl.style.display = isExpanded ? 'block' : 'none';

    for (const child of item.children) {
      childrenUl.appendChild(createTreeItemEl(child));
    }
    li.appendChild(childrenUl);
  }

  return li;
}

/* ============================================================
   Breadcrumbs
   ============================================================ */

/** Update the breadcrumb bar to show the path to the given item. */
export function renderBreadcrumbs(itemId) {
  const container = document.getElementById('notes-breadcrumbs');
  if (!container) return;

  if (!itemId) {
    container.innerHTML = '';
    return;
  }

  const item = Store.getItem(itemId);
  if (!item) { container.innerHTML = ''; return; }

  const ancestors = Store.getAncestors(itemId);
  const parts = [...ancestors, item];

  container.innerHTML = '';

  // "Notes" root link
  const rootLink = document.createElement('button');
  rootLink.className = 'breadcrumbs__item';
  rootLink.textContent = 'Notes';
  rootLink.addEventListener('click', () => {
    selectedItemId = null;
    renderTree();
    renderBreadcrumbs(null);
    showMobileTree();
  });
  container.appendChild(rootLink);

  for (let i = 0; i < parts.length; i++) {
    // Separator
    const sep = document.createElement('span');
    sep.className = 'breadcrumbs__separator';
    sep.innerHTML = ICONS.breadcrumbSep;
    container.appendChild(sep);

    const isLast = i === parts.length - 1;
    const part = parts[i];

    if (isLast) {
      const current = document.createElement('span');
      current.className = 'breadcrumbs__current';
      current.textContent = part.name;
      container.appendChild(current);
    } else {
      const link = document.createElement('button');
      link.className = 'breadcrumbs__item';
      link.textContent = part.name;
      link.addEventListener('click', () => selectItem(part.id));
      container.appendChild(link);
    }
  }
}

/* ============================================================
   Selection
   ============================================================ */

/** Select an item in the tree. If it's a note, notify the editor. */
export function selectItem(id) {
  selectedItemId = id;
  const item = Store.getItem(id);

  // Update active state in the tree
  document.querySelectorAll('.tree-item__row').forEach(row => {
    row.classList.toggle('active', row.closest('.tree-item')?.dataset.id === id);
  });

  if (item) {
    renderBreadcrumbs(id);

    if (item.type === 'folder') {
      // Toggle expansion when clicking a folder
      Store.toggleExpanded(id);
      renderTree();
    } else if (item.type === 'note') {
      Store.setLastOpenedNoteId(id);
      showMobileEditor();
      if (onNoteSelectCallback) onNoteSelectCallback(item);
    }
  }
}

/* ============================================================
   Mobile pane switching
   ============================================================ */

function showMobileEditor() {
  document.querySelector('.notes-layout')?.classList.add('notes-layout--show-editor');
}

function showMobileTree() {
  document.querySelector('.notes-layout')?.classList.remove('notes-layout--show-editor');
}

/* ============================================================
   Event handlers — clicks
   ============================================================ */

function handleTreeClick(e) {
  const row = e.target.closest('.tree-item__row');
  if (!row) return;

  const treeItem = row.closest('.tree-item');
  const id = treeItem?.dataset.id;
  if (!id) return;

  // Three-dot button opens context menu
  if (e.target.closest('.tree-item__actions')) {
    e.stopPropagation();
    const rect = e.target.closest('.tree-item__actions').getBoundingClientRect();
    showContextMenu(id, rect.right, rect.bottom);
    return;
  }

  // Toggle button expands/collapses without selecting
  if (e.target.closest('.tree-item__toggle')) {
    e.stopPropagation();
    const item = Store.getItem(id);
    if (item?.type === 'folder') {
      Store.toggleExpanded(id);
      renderTree();
      // Keep the current selection active
      if (selectedItemId) {
        document.querySelector(`.tree-item[data-id="${selectedItemId}"] .tree-item__row`)
          ?.classList.add('active');
      }
    }
    return;
  }

  // Clicking the row selects the item
  selectItem(id);
}

/* ============================================================
   Context menu
   ============================================================ */

function showContextMenu(itemId, x, y) {
  hideContextMenu();

  const item = Store.getItem(itemId);
  if (!item) return;

  contextMenu = document.createElement('div');
  contextMenu.className = 'context-menu';
  contextMenu.setAttribute('role', 'menu');

  const isFolder = item.type === 'folder';

  const menuItems = [];

  if (isFolder) {
    menuItems.push({ label: 'New Note', icon: ICONS.newNote, action: () => createNewNote(itemId) });
    menuItems.push({ label: 'New Folder', icon: ICONS.newFolder, action: () => createNewFolder(itemId) });
    menuItems.push({ type: 'divider' });
  }

  menuItems.push({ label: 'Rename', icon: ICONS.rename, action: () => startRename(itemId), shortcut: 'F2' });
  menuItems.push({ label: 'Move to…', icon: ICONS.move, action: () => showMoveModal(itemId) });
  menuItems.push({ label: 'Duplicate', icon: ICONS.duplicate, action: () => duplicateItemAction(itemId) });
  menuItems.push({
    label: item.pinned ? 'Unpin' : 'Pin',
    icon: ICONS.pin,
    action: () => { Store.togglePin(itemId); renderTree(); }
  });
  menuItems.push({ type: 'divider' });
  menuItems.push({ label: 'Delete', icon: ICONS.trash, action: () => confirmDelete(itemId), danger: true });

  for (const mi of menuItems) {
    if (mi.type === 'divider') {
      const div = document.createElement('div');
      div.className = 'context-menu__divider';
      contextMenu.appendChild(div);
      continue;
    }

    const btn = document.createElement('button');
    btn.className = 'context-menu__item' + (mi.danger ? ' context-menu__item--danger' : '');
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = `
      <span class="context-menu__icon">${mi.icon}</span>
      <span class="context-menu__label">${mi.label}</span>
      ${mi.shortcut ? `<kbd>${mi.shortcut}</kbd>` : ''}
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideContextMenu();
      mi.action();
    });
    contextMenu.appendChild(btn);
  }

  document.body.appendChild(contextMenu);

  // Position: ensure menu stays within viewport
  const menuRect = contextMenu.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (x + menuRect.width > vw) x = vw - menuRect.width - 8;
  if (y + menuRect.height > vh) y = vh - menuRect.height - 8;
  if (x < 0) x = 8;
  if (y < 0) y = 8;

  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';

  // Close on outside click or Escape key
  const handleKeydown = (e) => {
    if (e.key === 'Escape') hideContextMenu();
  };
  document.addEventListener('keydown', handleKeydown, { once: true });

  requestAnimationFrame(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
    document.addEventListener('contextmenu', hideContextMenu, { once: true });
  });
}

function hideContextMenu() {
  if (contextMenu) {
    contextMenu.remove();
    contextMenu = null;
  }
}

/** Handle native right-click on tree items. */
function handleContextMenu(e) {
  const row = e.target.closest('.tree-item__row');
  if (!row) return;

  const id = row.closest('.tree-item')?.dataset.id;
  if (!id) return;

  e.preventDefault();
  showContextMenu(id, e.clientX, e.clientY);
}

/* ============================================================
   Actions — create, rename, delete, duplicate
   ============================================================ */

/** Create a new note inside the given parent (or root). */
export function createNewNote(parentId = null) {
  if (parentId) {
    Store.expandFolder(parentId);
  }
  const name = Store.getUniqueName('Untitled Note', parentId);
  const note = Store.createItem('note', name, parentId);
  renderTree();
  selectItem(note.id);
  // Focus editor title so user can immediately title and write their note
  requestAnimationFrame(() => {
    const titleInput = document.getElementById('notes-editor-title');
    if (titleInput) {
      titleInput.focus();
      titleInput.select();
    }
  });
}

/** Create a new folder inside the given parent (or root). */
export function createNewFolder(parentId = null) {
  if (parentId) {
    Store.expandFolder(parentId);
  }
  const name = Store.getUniqueName('New Folder', parentId);
  const folder = Store.createItem('folder', name, parentId);
  renderTree();
  requestAnimationFrame(() => startRename(folder.id));
}

/** Start inline rename for an item. */
function startRename(id) {
  renamingItemId = id;
  const item = Store.getItem(id);
  if (!item) return;

  const row = document.querySelector(`.tree-item[data-id="${id}"] .tree-item__row`);
  const nameEl = row?.querySelector('.tree-item__name');
  if (!nameEl) return;

  const oldName = item.name;

  // Replace text with an input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tree-item__rename-input';
  input.value = oldName;
  input.setAttribute('aria-label', 'Rename item');

  nameEl.textContent = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();

  function finishRename() {
    const newName = input.value.trim();
    renamingItemId = null;

    if (!newName) {
      // Empty name — revert
      nameEl.textContent = oldName;
      return;
    }

    if (newName !== oldName) {
      // Check for duplicates
      if (Store.nameExists(newName, item.parentId, id)) {
        const uniqueName = Store.getUniqueName(newName, item.parentId, id);
        Store.renameItem(id, uniqueName);
      } else {
        Store.renameItem(id, newName);
      }
    }

    renderTree();
    renderBreadcrumbs(selectedItemId);
    // Re-highlight the renamed item
    if (selectedItemId) {
      document.querySelector(`.tree-item[data-id="${selectedItemId}"] .tree-item__row`)
        ?.classList.add('active');
    }
    // Notify editor if the renamed item is the currently open note
    if (id === selectedItemId && onNoteSelectCallback) {
      const updated = Store.getItem(id);
      if (updated?.type === 'note') onNoteSelectCallback(updated);
    }
  }

  input.addEventListener('blur', finishRename);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.value = oldName;
      input.blur();
    }
  });
}

/** Show a confirm dialog and delete the item. */
function confirmDelete(id) {
  const item = Store.getItem(id);
  if (!item) return;

  let message;
  if (item.type === 'folder') {
    const counts = Store.countDescendants(id);
    const parts = [];
    if (counts.folders > 0) parts.push(`${counts.folders} folder${counts.folders > 1 ? 's' : ''}`);
    if (counts.notes > 0) parts.push(`${counts.notes} note${counts.notes > 1 ? 's' : ''}`);
    const itemsText = parts.length > 0 ? ` and its contents (${parts.join(', ')})` : '';
    message = `Delete folder "${item.name}"${itemsText}? This cannot be undone.`;
  } else {
    message = `Delete note "${item.name}"? This cannot be undone.`;
  }

  if (!confirm(message)) return;

  const wasSelected = id === selectedItemId;
  Store.deleteItem(id);

  if (wasSelected) {
    selectedItemId = null;
    renderBreadcrumbs(null);
    if (onNoteDeleteCallback) onNoteDeleteCallback();
  }

  renderTree();
}

function duplicateItemAction(id) {
  const newItem = Store.duplicateItem(id);
  if (newItem) {
    renderTree();
    selectItem(newItem.id);
  }
}

/* ============================================================
   Move modal
   ============================================================ */

function showMoveModal(itemId) {
  const item = Store.getItem(itemId);
  if (!item) return;

  // Collect IDs that are invalid as destinations
  const invalidIds = new Set([itemId]);
  if (item.type === 'folder') {
    for (const d of Store.getDescendants(itemId)) {
      invalidIds.add(d.id);
    }
  }

  // Build modal
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay visible';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', `Move "${item.name}"`);

  let selectedDest = null; // null means root

  modal.innerHTML = `
    <div class="modal__header">
      <h3>Move "${escapeHtml(item.name)}"</h3>
      <button class="btn btn--icon modal__close" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="modal__body">
      <p style="margin-bottom: var(--space-3); color: var(--color-text-secondary); font-size: var(--text-sm);">
        Select a destination folder:
      </p>
      <div class="modal__tree" role="tree"></div>
    </div>
    <div class="modal__footer">
      <button class="btn btn--secondary modal__cancel">Cancel</button>
      <button class="btn btn--primary modal__confirm">Move here</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Build the folder tree for the modal
  const modalTree = modal.querySelector('.modal__tree');

  // Root option
  const rootOpt = createMoveOption('Root', null, item.parentId === null);
  modalTree.appendChild(rootOpt);

  // Render all folders
  function renderMoveTree(parentId, container, depth = 0) {
    const folders = Store.getChildren(parentId).filter(i => i.type === 'folder');
    for (const folder of folders) {
      if (invalidIds.has(folder.id)) continue;
      const isCurrentParent = folder.id === item.parentId;
      const opt = createMoveOption(folder.name, folder.id, isCurrentParent, depth);
      container.appendChild(opt);
      renderMoveTree(folder.id, container, depth + 1);
    }
  }

  renderMoveTree(null, modalTree);

  function createMoveOption(name, id, isCurrent, depth = 0) {
    const btn = document.createElement('button');
    btn.className = 'modal__tree-item' + (isCurrent ? ' current' : '');
    btn.style.paddingLeft = `${12 + depth * 20}px`;
    btn.innerHTML = `
      <span class="modal__tree-icon">${id === null ? ICONS.back : ICONS.folderClosed}</span>
      <span>${escapeHtml(name)}</span>
      ${isCurrent ? '<span class="badge badge--primary" style="margin-left:auto;">current</span>' : ''}
    `;
    btn.addEventListener('click', () => {
      selectedDest = id;
      modalTree.querySelectorAll('.modal__tree-item').forEach(el => el.classList.remove('selected'));
      btn.classList.add('selected');
    });
    return btn;
  }

  // Event listeners
  function closeModal() {
    overlay.remove();
    document.removeEventListener('keydown', handleModalKeydown);
  }

  function handleModalKeydown(e) {
    if (e.key === 'Escape') closeModal();
  }

  document.addEventListener('keydown', handleModalKeydown);
  modal.querySelector('.modal__close').addEventListener('click', closeModal);
  modal.querySelector('.modal__cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  modal.querySelector('.modal__confirm').addEventListener('click', () => {
    if (selectedDest === undefined) {
      // No selection made — do nothing
      return;
    }
    const success = Store.moveItem(itemId, selectedDest);
    if (success) {
      renderTree();
      renderBreadcrumbs(selectedItemId);
    }
    closeModal();
  });

  // Focus trap: focus the first option
  requestAnimationFrame(() => {
    modalTree.querySelector('.modal__tree-item')?.focus();
  });
}

/* ============================================================
   Drag and Drop
   ============================================================ */

let draggedId = null;

function handleDragStart(e) {
  // Don't initiate drag if clicking buttons, toggles, or editing input
  if (e.target.closest('.tree-item__actions') || e.target.closest('.tree-item__toggle') || e.target.tagName === 'INPUT') {
    e.preventDefault();
    return;
  }

  const row = e.target.closest('.tree-item__row');
  if (!row) return;
  const id = row.closest('.tree-item')?.dataset.id;
  if (!id) return;

  draggedId = id;
  row.classList.add('dragging');

  // Required for Firefox
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  draggedId = null;
  // Clean up all drag styles
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function handleDragOver(e) {
  e.preventDefault(); // Allow drop
  e.dataTransfer.dropEffect = 'move';

  const row = e.target.closest('.tree-item__row');
  if (!row) return;

  const targetId = row.closest('.tree-item')?.dataset.id;
  if (targetId === draggedId) return;

  // Clear previous drag-over highlights
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  row.classList.add('drag-over');
}

function handleDragLeave(e) {
  const row = e.target.closest('.tree-item__row');
  if (row) row.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

  if (!draggedId) return;

  const row = e.target.closest('.tree-item__row');
  if (!row) {
    // Dropped on empty space of the tree container -> move to root
    const success = Store.moveItem(draggedId, null);
    if (success) {
      renderTree();
      renderBreadcrumbs(selectedItemId);
    }
    draggedId = null;
    return;
  }

  const targetId = row.closest('.tree-item')?.dataset.id;
  if (!targetId || targetId === draggedId) {
    draggedId = null;
    return;
  }

  const targetItem = Store.getItem(targetId);
  if (!targetItem) {
    draggedId = null;
    return;
  }

  // If dropping onto a folder, move into it.
  // If dropping onto a note, move into the note's parent folder.
  const destParentId = targetItem.type === 'folder' ? targetId : targetItem.parentId;

  const success = Store.moveItem(draggedId, destParentId);
  if (success) {
    renderTree();
    renderBreadcrumbs(selectedItemId);
  }

  draggedId = null;
}

/* ============================================================
   Keyboard navigation
   ============================================================ */

function handleTreeKeydown(e) {
  // Never intercept keyboard events while user is typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const row = e.target.closest('.tree-item__row');
  if (!row) return;

  const treeItem = row.closest('.tree-item');
  const id = treeItem?.dataset.id;
  if (!id) return;

  const item = Store.getItem(id);
  if (!item) return;

  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      selectItem(id);
      break;

    case 'F2':
      e.preventDefault();
      startRename(id);
      break;

    case 'Delete':
      e.preventDefault();
      confirmDelete(id);
      break;

    case 'ArrowRight':
      e.preventDefault();
      if (item.type === 'folder') {
        if (!Store.isExpanded(id)) {
          Store.toggleExpanded(id);
          renderTree();
          // Re-focus the current row
          document.querySelector(`.tree-item[data-id="${id}"] .tree-item__row`)?.focus();
        } else {
          // Focus first child
          const firstChild = treeItem.querySelector('.tree-item__children .tree-item__row');
          if (firstChild) firstChild.focus();
        }
      }
      break;

    case 'ArrowLeft':
      e.preventDefault();
      if (item.type === 'folder' && Store.isExpanded(id)) {
        Store.toggleExpanded(id);
        renderTree();
        document.querySelector(`.tree-item[data-id="${id}"] .tree-item__row`)?.focus();
      } else if (item.parentId) {
        // Focus parent row
        document.querySelector(`.tree-item[data-id="${item.parentId}"] > .tree-item__row`)?.focus();
      }
      break;

    case 'ArrowDown': {
      e.preventDefault();
      const allRows = [...document.querySelectorAll('.tree-item__row')];
      const filtered = allRows.filter(r => r.offsetParent !== null); // Only visible
      const idx = filtered.indexOf(row);
      if (idx < filtered.length - 1) filtered[idx + 1].focus();
      break;
    }

    case 'ArrowUp': {
      e.preventDefault();
      const allRows = [...document.querySelectorAll('.tree-item__row')];
      const filtered = allRows.filter(r => r.offsetParent !== null);
      const idx = filtered.indexOf(row);
      if (idx > 0) filtered[idx - 1].focus();
      break;
    }
  }
}

/* ============================================================
   Search
   ============================================================ */

let searchTimeout = null;

function handleSearchInput(e) {
  const query = e.target.value;

  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const resultsContainer = document.getElementById('notes-search-results');
    if (!resultsContainer) return;

    if (!query.trim()) {
      resultsContainer.innerHTML = '';
      resultsContainer.style.display = 'none';
      document.getElementById('notes-tree').style.display = '';
      return;
    }

    const results = Store.searchNotes(query);
    document.getElementById('notes-tree').style.display = 'none';
    resultsContainer.style.display = 'block';

    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state" style="padding: var(--space-6) var(--space-4);">
          <p class="empty-state__title">No results</p>
          <p class="empty-state__description">No notes match "${escapeHtml(query)}".</p>
        </div>`;
      return;
    }

    resultsContainer.innerHTML = '';
    for (const result of results) {
      const item = result.item;
      const el = document.createElement('button');
      el.className = 'search-result';
      const path = result.ancestors.map(a => a.name).join(' › ');

      let snippetHtml = '';
      if (result.snippet) {
        snippetHtml = `<p class="search-result__snippet">${highlightMatch(result.snippet, query)}</p>`;
      }

      el.innerHTML = `
        <div class="search-result__header">
          <span class="tree-item__icon">${ICONS.file}</span>
          <span class="search-result__name">${highlightMatch(item.name, query)}</span>
        </div>
        ${path ? `<p class="search-result__path">${escapeHtml(path)}</p>` : ''}
        ${snippetHtml}
      `;

      el.addEventListener('click', () => {
        // Clear search and open the note
        const searchInput = document.getElementById('notes-search-input');
        if (searchInput) searchInput.value = '';
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'none';
        document.getElementById('notes-tree').style.display = '';

        Store.expandToItem(item.id);
        renderTree();
        selectItem(item.id);
      });

      resultsContainer.appendChild(el);
    }
  }, 200);
}

/* ============================================================
   Utility helpers
   ============================================================ */

/** Escape HTML to prevent XSS in user-generated text. */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Highlight search matches in text. */
function highlightMatch(text, query) {
  const escaped = escapeHtml(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${q})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

/* ============================================================
   Initialization
   ============================================================ */

/**
 * Initialize the Notes tree UI. Call after the DOM is ready
 * and the notes store is loaded.
 */
export function initNotesTree() {
  Store.initNotesStore();

  const treeContainer = document.getElementById('notes-tree');
  if (!treeContainer) return;

  // Set ARIA role on the tree root
  treeContainer.setAttribute('role', 'tree');
  treeContainer.setAttribute('aria-label', 'Notes and folders');

  // Event delegation on the tree container
  treeContainer.addEventListener('click', handleTreeClick);
  treeContainer.addEventListener('contextmenu', handleContextMenu);
  treeContainer.addEventListener('keydown', handleTreeKeydown);

  // Drag and drop
  treeContainer.addEventListener('dragstart', handleDragStart);
  treeContainer.addEventListener('dragend', handleDragEnd);
  treeContainer.addEventListener('dragover', handleDragOver);
  treeContainer.addEventListener('dragleave', handleDragLeave);
  treeContainer.addEventListener('drop', handleDrop);

  // Global Ctrl+N shortcut for New Note in Notes view
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !e.shiftKey && !e.altKey) {
      const notesView = document.getElementById('view-notes');
      if (notesView?.classList.contains('active')) {
        e.preventDefault();
        const parentId = getSelectedFolderContext();
        createNewNote(parentId);
      }
    }
  });

  // Sidebar & empty-state action buttons
  document.getElementById('notes-new-note-btn')
    ?.addEventListener('click', () => {
      // Create at root or inside the selected folder
      const parentId = getSelectedFolderContext();
      createNewNote(parentId);
    });

  document.getElementById('notes-empty-create-btn')
    ?.addEventListener('click', () => {
      createNewNote();
    });

  document.getElementById('notes-new-folder-btn')
    ?.addEventListener('click', () => {
      const parentId = getSelectedFolderContext();
      createNewFolder(parentId);
    });

  // Search input
  document.getElementById('notes-search-input')
    ?.addEventListener('input', handleSearchInput);

  // Mobile back button
  document.getElementById('notes-back-btn')
    ?.addEventListener('click', () => {
      showMobileTree();
    });

  // Render the initial tree
  renderTree();

  // Restore last opened note
  const lastNoteId = Store.getLastOpenedNoteId();
  if (lastNoteId && Store.getItem(lastNoteId)) {
    Store.expandToItem(lastNoteId);
    renderTree();
    selectItem(lastNoteId);
  }
}

/**
 * Get the "contextual" parent folder for new items:
 * if a folder is selected, create inside it; otherwise root.
 */
function getSelectedFolderContext() {
  if (!selectedItemId) return null;
  const item = Store.getItem(selectedItemId);
  if (!item) return null;
  if (item.type === 'folder') return item.id;
  return item.parentId; // If a note is selected, use its parent folder
}

