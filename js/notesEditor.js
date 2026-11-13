/**
 * notesEditor.js — Note Markdown Editor, Toolbar, View Modes, Autosave & Preview.
 *
 * Implements:
 *   - Markdown formatting toolbar (bold, italic, strikethrough, headings, lists,
 *     checklists, quotes, code, code blocks, links, horizontal rules).
 *   - Three view modes: Edit, Split (live preview), and Preview.
 *   - Real-time autosave with 500ms debounce and visual save indicators.
 *   - Word count, character count, and estimated reading time.
 *   - Full keyboard shortcuts: Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+S, Tab/Shift+Tab,
 *     and smart list continuations on Enter.
 *   - Safe Markdown rendering via marked + DOMPurify (XSS prevention).
 *   - Interactive preview task list checkboxes that toggle markdown source.
 *   - Actions: Export as .md, Copy to clipboard, and Pin/Favorite.
 */

import * as Store from './notesStore.js';
import { renderTree, renderBreadcrumbs } from './notesTree.js';

/* ============================================================
   Module State
   ============================================================ */

let currentNoteId = null;
let currentViewMode = 'split'; // 'edit' | 'split' | 'preview'
let autosaveTimer = null;
let hasUnsavedChanges = false;

/* DOM element references */
let editorContainerEl = null;
let emptyStateEl = null;
let titleInputEl = null;
let textareaEl = null;
let previewEl = null;
let statusSaveEl = null;
let statusWordsEl = null;
let statusCharsEl = null;
let statusReadTimeEl = null;
let pinBtnEl = null;

/* ============================================================
   Undo / Redo History Manager & Fullscreen State
   ============================================================ */

const MAX_UNDO_STACK = 80;
let undoStack = [];
let redoStack = [];
let lastRecordedValue = '';
let undoDebounceTimer = null;

function initUndoHistory(initialValue = '') {
  undoStack = [{
    value: initialValue,
    selectionStart: initialValue.length,
    selectionEnd: initialValue.length
  }];
  redoStack = [];
  lastRecordedValue = initialValue;
  updateUndoRedoUI();
}

function pushUndoSnapshot(force = false) {
  if (!textareaEl) return;
  const currentVal = textareaEl.value;
  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;

  if (!force && currentVal === lastRecordedValue) return;

  undoStack.push({
    value: currentVal,
    selectionStart: start,
    selectionEnd: end
  });

  if (undoStack.length > MAX_UNDO_STACK) {
    undoStack.shift();
  }

  redoStack = [];
  lastRecordedValue = currentVal;
  updateUndoRedoUI();
}

function handleTypingUndo() {
  clearTimeout(undoDebounceTimer);
  undoDebounceTimer = setTimeout(() => {
    pushUndoSnapshot(false);
  }, 400);
}

export function undo() {
  if (!textareaEl || undoStack.length <= 1) return;

  const currentVal = textareaEl.value;
  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;

  redoStack.push({
    value: currentVal,
    selectionStart: start,
    selectionEnd: end
  });

  undoStack.pop(); // Remove current
  const prev = undoStack[undoStack.length - 1];
  if (!prev) return;

  lastRecordedValue = prev.value;
  textareaEl.value = prev.value;
  textareaEl.setSelectionRange(prev.selectionStart, prev.selectionEnd);

  updatePreview();
  updateStats();
  scheduleAutosave();
  updateUndoRedoUI();
  textareaEl.focus();
}

export function redo() {
  if (!textareaEl || redoStack.length === 0) return;

  const next = redoStack.pop();
  if (!next) return;

  undoStack.push({
    value: next.value,
    selectionStart: next.selectionStart,
    selectionEnd: next.selectionEnd
  });

  lastRecordedValue = next.value;
  textareaEl.value = next.value;
  textareaEl.setSelectionRange(next.selectionStart, next.selectionEnd);

  updatePreview();
  updateStats();
  scheduleAutosave();
  updateUndoRedoUI();
  textareaEl.focus();
}

function updateUndoRedoUI() {
  const undoBtn = document.getElementById('notes-btn-undo');
  const redoBtn = document.getElementById('notes-btn-redo');

  if (undoBtn) {
    const canUndo = undoStack.length > 1;
    undoBtn.disabled = !canUndo;
    undoBtn.setAttribute('aria-disabled', String(!canUndo));
  }
  if (redoBtn) {
    const canRedo = redoStack.length > 0;
    redoBtn.disabled = !canRedo;
    redoBtn.setAttribute('aria-disabled', String(!canRedo));
  }
}

/**
 * Toggle Fullscreen / Focus Mode for the editor.
 * @param {boolean|null} [forceState=null]
 */
