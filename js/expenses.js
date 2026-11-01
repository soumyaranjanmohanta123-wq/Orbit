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

/* ============================================================
   Currency & Date Formatting Helpers
   ============================================================ */

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
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

export function addTransaction({ type, amount, category, date, note }) {
  const transaction = {
    id: generateId(),
    type: type === 'income' ? 'income' : 'expense',
    amount: Math.abs(parseFloat(amount) || 0),
    category: (category || 'Other').trim(),
    date: date || getTodayDateString(),
    note: (note || '').trim(),
    createdAt: new Date().toISOString()
  };

  transactions.push(transaction);
  save();
  renderExpenses();
  return transaction;
}

export function updateTransaction(id, { type, amount, category, date, note }) {
  const item = transactions.find(t => t.id === id);
  if (!item) return false;

  item.type = type === 'income' ? 'income' : 'expense';
  item.amount = Math.abs(parseFloat(amount) || 0);
  item.category = (category || 'Other').trim();
  item.date = date || getTodayDateString();
  item.note = (note || '').trim();
  item.updatedAt = new Date().toISOString();

  save();
  renderExpenses();
  return true;
}

export function deleteTransaction(id) {
  const idx = transactions.findIndex(t => t.id === id);
  if (idx === -1) return false;

  transactions.splice(idx, 1);
  save();
  renderExpenses();
  return true;
}

/* ============================================================
   Calculations & Metrics
   ============================================================ */

/**
 * Calculate financial totals (Income, Expense, Balance) for an array of transactions.
 * @param {Array<Object>} txList
 */
export function calculateTotals(txList) {
  let income = 0;
  let expenses = 0;

  for (const t of txList) {
    if (t.type === 'income') {
      income += Number(t.amount) || 0;
    } else {
      expenses += Number(t.amount) || 0;
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

    // 3. Category filter
    if (activeFilter.category !== 'all') {
      if (t.category !== activeFilter.category) return false;
    }

    // 4. Text search (note or category)
    if (activeFilter.searchQuery) {
      const q = activeFilter.searchQuery.toLowerCase();
      const noteMatch = (t.note || '').toLowerCase().includes(q);
      const catMatch = (t.category || '').toLowerCase().includes(q);
      if (!noteMatch && !catMatch) return false;
    }

    return true;
  });
}

/* ============================================================
   DOM Rendering
   ============================================================ */

