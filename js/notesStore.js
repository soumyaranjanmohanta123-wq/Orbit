/**
 * notesStore.js — Data model and CRUD operations for notes and folders.
 *
 * Data lives in localStorage as a flat array of items. Each item has:
 *   { id, type, name, parentId, content, createdAt, updatedAt, sortOrder, pinned }
 *
 * The flat structure is simpler to persist; the tree shape is rebuilt
 * on demand by grouping items by parentId.
 */

import Storage from './storage.js';

/* ============================================================
   Constants
   ============================================================ */

const STORAGE_KEY  = 'orbit-notes';
const EXPANDED_KEY = 'orbit-notes-expanded';   // Set of expanded folder IDs
const LAST_NOTE_KEY = 'orbit-notes-last-open';  // ID of last opened note

/* ============================================================
   Internal state
   ============================================================ */

/** @type {Array<Object>} The authoritative flat list of all items. */
let items = [];

/** @type {Set<string>} IDs of folders that are expanded in the tree. */
let expandedFolders = new Set();

/* ============================================================
   Persistence helpers
   ============================================================ */

/** Load items from localStorage into memory. */
function load() {
  items = Storage.get(STORAGE_KEY, []);
  // Ensure every item has the expected shape (handles old/corrupt data)
  items = items.filter(item =>
    item && typeof item.id === 'string' && typeof item.type === 'string'
  );
  const saved = Storage.get(EXPANDED_KEY, []);
  expandedFolders = new Set(Array.isArray(saved) ? saved : []);
}

/** Persist the current items array to localStorage. */
function save() {
  Storage.set(STORAGE_KEY, items);
}

/** Persist expanded folder IDs. */
function saveExpanded() {
  Storage.set(EXPANDED_KEY, [...expandedFolders]);
}

/* ============================================================
   ID generation
   ============================================================ */

/** Generate a short random ID (collision-safe for a local app). */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ============================================================
   Getters — read operations
   ============================================================ */

/** Get all items (returns a shallow copy). */
export function getAllItems() {
  return [...items];
}

/** Get a single item by ID. */
export function getItem(id) {
  return items.find(item => item.id === id) || null;
}

