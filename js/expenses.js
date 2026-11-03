/**
 * expenses.js — Expense & Income Tracker Module.
 *
 * Implements:
 *   - LocalStorage persistence for income and expense transactions.
 *   - Total income, total expenses, and net balance calculation.
 *   - Category selection with separate presets for expense and income.
 *   - Multi-criteria filtering: period (All Time, This Month, Last Month),
 *     transaction type (All, Income, Expense), category, and live text search.
 *   - Full transaction CRUD: add, edit, delete with confirmation.
 *   - Input validation, currency formatting, and XSS sanitization.
 *   - Exposes summary metrics for integration with the Dashboard (Step 5).
 */

import Storage from './storage.js';

/* ============================================================
   Constants & Presets
   ============================================================ */

const STORAGE_KEY = 'orbit-expenses';

export const EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Rent & Housing',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Health & Fitness',
  'Education',
  'Personal Care',
  'Travel',
  'Other Expense'
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance & Contract',
  'Investments',
  'Allowance',
  'Gifts',
  'Refunds',
  'Other Income'
];

/* ============================================================
   State
   ============================================================ */

/** @type {Array<Object>} In-memory list of transactions */
let transactions = [];

/** Active filters */
let activeFilter = {
  period: 'this-month', // 'all' | 'this-month' | 'last-month'
  type: 'all',          // 'all' | 'income' | 'expense'
  category: 'all',
  searchQuery: ''
};

/** Editing transaction ID (null if adding a new one) */
let editingTransactionId = null;

/* ============================================================
   Persistence
   ============================================================ */

function load() {
  transactions = Storage.get(STORAGE_KEY, []);
  if (!Array.isArray(transactions)) {
    transactions = [];
  }
}

function save() {
  Storage.set(STORAGE_KEY, transactions);
}