export function toggleFullscreen(forceState = null) {
  if (!editorContainerEl) return;

  const shouldBeFullscreen = forceState !== null
    ? forceState
    : !editorContainerEl.classList.contains('notes-editor--fullscreen');

  editorContainerEl.classList.toggle('notes-editor--fullscreen', shouldBeFullscreen);

  const expandIcon = document.querySelector('.notes-fs-icon-expand');
  const compressIcon = document.querySelector('.notes-fs-icon-compress');
  if (expandIcon && compressIcon) {
    expandIcon.style.display = shouldBeFullscreen ? 'none' : 'block';
    compressIcon.style.display = shouldBeFullscreen ? 'block' : 'none';
  }

  const fsBtn = document.getElementById('notes-fullscreen-btn');
  if (fsBtn) {
    fsBtn.setAttribute('title', shouldBeFullscreen ? 'Exit Fullscreen (Esc / Ctrl+Shift+F)' : 'Toggle Fullscreen Focus (Ctrl+Shift+F)');
    fsBtn.setAttribute('aria-pressed', String(shouldBeFullscreen));
  }
}

/* ============================================================
   Markdown Engine & Sanitizer (marked + DOMPurify)
   ============================================================ */

/**
 * Configure marked with GitHub-flavored markdown and line breaks.
 */
function setupMarked() {
  if (typeof window.marked !== 'undefined') {
    if (typeof window.marked.use === 'function') {
      window.marked.use({
        gfm: true,
        breaks: true
      });
    } else if (window.marked.setOptions) {
      window.marked.setOptions({
        gfm: true,
        breaks: true
      });
    }
  }
}

/**
 * Safely parse Markdown to HTML and sanitize with DOMPurify.
 * Includes defensive fallback if CDNs are blocked or unavailable.
 * @param {string} markdown
 * @returns {string} Sanitized HTML
 */
function renderMarkdown(markdown) {
  if (!markdown) return '<p class="markdown-empty-hint">Empty note. Type on the left to see live preview.</p>';

  // Process multi-color highlight syntax: ==text== (default yellow) or ==color:text== or ==color|text==
  const processed = markdown.replace(/==(?:(yellow|green|blue|purple|pink|orange)[:|])?([^=\n\r]+?)==/gi, (match, colorPrefix, content) => {
    const color = (colorPrefix || 'yellow').toLowerCase();
    return `<mark class="note-highlight note-highlight--${color}">${content}</mark>`;
  });

  let rawHtml = '';
  if (typeof window.marked !== 'undefined') {
    try {
      rawHtml = typeof window.marked.parse === 'function'
        ? window.marked.parse(processed)
        : window.marked(processed);
    } catch {
      rawHtml = `<pre>${escapeHtml(markdown)}</pre>`;
    }
  } else {
    // Fallback if marked is missing
    rawHtml = `<pre style="white-space: pre-wrap; font-family: var(--font-mono);">${escapeHtml(markdown)}</pre>`;
  }

  // Sanitize via DOMPurify to eliminate any XSS vulnerability
  if (typeof window.DOMPurify !== 'undefined' && typeof window.DOMPurify.sanitize === 'function') {
    return window.DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['target', 'data-check-index', 'class'],
      ADD_TAGS: ['input', 'mark']
    });
  }

  return rawHtml;
}

/**
 * Escape HTML for fallback rendering.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
   View Modes (Edit, Split, Preview)
   ============================================================ */

/**
 * Set current editor view mode: 'edit', 'split', or 'preview'.
 * @param {'edit'|'split'|'preview'} mode
 */
export function setViewMode(mode) {
  // Mobile protection: don't allow split on screens narrower than 768px
  if (mode === 'split' && window.innerWidth < 768) {
    mode = 'edit';
  }

  currentViewMode = mode;

  if (!editorContainerEl) return;

  editorContainerEl.classList.remove('mode-edit', 'mode-split', 'mode-preview');
  editorContainerEl.classList.add(`mode-${mode}`);

  // Update segmented control buttons active states
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  // Always update preview content when entering split or preview mode
  if (mode === 'split' || mode === 'preview') {
    updatePreview();
  }

  // Focus textarea when entering edit or split mode
  if (mode === 'edit' || mode === 'split') {
    textareaEl?.focus();
  }
}

/* ============================================================
   Note Loading & Selection
   ============================================================ */

/**
 * Open a note in the editor.
 * @param {Object} note - The note object from notesStore
 */