export function renderExpenses() {
  const filtered = getFilteredTransactions();
  const totals = calculateTotals(filtered);

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

  // 2. Render Transactions List
  const listEl = document.getElementById('expense-list');
  const countBadgeEl = document.getElementById('expense-count-badge');
  if (countBadgeEl) {
    countBadgeEl.textContent = `${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`;
  }

  if (!listEl) return;

  if (filtered.length === 0) {
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

  // Render transaction cards / table
  listEl.innerHTML = `
    <div class="transaction-table-wrapper">
      <table class="transaction-table" aria-label="Transactions">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Category</th>
            <th>Note</th>
            <th style="text-align: right;">Amount</th>
            <th style="text-align: right; width: 80px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(t => renderTransactionRow(t)).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Attach event handlers for edit and delete buttons
  listEl.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      openModal(id);
    });
  });

  listEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const t = getTransaction(id);
      if (!t) return;

      const confirmMsg = `Delete ${t.type} "${t.category} (${formatCurrency(t.amount)})"?`;
      if (confirm(confirmMsg)) {
        deleteTransaction(id);
      }
    });
  });
}

function renderTransactionRow(t) {
  const isIncome = t.type === 'income';
  const amountClass = isIncome ? 'tx-amount--income' : 'tx-amount--expense';
  const sign = isIncome ? '+' : '-';
  const badgeClass = isIncome ? 'badge--success' : 'badge--primary';

  return `
    <tr class="transaction-row" data-id="${t.id}">
      <td class="tx-cell-date">${formatDate(t.date)}</td>
      <td>
        <span class="badge ${badgeClass}">${isIncome ? 'Income' : 'Expense'}</span>
      </td>
      <td class="tx-cell-category">
        <span class="tx-category-name">${escapeHtml(t.category)}</span>
      </td>
      <td class="tx-cell-note">
        ${t.note ? `<span class="tx-note-text" title="${escapeHtml(t.note)}">${escapeHtml(t.note)}</span>` : '<span class="tx-note-empty">—</span>'}
      </td>
      <td class="tx-cell-amount ${amountClass}" style="text-align: right;">
        ${sign} ${formatCurrency(t.amount)}
      </td>
      <td class="tx-cell-actions" style="text-align: right;">
        <div class="tx-action-btns">
          <button class="btn btn--icon btn--sm" data-action="edit" data-id="${t.id}" title="Edit transaction" aria-label="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn--icon btn--sm tx-btn--delete" data-action="delete" data-id="${t.id}" title="Delete transaction" aria-label="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
   Transaction Modal (Add / Edit)
   ============================================================ */

export function openModal(transactionId = null) {
  editingTransactionId = transactionId;
  const modalOverlay = document.getElementById('expense-modal-overlay');
  const modalTitle = document.getElementById('expense-modal-title');
  const form = document.getElementById('expense-form');
  const typeIncomeRadio = document.getElementById('expense-type-income');
  const typeExpenseRadio = document.getElementById('expense-type-expense');
  const amountInput = document.getElementById('expense-amount');
  const categorySelect = document.getElementById('expense-category');
  const dateInput = document.getElementById('expense-date');
  const noteInput = document.getElementById('expense-note');
  const errorMsg = document.getElementById('expense-error-msg');

  if (!modalOverlay || !form) return;

  if (errorMsg) errorMsg.style.display = 'none';

  if (transactionId) {
    // Edit Mode
    const t = getTransaction(transactionId);
    if (!t) return;

    if (modalTitle) modalTitle.textContent = 'Edit Transaction';
    if (t.type === 'income') {
      typeIncomeRadio.checked = true;
    } else {
      typeExpenseRadio.checked = true;
    }

    populateCategories(t.type);
    amountInput.value = t.amount;
    categorySelect.value = t.category;
    dateInput.value = t.date;
    noteInput.value = t.note || '';
  } else {
    // Add Mode
    if (modalTitle) modalTitle.textContent = 'Add Transaction';
    typeExpenseRadio.checked = true;
    populateCategories('expense');
    amountInput.value = '';
    dateInput.value = getTodayDateString();
    noteInput.value = '';
  }

  modalOverlay.classList.add('visible');
  amountInput.focus();
}

export function closeModal() {
  const modalOverlay = document.getElementById('expense-modal-overlay');
  if (modalOverlay) {
    modalOverlay.classList.remove('visible');
  }
  const errorMsg = document.getElementById('expense-error-msg');
  if (errorMsg) errorMsg.style.display = 'none';
  editingTransactionId = null;
}

function populateCategories(type) {
  const select = document.getElementById('expense-category');
  if (!select) return;

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  select.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

function handleFormSubmit(e) {
  e.preventDefault();

  const type = document.querySelector('input[name="expense-type"]:checked')?.value || 'expense';
  const amountStr = document.getElementById('expense-amount')?.value;
  const category = document.getElementById('expense-category')?.value;
  const date = document.getElementById('expense-date')?.value;
  const note = document.getElementById('expense-note')?.value;
  const errorMsg = document.getElementById('expense-error-msg');

  const amount = parseFloat(amountStr);

  // Validation
  if (isNaN(amount) || amount <= 0) {
    if (errorMsg) {
      errorMsg.textContent = 'Please enter a valid amount greater than $0.00.';
      errorMsg.style.display = 'block';
    }
    return;
  }

  if (!date) {
    if (errorMsg) {
      errorMsg.textContent = 'Please select a valid date.';
      errorMsg.style.display = 'block';
    }
    return;
  }

  if (editingTransactionId) {
    updateTransaction(editingTransactionId, { type, amount, category, date, note });
  } else {
    addTransaction({ type, amount, category, date, note });
  }

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

  // 1. Initial category population for form and filter dropdowns
  populateCategories('expense');
  populateFilterCategories();

  // 2. Add Transaction Button
  document.getElementById('expense-add-btn')?.addEventListener('click', () => openModal());

  // 3. Modal close and cancel buttons
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

  // 4. Form type radio change (Income vs Expense categories update)
  document.querySelectorAll('input[name="expense-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      populateCategories(e.target.value);
    });
  });

  // 5. Form submission
  document.getElementById('expense-form')?.addEventListener('submit', handleFormSubmit);

  // 6. Filter Controls
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

  // 7. Initial render
  renderExpenses();
}

