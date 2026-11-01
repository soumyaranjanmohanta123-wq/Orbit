/**
 * app.js — Application entry point.
 *
 * Imports and initializes every module. Each feature module
 * (notes, expenses, routines, dashboard) will be added here
 * in later steps.
 */

import { initUI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  initUI();
});