export function openNote(note) {
  if (!note || note.type !== 'note') {
    closeNote();
    return;
  }

  // If there were pending changes from a previous note, save them immediately
  if (hasUnsavedChanges && currentNoteId && currentNoteId !== note.id) {
    saveNow();
  }

  currentNoteId = note.id;
  hasUnsavedChanges = false;

  // Show editor container, hide empty state
  if (emptyStateEl) {
    emptyStateEl.style.display = 'none';
  }
  if (editorContainerEl) {
    editorContainerEl.classList.remove('u-hidden');
    editorContainerEl.style.display = 'flex';
  }

  // Set note values
  if (titleInputEl) titleInputEl.value = note.name || '';
  if (textareaEl) textareaEl.value = note.content || '';

  // Initialize undo / redo history for this note
  initUndoHistory(note.content || '');

  // Update pin button state
  updatePinButton(Boolean(note.pinned));

  // Update save status indicator
  const d = new Date(note.updatedAt || note.createdAt);
  setSaveStatus(`Saved ${formatTimeAgo(d)}`);

  // Update stats & preview
  updateStats();
  updatePreview();

  // If on mobile screen, ensure view mode is 'edit'
  if (window.innerWidth < 768 && currentViewMode === 'split') {
    setViewMode('edit');
  } else {
    setViewMode(currentViewMode);
  }
}

/**
 * Close editor and return to empty state.
 */
export function closeNote() {
  if (hasUnsavedChanges && currentNoteId) {
    saveNow();
  }
  currentNoteId = null;
  hasUnsavedChanges = false;
  undoStack = [];
  redoStack = [];
  updateUndoRedoUI();
  toggleFullscreen(false);

  const palette = document.getElementById('notes-highlight-palette');
  if (palette) palette.style.display = 'none';
  document.getElementById('notes-highlight-chevron')?.setAttribute('aria-expanded', 'false');

  if (emptyStateEl) {
    emptyStateEl.style.display = 'flex';
  }
  if (editorContainerEl) {
    editorContainerEl.style.display = 'none';
  }
}

/* ============================================================
   Autosave & Persistence
   ============================================================ */

/**
 * Schedule a debounced save (500ms).
 */
function scheduleAutosave() {
  if (!currentNoteId) return;

  hasUnsavedChanges = true;
  setSaveStatus('Saving…');

  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveNow();
  }, 500);
}

/**
 * Perform save immediately.
 */
export function saveNow() {
  clearTimeout(autosaveTimer);
  if (!currentNoteId) return;

  const title = (titleInputEl?.value || '').trim() || 'Untitled Note';
  const content = textareaEl?.value ?? '';

  const note = Store.getItem(currentNoteId);
  if (!note) return;

  let titleChanged = false;
  if (note.name !== title) {
    // Check duplicates and rename
    const uniqueName = Store.getUniqueName(title, note.parentId, currentNoteId);
    Store.renameItem(currentNoteId, uniqueName);
    if (titleInputEl && titleInputEl.value !== uniqueName) {
      titleInputEl.value = uniqueName;
    }
    titleChanged = true;
  }

  Store.updateNoteContent(currentNoteId, content);
  hasUnsavedChanges = false;
  setSaveStatus('Saved just now');

  if (titleChanged) {
    renderTree();
    renderBreadcrumbs(currentNoteId);
    // Keep row active
    document.querySelector(`.tree-item[data-id="${currentNoteId}"] .tree-item__row`)?.classList.add('active');
  }
}

/**
 * Update the visible save status text.
 * @param {string} text
 */
function setSaveStatus(text) {
  if (statusSaveEl) {
    statusSaveEl.textContent = text;
  }
}

/* ============================================================
   Preview & Live Checklist Toggling
   ============================================================ */

/**
 * Update the HTML preview pane from current textarea markdown.
 */
function updatePreview() {
  if (!previewEl || !textareaEl) return;
  const markdown = textareaEl.value;
  previewEl.innerHTML = renderMarkdown(markdown);

  // Wire interactive task list checkboxes inside the rendered preview
  wirePreviewCheckboxes();
}

/**
 * Make task checkboxes in preview interactive so clicking toggles `- [ ]` <-> `- [x]`
 * in the markdown source and triggers autosave.
 */
function wirePreviewCheckboxes() {
  if (!previewEl) return;

  const checkboxes = previewEl.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((cb, index) => {
    cb.removeAttribute('disabled');
    cb.style.cursor = 'pointer';
    cb.dataset.checkIndex = String(index);

    cb.addEventListener('change', () => {
      toggleMarkdownCheckbox(index, cb.checked);
    });
  });
}

/**
 * Toggle the Nth markdown checklist checkbox in the textarea source.
 * @param {number} targetIndex - 0-based index of the checkbox in document
 * @param {boolean} isChecked - New checked state
 */
function toggleMarkdownCheckbox(targetIndex, isChecked) {
  if (!textareaEl) return;
  const text = textareaEl.value;

  // Regex matches task list checkbox patterns: - [ ] or - [x] or * [ ] or 1. [ ]
  const taskRegex = /^(\s*[-*+]|\s*\d+\.)\s+\[([ xX])\]/gm;
  let match;
  let currentIndex = 0;

  while ((match = taskRegex.exec(text)) !== null) {
    if (currentIndex === targetIndex) {
      const matchIndex = match.index;
      const prefix = match[1];
      const newBox = isChecked ? '[x]' : '[ ]';
      const replacement = `${prefix} ${newBox}`;

      const updatedText = text.substring(0, matchIndex) +
                          replacement +
                          text.substring(matchIndex + match[0].length);

      textareaEl.value = updatedText;
      updateStats();
      scheduleAutosave();
      return;
    }
    currentIndex++;
  }
}

