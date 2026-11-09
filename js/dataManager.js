/**
 * dataManager.js — Complete Data Export & Import Module for Orbit.
 *
 * Provides:
 *   - Full backup export of Notes, Expenses, and Routines to a single JSON file.
 *   - Category-selective export (all or specific modules).
 *   - Safe file parsing and schema validation on import.
 *   - Two restore modes: Merge (safe, non-destructive) and Replace (overwrite).
 *   - Real-time UI synchronization across Notes tree, Expenses list, Routines, and Dashboard.
 */

import { exportNotesData, importNotesData } from './notesStore.js';
import { renderTree } from './notesTree.js';
import { exportExpensesData, importExpensesData } from './expenses.js';
import { exportRoutinesData, importRoutinesData } from './routines.js';
import { renderDashboard } from './dashboard.js';

/* ============================================================
   State
   ============================================================ */

/** Parsed file payload pending import */
let stagedImportPayload = null;

/* ============================================================
   Toast & Alert Helpers
   ============================================================ */

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
    }, 2500);
  });
}

function showAlert(message, type = 'info') {
  const alertEl = document.getElementById('data-modal-alert');
  if (!alertEl) return;

  alertEl.className = `data-modal-alert data-modal-alert--${type}`;
  alertEl.innerHTML = `
    <div class="data-modal-alert__content">
      <span>${escapeHtml(message)}</span>
    </div>
  `;
  alertEl.style.display = 'block';
}

