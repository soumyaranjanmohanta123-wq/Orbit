# Orbit

> **Keep your life in orbit.**

Orbit is a front-end personal life manager that brings your notes, finances, and daily routines into one clean interface. All data is saved in the browser using `localStorage` — no backend, no database, no login required.

## Features (v1)

| Module | Description |
|---|---|
| **Dashboard** | Monthly income/expense summary, today's routine progress, recently edited notes. |
| **Notes Workspace** | Nested folders, Markdown editor with toolbar, split/preview modes, search, autosave. |
| **Expense Tracker** | Add income & expenses with categories, filters, and monthly totals. |
| **Routine Tracker** | Daily habits with check-off and streak counting. |

## Tech Stack

- Plain HTML, CSS, and vanilla JavaScript (ES modules)
- [marked](https://github.com/markedjs/marked) (Markdown parsing) + [DOMPurify](https://github.com/cure53/DOMPurify) (XSS sanitization) via CDN
- No frameworks, no build tools

## Project Structure

```
Orbit/
├── index.html              Main HTML document
├── css/
│   ├── design-system.css   CSS variables, reset, typography
│   ├── layout.css          Sidebar, main grid, responsive
│   ├── components.css      Buttons, cards, inputs, empty states
│   ├── notes.css           Notes workspace, tree, context menu, modals
│   └── expenses.css        Expense tracker layout, metrics, filters, modal
├── js/
│   ├── app.js              Entry point — initialises all modules
│   ├── storage.js          Safe localStorage wrapper
│   ├── ui.js               Theme toggle, navigation, sidebar
│   ├── notesStore.js       Notes & folders data model + CRUD
│   ├── notesTree.js        Folder tree UI, DND, context menu, breadcrumbs
│   ├── notesEditor.js      Markdown editor, toolbar, autosave, preview
│   └── expenses.js         Expense & income tracker, filters, totals, CRUD
├── assets/                 (reserved for future static assets)
└── README.md
```

## Getting Started

1. Clone the repository.
2. Open `index.html` in any modern browser — no server needed.
   - Or use a local dev server: `npx serve .` or the VS Code Live Server extension.
3. Start exploring!

## Build Log

- **Step 1** — Project structure, design system, base layout, sidebar navigation, light/dark mode, responsive shell.
- **Step 2A** — Notes data model & folder tree: nested folders, drag & drop, context menu, modal move, inline rename, breadcrumbs, search, keyboard navigation.
- **Step 2B** — Markdown note editor: formatting toolbar, Edit/Split/Preview view modes, 500ms debounced autosave, interactive preview checklist, keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+S, Tab), copy, and .md export.
- **Step 3** — Expense tracker: income & expense transactions, category presets, date/period filters, live search, financial metric totals, and modal dialog.

## License

MIT
