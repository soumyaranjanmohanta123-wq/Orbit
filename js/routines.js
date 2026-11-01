/**
 * routines.js — Daily Habit & Routine Tracker Module.
 *
 * Implements:
 *   - LocalStorage persistence under orbit-routines.
 *   - Habit creation, editing, and deletion with confirmation.
 *   - Accurate consecutive streak calculation (current streak & best streak).
 *   - Time of day filtering (All, Morning, Afternoon, Evening).
 *   - Daily completion progress ring/bar calculation.
 *   - 7-day visual history mini-strip for each habit.
 *   - Interactive check-off with celebratory feedback.
 *   - Exposes getTodayRoutineProgress() for Dashboard integration (Step 5).
 */

import Storage from './storage.js';

/* ============================================================
   Constants & Presets
   ============================================================ */

const STORAGE_KEY = 'orbit-routines';

export const HABIT_CATEGORIES = [
  'Health & Fitness',
  'Mindfulness',
  'Learning & Skill',
  'Productivity',
  'Personal Care',
  'Lifestyle',
  'Other'
];

export const TIME_OF_DAY_OPTIONS = [
  { value: 'anytime', label: 'Anytime' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' }
];

/* ============================================================
   State
   ============================================================ */

/** @type {Array<Object>} In-memory list of routines */
let routines = [];

/** Active time of day filter */
let activeTimeFilter = 'all'; // 'all' | 'morning' | 'afternoon' | 'evening'

/** Editing routine ID (null if creating a new one) */
let editingRoutineId = null;

/* ============================================================
   Persistence
   ============================================================ */

function load() {
  routines = Storage.get(STORAGE_KEY, []);
  if (!Array.isArray(routines)) {
    routines = [];
  }
}

function save() {
  Storage.set(STORAGE_KEY, routines);
}

function generateId() {
  return 'rt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ============================================================
   Date & Streak Helpers
   ============================================================ */

/**
 * Format a Date object to YYYY-MM-DD local date string.
 * @param {Date} date
 * @returns {string} YYYY-MM-DD
 */
export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayDateString() {
  return toDateString(new Date());
}

/**
 * Get date string offset by N days from given date string.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} dayOffset - Negative for past, positive for future
 * @returns {string} YYYY-MM-DD
 */
function offsetDateString(dateStr, dayOffset) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + dayOffset);
  return toDateString(date);
}

/**
 * Calculate current streak and longest streak from completed date strings.
 * @param {Array<string>} completedDates - List of YYYY-MM-DD strings
 * @returns {{ currentStreak: number, bestStreak: number, completedToday: boolean }}
 */
export function calculateStreak(completedDates = []) {
  if (!completedDates || completedDates.length === 0) {
    return { currentStreak: 0, bestStreak: 0, completedToday: false };
  }

  const dateSet = new Set(completedDates);
  const today = getTodayDateString();
  const yesterday = offsetDateString(today, -1);

  const completedToday = dateSet.has(today);

  // 1. Current streak calculation:
  // Streak is alive if completed today OR completed yesterday.
  let currentStreak = 0;
  let checkDate = completedToday ? today : (dateSet.has(yesterday) ? yesterday : null);

  while (checkDate && dateSet.has(checkDate)) {
    currentStreak++;
    checkDate = offsetDateString(checkDate, -1);
  }

  // 2. Best streak calculation:
  // Sort distinct date strings chronologically and find max consecutive run
  const sortedDates = [...dateSet].sort();
  let bestStreak = 0;
  let runningStreak = 0;
  let prevDate = null;

  for (const d of sortedDates) {
    if (!prevDate) {
      runningStreak = 1;
    } else {
      const expectedNext = offsetDateString(prevDate, 1);
      if (d === expectedNext) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
    }
    if (runningStreak > bestStreak) {
      bestStreak = runningStreak;
    }
    prevDate = d;
  }

  return {
    currentStreak,
    bestStreak: Math.max(bestStreak, currentStreak),
    completedToday
  };
}

/**
 * Get the past 7 days metadata for the weekly completion strip.
 * @param {Array<string>} completedDates
 * @returns {Array<{ dateStr: string, dayLetter: string, isToday: boolean, isCompleted: boolean }>}
 */
export function getPast7Days(completedDates = []) {
  const dateSet = new Set(completedDates);
  const today = new Date();
  const days = [];

  const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = toDateString(d);

    days.push({
      dateStr,
      dayLetter: dayLetters[d.getDay()],
      isToday: i === 0,
      isCompleted: dateSet.has(dateStr)
    });
  }

  return days;
}