/** Get all direct children of a parent (null = root level). */
export function getChildren(parentId = null) {
  return items
    .filter(item => item.parentId === parentId)
    .sort((a, b) => {
      // Folders first, then notes. Within each group, sort by sortOrder then name.
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
}

/** Build the full tree (used for rendering). */
export function getTree(parentId = null) {
  const children = getChildren(parentId);
  return children.map(item => ({
    ...item,
    children: item.type === 'folder' ? getTree(item.id) : []
  }));
}

/** Get the ancestor chain from an item up to root (bottom → top). */
export function getAncestors(id) {
  const ancestors = [];
  let current = getItem(id);
  while (current && current.parentId) {
    const parent = getItem(current.parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
  }
  return ancestors;
}

/** Get ALL descendants of a folder (recursive). */
export function getDescendants(folderId) {
  const result = [];
  const directChildren = items.filter(item => item.parentId === folderId);
  for (const child of directChildren) {
    result.push(child);
    if (child.type === 'folder') {
      result.push(...getDescendants(child.id));
    }
  }
  return result;
}

/** Count descendants (for delete confirmation). */
export function countDescendants(folderId) {
  const desc = getDescendants(folderId);
  const folders = desc.filter(d => d.type === 'folder').length;
  const notes = desc.filter(d => d.type === 'note').length;
  return { total: desc.length, folders, notes };
}

/** Check if a name already exists among siblings. */
export function nameExists(name, parentId, excludeId = null) {
  return items.some(item =>
    item.parentId === parentId &&
    item.name.toLowerCase() === name.toLowerCase() &&
    item.id !== excludeId
  );
}

/**
 * Generate a unique name by appending " (2)", " (3)", etc.
 * @param {string} baseName - The desired name.
 * @param {string|null} parentId - The parent folder.
 * @param {string|null} excludeId - An item ID to skip (for rename).
 * @returns {string} A unique name.
 */
export function getUniqueName(baseName, parentId, excludeId = null) {
  if (!nameExists(baseName, parentId, excludeId)) return baseName;
  let counter = 2;
  let candidate;
  do {
    candidate = `${baseName} (${counter})`;
    counter++;
  } while (nameExists(candidate, parentId, excludeId));
  return candidate;
}

/* ============================================================
   Mutations — write operations
   ============================================================ */

/** Create a new item (folder or note). Returns the created item. */
export function createItem(type, name, parentId = null) {
  const now = new Date().toISOString();
  // Determine sort order (append at end of siblings)
  const siblings = getChildren(parentId);
  const maxOrder = siblings.length > 0
    ? Math.max(...siblings.map(s => s.sortOrder || 0))
    : 0;

  const item = {
    id: generateId(),
    type,                       // 'folder' or 'note'
    name: name.trim(),
    parentId,
    content: type === 'note' ? '' : undefined,
    createdAt: now,
    updatedAt: now,
    sortOrder: maxOrder + 1,
    pinned: false
  };

  items.push(item);
  save();

  // Auto-expand the parent folder so the new item is visible
  if (parentId) {
    expandedFolders.add(parentId);
    saveExpanded();
  }

  return item;
}

/** Rename an item. Returns true if successful. */
export function renameItem(id, newName) {
  const item = getItem(id);
  if (!item) return false;

  newName = newName.trim();
  if (!newName) return false;

  item.name = newName;
  item.updatedAt = new Date().toISOString();
  save();
  return true;
}

/** Update a note's content. */
export function updateNoteContent(id, content) {
  const item = getItem(id);
  if (!item || item.type !== 'note') return false;

  item.content = content;
  item.updatedAt = new Date().toISOString();
  save();
  return true;
}

/** Toggle the pinned status of an item. */
export function togglePin(id) {
  const item = getItem(id);
  if (!item) return false;
  item.pinned = !item.pinned;
  item.updatedAt = new Date().toISOString();
  save();
  return item.pinned;
}

/** Delete an item (and all descendants if it's a folder). */
export function deleteItem(id) {
  const item = getItem(id);
  if (!item) return false;

  // Collect IDs to remove (the item itself + all descendants)
  const idsToRemove = new Set([id]);
  if (item.type === 'folder') {
    for (const desc of getDescendants(id)) {
      idsToRemove.add(desc.id);
    }
    // Clean up expanded set
    for (const fid of idsToRemove) {
      expandedFolders.delete(fid);
    }
    saveExpanded();
  }

  items = items.filter(i => !idsToRemove.has(i.id));
  save();
  return true;
}

/**
 * Move an item to a new parent folder.
 * Prevents moving a folder into itself or its own descendants.
 * @returns {boolean} True if the move succeeded.
 */
export function moveItem(id, newParentId) {
  const item = getItem(id);
  if (!item) return false;

  // Can't move to same parent
  if (item.parentId === newParentId) return false;

  // Can't move a folder into itself
  if (id === newParentId) return false;

  // Can't move a folder into one of its own descendants
  if (item.type === 'folder' && newParentId !== null) {
    const descendantIds = new Set(getDescendants(id).map(d => d.id));
    if (descendantIds.has(newParentId)) return false;
  }

  // Handle duplicate names in destination
  if (nameExists(item.name, newParentId, id)) {
    item.name = getUniqueName(item.name, newParentId, id);
  }

  // Update sort order to end of new parent
  const newSiblings = getChildren(newParentId);
  const maxOrder = newSiblings.length > 0
    ? Math.max(...newSiblings.map(s => s.sortOrder || 0))
    : 0;
  item.sortOrder = maxOrder + 1;

  item.parentId = newParentId;
  item.updatedAt = new Date().toISOString();
  save();

  // Expand the destination folder
  if (newParentId) {
    expandedFolders.add(newParentId);
    saveExpanded();
  }

  return true;
}

/**
 * Duplicate an item (and all descendants for folders).
 * Returns the new root item.
 */
export function duplicateItem(id) {
  const original = getItem(id);
  if (!original) return null;

  const now = new Date().toISOString();
  const copyName = getUniqueName(original.name + ' (copy)', original.parentId);

  if (original.type === 'note') {
    return createNoteWithContent(copyName, original.parentId, original.content || '');
  }

  // For folders: deep-duplicate the entire subtree
  const newFolder = createItem('folder', copyName, original.parentId);
  duplicateChildren(id, newFolder.id);
  return newFolder;
}

/** Recursively duplicate all children of a folder into a new parent. */
function duplicateChildren(sourceParentId, newParentId) {
  const children = getChildren(sourceParentId);
  for (const child of children) {
    if (child.type === 'note') {
      createNoteWithContent(child.name, newParentId, child.content || '');
    } else {
      const newChild = createItem('folder', child.name, newParentId);
      duplicateChildren(child.id, newChild.id);
    }
  }
}

/** Create a note with initial content (used by duplicate). */
function createNoteWithContent(name, parentId, content) {
  const item = createItem('note', name, parentId);
  item.content = content;
  save();
  return item;
}

/* ============================================================
   Expanded folder state
   ============================================================ */

export function isExpanded(folderId) {
  return expandedFolders.has(folderId);
}

export function toggleExpanded(folderId) {
  if (expandedFolders.has(folderId)) {
    expandedFolders.delete(folderId);
  } else {
    expandedFolders.add(folderId);
  }
  saveExpanded();
}

export function expandFolder(folderId) {
  expandedFolders.add(folderId);
  saveExpanded();
}

/** Expand all ancestors of an item (to make it visible in the tree). */
export function expandToItem(id) {
  const ancestors = getAncestors(id);
  for (const ancestor of ancestors) {
    expandedFolders.add(ancestor.id);
  }
  if (ancestors.length > 0) saveExpanded();
}

/* ============================================================
   Last opened note
   ============================================================ */

export function getLastOpenedNoteId() {
  return Storage.get(LAST_NOTE_KEY, null);
}

export function setLastOpenedNoteId(id) {
  Storage.set(LAST_NOTE_KEY, id);
}

/* ============================================================
   Search
   ============================================================ */

/**
 * Search notes by title and content.
 * Returns matches with the matching snippet highlighted.
 */
export function searchNotes(query) {
  if (!query || !query.trim()) return [];

  const q = query.trim().toLowerCase();
  const results = [];

  for (const item of items) {
    if (item.type !== 'note') continue;

    const nameMatch = item.name.toLowerCase().includes(q);
    const contentMatch = (item.content || '').toLowerCase().includes(q);

    if (nameMatch || contentMatch) {
      let snippet = '';
      if (contentMatch) {
        const content = item.content || '';
        const idx = content.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 40);
        const end = Math.min(content.length, idx + q.length + 40);
        snippet = (start > 0 ? '...' : '') +
                  content.slice(start, end) +
                  (end < content.length ? '...' : '');
      }

      results.push({
        item,
        nameMatch,
        contentMatch,
        snippet,
        ancestors: getAncestors(item.id)
      });
    }
  }

  // Sort: name matches first, then by updatedAt descending
  results.sort((a, b) => {
    if (a.nameMatch !== b.nameMatch) return a.nameMatch ? -1 : 1;
    return new Date(b.item.updatedAt) - new Date(a.item.updatedAt);
  });

  return results;
}

/* ============================================================
   Initialization
   ============================================================ */

/** Call once at app startup to load data from localStorage. */
export function initNotesStore() {
  load();
}