/* ============================================================
   Word, Character & Reading Time Stats
   ============================================================ */

/**
 * Recalculate word count, character count, and reading time.
 */
function updateStats() {
  const text = textareaEl?.value || '';

  const charCount = text.length;

  // Match sequences of non-whitespace characters
  const trimmed = text.trim();
  const wordCount = trimmed ? (trimmed.match(/\S+/g) || []).length : 0;

  // Estimated reading speed: ~200 words per minute
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  if (statusWordsEl) statusWordsEl.textContent = `${wordCount} word${wordCount === 1 ? '' : 's'}`;
  if (statusCharsEl) statusCharsEl.textContent = `${charCount} character${charCount === 1 ? '' : 's'}`;
  if (statusReadTimeEl) statusReadTimeEl.textContent = `${readTime} min read`;
}

/* ============================================================
   Formatting Engine & Text Manipulations
   ============================================================ */

/**
 * Wrap current selection with prefix and suffix.
 * Preserves browser native undo stack where supported.
 * @param {string} prefix - e.g. '**'
 * @param {string} suffix - e.g. '**'
 * @param {string} defaultText - placeholder if selection is empty
 */
function insertAround(prefix, suffix = prefix, defaultText = 'text') {
  if (!textareaEl) return;
  textareaEl.focus();

  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;
  const selected = textareaEl.value.substring(start, end);

  const textToInsert = selected || defaultText;
  const replacement = `${prefix}${textToInsert}${suffix}`;

  insertTextAtSelection(replacement, start + prefix.length, start + prefix.length + textToInsert.length);
}

/* ============================================================
   Multi-Color Highlighting Engine
   ============================================================ */

export const HIGHLIGHT_COLORS = {
  yellow: { name: 'Yellow', hex: '#facc15' },
  green:  { name: 'Green',  hex: '#4ade80' },
  blue:   { name: 'Blue',   hex: '#60a5fa' },
  purple: { name: 'Purple', hex: '#c084fc' },
  pink:   { name: 'Pink',   hex: '#f472b6' },
  orange: { name: 'Orange', hex: '#fb923c' }
};

let activeHighlightColor = (() => {
  try {
    const saved = localStorage.getItem('orbit_notes_highlight_color');
    if (saved && HIGHLIGHT_COLORS[saved]) return saved;
  } catch {}
  return 'yellow';
})();

/**
 * Set active highlight color and update toolbar indicators.
 * @param {string} color
 */
export function setHighlightColor(color) {
  if (!HIGHLIGHT_COLORS[color]) color = 'yellow';
  activeHighlightColor = color;

  try {
    localStorage.setItem('orbit_notes_highlight_color', color);
  } catch {}

  const colorBar = document.getElementById('notes-highlight-color-bar');
  if (colorBar) {
    colorBar.style.backgroundColor = HIGHLIGHT_COLORS[color].hex;
  }

  const btn = document.getElementById('notes-btn-highlight');
  if (btn) {
    btn.setAttribute('title', `Highlight (${HIGHLIGHT_COLORS[color].name}, Ctrl+H)`);
  }

  document.querySelectorAll('.notes-palette-color-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.color === color);
  });
}

/**
 * Apply highlight color to current selection or active word/cursor.
 * @param {string} [color]
 */
export function applyHighlight(color = activeHighlightColor) {
  if (!HIGHLIGHT_COLORS[color]) color = 'yellow';
  setHighlightColor(color);

  if (!textareaEl) return;
  textareaEl.focus();
  pushUndoSnapshot(true);

  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;
  const val = textareaEl.value;
  const selected = val.substring(start, end);

  const prefix = color === 'yellow' ? '==' : `==${color}:`;
  const suffix = '==';

  // 1. If text is selected
  if (start !== end) {
    // If the selection itself is already wrapped in ==...==
    if (selected.startsWith('==') && selected.endsWith('==') && selected.length >= 4) {
      const inner = selected.slice(2, -2).replace(/^(?:yellow|green|blue|purple|pink|orange)[:|]/i, '');
      const replacement = `${prefix}${inner}${suffix}`;
      insertTextAtSelection(replacement, start, start + replacement.length);
    } else {
      const replacement = `${prefix}${selected}${suffix}`;
      insertTextAtSelection(replacement, start, start + replacement.length);
    }
    return;
  }

  // 2. If cursor is collapsed (start === end), check if inside an existing highlight on the line
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = val.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = val.length;
  const line = val.substring(lineStart, lineEnd);
  const offsetInLine = start - lineStart;

  const hlRegex = /==(?:(yellow|green|blue|purple|pink|orange)[:|])?([^=\n\r]+?)==/gi;
  let m;
  let insideMatch = null;
  while ((m = hlRegex.exec(line)) !== null) {
    const mStart = m.index;
    const mEnd = m.index + m[0].length;
    if (offsetInLine >= mStart && offsetInLine <= mEnd) {
      insideMatch = {
        start: lineStart + mStart,
        end: lineStart + mEnd,
        inner: m[2]
      };
      break;
    }
  }

  if (insideMatch) {
    const replacement = `${prefix}${insideMatch.inner}${suffix}`;
    textareaEl.setSelectionRange(insideMatch.start, insideMatch.end);
    insertTextAtSelection(replacement, insideMatch.start, insideMatch.start + replacement.length);
  } else {
    const textToInsert = 'highlighted text';
    const replacement = `${prefix}${textToInsert}${suffix}`;
    insertTextAtSelection(replacement, start + prefix.length, start + prefix.length + textToInsert.length);
  }
}

