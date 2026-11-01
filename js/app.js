/**
 * app.js — Application entry point.
 *
 * Imports and initializes every module. Each feature module
 * (notes, expenses, routines, dashboard) is wired here.
 */

import { initUI, onViewChange } from './ui.js';
import { initNotesTree, onNoteSelect, onNoteDelete } from './notesTree.js';
import { initNotesEditor, openNote, closeNote } from './notesEditor.js';
import * as NotesStore from './notesStore.js';
import { initExpenses } from './expenses.js';
import { initRoutines } from './routines.js';
import { initDashboard } from './dashboard.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize UI shell (theme, routing, sidebar)
  initUI();

  // 2. Initialize Notes Workspace (Editor first, then connect callbacks, then Tree)
  initNotesEditor();

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

  initNotesTree();

  // 3. Initialize Expense Tracker Module
  initExpenses();

  // 4. Initialize Routine Tracker Module
  initRoutines();

  // 5. Initialize Dashboard Module (pulls data from all modules)
  initDashboard();

  // Re-render views when navigating (e.g. returning to Dashboard updates fresh stats)
  onViewChange((view) => {
    if (view === 'dashboard') {
      initDashboard();
    }
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

