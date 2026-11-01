/**
 * dashboard.js — Central Personal Life Manager Overview Module.
 *
 * Pulls and synthesizes data across all Orbit modules:
 *   1. Finances: Month's income, expenses, and net balance (from expenses.js).
 *   2. Routines: Today's habit progress, completion bar, and quick check-off (from routines.js).
 *   3. Notes: Recently edited notes with path breadcrumbs and instant navigation (from notesStore.js).
 *   4. Greeting & Quick Actions: Time-based greeting, live date, and 1-click creation shortcuts.
 */

import { getMonthlySummary, formatCurrency, openModal as openExpenseModal } from './expenses.js';
import { getTodayRoutineProgress, getAllRoutines, toggleRoutine, calculateStreak, openModal as openRoutineModal } from './routines.js';
import * as NotesStore from './notesStore.js';
import { selectItem, renderTree, createNewNote } from './notesTree.js';
import { navigateTo } from './ui.js';

/* ============================================================
   Greeting & Date Helpers
   ============================================================ */

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getFormattedDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
   Rendering
   ============================================================ */

/**
 * Render all dashboard sections with the latest live data.
 */
export function renderDashboard() {
  // 1. Update Greeting & Date
  const greetingEl = document.getElementById('dashboard-greeting');
  const dateEl = document.getElementById('dashboard-date');
  if (greetingEl) greetingEl.textContent = `${getGreeting()}!`;
  if (dateEl) dateEl.textContent = getFormattedDate();

  // 2. Render Financial Summary
  renderFinances();

  // 3. Render Routine Progress
  renderRoutines();

  // 4. Render Recently Edited Notes
  renderRecentNotes();
}

/**
 * Financial metrics section for current month.
 */
function renderFinances() {
  const summary = getMonthlySummary();

  const incomeEl = document.getElementById('dashboard-finance-income');
  const expenseEl = document.getElementById('dashboard-finance-expenses');
  const balanceEl = document.getElementById('dashboard-finance-balance');

  if (incomeEl) incomeEl.textContent = formatCurrency(summary.income);
  if (expenseEl) expenseEl.textContent = formatCurrency(summary.expenses);
  if (balanceEl) {
    balanceEl.textContent = formatCurrency(summary.balance);
    balanceEl.classList.remove('balance-positive', 'balance-negative');
    if (summary.balance > 0) balanceEl.classList.add('balance-positive');
    else if (summary.balance < 0) balanceEl.classList.add('balance-negative');
  }
}

/**
 * Today's routine progress bar & quick check-off habits.
 */
function renderRoutines() {
  const progress = getTodayRoutineProgress();
  const habits = getAllRoutines();

  const pctEl = document.getElementById('dashboard-routine-pct');
  const fillEl = document.getElementById('dashboard-routine-fill');
  const labelEl = document.getElementById('dashboard-routine-label');
  const listEl = document.getElementById('dashboard-routine-list');

  if (pctEl) pctEl.textContent = `${progress.percentage}%`;
  if (fillEl) fillEl.style.width = `${progress.percentage}%`;
  if (labelEl) {
    labelEl.textContent = progress.total > 0
      ? `${progress.completed} of ${progress.total} habits completed`
      : 'No habits added yet';
  }

  if (!listEl) return;

  if (habits.length === 0) {
    listEl.innerHTML = `
      <div class="dash-empty-item">
        <p>No habits configured. Build your first routine to track progress!</p>
        <button id="dash-create-habit-btn" class="btn btn--secondary btn--sm">Add Habit</button>
      </div>
    `;
    document.getElementById('dash-create-habit-btn')?.addEventListener('click', () => {
      navigateTo('routines');
      setTimeout(() => openRoutineModal(), 150);
    });
    return;
  }

  // Display top 4 habits for quick daily check-off
  const topHabits = habits.slice(0, 4);
  listEl.innerHTML = topHabits.map(h => {
    const streak = calculateStreak(h.completedDates || []);
    const isDone = streak.completedToday;

    return `
      <div class="dash-habit-row ${isDone ? 'done' : ''}">
        <button type="button" class="habit-check-btn ${isDone ? 'checked' : ''}"
                data-action="dash-check-habit" data-id="${h.id}"
                aria-label="${isDone ? 'Mark habit incomplete' : 'Mark habit complete'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <div class="dash-habit-info">
          <span class="dash-habit-title ${isDone ? 'completed' : ''}">${escapeHtml(h.title)}</span>
          <span class="dash-habit-streak ${streak.currentStreak >= 3 ? 'hot' : ''}">
            🔥 ${streak.currentStreak}d
          </span>
        </div>
      </div>
    `;
  }).join('');

  // Wire interactive check-off buttons
  listEl.querySelectorAll('[data-action="dash-check-habit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      toggleRoutine(id);
      renderRoutines();
    });
  });
}

