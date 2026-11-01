/**
 * ui.js — Theme toggling, view navigation, and sidebar controls.
 *
 * Manages three pieces of UI state:
 *   1. Theme (light / dark) — saved in localStorage.
 *   2. Active view (dashboard / notes / expenses / routines) — driven by URL hash.
 *   3. Sidebar collapsed state — saved in localStorage.
 */

import Storage from './storage.js';

/* ============================================================
   Constants
   ============================================================ */

const THEME_KEY    = 'orbit-theme';
const SIDEBAR_KEY  = 'orbit-sidebar-collapsed';
const VIEWS        = ['dashboard', 'notes', 'expenses', 'routines'];

/* ============================================================
   Theme
   ============================================================ */

/**
 * Determine the initial theme: saved preference > OS preference > light.
 */
function getPreferredTheme() {
  const saved = Storage.get(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Apply a theme to the document and persist the choice.
 * @param {'light'|'dark'} theme
 */
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  Storage.set(THEME_KEY, theme);
  updateThemeUI(theme);
}

/** Update the visual label, icons, and ARIA state of all theme toggle buttons. */
function updateThemeUI(theme) {
  const isDark = theme === 'dark';
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.setAttribute('aria-checked', String(isDark));
    btn.setAttribute('aria-label', isDark ? 'Switch to Day mode' : 'Switch to Night mode');
    btn.title = isDark ? 'Switch to Day mode' : 'Switch to Night mode';
    const label = btn.querySelector('.theme-toggle__label');
    if (label) {
      label.textContent = isDark ? 'Night Mode' : 'Day Mode';
    }
  });
}

/** Toggle between light (day) and dark (night) mode. */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
}

/* ============================================================
   Navigation / Router
   ============================================================ */

/** Currently active view name. */
let currentView = 'dashboard';

/** Callbacks invoked whenever active view changes. */
let viewChangeCallbacks = [];

export function onViewChange(fn) {
  if (typeof fn === 'function') {
    viewChangeCallbacks.push(fn);
  }
}

/**
 * Switch the visible view panel and update all nav highlights.
 * @param {string} viewName - One of VIEWS.
 */
function navigateTo(viewName) {
  if (!VIEWS.includes(viewName)) viewName = 'dashboard';
  currentView = viewName;

  // Toggle view visibility
  document.querySelectorAll('.view').forEach(el => {
    el.classList.toggle('active', el.id === `view-${viewName}`);
  });

  // Highlight the matching sidebar nav item
  document.querySelectorAll('.sidebar .nav-item').forEach(link => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });

  // Highlight the matching bottom nav item
  document.querySelectorAll('.bottom-nav__item').forEach(link => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });

  // Update URL hash without triggering hashchange (replaceState avoids
  // adding a new history entry every time you switch tabs)
  if (window.location.hash !== `#${viewName}`) {
    history.replaceState(null, '', `#${viewName}`);
  }

  // Notify registered callbacks
  viewChangeCallbacks.forEach(fn => {
    try { fn(viewName); } catch (err) { console.error(err); }
  });
}

/**
 * Read the current view from the URL hash.
 * Falls back to 'dashboard' if the hash is empty or unrecognized.
 */
function getViewFromHash() {
  const hash = window.location.hash.slice(1);
  return VIEWS.includes(hash) ? hash : 'dashboard';
}

/** @returns {string} The name of the currently active view. */
export function getCurrentView() {
  return currentView;
}

/* ============================================================
   Sidebar
   ============================================================ */

/**
 * Toggle the sidebar between expanded and collapsed on desktop.
 * Persists the state so it survives a page reload.
 */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  Storage.set(SIDEBAR_KEY, sidebar.classList.contains('collapsed'));
}

/** Restore the saved sidebar state on page load. */
function restoreSidebarState() {
  const collapsed = Storage.get(SIDEBAR_KEY, false);
  if (collapsed) {
    document.getElementById('sidebar')?.classList.add('collapsed');
  }
}

/* ============================================================
   Initialization — called once from app.js
   ============================================================ */

export function initUI() {
  // 1. Apply saved theme
  setTheme(getPreferredTheme());

  // 2. Restore sidebar state
  restoreSidebarState();

  // 3. Wire up theme toggle buttons (desktop + mobile)
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
    });
  });

  // 4. Wire up sidebar collapse button
  document.getElementById('sidebar-collapse-btn')
    ?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleSidebar();
    });

  // 5. Wire up logo to dashboard
  document.querySelector('.sidebar__logo')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('dashboard');
  });

  // 6. Wire up sidebar nav items (direct + delegated)
  document.querySelectorAll('.sidebar .nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      if (view) navigateTo(view);
    });
  });

  document.querySelector('.sidebar__nav')?.addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item');
    if (item?.dataset.view) {
      e.preventDefault();
      navigateTo(item.dataset.view);
    }
  });

  // 7. Wire up bottom nav items
  document.querySelector('.bottom-nav')?.addEventListener('click', (e) => {
    const item = e.target.closest('.bottom-nav__item');
    if (item?.dataset.view) {
      e.preventDefault();
      navigateTo(item.dataset.view);
    }
  });

  // 8. Listen for hash changes (e.g. browser back/forward buttons)
  window.addEventListener('hashchange', () => navigateTo(getViewFromHash()));

  // 9. Navigate to the initial view
  navigateTo(getViewFromHash());
}

export { navigateTo };