/**
 * Remove highlight from selected text or from highlight under cursor.
 */
export function removeHighlight() {
  if (!textareaEl) return;
  textareaEl.focus();
  pushUndoSnapshot(true);

  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;
  const val = textareaEl.value;
  const selected = val.substring(start, end);

  // If text is selected
  if (start !== end) {
    const hlRegex = /==(?:(yellow|green|blue|purple|pink|orange)[:|])?([^=\n\r]+?)==/gi;
    if (selected.startsWith('==') && selected.endsWith('==') && selected.length >= 4) {
      const inner = selected.slice(2, -2).replace(/^(?:yellow|green|blue|purple|pink|orange)[:|]/i, '');
      insertTextAtSelection(inner, start, start + inner.length);
    } else if (hlRegex.test(selected)) {
      const stripped = selected.replace(/==(?:(yellow|green|blue|purple|pink|orange)[:|])?([^=\n\r]+?)==/gi, '$2');
      insertTextAtSelection(stripped, start, start + stripped.length);
    }
    return;
  }

  // If cursor collapsed, check if inside an existing highlight
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = val.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = val.length;
  const line = val.substring(lineStart, lineEnd);
  const offsetInLine = start - lineStart;

  const hlRegex = /==(?:(yellow|green|blue|purple|pink|orange)[:|])?([^=\n\r]+?)==/gi;
  let m;
  let insideMatch = null;
  while ((m = hlRegex.exec(line)) !== null) {
    const mStart = m.index;
    const mEnd = m.index + m[0].length;
    if (offsetInLine >= mStart && offsetInLine <= mEnd) {
      insideMatch = {
        start: lineStart + mStart,
        end: lineStart + mEnd,
        inner: m[2]
      };
      break;
    }
  }

  if (insideMatch) {
    textareaEl.setSelectionRange(insideMatch.start, insideMatch.end);
    insertTextAtSelection(insideMatch.inner, insideMatch.start, insideMatch.start + insideMatch.inner.length);
  }
}

/**
 * Initialize palette popover event listeners.
 */
function initHighlightPalette() {
  const chevronBtn = document.getElementById('notes-highlight-chevron');
  const paletteEl = document.getElementById('notes-highlight-palette');
  const clearBtn = document.getElementById('notes-highlight-clear-btn');

  // Initialize UI with active color
  setHighlightColor(activeHighlightColor);

  chevronBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!paletteEl) return;
    const isShown = paletteEl.style.display !== 'none';
    paletteEl.style.display = isShown ? 'none' : 'flex';
    chevronBtn.setAttribute('aria-expanded', String(!isShown));
  });

  // Color swatch buttons in palette
  document.querySelectorAll('.notes-palette-color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const color = btn.dataset.color;
      applyHighlight(color);
      if (paletteEl) paletteEl.style.display = 'none';
      chevronBtn?.setAttribute('aria-expanded', 'false');
    });
  });

  // Clear button
  clearBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeHighlight();
    if (paletteEl) paletteEl.style.display = 'none';
    chevronBtn?.setAttribute('aria-expanded', 'false');
  });

  // Close palette on click outside or escape
  document.addEventListener('click', (e) => {
    if (paletteEl && paletteEl.style.display !== 'none') {
      if (!e.target.closest('#notes-highlight-group')) {
        paletteEl.style.display = 'none';
        chevronBtn?.setAttribute('aria-expanded', 'false');
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && paletteEl && paletteEl.style.display !== 'none') {
      paletteEl.style.display = 'none';
      chevronBtn?.setAttribute('aria-expanded', 'false');
    }
  });
}

/**
 * Prefix each selected line (or current line) with a prefix (headings, lists, quotes).
 * @param {string} prefix - e.g. '# ', '- ', '> '
 */
