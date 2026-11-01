/**
 * app.js — Application entry point.
 *
 * Imports and initializes every module. Each feature module
 * (notes, expenses, routines, dashboard) is wired here.
 */

import { initUI } from './ui.js';
import { initNotesTree, onNoteSelect, onNoteDelete } from './notesTree.js';
import { initNotesEditor, openNote, closeNote } from './notesEditor.js';
import * as NotesStore from './notesStore.js';
import { initExpenses } from './expenses.js';
import { initRoutines } from './routines.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize UI shell (theme, routing, sidebar)
  initUI();

  // 2. Initialize Notes Workspace (Tree + Editor)
  initNotesTree();
  initNotesEditor();

  // 3. Initialize Expense Tracker Module
  initExpenses();

  // 4. Initialize Routine Tracker Module
  initRoutines();

  // Connect note tree selection to the note editor
  onNoteSelect((note) => {
    if (note && note.type === 'note') {
      openNote(note);
    }
  });

  // When active note is deleted, return editor to empty state
  onNoteDelete(() => {
    closeNote();
  });

  // Check if a note was restored from a previous session
  const lastOpenedId = NotesStore.getLastOpenedNoteId();
  if (lastOpenedId) {
    const item = NotesStore.getItem(lastOpenedId);
    if (item && item.type === 'note') {
      openNote(item);
    }
  }
});

