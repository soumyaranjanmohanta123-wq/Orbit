/**
 * app.js — Application entry point.
 *
 * Imports and initializes every module. Each feature module
 * (notes, expenses, routines, dashboard) is wired here.
 */

import { initUI } from './ui.js';
import { initNotesTree, onNoteSelect, onNoteDelete } from './notesTree.js';
import * as NotesStore from './notesStore.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize UI shell (theme, routing, sidebar)
  initUI();

  // 2. Initialize Notes Workspace (Step 2A: data model & tree)
  initNotesTree();

  // Wire up note selection preview in the main pane (Step 2A)
  const emptyStateEl = document.getElementById('notes-empty-state');
  const previewEl = document.getElementById('notes-selected-preview');
  const titleEl = document.getElementById('notes-preview-title');
  const updatedEl = document.getElementById('notes-preview-updated');
  const pathEl = document.getElementById('notes-preview-path');

  function updateMainPane(note) {
    if (!note || note.type !== 'note') {
      if (emptyStateEl) emptyStateEl.style.display = 'flex';
      if (previewEl) previewEl.style.display = 'none';
      return;
    }

    if (emptyStateEl) emptyStateEl.style.display = 'none';
    if (previewEl) previewEl.style.display = 'block';
    if (titleEl) titleEl.textContent = note.name;
    if (updatedEl) {
      const d = new Date(note.updatedAt || note.createdAt);
      updatedEl.textContent = `Last modified: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (pathEl) {
      const ancestors = NotesStore.getAncestors(note.id);
      pathEl.textContent = ancestors.length > 0 ? `Folder: ${ancestors.map(a => a.name).join(' / ')}` : 'Location: Root';
    }
  }

  onNoteSelect(updateMainPane);

  onNoteDelete(() => {
    updateMainPane(null);
  });

  // Check if a note was restored from a previous session
  const lastOpenedId = NotesStore.getLastOpenedNoteId();
  if (lastOpenedId) {
    const item = NotesStore.getItem(lastOpenedId);
    if (item && item.type === 'note') {
      updateMainPane(item);
    }
  }
});