function insertLinePrefix(prefix) {
  if (!textareaEl) return;
  textareaEl.focus();

  const val = textareaEl.value;
  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;

  // Find start of current line
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  // Find end of current selection's line
  let lineEnd = val.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = val.length;

  const affectedText = val.substring(lineStart, lineEnd);
  const lines = affectedText.split('\n');

  // If all lines already start with prefix, toggle it off; otherwise add it
  const allPrefixed = lines.every(l => l.startsWith(prefix));
  const newLines = lines.map(line => {
    if (allPrefixed) {
      return line.startsWith(prefix) ? line.slice(prefix.length) : line;
    } else {
      // Remove other heading prefixes if adding a heading
      let cleaned = line;
      if (prefix.startsWith('#')) {
        cleaned = line.replace(/^#{1,6}\s+/, '');
      }
      return `${prefix}${cleaned}`;
    }
  });

  const replacement = newLines.join('\n');
  textareaEl.setSelectionRange(lineStart, lineEnd);
  insertTextAtSelection(replacement, lineStart, lineStart + replacement.length);
}

/**
 * Insert a multi-line fenced code block.
 */
function insertCodeBlock() {
  if (!textareaEl) return;
  textareaEl.focus();

  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;
  const selected = textareaEl.value.substring(start, end) || '// your code here';

  const replacement = `\n\`\`\`javascript\n${selected}\n\`\`\`\n`;
  insertTextAtSelection(replacement, start + 4, start + 14); // select language label
}

/**
 * Insert a Markdown link: [text](url).
 */
function insertLink() {
  if (!textareaEl) return;
  textareaEl.focus();

  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;
  const selected = textareaEl.value.substring(start, end);

  const linkText = selected || 'link text';
  const urlPrompt = prompt('Enter link URL (e.g. https://example.com):', 'https://');
  if (urlPrompt === null) return; // user cancelled

  const safeUrl = urlPrompt.trim() || 'https://';
  const replacement = `[${linkText}](${safeUrl})`;

  insertTextAtSelection(replacement, start, start + replacement.length);
}

/**
 * Insert a standalone block (e.g. horizontal rule).
 * @param {string} blockText
 */
function insertBlock(blockText) {
  if (!textareaEl) return;
  textareaEl.focus();
  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;
  insertTextAtSelection(blockText, start + blockText.length, start + blockText.length);
}

/**
 * Insert text using setRangeText and trigger an input event for autosave/undo.
 * @param {string} text
 * @param {number} newSelectStart
 * @param {number} newSelectEnd
 */
function insertTextAtSelection(text, newSelectStart, newSelectEnd) {
  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;

  // setRangeText preserves native undo buffer in modern browsers
  if (typeof textareaEl.setRangeText === 'function') {
    textareaEl.setRangeText(text, start, end, 'end');
    if (newSelectStart !== undefined && newSelectEnd !== undefined) {
      textareaEl.setSelectionRange(newSelectStart, newSelectEnd);
    }
  } else {
    const val = textareaEl.value;
    textareaEl.value = val.substring(0, start) + text + val.substring(end);
    if (newSelectStart !== undefined && newSelectEnd !== undefined) {
      textareaEl.setSelectionRange(newSelectStart, newSelectEnd);
    }
  }

  // Dispatch standard input event so undo, autosave, and preview all update
  textareaEl.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ============================================================
   Keyboard Handling (Shortcuts, Tab, Smart Enter)
   ============================================================ */

/**
 * Handle keydown events inside the textarea.
 * @param {KeyboardEvent} e
 */
function handleTextareaKeydown(e) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifier = isMac ? e.metaKey : e.ctrlKey;

  // 1. Undo / Redo & Fullscreen shortcuts
  if (modifier && !e.altKey) {
    const key = e.key.toLowerCase();

    // Undo (Ctrl+Z)
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }

    // Redo (Ctrl+Y or Ctrl+Shift+Z)
    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
      return;
    }

    // Fullscreen toggle (Ctrl+Shift+F)
    if (key === 'f' && e.shiftKey) {
      e.preventDefault();
      toggleFullscreen();
      return;
    }

    // Formatting shortcuts (no shift)
    if (!e.shiftKey) {
      if (key === 'b') {
        e.preventDefault();
        pushUndoSnapshot(true);
        insertAround('**', '**', 'bold text');
        return;
      }

      if (key === 'i') {
        e.preventDefault();
        pushUndoSnapshot(true);
        insertAround('*', '*', 'italic text');
        return;
      }

      if (key === 'h') {
        e.preventDefault();
        applyHighlight(activeHighlightColor);
        return;
      }

      if (key === 'k') {
        e.preventDefault();
        pushUndoSnapshot(true);
        insertLink();
        return;
      }

      if (key === 's') {
        e.preventDefault();
        saveNow();
        return;
      }
    }
  }

  // 2. Tab key indentation (2 spaces or indent/unindent selected lines)
  if (e.key === 'Tab') {
    e.preventDefault();
    pushUndoSnapshot(true);
    handleTabIndentation(e.shiftKey);
    return;
  }

  // 3. Smart Enter for lists and checklists
  if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !modifier) {
    if (handleSmartEnter()) {
      e.preventDefault();
    }
  }
}