function generateId() {
  return 'tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function generateItemId() {
  return 'item_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Normalizer: extracts line items from a transaction.
 * If legacy transaction without items array, treats it as a single-item transaction.
 * @param {Object} t
 * @returns {Array<Object>}
 */
export function getTransactionItems(t) {
  if (Array.isArray(t.items) && t.items.length > 0) {
    return t.items;
  }
  // Legacy single-item fallback
  return [{
    id: (t.id || 'tx') + '_item0',
    name: t.note || t.category || 'Item',
    amount: Number(t.amount) || 0,
    category: t.category || (t.type === 'income' ? 'Other Income' : 'Other Expense')
  }];
}

/**
 * Helper to get a transaction title.
 * @param {Object} t
 * @returns {string}
 */
export function getTransactionTitle(t) {
  return t.title || t.note || t.category || 'Transaction';
}

/* ============================================================
   Currency & Date Formatting Helpers
   ============================================================ */

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatCurrency(amount) {
  return currencyFormatter.format(amount || 0);
}

export function formatDate(dateString) {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return dateString;

  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/* ============================================================
   CRUD Operations
   ============================================================ */

export function getAllTransactions() {
  return [...transactions].sort((a, b) => {
    // Sort by date descending, then createdAt descending
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

export function getTransaction(id) {
  return transactions.find(t => t.id === id) || null;
}

export function addTransaction({ type, title, amount, category, date, note, items }) {
  const transactionItems = Array.isArray(items) && items.length > 0 ? items : [];
  const totalAmount = transactionItems.length > 0
    ? transactionItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
    : Math.abs(parseFloat(amount) || 0);

  const mainCategory = category || (transactionItems.length === 1 ? transactionItems[0].category : 'Split');

  const transaction = {
    id: generateId(),
    type: type === 'income' ? 'income' : 'expense',
    title: (title || '').trim() || (transactionItems[0]?.name || 'Transaction'),
    amount: totalAmount,
    category: mainCategory,
    date: date || getTodayDateString(),
    note: (note || '').trim(),
    items: transactionItems,
    createdAt: new Date().toISOString()
  };

  transactions.push(transaction);
  save();
  renderExpenses();
  return transaction;
}

export function updateTransaction(id, { type, title, amount, category, date, note, items }) {
  const item = transactions.find(t => t.id === id);
  if (!item) return false;

  const transactionItems = Array.isArray(items) && items.length > 0 ? items : (item.items || []);
  const totalAmount = transactionItems.length > 0
    ? transactionItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
    : Math.abs(parseFloat(amount) || 0);

  const mainCategory = category || (transactionItems.length === 1 ? transactionItems[0].category : 'Split');

  item.type = type === 'income' ? 'income' : 'expense';
  item.title = (title || '').trim() || (transactionItems[0]?.name || item.title || 'Transaction');
  item.amount = totalAmount;
  item.category = mainCategory;
  item.date = date || getTodayDateString();
  item.note = (note || '').trim();
  item.items = transactionItems;
  item.updatedAt = new Date().toISOString();

  save();
  renderExpenses();
  return true;
}

export function deleteTransaction(id) {
  const idx = transactions.findIndex(t => t.id === id);
  if (idx === -1) return false;

  transactions.splice(idx, 1);
  expandedTxIds.delete(id);
  save();
  renderExpenses();
  return true;
}

/* ============================================================
   Calculations & Metrics
   ============================================================ */

/**
 * Calculate financial totals (Income, Expense, Balance) for an array of transactions,
 * counting each nested line item under its own category.
 * @param {Array<Object>} txList
 * @param {string} [categoryFilter] Optional category filter
 */
export function calculateTotals(txList, categoryFilter = null) {
  let income = 0;
  let expenses = 0;

  for (const t of txList) {
    const isIncome = t.type === 'income';
    const items = getTransactionItems(t);
    for (const item of items) {
      if (categoryFilter && categoryFilter !== 'all' && item.category !== categoryFilter) {
        continue;
      }
      const amt = Number(item.amount) || 0;
      if (isIncome) {
        income += amt;
      } else {
        expenses += amt;
      }
    }
  }

  const balance = income - expenses;
  return { income, expenses, balance };
}

/**
 * Get monthly summary metrics (used by the Dashboard in Step 5).
 * @param {number} [targetYear] - Full year (e.g. 2026). Defaults to current year.
 * @param {number} [targetMonth] - 1-based month (1 = Jan). Defaults to current month.
 */
export function getMonthlySummary(targetYear, targetMonth) {
  const now = new Date();
  const year = targetYear || now.getFullYear();
  const month = targetMonth || (now.getMonth() + 1);
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  const monthTxs = transactions.filter(t => t.date && t.date.startsWith(monthPrefix));
  return calculateTotals(monthTxs);
}

/* ============================================================
   Filtering
   ============================================================ */

function getFilteredTransactions() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Last month calculation
  const lastMonthDate = new Date(currentYear, now.getMonth() - 1, 1);
  const lastYear = lastMonthDate.getFullYear();
  const lastMonth = lastMonthDate.getMonth() + 1;

  const thisMonthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const lastMonthPrefix = `${lastYear}-${String(lastMonth).padStart(2, '0')}`;

  return getAllTransactions().filter(t => {
    // 1. Period filter
    if (activeFilter.period === 'this-month') {
      if (!t.date.startsWith(thisMonthPrefix)) return false;
    } else if (activeFilter.period === 'last-month') {
      if (!t.date.startsWith(lastMonthPrefix)) return false;
    }

    // 2. Type filter
    if (activeFilter.type !== 'all') {
      if (t.type !== activeFilter.type) return false;
    }

    // 3. Category filter: check if any nested item matches the active category
    if (activeFilter.category !== 'all') {
      const items = getTransactionItems(t);
      const hasCat = items.some(it => it.category === activeFilter.category);
      if (!hasCat) return false;
    }

    // 4. Text search: check title, note, item names, and item categories
    if (activeFilter.searchQuery) {
      const q = activeFilter.searchQuery.toLowerCase();
      const titleMatch = (t.title || '').toLowerCase().includes(q);
      const noteMatch = (t.note || '').toLowerCase().includes(q);
      const items = getTransactionItems(t);
      const itemMatch = items.some(it =>
        (it.name || '').toLowerCase().includes(q) ||
        (it.category || '').toLowerCase().includes(q)
      );
      if (!titleMatch && !noteMatch && !itemMatch) return false;
    }

    return true;
  });
}

/* ============================================================
   DOM Rendering
   ============================================================ */

export function renderExpenses() {
  const filtered = getFilteredTransactions();
  const totals = calculateTotals(filtered, activeFilter.category);

  // 1. Render Summary Cards
  const incomeEl = document.getElementById('expense-stat-income');
  const expensesEl = document.getElementById('expense-stat-expenses');
  const balanceEl = document.getElementById('expense-stat-balance');

  if (incomeEl) incomeEl.textContent = formatCurrency(totals.income);
  if (expensesEl) expensesEl.textContent = formatCurrency(totals.expenses);
  if (balanceEl) {
    balanceEl.textContent = formatCurrency(totals.balance);
    balanceEl.classList.remove('balance-positive', 'balance-negative');
    if (totals.balance > 0) {
      balanceEl.classList.add('balance-positive');
    } else if (totals.balance < 0) {
      balanceEl.classList.add('balance-negative');
    }
  }

  // 2. Render Category Breakdown
  renderCategoryBreakdown(filtered);

  // 3. Render Transactions List
  const listEl = document.getElementById('expense-list');
  const countBadgeEl = document.getElementById('expense-count-badge');
  const toggleAllBtn = document.getElementById('expense-toggle-all-btn');

  if (countBadgeEl) {
    countBadgeEl.textContent = `${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`;
  }

  if (!listEl) return;

  if (filtered.length === 0) {
    if (toggleAllBtn) toggleAllBtn.style.display = 'none';
    listEl.innerHTML = `
      <div class="empty-state" style="padding: var(--space-12) var(--space-4);">
        <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="6" width="20" height="14" rx="2"/>
          <path d="M2 10h20"/>
          <path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>
        </svg>
        <p class="empty-state__title">No transactions found</p>
        <p class="empty-state__description">
          ${transactions.length === 0
            ? 'Start recording your income and expenses to view summaries and breakdowns.'
            : 'No transactions match the selected filters. Try adjusting your filter criteria.'}
        </p>
        ${transactions.length === 0
          ? '<button class="btn btn--primary" id="expense-empty-add-btn">Add Your First Transaction</button>'
          : '<button class="btn btn--secondary btn--sm" id="expense-empty-reset-btn">Reset Filters</button>'}
      </div>
    `;

    document.getElementById('expense-empty-add-btn')?.addEventListener('click', () => openModal());
    document.getElementById('expense-empty-reset-btn')?.addEventListener('click', resetFilters);
    return;
  }

  // Group transactions by date
  const groupsByDate = new Map();
  filtered.forEach(t => {
    if (!groupsByDate.has(t.date)) {
      groupsByDate.set(t.date, []);
    }
    groupsByDate.get(t.date).push(t);
  });

  const sortedDates = [...groupsByDate.keys()].sort((a, b) => b.localeCompare(a));

  // Expand the first date by default on initial load
  if (!hasInitializedExpandedDates && sortedDates.length > 0) {
    expandedDates.add(sortedDates[0]);
    hasInitializedExpandedDates = true;
  }

  // Update Expand All / Collapse All button
  if (toggleAllBtn) {
    toggleAllBtn.style.display = 'inline-flex';
    const allExpanded = sortedDates.length > 0 && sortedDates.every(d => expandedDates.has(d));
    toggleAllBtn.textContent = allExpanded ? 'Collapse All' : 'Expand All';
    toggleAllBtn.onclick = () => {
      if (allExpanded) {
        expandedDates.clear();
      } else {
        sortedDates.forEach(d => expandedDates.add(d));
      }
      renderExpenses();
    };
  }

  // Render day groups
  listEl.innerHTML = `
    <div class="expense-day-groups" role="region" aria-label="Transactions grouped by date">
      ${sortedDates.map(d => renderDayGroup(d, groupsByDate.get(d))).join('')}
    </div>
  `;

  // Attach event handlers
  // Day header toggle (click & keyboard)
  listEl.querySelectorAll('[data-action="toggle-day"]').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const dateStr = header.dataset.date;
      if (expandedDates.has(dateStr)) {
        expandedDates.delete(dateStr);
      } else {
        expandedDates.add(dateStr);
      }
      renderExpenses();
    });

    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('button')) return;
        e.preventDefault();
        header.click();
      }
    });
  });

  // Main transaction row toggle (click & keyboard)
  listEl.querySelectorAll('[data-action="toggle-tx"]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = row.dataset.id;
      if (expandedTxIds.has(id)) {
        expandedTxIds.delete(id);
      } else {
        expandedTxIds.add(id);
      }
      renderExpenses();
    });

    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('button')) return;
        e.preventDefault();
        row.click();
      }
    });
  });

  // Quick "+ Add" to specific date
  listEl.querySelectorAll('[data-action="quick-add-date"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dateStr = btn.dataset.date;
      openModal();
      setCalendarDate(dateStr);
      document.getElementById('expense-title')?.focus();
    });
  });

  // Edit transaction
  listEl.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      openModal(id);
    });
  });

  // Delete transaction
  listEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const t = getTransaction(id);
      if (!t) return;

      const confirmMsg = `Delete ${t.type} "${getTransactionTitle(t)} (${formatCurrency(t.amount)})" and all its items?`;
      if (confirm(confirmMsg)) {
        deleteTransaction(id);
      }
    });
  });
}