/* ============================================================
   CRUD Operations
   ============================================================ */

export function getAllRoutines() {
  return [...routines];
}

export function getRoutine(id) {
  return routines.find(r => r.id === id) || null;
}

export function addRoutine({ title, category, timeOfDay }) {
  const routine = {
    id: generateId(),
    title: (title || 'New Habit').trim(),
    category: (category || 'Other').trim(),
    timeOfDay: (timeOfDay || 'anytime').toLowerCase(),
    completedDates: [],
    createdAt: new Date().toISOString()
  };

  routines.push(routine);
  save();
  renderRoutines();
  return routine;
}

export function updateRoutine(id, { title, category, timeOfDay }) {
  const item = routines.find(r => r.id === id);
  if (!item) return false;

  item.title = (title || 'New Habit').trim();
  item.category = (category || 'Other').trim();
  item.timeOfDay = (timeOfDay || 'anytime').toLowerCase();
  item.updatedAt = new Date().toISOString();

  save();
  renderRoutines();
  return true;
}

export function deleteRoutine(id) {
  const idx = routines.findIndex(r => r.id === id);
  if (idx === -1) return false;

  routines.splice(idx, 1);
  save();
  renderRoutines();
  return true;
}

/**
 * Toggle routine completion for a given date (defaults to today).
 * @param {string} id
 * @param {string} [targetDate]
 */
export function toggleRoutine(id, targetDate) {
  const routine = routines.find(r => r.id === id);
  if (!routine) return false;

  const date = targetDate || getTodayDateString();
  const set = new Set(routine.completedDates || []);

  const wasCompleted = set.has(date);
  if (wasCompleted) {
    set.delete(date);
  } else {
    set.add(date);
  }

  routine.completedDates = [...set];
  save();
  renderRoutines();
  return !wasCompleted;
}

/* ============================================================
   Progress Calculation (Used here and on Dashboard)
   ============================================================ */

/**
 * Returns today's routine progress (used by Dashboard in Step 5).
 * @returns {{ total: number, completed: number, percentage: number, text: string }}
 */
export function getTodayRoutineProgress() {
  const today = getTodayDateString();
  const total = routines.length;
  if (total === 0) {
    return { total: 0, completed: 0, percentage: 0, text: 'No habits yet' };
  }

  const completed = routines.filter(r => (r.completedDates || []).includes(today)).length;
  const percentage = Math.round((completed / total) * 100);

  let text = '';
  if (completed === total) {
    text = 'All routines completed today! Outstanding!';
  } else if (completed === 0) {
    text = 'Ready to start? Check off your first habit.';
  } else {
    text = `${completed} of ${total} habits finished. Keep the momentum going!`;
  }

  return { total, completed, percentage, text };
}

/* ============================================================
   Filtering
   ============================================================ */

function getFilteredRoutines() {
  if (activeTimeFilter === 'all') {
    return getAllRoutines();
  }
  return routines.filter(r => r.timeOfDay === activeTimeFilter);
}

/* ============================================================
   DOM Rendering
   ============================================================ */