/**
 * Indent or unindent with 2 spaces.
 * @param {boolean} isShift - True if Shift+Tab (unindent)
 */
function handleTabIndentation(isShift) {
  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;
  const val = textareaEl.value;

  // If no selection or single-line cursor, simple tab insertion
  if (start === end && !isShift) {
    insertTextAtSelection('  ', start + 2, start + 2);
    return;
  }

  // Multi-line indent/unindent
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = val.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = val.length;

  const lines = val.substring(lineStart, lineEnd).split('\n');
  let newLines;

  if (isShift) {
    // Unindent: remove up to 2 leading spaces
    newLines = lines.map(line => line.replace(/^ {1,2}/, ''));
  } else {
    // Indent: add 2 leading spaces
    newLines = lines.map(line => '  ' + line);
  }

  const replacement = newLines.join('\n');
  textareaEl.setSelectionRange(lineStart, lineEnd);
  insertTextAtSelection(replacement, lineStart, lineStart + replacement.length);
}

/**
 * Automatically continue checklists and bulleted/numbered lists on Enter.
 * If the current list line is empty, clears the prefix instead.
 * @returns {boolean} True if handled
 */
function handleSmartEnter() {
  const start = textareaEl.selectionStart;
  const val = textareaEl.value;

  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  const currentLine = val.substring(lineStart, start);

  // Check for checklist: "- [ ] " or "- [x] "
  const checkMatch = currentLine.match(/^(\s*[-*+]\s+\[[ xX]\]\s*)(.*)$/);
  if (checkMatch) {
    const prefix = checkMatch[1].replace(/\[[xX]\]/, '[ ]'); // new items start unchecked
    const content = checkMatch[2];

    if (!content.trim()) {
      // Empty checklist item -> clear prefix (exit list)
      textareaEl.setSelectionRange(lineStart, start);
      insertTextAtSelection('', lineStart, lineStart);
      return true;
    }

    insertTextAtSelection('\n' + prefix, start + prefix.length + 1, start + prefix.length + 1);
    return true;
  }

  // Check for bullet list: "- " or "* " or "+ "
  const bulletMatch = currentLine.match(/^(\s*[-*+]\s+)(.*)$/);
  if (bulletMatch) {
    const prefix = bulletMatch[1];
    const content = bulletMatch[2];

    if (!content.trim()) {
      textareaEl.setSelectionRange(lineStart, start);
      insertTextAtSelection('', lineStart, lineStart);
      return true;
    }

    insertTextAtSelection('\n' + prefix, start + prefix.length + 1, start + prefix.length + 1);
    return true;
  }

  // Check for numbered list: "1. ", "2. ", etc.
  const numMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (numMatch) {
    const indent = numMatch[1];
    const num = parseInt(numMatch[2], 10);
    const content = numMatch[3];

    if (!content.trim()) {
      textareaEl.setSelectionRange(lineStart, start);
      insertTextAtSelection('', lineStart, lineStart);
      return true;
    }

    const nextPrefix = `${indent}${num + 1}. `;
    insertTextAtSelection('\n' + nextPrefix, start + nextPrefix.length + 1, start + nextPrefix.length + 1);
    return true;
  }

  return false;
}

/* ============================================================
   Extra Actions (Export, Copy, Pin)
   ============================================================ */

/**
 * Export current note as a .md file.
 */
function exportNote() {
  if (!currentNoteId) return;
  const note = Store.getItem(currentNoteId);
  if (!note) return;

  const filename = `${(note.name || 'note').replace(/[\\/:*?"<>|]/g, '_')}.md`;
  const content = note.content || '';

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // Clean up
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

/**
 * Copy note markdown content to clipboard.
 */
function copyNoteContent() {
  if (!textareaEl) return;
  const text = textareaEl.value;

  navigator.clipboard.writeText(text).then(() => {
    showToast('Note copied to clipboard!');
  }).catch(() => {
    // Fallback if clipboard API is restricted
    textareaEl.select();
    document.execCommand('copy');
    showToast('Note copied to clipboard!');
  });
}

/**
 * Toggle pin status for the current note.
 */
function toggleCurrentPin() {
  if (!currentNoteId) return;
  const newPinnedState = Store.togglePin(currentNoteId);
  updatePinButton(newPinnedState);
  renderTree();
  // Keep row active
  document.querySelector(`.tree-item[data-id="${currentNoteId}"] .tree-item__row`)?.classList.add('active');
  showToast(newPinnedState ? 'Note pinned' : 'Note unpinned');
}

/**
 * Update the visual state of the pin button.
 * @param {boolean} isPinned
 */
function updatePinButton(isPinned) {
  if (!pinBtnEl) return;
  pinBtnEl.classList.toggle('active', isPinned);
  pinBtnEl.setAttribute('aria-pressed', String(isPinned));
  pinBtnEl.title = isPinned ? 'Unpin note' : 'Pin note';
}

/**
 * Show a temporary toast message.
 * @param {string} message
 */
function showToast(message) {
  const existing = document.getElementById('orbit-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'orbit-toast';
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 250);
    }, 2000);
  });
}