function clearAlert() {
  const alertEl = document.getElementById('data-modal-alert');
  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.textContent = '';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
   Data Counting
   ============================================================ */

export function getDataCounts() {
  const notesData = exportNotesData();
  const notesCount = Array.isArray(notesData?.items) ? notesData.items.length : 0;
  const expensesCount = exportExpensesData().length;
  const routinesCount = exportRoutinesData().length;

  return {
    notes: notesCount,
    expenses: expensesCount,
    routines: routinesCount
  };
}

export function updateDataCountsDisplay() {
  const counts = getDataCounts();
  const notesEl = document.getElementById('data-summary-notes');
  const expensesEl = document.getElementById('data-summary-expenses');
  const routinesEl = document.getElementById('data-summary-routines');

  if (notesEl) notesEl.textContent = `${counts.notes} item${counts.notes === 1 ? '' : 's'}`;
  if (expensesEl) expensesEl.textContent = `${counts.expenses} transaction${counts.expenses === 1 ? '' : 's'}`;
  if (routinesEl) routinesEl.textContent = `${counts.routines} habit${counts.routines === 1 ? '' : 's'}`;
}

/* ============================================================
   Export Data
   ============================================================ */

export function exportBackup() {
  clearAlert();

  const includeNotes = document.getElementById('export-check-notes')?.checked ?? true;
  const includeExpenses = document.getElementById('export-check-expenses')?.checked ?? true;
  const includeRoutines = document.getElementById('export-check-routines')?.checked ?? true;

  if (!includeNotes && !includeExpenses && !includeRoutines) {
    showAlert('Please select at least one data category to export.', 'error');
    return;
  }

  const backupData = {};
  const counts = {};

  if (includeNotes) {
    const notesData = exportNotesData();
    backupData.notes = notesData.items;
    backupData.notesExpanded = notesData.expanded;
    counts.notes = notesData.items.length;
  }

  if (includeExpenses) {
    const expensesData = exportExpensesData();
    backupData.expenses = expensesData;
    counts.expenses = expensesData.length;
  }

  if (includeRoutines) {
    const routinesData = exportRoutinesData();
    backupData.routines = routinesData;
    counts.routines = routinesData.length;
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  const payload = {
    appName: 'Orbit',
    version: '1.0',
    exportedAt: now.toISOString(),
    counts,
    data: backupData
  };

  try {
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const filename = `orbit-backup-${dateStr}.json`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const parts = [];
    if (counts.notes != null) parts.push(`${counts.notes} note(s)/folder(s)`);
    if (counts.expenses != null) parts.push(`${counts.expenses} transaction(s)`);
    if (counts.routines != null) parts.push(`${counts.routines} habit(s)`);

    showAlert(`Exported ${parts.join(', ')} to ${filename}`, 'success');
    showToast(`Downloaded ${filename}`);
  } catch (err) {
    console.error('[DataManager] Export error:', err);
    showAlert('Failed to generate export file. Please try again.', 'error');
  }
}

/* ============================================================
   Import Data
   ============================================================ */

/**
 * Normalize and extract items from parsed JSON content.
 * Accepts:
 *   1. Full Orbit backup: { data: { notes: [], expenses: [], routines: [] } }
 *   2. Direct keys: { notes: [], expenses: [], routines: [] }
 * @param {Object} parsed
 */
function extractImportData(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  const source = parsed.data || parsed;

  const notes = Array.isArray(source.notes) ? source.notes : [];
  const notesExpanded = Array.isArray(source.notesExpanded) ? source.notesExpanded : [];
  const expenses = Array.isArray(source.expenses) ? source.expenses : [];
  const routines = Array.isArray(source.routines) ? source.routines : [];

  if (notes.length === 0 && expenses.length === 0 && routines.length === 0) {
    return null;
  }

  return {
    notes,
    notesExpanded,
    expenses,
    routines
  };
}

/**
 * Handle incoming file selection (via file picker or drag & drop).
 * @param {File} file
 */
export function handleFileSelect(file) {
  clearAlert();
  stagedImportPayload = null;

  const btnImport = document.getElementById('btn-import-backup');
  const previewEl = document.getElementById('data-import-preview');
  const dropzoneText = document.getElementById('data-dropzone-text');

  if (btnImport) btnImport.disabled = true;
  if (previewEl) {
    previewEl.style.display = 'none';
    previewEl.innerHTML = '';
  }

  if (!file) return;

  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    showAlert('Please select a valid .json file.', 'error');
    return;
  }

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const extracted = extractImportData(parsed);

      if (!extracted) {
        showAlert('The selected JSON file does not contain recognizable Orbit data (notes, expenses, or routines).', 'error');
        return;
      }

      stagedImportPayload = extracted;

      // Update dropzone label with file name
      if (dropzoneText) {
        dropzoneText.innerHTML = `Selected: <strong>${escapeHtml(file.name)}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
      }

      // Show preview card
      if (previewEl) {
        previewEl.innerHTML = `
          <div class="data-preview-box">
            <span class="data-preview-title">Ready to import:</span>
            <div class="data-preview-tags">
              <span class="badge badge--primary">${extracted.notes.length} Note(s)</span>
              <span class="badge badge--success">${extracted.expenses.length} Transaction(s)</span>
              <span class="badge badge--secondary">${extracted.routines.length} Habit(s)</span>
            </div>
          </div>
        `;
        previewEl.style.display = 'block';
      }

      if (btnImport) btnImport.disabled = false;
    } catch (err) {
      console.error('[DataManager] File parse error:', err);
      showAlert('Could not parse the file. Please ensure it is a valid JSON file.', 'error');
    }
  };

  reader.onerror = () => {
    showAlert('Failed to read the selected file.', 'error');
  };

  reader.readAsText(file);
}

/**
 * Execute import of the staged payload.
 */
export function executeImport() {
  if (!stagedImportPayload) {
    showAlert('Please select a valid backup file first.', 'error');
    return;
  }

  const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'merge';

  if (mode === 'replace') {
    const confirmMsg = 'Warning: Replace mode will overwrite your current notes, expenses, and habits with the backup file. Are you sure you want to proceed?';
    if (!confirm(confirmMsg)) {
      return;
    }
  }

  let importedNotes = 0;
  let importedExpenses = 0;
  let importedRoutines = 0;

  try {
    // 1. Import Notes
    if (stagedImportPayload.notes.length > 0) {
      importedNotes = importNotesData({
        items: stagedImportPayload.notes,
        expanded: stagedImportPayload.notesExpanded
      }, mode);
      renderTree();
    }

    // 2. Import Expenses
    if (stagedImportPayload.expenses.length > 0) {
      importedExpenses = importExpensesData(stagedImportPayload.expenses, mode);
    }

    // 3. Import Routines
    if (stagedImportPayload.routines.length > 0) {
      importedRoutines = importRoutinesData(stagedImportPayload.routines, mode);
    }

    // 4. Refresh Dashboard
    renderDashboard();

    // 5. Update counts in modal
    updateDataCountsDisplay();

    // Success feedback
    const summary = `${importedNotes} notes/folders, ${importedExpenses} transactions, ${importedRoutines} habits`;
    showAlert(`Successfully imported (${mode === 'replace' ? 'replaced' : 'merged'}): ${summary}.`, 'success');
    showToast(`Data restored: ${summary}`);

    // Reset staged payload & controls
    stagedImportPayload = null;
    const fileInput = document.getElementById('data-import-file');
    if (fileInput) fileInput.value = '';
    const dropzoneText = document.getElementById('data-dropzone-text');
    if (dropzoneText) {
      dropzoneText.innerHTML = '<strong>Click to choose file</strong> or drag & drop here';
    }
    const previewEl = document.getElementById('data-import-preview');
    if (previewEl) {
      previewEl.style.display = 'none';
      previewEl.innerHTML = '';
    }
    const btnImport = document.getElementById('btn-import-backup');
    if (btnImport) btnImport.disabled = true;

  } catch (err) {
    console.error('[DataManager] Import execution error:', err);
    showAlert('An error occurred while importing data. Please check the file format.', 'error');
  }
}

/* ============================================================
   Modal Lifecycle & Drag-and-Drop
   ============================================================ */

export function openDataModal() {
  const overlay = document.getElementById('data-modal-overlay');
  if (!overlay) return;

  clearAlert();
  updateDataCountsDisplay();

  // Reset file selection
  stagedImportPayload = null;
  const fileInput = document.getElementById('data-import-file');
  if (fileInput) fileInput.value = '';

  const dropzoneText = document.getElementById('data-dropzone-text');
  if (dropzoneText) {
    dropzoneText.innerHTML = '<strong>Click to choose file</strong> or drag & drop here';
  }

  const previewEl = document.getElementById('data-import-preview');
  if (previewEl) {
    previewEl.style.display = 'none';
    previewEl.innerHTML = '';
  }

  const btnImport = document.getElementById('btn-import-backup');
  if (btnImport) btnImport.disabled = true;

  overlay.classList.add('visible');
}

export function closeDataModal() {
  const overlay = document.getElementById('data-modal-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
  }
  clearAlert();
  stagedImportPayload = null;
}

/* ============================================================
   Initialization
   ============================================================ */

export function initDataManager() {
  // 1. Triggers to open Data modal
  document.getElementById('sidebar-data-btn')?.addEventListener('click', openDataModal);
  document.getElementById('mobile-data-btn')?.addEventListener('click', openDataModal);
  document.getElementById('dash-action-data')?.addEventListener('click', openDataModal);

  // 2. Modal close triggers
  document.getElementById('data-modal-close')?.addEventListener('click', closeDataModal);
  document.getElementById('data-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'data-modal-overlay') closeDataModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('data-modal-overlay');
      if (overlay && overlay.classList.contains('visible')) {
        closeDataModal();
      }
    }
  });

  // 3. Export button
  document.getElementById('btn-export-backup')?.addEventListener('click', exportBackup);

  // 4. File input & Dropzone
  const fileInput = document.getElementById('data-import-file');
  const dropzone = document.getElementById('data-dropzone');

  dropzone?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  });

  // Drag and drop support
  if (dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('is-dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFileSelect(file);
    });
  }

  // 5. Import execution button
  document.getElementById('btn-import-backup')?.addEventListener('click', executeImport);
}

