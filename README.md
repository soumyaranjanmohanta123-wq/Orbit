# Orbit

> **Keep your life in orbit.**

Orbit is a clean, modern, front-end personal life manager that unifies your notes, finances, and daily routines into a single cohesive interface. All data is saved directly in the browser using `localStorage` — no backend, no database, no accounts or cloud dependencies required.

---

## Features (v1)

| Module | Core Capabilities |
|---|---|
| **Dashboard** | Personalized time-based greeting, monthly financial summary (income, expenses, net balance), today's habit completion progress with 1-click check-off, and recently edited notes with 1-click navigation. |
| **Notes Workspace** | Unlimited nested folders, breadcrumb navigation, drag-and-drop hierarchy management, context menus, full Markdown editor with formatting toolbar, Edit/Split/Preview view modes, 500ms debounced autosave, interactive preview task checklists, global search with match highlighting, and `.md` file export. |
| **Expense Tracker** | Income & expense tracking with category presets, custom dates, notes, multi-criteria period filters (`This Month`, `Last Month`, `All Time`), type filters (`All`, `Income`, `Expense`), category filtering, debounced search, real-time totals, and modal dialogs. |
| **Routine Tracker** | Daily habit builder, time-of-day filtering (`Morning`, `Afternoon`, `Evening`, `Anytime`), consecutive day streak counting (current & all-time best streaks), animated daily completion progress bar, interactive 7-day visual history mini-strip with backfill support, and modal dialogs. |

---

## Tech Stack & Architecture

- **Vanilla HTML5, CSS3, and JavaScript (ES Modules)** — No build tools, bundlers, or frameworks.
- **Marked** (Markdown rendering) + **DOMPurify** (XSS sanitization) loaded via CDN.
- **Design Tokens** — Comprehensive CSS custom property design system (`--color-*`, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`).
- **Typography** — `Inter` for UI clarity and `JetBrains Mono` for code and Markdown inputs.
- **Persistence** — Safe `localStorage` abstraction layer (`js/storage.js`) with comprehensive `try/catch` error handling against corrupted or quota-limited browser storage.
- **Accessibility** — Full semantic HTML, visible `:focus-visible` keyboard rings, WAI-ARIA roles (`role="tree"`, `role="treeitem"`, `role="dialog"`, `role="progressbar"`, `role="toolbar"`), and high-contrast light and dark modes.

---

## Project Structure

```
Orbit/
├── index.html              Main application HTML document
├── css/
│   ├── design-system.css   Design tokens, CSS reset, typography, light/dark themes
│   ├── layout.css          Desktop sidebar, responsive grid, mobile header & tab bar
│   ├── components.css      Reusable buttons, cards, badges, inputs, empty states
│   ├── notes.css           Three-pane layout, folder tree, context menus, Markdown editor
│   ├── expenses.css        Financial metric cards, filters bar, transactions table, modal
│   ├── routines.css        Habit cards, streak badges, progress bar, 7-day mini-strip
│   └── dashboard.css       Dashboard grid, metric summary, quick check-off, recent notes
├── js/
│   ├── app.js              Application entry point initializing all modules
│   ├── storage.js          Safe localStorage wrapper with try/catch
│   ├── ui.js               Theme switcher (persisted), hash-based view router, sidebar
│   ├── notesStore.js       Flat data model, tree building, CRUD, move validation, search
│   ├── notesTree.js        Tree rendering, DND, context menus, inline rename, breadcrumbs
│   ├── notesEditor.js      Markdown editor, toolbar, autosave, preview, checklists, export
│   ├── expenses.js         Expense & income tracker, filters, calculations, modal CRUD
│   ├── routines.js         Habit tracking, consecutive streak algorithm, daily progress
│   └── dashboard.js        Cross-module dashboard overview, metrics, quick actions
├── assets/                 Static assets & icons
└── README.md
```

---

## Keyboard Shortcuts Reference

### Global Navigation
| Shortcut | Action | Scope |
|---|---|---|
| `Ctrl+N` / `Cmd+N` | Create a new note in current folder context | Notes Workspace |
| `Escape` | Dismiss active modal or context menu | Global |

### Notes Tree Navigation
| Shortcut | Action | Scope |
|---|---|---|
| `↑` / `↓` | Move selection between visible tree items | Folder Tree |
| `→` | Expand folder or move into first child | Folder Tree |
| `←` | Collapse folder or jump to parent folder | Folder Tree |
| `Enter` | Select note or toggle folder open/closed | Folder Tree |
| `F2` | Start inline renaming of selected item | Folder Tree |
| `Delete` | Delete selected note or folder (with confirmation) | Folder Tree |

### Markdown Editor
| Shortcut | Action | Scope |
|---|---|---|
| `Ctrl+B` / `Cmd+B` | Bold text (`**text**`) | Note Editor |
| `Ctrl+I` / `Cmd+I` | Italic text (`*text*`) | Note Editor |
| `Ctrl+K` / `Cmd+K` | Insert Markdown link (`[text](url)`) | Note Editor |
| `Ctrl+S` / `Cmd+S` | Force immediate save (bypasses debounce) | Note Editor |
| `Tab` | Indent with 2 spaces (or indent selected lines) | Note Editor |
| `Shift+Tab` | Unindent selected lines by 2 spaces | Note Editor |
| `Enter` | Automatically continue task checklists, bullets, numbers | Note Editor |

---

## Getting Started

1. Clone or download the repository:
   ```bash
   git clone https://github.com/soumyaranjanmohanta123-wq/Orbit.git
   ```
2. Open `index.html` directly in any modern browser (Chrome, Edge, Firefox, Safari).
   - Alternatively, serve locally using any static web server:
     ```bash
     npx serve .
     ```
3. No configuration, environment variables, or build steps required.

---

## Build Log

- **Step 1** — Project scaffold, design system tokens, responsive layout shell, collapsible sidebar, mobile bottom tab bar, theme toggle (light/dark) persisted in `localStorage`.
- **Step 2A** — Notes data model & folder tree: flat array storage, unlimited nesting, drag & drop, context menus, inline rename, breadcrumbs, search indexing, and keyboard navigation.
- **Step 2B** — Markdown note editor: formatting toolbar, Edit/Split/Preview view modes, 500ms debounced autosave, interactive preview task checklists, keyboard shortcuts, word/char counts, copy, and `.md` export.
- **Step 3** — Expense tracker: income & expense transactions, category presets, date/period filters, live search, financial metric totals, and modal dialog.
- **#4** — Routine tracker: daily habits, time-of-day filters, progress indicator, consecutive streak counting, 7-day visual strip, and modal dialog.
- **#5** — Dashboard: multi-module overview of monthly finances, today's habit progress with 1-click check-off, recent notes with instant jumping, time greeting, and quick action shortcuts.
- **#6** — Final polish: eliminated all inline styles, added mobile horizontal scroll for formatting toolbar, verified high-contrast accessibility (AAA/AA), refined responsive breakpoints down to 360px, and updated documentation.

---

## License

MIT © 2026 Orbit Contributors