export function renderRoutines() {
  const filtered = getFilteredRoutines();
  const progress = getTodayRoutineProgress();

  // 1. Render Progress Banner
  const progressPctEl = document.getElementById('routine-progress-pct');
  const progressFillEl = document.getElementById('routine-progress-fill');
  const progressTextEl = document.getElementById('routine-progress-text');
  const todayDateLabelEl = document.getElementById('routine-today-date');

  if (todayDateLabelEl) {
    todayDateLabelEl.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  }

  if (progressPctEl) progressPctEl.textContent = `${progress.percentage}%`;
  if (progressFillEl) progressFillEl.style.width = `${progress.percentage}%`;
  if (progressTextEl) progressTextEl.textContent = progress.text;

  // 2. Render Habits List / Grid
  const listEl = document.getElementById('routine-list');
  const countBadgeEl = document.getElementById('routine-count-badge');

  if (countBadgeEl) {
    countBadgeEl.textContent = `${filtered.length} habit${filtered.length === 1 ? '' : 's'}`;
  }

  if (!listEl) return;

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" style="padding: var(--space-12) var(--space-4);">
        <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <p class="empty-state__title">No habits found</p>
        <p class="empty-state__description">
          ${routines.length === 0
            ? 'Build positive daily routines. Add habits like reading, working out, or drinking water.'
            : 'No habits match the selected time of day.'}
        </p>
        ${routines.length === 0
          ? '<button class="btn btn--primary" id="routine-empty-add-btn">Add Your First Habit</button>'
          : '<button class="btn btn--secondary btn--sm" id="routine-empty-reset-btn">Show All Habits</button>'}
      </div>
    `;

    document.getElementById('routine-empty-add-btn')?.addEventListener('click', () => openModal());
    document.getElementById('routine-empty-reset-btn')?.addEventListener('click', () => {
      setTimeFilter('all');
    });
    return;
  }

  // Render routine cards
  listEl.innerHTML = `
    <div class="routine-grid">
      ${filtered.map(r => renderRoutineCard(r)).join('')}
    </div>
  `;

  // Attach event listeners for checking off habits
  listEl.querySelectorAll('[data-action="toggle-habit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      toggleRoutine(id);
    });
  });

  // Attach event listeners for 7-day strip dots
  listEl.querySelectorAll('[data-action="toggle-date"]').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = dot.dataset.id;
      const date = dot.dataset.date;
      toggleRoutine(id, date);
    });
  });

  // Attach edit and delete buttons
  listEl.querySelectorAll('[data-action="edit-habit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      openModal(id);
    });
  });

  listEl.querySelectorAll('[data-action="delete-habit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = getRoutine(id);
      if (!item) return;

      if (confirm(`Delete habit "${item.title}"? This will erase all its recorded streaks.`)) {
        deleteRoutine(id);
      }
    });
  });
}

function renderRoutineCard(r) {
  const streak = calculateStreak(r.completedDates || []);
  const pastDays = getPast7Days(r.completedDates || []);
  const isDoneToday = streak.completedToday;

  const streakClass = streak.currentStreak >= 3 ? 'habit-streak--hot' : '';

  return `
    <div class="habit-card ${isDoneToday ? 'habit-card--done' : ''}" data-id="${r.id}">
      <div class="habit-card__main">
        <!-- Big Completion Checkbox Circle -->
        <button type="button" class="habit-check-btn ${isDoneToday ? 'checked' : ''}"
                data-action="toggle-habit" data-id="${r.id}"
                aria-label="${isDoneToday ? 'Mark habit incomplete' : 'Mark habit complete'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>

        <div class="habit-info">
          <div class="habit-title-row">
            <h3 class="habit-title ${isDoneToday ? 'completed' : ''}">${escapeHtml(r.title)}</h3>
          </div>
          <div class="habit-tags">
            <span class="badge badge--primary">${escapeHtml(r.category)}</span>
            <span class="habit-time-tag">${formatTimeTag(r.timeOfDay)}</span>
          </div>
        </div>

        <!-- Action menu buttons (Edit / Delete) -->
        <div class="habit-actions">
          <button class="btn btn--icon btn--sm" data-action="edit-habit" data-id="${r.id}" title="Edit habit" aria-label="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn--icon btn--sm habit-btn--delete" data-action="delete-habit" data-id="${r.id}" title="Delete habit" aria-label="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Footer: Streak count & 7-day mini strip -->
      <div class="habit-card__footer">
        <div class="habit-streak ${streakClass}" title="Current Streak: ${streak.currentStreak} days | Best Streak: ${streak.bestStreak} days">
          <!-- Flame icon -->
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 23c-4.97 0-9-4.03-9-9 0-4.07 2.73-7.5 6.55-8.59.39-.11.75.24.64.63-.52 1.83.21 3.59 1.63 4.29 1.25.61 2.45-.19 2.59-1.57.06-.55.6-.9 1.07-.63C17.65 9.38 19 11.54 19 14c0 .87-.16 1.7-.45 2.47-.19.5.17 1.03.71 1.03h.05c.34 0 .66-.18.82-.48.56-1.03.87-2.22.87-3.48 0-4.47-3.13-8.23-7.39-9.19-.48-.11-.87.32-.72.79.79 2.41-.65 4.96-3.08 5.48-1.77.38-3.41-.35-4.32-1.74-.29-.44-.9-.47-1.19-.05C4.78 10.37 4 12.1 4 14c0 4.41 3.59 8 8 8 3.56 0 6.58-2.33 7.62-5.56.16-.5-.22-1-.74-1-.37 0-.7.24-.83.59-.83 2.37-3.07 4.09-5.69 4.09l-.36-.12z"/>
          </svg>
          <span class="habit-streak__count">${streak.currentStreak} day${streak.currentStreak === 1 ? '' : 's'}</span>
          ${streak.bestStreak > 1 ? `<span class="habit-streak__best">Best: ${streak.bestStreak}</span>` : ''}
        </div>

        <!-- 7-day completion mini dots -->
        <div class="habit-week-strip" role="group" aria-label="Past 7 days completion">
          ${pastDays.map(d => `
            <button type="button" class="habit-day-dot ${d.isCompleted ? 'completed' : ''} ${d.isToday ? 'today' : ''}"
                    data-action="toggle-date" data-id="${r.id}" data-date="${d.dateStr}"
                    title="${d.dateStr}: ${d.isCompleted ? 'Completed' : 'Missed'}">
              <span class="habit-day-letter">${d.dayLetter}</span>
              <span class="habit-day-indicator"></span>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function formatTimeTag(timeOfDay) {
  switch (timeOfDay) {
    case 'morning':   return '🌅 Morning';
    case 'afternoon': return '☀️ Afternoon';
    case 'evening':   return '🌙 Evening';
    default:          return '⭐ Anytime';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
   Habit Modal (Add / Edit)
   ============================================================ */

export function openModal(routineId = null) {
  editingRoutineId = routineId;

  const modalOverlay = document.getElementById('routine-modal-overlay');
  const modalTitle = document.getElementById('routine-modal-title');
  const form = document.getElementById('routine-form');
  const titleInput = document.getElementById('routine-title');
  const categorySelect = document.getElementById('routine-category');
  const timeSelect = document.getElementById('routine-time');
  const errorMsg = document.getElementById('routine-error-msg');

  if (!modalOverlay || !form) return;

  if (errorMsg) errorMsg.style.display = 'none';

  // Populate categories
  if (categorySelect) {
    categorySelect.innerHTML = HABIT_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('');
  }

  // Populate times
  if (timeSelect) {
    timeSelect.innerHTML = TIME_OF_DAY_OPTIONS.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
  }

  if (routineId) {
    // Edit mode
    const item = getRoutine(routineId);
    if (!item) return;

    if (modalTitle) modalTitle.textContent = 'Edit Habit';
    titleInput.value = item.title;
    categorySelect.value = item.category;
    timeSelect.value = item.timeOfDay || 'anytime';
  } else {
    // Add mode
    if (modalTitle) modalTitle.textContent = 'Create New Habit';
    titleInput.value = '';
    categorySelect.value = HABIT_CATEGORIES[0];
    timeSelect.value = 'anytime';
  }

  modalOverlay.classList.add('visible');
  titleInput.focus();
}

export function closeModal() {
  const modalOverlay = document.getElementById('routine-modal-overlay');
  if (modalOverlay) {
    modalOverlay.classList.remove('visible');
  }
  const errorMsg = document.getElementById('routine-error-msg');
  if (errorMsg) errorMsg.style.display = 'none';
  editingRoutineId = null;
}

function handleFormSubmit(e) {
  e.preventDefault();

  const titleInput = document.getElementById('routine-title');
  const categorySelect = document.getElementById('routine-category');
  const timeSelect = document.getElementById('routine-time');
  const errorMsg = document.getElementById('routine-error-msg');

  const title = (titleInput?.value || '').trim();
  const category = categorySelect?.value || 'Other';
  const timeOfDay = timeSelect?.value || 'anytime';

  if (!title) {
    if (errorMsg) {
      errorMsg.textContent = 'Please enter a habit name.';
      errorMsg.style.display = 'block';
    }
    titleInput?.focus();
    return;
  }

  if (editingRoutineId) {
    updateRoutine(editingRoutineId, { title, category, timeOfDay });
  } else {
    addRoutine({ title, category, timeOfDay });
  }

  closeModal();
}

/* ============================================================
   Time Filter Controls
   ============================================================ */

function setTimeFilter(time) {
  activeTimeFilter = time;

  document.querySelectorAll('.routine-time-btn').forEach(btn => {
    const isActive = btn.dataset.time === time;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  renderRoutines();
}

/* ============================================================
   Initialization
   ============================================================ */

export function initRoutines() {
  load();

  // 1. Add Habit button
  document.getElementById('routine-add-btn')?.addEventListener('click', () => openModal());

  // 2. Modal close and cancel buttons
  document.getElementById('routine-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('routine-modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('routine-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'routine-modal-overlay') closeModal();
  });

  // Modal Escape key support
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('routine-modal-overlay');
      if (modal && modal.classList.contains('visible')) {
        closeModal();
      }
    }
  });

  // 3. Form submit handler
  document.getElementById('routine-form')?.addEventListener('submit', handleFormSubmit);

  // 4. Time filter button group
  document.querySelectorAll('.routine-time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimeFilter(btn.dataset.time);
    });
  });

  // 5. Initial render
  renderRoutines();
}