const expandedDates = new Set();
let hasInitializedExpandedDates = false;
const expandedTxIds = new Set();

/**
 * Render Category Breakdown Card based on current filtered items.
 * Each item is counted under its own category.
 * @param {Array<Object>} txList
 */
function renderCategoryBreakdown(txList) {
  const container = document.getElementById('expense-category-breakdown');
  const badgeTotal = document.getElementById('expense-breakdown-total');
  if (!container) return;

  const categoryMap = new Map();
  let totalExpenses = 0;

  txList.forEach(t => {
    if (t.type !== 'expense') return;
    const items = getTransactionItems(t);
    items.forEach(item => {
      if (activeFilter.category !== 'all' && item.category !== activeFilter.category) {
        return;
      }
      const cat = item.category || 'Other Expense';
      const amt = Number(item.amount) || 0;
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + amt);
      totalExpenses += amt;
    });
  });

  if (badgeTotal) {
    badgeTotal.textContent = `Expenses: ${formatCurrency(totalExpenses)}`;
  }

  if (totalExpenses === 0 || categoryMap.size === 0) {
    container.innerHTML = `
      <div class="category-breakdown-empty">
        <p>No expense data to display for the selected period.</p>
      </div>
    `;
    return;
  }

  // Sort categories descending by expense amount
  const sortedCategories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);

  container.innerHTML = `
    <div class="category-bars-list">
      ${sortedCategories.map(([cat, amt]) => {
        const pct = totalExpenses > 0 ? ((amt / totalExpenses) * 100).toFixed(1) : 0;
        return `
          <div class="category-bar-item" data-category="${escapeHtml(cat)}" title="Click to filter by ${escapeHtml(cat)}" role="button" tabindex="0">
            <div class="category-bar-header">
              <div class="category-bar-name">
                <span class="category-bar-dot"></span>
                <span>${escapeHtml(cat)}</span>
              </div>
              <div class="category-bar-values">
                <span class="category-bar-amt">${formatCurrency(amt)}</span>
                <span class="category-bar-pct">(${pct}%)</span>
              </div>
            </div>
            <div class="category-bar-track">
              <div class="category-bar-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Clicking on category bar filters by that category
  container.querySelectorAll('.category-bar-item').forEach(bar => {
    const handleCategoryClick = () => {
      const cat = bar.dataset.category;
      if (activeFilter.category === cat) {
        activeFilter.category = 'all';
      } else {
        activeFilter.category = cat;
      }
      const catSelect = document.getElementById('expense-filter-category');
      if (catSelect) catSelect.value = activeFilter.category;
      renderExpenses();
    };

    bar.addEventListener('click', handleCategoryClick);
    bar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCategoryClick();
      }
    });
  });
}