/* ============================================================
   Formatting Helpers
   ============================================================ */

/**
 * Relative time formatter for "Saved 2 minutes ago", etc.
 * @param {Date} date
 * @returns {string}
 */
function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

/* ============================================================
   Initialization
   ============================================================ */

/**
 * Initialize the note editor module and attach all event listeners.
 */
export function initNotesEditor() {
  setupMarked();

  // Cache DOM references
  editorContainerEl = document.getElementById('notes-editor');
  emptyStateEl = document.getElementById('notes-empty-state');
  titleInputEl = document.getElementById('notes-editor-title');
  textareaEl = document.getElementById('notes-textarea');
  previewEl = document.getElementById('notes-preview');
  statusSaveEl = document.getElementById('notes-status-save');
  statusWordsEl = document.getElementById('notes-status-words');
  statusCharsEl = document.getElementById('notes-status-chars');
  statusReadTimeEl = document.getElementById('notes-status-readtime');
  pinBtnEl = document.getElementById('notes-pin-btn');

  if (!editorContainerEl || !textareaEl) return;

  // 1. Textarea input listener (stats, preview, autosave, undo tracking)
  textareaEl.addEventListener('input', () => {
    handleTypingUndo();
    updateStats();
    if (currentViewMode === 'split' || currentViewMode === 'preview') {
      updatePreview();
    }
    scheduleAutosave();
  });

  // 2. Textarea keydown listener (shortcuts, tab, smart enter)
  textareaEl.addEventListener('keydown', handleTextareaKeydown);

  // 3. Title input listener (autosave)
  titleInputEl?.addEventListener('input', () => {
    scheduleAutosave();
  });

  titleInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      textareaEl.focus();
    }
  });

  // 4. View mode buttons
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === 'edit' || mode === 'split' || mode === 'preview') {
        setViewMode(mode);
      }
    });
  });

  // 5. Formatting toolbar buttons
  document.querySelectorAll('[data-format]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const format = btn.dataset.format;
      pushUndoSnapshot(true);

      switch (format) {
        case 'bold':          insertAround('**', '**', 'bold text'); break;
        case 'italic':        insertAround('*', '*', 'italic text'); break;
        case 'strikethrough': insertAround('~~', '~~', 'strikethrough'); break;
        case 'highlight':     applyHighlight(activeHighlightColor); break;
        case 'h1':            insertLinePrefix('# '); break;
        case 'h2':            insertLinePrefix('## '); break;
        case 'h3':            insertLinePrefix('### '); break;
        case 'bullet':        insertLinePrefix('- '); break;
        case 'numbered':      insertLinePrefix('1. '); break;
        case 'check':         insertLinePrefix('- [ ] '); break;
        case 'quote':         insertLinePrefix('> '); break;
        case 'code':          insertAround('`', '`', 'code'); break;
        case 'codeblock':     insertCodeBlock(); break;
        case 'link':          insertLink(); break;
        case 'hr':            insertBlock('\n---\n'); break;
      }
    });
  });

  // 6. Undo & Redo buttons
  document.getElementById('notes-btn-undo')?.addEventListener('click', (e) => {
    e.preventDefault();
    undo();
  });

  document.getElementById('notes-btn-redo')?.addEventListener('click', (e) => {
    e.preventDefault();
    redo();
  });

  // 7. Fullscreen button
  document.getElementById('notes-fullscreen-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleFullscreen();
  });

  // 8. Escape key listener for fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editorContainerEl?.classList.contains('notes-editor--fullscreen')) {
      toggleFullscreen(false);
    }
  });

  // 9. Multi-color highlight palette
  initHighlightPalette();

  // 10. Action buttons
  document.getElementById('notes-export-btn')?.addEventListener('click', exportNote);
  document.getElementById('notes-copy-btn')?.addEventListener('click', copyNoteContent);
  pinBtnEl?.addEventListener('click', toggleCurrentPin);

  // 11. Window resize handler to guard split mode on mobile
  window.addEventListener('resize', () => {
    if (window.innerWidth < 768 && currentViewMode === 'split') {
      setViewMode('edit');
    }
  });

  // Default to split mode on desktop, edit mode on mobile
  setViewMode(window.innerWidth >= 768 ? 'split' : 'edit');
}