/**
 * Most recently updated notes list.
 */
function renderRecentNotes() {
  const listEl = document.getElementById('dashboard-recent-notes');
  if (!listEl) return;

  const allNotes = NotesStore.getAllItems()
    .filter(i => i.type === 'note')
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  if (allNotes.length === 0) {
    listEl.innerHTML = `
      <div class="dash-empty-item">
        <p>No notes created yet. Capture your ideas and knowledge in Markdown!</p>
        <button id="dash-create-note-btn" class="btn btn--secondary btn--sm">Create Note</button>
      </div>
    `;
    document.getElementById('dash-create-note-btn')?.addEventListener('click', () => {
      navigateTo('notes');
      setTimeout(() => createNewNote(), 150);
    });
    return;
  }

  // Display top 5 recently edited notes
  const recentNotes = allNotes.slice(0, 5);

  listEl.innerHTML = recentNotes.map(n => {
    const ancestors = NotesStore.getAncestors(n.id);
    const path = ancestors.length > 0 ? ancestors.map(a => a.name).join(' › ') : 'Root';
    const timeAgo = formatRelativeTime(n.updatedAt || n.createdAt);

    return `
      <div class="dash-note-item" data-action="open-note" data-id="${n.id}">
        <div class="dash-note-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <div class="dash-note-details">
          <div class="dash-note-title">${escapeHtml(n.name)}</div>
          <div class="dash-note-path">${escapeHtml(path)}</div>
        </div>
        <div class="dash-note-time">${timeAgo}</div>
      </div>
    `;
  }).join('');

  // Wire click to jump straight to note in Notes workspace
  listEl.querySelectorAll('[data-action="open-note"]').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      NotesStore.expandToItem(id);
      renderTree();
      selectItem(id);
      navigateTo('notes');
    });
  });
}

/* ============================================================
   Initialization
   ============================================================ */

export function initDashboard() {
  // 1. Quick Action Buttons
  document.getElementById('dash-action-new-note')?.addEventListener('click', () => {
    navigateTo('notes');
    setTimeout(() => createNewNote(), 150);
  });

  document.getElementById('dash-action-add-expense')?.addEventListener('click', () => {
    navigateTo('expenses');
    setTimeout(() => openExpenseModal(), 150);
  });

  document.getElementById('dash-action-add-habit')?.addEventListener('click', () => {
    navigateTo('routines');
    setTimeout(() => openRoutineModal(), 150);
  });

  // 2. Section navigation links
  document.getElementById('dash-link-expenses')?.addEventListener('click', () => navigateTo('expenses'));
  document.getElementById('dash-link-routines')?.addEventListener('click', () => navigateTo('routines'));
  document.getElementById('dash-link-notes')?.addEventListener('click', () => navigateTo('notes'));

  // 3. Re-render whenever user switches views back to dashboard
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#dashboard' || window.location.hash === '') {
      renderDashboard();
    }
  });

  // 4. Initial render
  renderDashboard();
}

