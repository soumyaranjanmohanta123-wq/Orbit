/**
 * storage.js — Safe wrapper around localStorage.
 *
 * Every read/write is wrapped in try-catch so the app won't crash
 * if localStorage is full, disabled, or contains invalid JSON.
 * All values are serialized as JSON automatically.
 */

const Storage = {
  /**
   * Read a value from localStorage.
   * @param {string} key      - Storage key to look up.
   * @param {*}      fallback - Returned when the key is missing or corrupt.
   * @returns {*} The parsed value, or the fallback.
   */
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      // Data was corrupted or unparseable — return the safe default
      return fallback;
    }
  },

  /**
   * Write a value to localStorage.
   * @param {string} key   - Storage key.
   * @param {*}      value - Any JSON-serializable value.
   * @returns {boolean} True if the write succeeded.
   */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      // Storage might be full (5 MB limit) or blocked by the browser
      console.warn(`[Storage] Failed to write key "${key}".`);
      return false;
    }
  },

  /**
   * Remove a key from localStorage.
   * @param {string} key
   * @returns {boolean} True if the removal succeeded.
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Check whether a key exists in localStorage.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }
};

export default Storage;