function renderDayTotals(dayIncome, dayExpenses, dayNet) {
  if (dayIncome > 0 && dayExpenses > 0) {
    const netClass = dayNet >= 0 ? 'color: var(--color-success);' : 'color: var(--color-danger);';
    const netSign = dayNet >= 0 ? '+' : '';
    return `
      <span class="day-total--income">+${formatCurrency(dayIncome)}</span>
      <span class="day-total-sep">/</span>
      <span class="day-total--expense">-${formatCurrency(dayExpenses)}</span>
      <span class="day-net-label" style="${netClass}">(${netSign}${formatCurrency(dayNet)})</span>
    `;
  }
  if (dayIncome > 0) {
    return `<span class="day-total--income">Total: +${formatCurrency(dayIncome)}</span>`;
  }
  return `<span class="day-total--expense">Total: -${formatCurrency(dayExpenses)}</span>`;
}

function renderMainTransactionCard(t) {
  const isIncome = t.type === 'income';
  const amountClass = isIncome ? 'tx-amount--income' : 'tx-amount--expense';
  const sign = isIncome ? '+' : '-';
  const badgeClass = isIncome ? 'badge--success' : 'badge--primary';
  const items = getTransactionItems(t);
  const title = getTransactionTitle(t);
  const isExpanded = expandedTxIds.has(t.id);

  const isSingle = items.length === 1;
  const countBadge = isSingle
    ? `<span class="main-tx-category-badge">${escapeHtml(items[0].category || t.category || 'General')}</span>`
    : `<span class="main-tx-item-badge">${items.length} items</span>`;

  return `
    <div class="main-tx-card ${isExpanded ? 'is-expanded' : ''}" data-tx-id="${t.id}">
      <div class="main-tx-row" data-action="toggle-tx" data-id="${t.id}" role="button" tabindex="0" aria-expanded="${isExpanded}">
        <div class="main-tx-left">
          <svg class="main-tx-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span class="badge ${badgeClass}">${isIncome ? 'Income' : 'Expense'}</span>
          <div class="main-tx-info">
            <div class="main-tx-title-row">
              <span class="main-tx-title">${escapeHtml(title)}</span>
              ${countBadge}
            </div>
            ${t.note ? `<span class="main-tx-note" title="${escapeHtml(t.note)}">${escapeHtml(t.note)}</span>` : ''}
          </div>
        </div>

        <div class="main-tx-right">
          <span class="main-tx-amount ${amountClass}">
            ${sign} ${formatCurrency(t.amount)}
          </span>
          <div class="tx-action-btns">
            <button type="button" class="btn btn--icon btn--sm" data-action="edit" data-id="${t.id}" title="Edit transaction" aria-label="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button type="button" class="btn btn--icon btn--sm tx-btn--delete" data-action="delete" data-id="${t.id}" title="Delete transaction" aria-label="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Expanded Items Breakdown -->
      <div class="main-tx-breakdown" id="tx-breakdown-${t.id}">
        <table class="tx-items-table" aria-label="Items for ${escapeHtml(title)}">
          <thead>
            <tr>
              <th class="tx-item-num">#</th>
              <th>Item Name</th>
              <th>Category</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it, idx) => `
              <tr>
                <td class="tx-item-num">${idx + 1}</td>
                <td class="tx-item-name">${escapeHtml(it.name || '—')}</td>
                <td class="tx-item-cat"><span class="badge badge--neutral">${escapeHtml(it.category || 'Other')}</span></td>
                <td class="tx-item-amt" style="text-align: right;">${formatCurrency(it.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3">Total (${items.length} ${items.length === 1 ? 'item' : 'items'})</td>
              <td class="tx-items-footer-amt" style="text-align: right;">${formatCurrency(t.amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function renderDayGroup(dateStr, txs) {
  let dayIncome = 0;
  let dayExpenses = 0;
  txs.forEach(t => {
    if (t.type === 'income') dayIncome += Number(t.amount) || 0;
    else dayExpenses += Number(t.amount) || 0;
  });
  const dayNet = dayIncome - dayExpenses;
  const isExpanded = expandedDates.has(dateStr);
  const isToday = (dateStr === getTodayDateString());
  const isYesterday = (dateStr === getYesterdayDateString());
  const formattedDate = formatDate(dateStr);

  return `
    <div class="expense-day-group ${isExpanded ? 'is-expanded' : ''}" data-date="${dateStr}">
      <div class="expense-day-header" data-action="toggle-day" data-date="${dateStr}" role="button" tabindex="0" aria-expanded="${isExpanded}">
        <div class="expense-day-header__left">
          <svg class="expense-day-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <div class="expense-day-title-wrap">
            <span class="expense-day-date">${escapeHtml(formattedDate)}</span>
            ${isToday ? '<span class="badge badge--primary day-badge">Today</span>' : ''}
            ${isYesterday ? '<span class="badge badge--secondary day-badge">Yesterday</span>' : ''}
          </div>
          <span class="expense-day-count">${txs.length} transaction${txs.length === 1 ? '' : 's'}</span>
        </div>

        <div class="expense-day-header__right">
          <div class="expense-day-totals">
            ${renderDayTotals(dayIncome, dayExpenses, dayNet)}
          </div>
          <button type="button" class="btn btn--xs btn--secondary btn--day-add" data-action="quick-add-date" data-date="${dateStr}" title="Add transaction on this day">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px; margin-right: 3px;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add
          </button>
        </div>
      </div>

      <div class="expense-day-body ${isExpanded ? 'is-expanded' : ''}">
        <div class="main-tx-list" role="list">
          ${txs.map(t => renderMainTransactionCard(t)).join('')}
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
   Calendar Component (Transaction Modal)
   ============================================================ */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

let calViewYear = new Date().getFullYear();
let calViewMonth = new Date().getMonth(); // 0-11
let calSelectedDate = getTodayDateString();

function getYesterdayDateString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function populateYearSelect(centerYear) {
  const yearSelect = document.getElementById('expense-cal-year-select');
  if (!yearSelect) return;
  const startYear = centerYear - 5;
  const endYear = centerYear + 2;
  const options = [];
  for (let y = startYear; y <= endYear; y++) {
    options.push(`<option value="${y}">${y}</option>`);
  }
  yearSelect.innerHTML = options.join('');
}

function ensureYearOption(year) {
  const yearSelect = document.getElementById('expense-cal-year-select');
  if (!yearSelect) return;
  let exists = false;
  for (let i = 0; i < yearSelect.options.length; i++) {
    if (parseInt(yearSelect.options[i].value, 10) === year) {
      exists = true;
      break;
    }
  }
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = year;
    opt.textContent = year;
    if (yearSelect.options.length > 0 && year < parseInt(yearSelect.options[0].value, 10)) {
      yearSelect.insertBefore(opt, yearSelect.firstChild);
    } else {
      yearSelect.appendChild(opt);
    }
  }
  yearSelect.value = year;
}

function updateCalendarSelectedDisplay(dateStr) {
  const displayEl = document.getElementById('expense-cal-selected-display');
  if (!displayEl) return;
  if (!dateStr) {
    displayEl.textContent = 'No date selected';
    return;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const formatted = dateObj.toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  displayEl.textContent = formatted;
}

function renderCalendarGrid() {
  const monthSelect = document.getElementById('expense-cal-month-select');
  const yearSelect = document.getElementById('expense-cal-year-select');
  const gridEl = document.getElementById('expense-cal-grid');

  if (monthSelect) monthSelect.value = calViewMonth;
  if (yearSelect) yearSelect.value = calViewYear;
  if (!gridEl) return;

  const todayStr = getTodayDateString();

  // First day of viewed month (0 = Sun, 6 = Sat)
  const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
  // Total days in viewed month
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  // Total days in previous month
  const daysInPrevMonth = new Date(calViewYear, calViewMonth, 0).getDate();

  let html = '';

  // Trailing days from previous month
  const prevYear = calViewMonth === 0 ? calViewYear - 1 : calViewYear;
  const prevMonth = calViewMonth === 0 ? 12 : calViewMonth; // 1-indexed

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isSelected = dateStr === calSelectedDate;
    const isToday = dateStr === todayStr;
    html += `
      <button type="button" class="calendar-day-btn is-outside${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}"
              data-date="${dateStr}" aria-label="${dateStr}" ${isSelected ? 'aria-selected="true"' : ''}>
        ${d}
      </button>
    `;
  }

  // Days in current month
  const currMonth = calViewMonth + 1; // 1-indexed
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calViewYear}-${String(currMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isSelected = dateStr === calSelectedDate;
    const isToday = dateStr === todayStr;
    html += `
      <button type="button" class="calendar-day-btn${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}"
              data-date="${dateStr}" aria-label="${dateStr}" ${isSelected ? 'aria-selected="true"' : ''}>
        ${d}
      </button>
    `;
  }

  // Leading days from next month to complete row
  const totalCells = firstDay + daysInMonth;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  const nextYear = calViewMonth === 11 ? calViewYear + 1 : calViewYear;
  const nextMonth = calViewMonth === 11 ? 1 : calViewMonth + 2; // 1-indexed

  for (let d = 1; d <= remainingCells; d++) {
    const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isSelected = dateStr === calSelectedDate;
    const isToday = dateStr === todayStr;
    html += `
      <button type="button" class="calendar-day-btn is-outside${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}"
              data-date="${dateStr}" aria-label="${dateStr}" ${isSelected ? 'aria-selected="true"' : ''}>
        ${d}
      </button>
    `;
  }

  gridEl.innerHTML = html;
}

export function setCalendarDate(dateStr) {
  if (!dateStr) return;
  calSelectedDate = dateStr;

  const [yStr, mStr] = dateStr.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1; // 0-indexed

  if (!isNaN(y) && !isNaN(m)) {
    calViewYear = y;
    calViewMonth = m;
    ensureYearOption(y);
  }

  const dateInput = document.getElementById('expense-date');
  if (dateInput) {
    dateInput.value = dateStr;
  }

  updateCalendarSelectedDisplay(dateStr);
  renderCalendarGrid();
}

function initCalendar() {
  const monthSelect = document.getElementById('expense-cal-month-select');
  const yearSelect = document.getElementById('expense-cal-year-select');
  const prevBtn = document.getElementById('expense-cal-prev');
  const nextBtn = document.getElementById('expense-cal-next');
  const gridEl = document.getElementById('expense-cal-grid');

  if (!monthSelect || !yearSelect || !gridEl) return;

  // 1. Month options
  monthSelect.innerHTML = MONTH_NAMES.map((m, idx) => `<option value="${idx}">${m}</option>`).join('');

  // 2. Year options
  const currentYear = new Date().getFullYear();
  populateYearSelect(currentYear);

  // 3. Navigation controls
  prevBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (calViewMonth === 0) {
      calViewMonth = 11;
      calViewYear--;
    } else {
      calViewMonth--;
    }
    ensureYearOption(calViewYear);
    renderCalendarGrid();
  });

  nextBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (calViewMonth === 11) {
      calViewMonth = 0;
      calViewYear++;
    } else {
      calViewMonth++;
    }
    ensureYearOption(calViewYear);
    renderCalendarGrid();
  });

  // 4. Dropdowns
  monthSelect.addEventListener('change', (e) => {
    calViewMonth = parseInt(e.target.value, 10);
    renderCalendarGrid();
  });

  yearSelect.addEventListener('change', (e) => {
    calViewYear = parseInt(e.target.value, 10);
    renderCalendarGrid();
  });

  // 5. Preset buttons (Today / Yesterday)
  document.querySelectorAll('.calendar-preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const preset = e.currentTarget.getAttribute('data-preset');
      if (preset === 'today') {
        setCalendarDate(getTodayDateString());
      } else if (preset === 'yesterday') {
        setCalendarDate(getYesterdayDateString());
      }
    });
  });

  // 6. Grid day selection delegation
  gridEl.addEventListener('click', (e) => {
    const dayBtn = e.target.closest('.calendar-day-btn');
    if (!dayBtn) return;
    e.preventDefault();
    const dateStr = dayBtn.getAttribute('data-date');
    if (dateStr) {
      setCalendarDate(dateStr);
    }
  });

  // 7. Toggle expand / collapse of calendar window
  const toggleBtn = document.getElementById('expense-calendar-toggle-btn');
  toggleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleCalendarCollapse();
  });

  // Initial render
  setCalendarDate(getTodayDateString());
}

function toggleCalendarCollapse(forceOpen = null) {
  const wrapEl = document.getElementById('expense-calendar-wrap');
  const toggleBtn = document.getElementById('expense-calendar-toggle-btn');
  const labelEl = document.getElementById('expense-calendar-toggle-label');
  const chevronEl = document.getElementById('expense-calendar-chevron');

  if (!wrapEl) return;

  const isCurrentlyOpen = wrapEl.style.display !== 'none';
  const shouldOpen = forceOpen !== null ? forceOpen : !isCurrentlyOpen;

  if (shouldOpen) {
    wrapEl.style.display = 'block';
    if (toggleBtn) {
      toggleBtn.classList.add('is-active');
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
    if (labelEl) labelEl.textContent = 'Hide Calendar';
    if (chevronEl) chevronEl.style.transform = 'rotate(180deg)';
    renderCalendarGrid();
  } else {
    wrapEl.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.classList.remove('is-active');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
    if (labelEl) labelEl.textContent = 'Change Date';
    if (chevronEl) chevronEl.style.transform = 'rotate(0deg)';
  }
}

/* ============================================================
   Transaction Modal & Dynamic Line Items (Split Transactions)
   ============================================================ */

/**
 * Append a new line item row to the modal's items container.
 * @param {Object} [itemData] Optional prefilled data { id, name, amount, category }
 * @returns {HTMLElement} The created item row element
 */
function addItemRow(itemData = null) {
  const listEl = document.getElementById('expense-items-list');
  if (!listEl) return null;

  const currentType = document.querySelector('input[name="expense-type"]:checked')?.value || 'expense';
  const categories = currentType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const row = document.createElement('div');
  row.className = 'expense-item-row';
  const itemId = itemData?.id || generateItemId();
  row.dataset.itemId = itemId;

  const itemName = itemData?.name || '';
  const itemAmount = (itemData?.amount != null && itemData.amount !== '') ? itemData.amount : '';
  const itemCategory = itemData?.category || categories[0];

  row.innerHTML = `
    <div class="expense-item-row__fields">
      <input type="text" class="input input--sm expense-item-name" placeholder="Item name (e.g. Milk, Detergent)" value="${escapeHtml(itemName)}" maxlength="80">
      <div class="expense-item-prefix-wrap">
        <span class="expense-item-prefix">₹</span>
        <input type="number" class="input input--sm expense-item-amount" placeholder="0.00" step="0.01" min="0.01" value="${itemAmount !== '' ? itemAmount : ''}" required>
      </div>
      <select class="input input--sm expense-item-category">
        ${categories.map(cat => `<option value="${escapeHtml(cat)}" ${cat === itemCategory ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
      </select>
    </div>
    <button type="button" class="btn btn--icon btn--sm btn--remove-item" title="Remove item" aria-label="Remove item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </button>
  `;

  // Remove button handler
  row.querySelector('.btn--remove-item').addEventListener('click', () => {
    const allRows = listEl.querySelectorAll('.expense-item-row');
    if (allRows.length > 1) {
      row.remove();
    } else {
      // Clear fields if it's the last remaining row
      const nameInput = row.querySelector('.expense-item-name');
      const amtInput = row.querySelector('.expense-item-amount');
      if (nameInput) nameInput.value = '';
      if (amtInput) amtInput.value = '';
    }
    updateItemsTotal();
  });

  // Live total update as amounts are entered
  row.querySelector('.expense-item-amount').addEventListener('input', updateItemsTotal);

  listEl.appendChild(row);
  updateItemsTotal();
  return row;
}

/**
 * Recalculate and update the live total displayed inside the modal.
 */
function updateItemsTotal() {
  const listEl = document.getElementById('expense-items-list');
  const totalDisplay = document.getElementById('expense-items-total');
  if (!listEl || !totalDisplay) return;

  let sum = 0;
  listEl.querySelectorAll('.expense-item-amount').forEach(input => {
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) {
      sum += val;
    }
  });

  totalDisplay.textContent = formatCurrency(sum);
}

/**
 * Synchronize category select dropdowns across all item rows when switching Expense vs Income.
 * @param {'expense'|'income'} newType
 */
function updateItemRowCategories(newType) {
  const listEl = document.getElementById('expense-items-list');
  if (!listEl) return;

  const categories = newType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  listEl.querySelectorAll('.expense-item-category').forEach(select => {
    const currentVal = select.value;
    select.innerHTML = categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
    if (categories.includes(currentVal)) {
      select.value = currentVal;
    } else {
      select.value = categories[0];
    }
  });
}

export function openModal(transactionId = null) {
  editingTransactionId = transactionId;
  const modalOverlay = document.getElementById('expense-modal-overlay');
  const modalTitle = document.getElementById('expense-modal-title');
  const form = document.getElementById('expense-form');
  const typeIncomeRadio = document.getElementById('expense-type-income');
  const typeExpenseRadio = document.getElementById('expense-type-expense');
  const titleInput = document.getElementById('expense-title');
  const noteInput = document.getElementById('expense-note');
  const itemsListEl = document.getElementById('expense-items-list');
  const errorMsg = document.getElementById('expense-error-msg');
  const successMsg = document.getElementById('expense-success-msg');

  if (!modalOverlay || !form) return;

  if (errorMsg) errorMsg.style.display = 'none';
  if (successMsg) {
    successMsg.textContent = '';
    successMsg.style.display = 'none';
  }

  // Minimize the calendar by default when opening the modal
  toggleCalendarCollapse(false);

  // Clear existing item rows
  if (itemsListEl) itemsListEl.innerHTML = '';

  if (transactionId) {
    const t = getTransaction(transactionId);
    if (!t) return;

    if (modalTitle) modalTitle.textContent = 'Edit Transaction';
    if (t.type === 'income') {
      typeIncomeRadio.checked = true;
    } else {
      typeExpenseRadio.checked = true;
    }

    if (titleInput) titleInput.value = getTransactionTitle(t);
    setCalendarDate(t.date);
    if (noteInput) noteInput.value = t.note || '';

    // Populate existing nested line items (or normalized legacy item)
    const items = getTransactionItems(t);
    items.forEach(it => addItemRow(it));
  } else {
    if (modalTitle) modalTitle.textContent = 'Add Transaction';
    typeExpenseRadio.checked = true;
    if (titleInput) titleInput.value = '';
    setCalendarDate(getTodayDateString());
    if (noteInput) noteInput.value = '';

    // Add 1 default empty item row
    addItemRow();
  }

  updateItemsTotal();
  modalOverlay.classList.add('visible');
  titleInput?.focus();
}

export function closeModal() {
  const modalOverlay = document.getElementById('expense-modal-overlay');
  if (modalOverlay) {
    modalOverlay.classList.remove('visible');
  }
  const errorMsg = document.getElementById('expense-error-msg');
  if (errorMsg) errorMsg.style.display = 'none';
  const successMsg = document.getElementById('expense-success-msg');
  if (successMsg) {
    successMsg.textContent = '';
    successMsg.style.display = 'none';
  }
  editingTransactionId = null;
}

function handleFormSubmit(e) {
  e.preventDefault();

  const type = document.querySelector('input[name="expense-type"]:checked')?.value || 'expense';
  const titleInput = document.getElementById('expense-title');
  const dateInput = document.getElementById('expense-date');
  const noteInput = document.getElementById('expense-note');
  const errorMsg = document.getElementById('expense-error-msg');
  const itemsListEl = document.getElementById('expense-items-list');

  const title = (titleInput?.value || '').trim();
  const date = dateInput?.value;
  const note = (noteInput?.value || '').trim();

  // Validation 1: Main transaction title
  if (!title) {
    if (errorMsg) {
      errorMsg.textContent = 'Please enter a transaction title.';
      errorMsg.style.display = 'block';
    }
    titleInput?.focus();
    return;
  }

  // Validation 2: Date
  if (!date) {
    if (errorMsg) {
      errorMsg.textContent = 'Please select a valid date.';
      errorMsg.style.display = 'block';
    }
    return;
  }

  // Validation 3: Validate that every item has an amount before saving
  const itemRows = itemsListEl ? itemsListEl.querySelectorAll('.expense-item-row') : [];
  if (itemRows.length === 0) {
    if (errorMsg) {
      errorMsg.textContent = 'Please add at least one item.';
      errorMsg.style.display = 'block';
    }
    return;
  }

  const items = [];
  let totalAmount = 0;

  for (let i = 0; i < itemRows.length; i++) {
    const row = itemRows[i];
    const nameInput = row.querySelector('.expense-item-name');
    const amtInput = row.querySelector('.expense-item-amount');
    const catSelect = row.querySelector('.expense-item-category');

    const itemName = (nameInput?.value || '').trim();
    const amtVal = parseFloat(amtInput?.value);
    const catVal = catSelect?.value;

    if (isNaN(amtVal) || amtVal <= 0) {
      if (errorMsg) {
        errorMsg.textContent = `Please enter a valid amount greater than ₹0.00 for item ${i + 1}${itemName ? ` ("${itemName}")` : ''}.`;
        errorMsg.style.display = 'block';
      }
      amtInput?.focus();
      return;
    }

    totalAmount += amtVal;
    items.push({
      id: row.dataset.itemId || generateItemId(),
      name: itemName || `${title} Item ${i + 1}`,
      amount: amtVal,
      category: catVal
    });
  }

  if (errorMsg) errorMsg.style.display = 'none';

  // Determine main category: if all items share the same category, use it; otherwise 'Split'
  const uniqueCategories = [...new Set(items.map(it => it.category))];
  const mainCategory = uniqueCategories.length === 1 ? uniqueCategories[0] : 'Split';

  if (editingTransactionId) {
    updateTransaction(editingTransactionId, {
      type,
      title,
      amount: totalAmount,
      category: mainCategory,
      date,
      note,
      items
    });
  } else {
    addTransaction({
      type,
      title,
      amount: totalAmount,
      category: mainCategory,
      date,
      note,
      items
    });
  }

  expandedDates.add(date);
  closeModal();
}

/* ============================================================
   Filters & Search
   ============================================================ */

function populateFilterCategories() {
  const select = document.getElementById('expense-filter-category');
  if (!select) return;

  const allCategories = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])].sort();
  select.innerHTML = '<option value="all">All Categories</option>' +
    allCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

function resetFilters() {
  activeFilter = {
    period: 'this-month',
    type: 'all',
    category: 'all',
    searchQuery: ''
  };

  const periodSelect = document.getElementById('expense-filter-period');
  const typeSelect = document.getElementById('expense-filter-type');
  const catSelect = document.getElementById('expense-filter-category');
  const searchInput = document.getElementById('expense-search-input');

  if (periodSelect) periodSelect.value = 'this-month';
  if (typeSelect) typeSelect.value = 'all';
  if (catSelect) catSelect.value = 'all';
  if (searchInput) searchInput.value = '';

  renderExpenses();
}

/* ============================================================
   Initialization
   ============================================================ */

export function initExpenses() {
  load();

  // 1. Initial category population for filter dropdown
  populateFilterCategories();

  // 2. Initialize modal calendar widget
  initCalendar();

  // 3. Add Transaction Button
  document.getElementById('expense-add-btn')?.addEventListener('click', () => openModal());

  // 4. Modal close and cancel buttons
  document.getElementById('expense-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('expense-modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('expense-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'expense-modal-overlay') closeModal();
  });

  // Modal Escape key support
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('expense-modal-overlay');
      if (modal && modal.classList.contains('visible')) {
        closeModal();
      }
    }
  });

  // 5. Form type radio change (Income vs Expense updates line item categories)
  document.querySelectorAll('input[name="expense-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      updateItemRowCategories(e.target.value);
    });
  });

  // 6. Form line item: Add Another Item button
  document.getElementById('expense-add-item-btn')?.addEventListener('click', () => {
    const newRow = addItemRow();
    newRow?.querySelector('.expense-item-name')?.focus();
  });

  // 7. Form submission
  document.getElementById('expense-form')?.addEventListener('submit', handleFormSubmit);

  // 8. Filter Controls
  document.getElementById('expense-filter-period')?.addEventListener('change', (e) => {
    activeFilter.period = e.target.value;
    renderExpenses();
  });

  document.getElementById('expense-filter-type')?.addEventListener('change', (e) => {
    activeFilter.type = e.target.value;
    renderExpenses();
  });

  document.getElementById('expense-filter-category')?.addEventListener('change', (e) => {
    activeFilter.category = e.target.value;
    renderExpenses();
  });

  let searchDebounce = null;
  document.getElementById('expense-search-input')?.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      activeFilter.searchQuery = e.target.value.trim();
      renderExpenses();
    }, 200);
  });

  document.getElementById('expense-reset-filters-btn')?.addEventListener('click', resetFilters);

  // 9. Initial render
  renderExpenses();
}

