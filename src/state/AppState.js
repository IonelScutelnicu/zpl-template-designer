// Observable Application State Management
// Centralizes all application state with event-driven updates

import { HISTORY_LIMIT } from '../config/constants.js';

/**
 * Observable state store for the ZPL Template Creator
 * Provides centralized state management with event subscription
 */
export class AppState {
  constructor() {
    // Core application state
    this.elements = [];
    this.selectedElement = null;

    // Label configuration
    this.labelSettings = {
      width: 100,              // in mm
      height: 50,              // in mm
      dpmm: 8,                 // dots per mm
      printOrientation: "N",   // N = normal, I = inverted
      printMirror: "N",        // N = normal, Y = mirrored (^PM)
      mediaDarkness: 25,       // ~SD value (0-30)
      printSpeed: 4,           // ^PR value (2-14)
      slewSpeed: 4,            // ^PR value (2-14)
      backfeedSpeed: 4,        // ^PR value (2-14)
      printQuantity: 1,        // ^PQ quantity (1-99999999)
      pauseCount: 0,           // ^PQ pause/cut count (0-99999999)
      replicates: 0,           // ^PQ replicates of each serial number (0-99999999)
      printQuantityPlaceholder: '', // ^PQ quantity placeholder name (e.g. 'qty' → %qty%)
      fontId: "0",             // ^CF default font identifier
      customFonts: [],         // Array of {id, fontFile} for ^CW commands
      defaultFontHeight: 20,   // ^CF default font height
      defaultFontWidth: 0,     // ^CF default font width (0 = omit from ZPL)
      homeX: 0,                // ^LH x position
      homeY: 0,                // ^LH y position
      labelTop: 0,             // ^LT label top shift
    };

    // History management
    this.history = {
      entries: [],
      index: -1,
      isApplying: false,
      commitTimers: new Map()
    };

    // Warnings from Labelary linter
    this.warnings = [];

    // Transform session tracking
    this.activeTransformSession = null;
    this.keyboardMoveSession = null;

    // Event listeners registry
    this.listeners = new Map();
  }

  /**
   * Subscribe to state change events
   * @param {string} event - Event name (e.g., 'elementsChanged', 'selectionChanged')
   * @param {Function} callback - Callback function to execute when event fires
   */
  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Unsubscribe from state change events
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  unsubscribe(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * Notify all subscribers of an event
   * @param {string} event - Event name
   * @param {*} data - Data to pass to callbacks
   */
  notify(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => cb(data));
    }
  }

  // ===== Elements Management =====

  /**
   * Set the elements array
   * @param {Array} elements - Array of element objects
   */
  setElements(elements) {
    this.elements = elements;
    this.notify('elementsChanged', this.elements);
  }

  /**
   * Add an element to the array
   * @param {Object} element - Element to add
   */
  addElement(element) {
    this.elements.push(element);
    this.notify('elementsChanged', this.elements);
  }

  /**
   * Remove an element by ID
   * @param {string|number} id - Element ID
   */
  removeElement(id) {
    const idStr = String(id);
    this.elements = this.elements.filter(el => String(el.id) !== idStr);
    this.notify('elementsChanged', this.elements);
  }

  /**
   * Update elements array (for reordering)
   * @param {Array} elements - New elements array
   */
  updateElements(elements) {
    this.elements = elements;
    this.notify('elementsChanged', this.elements);
  }

  // ===== Selection Management =====

  /**
   * Set the selected element
   * @param {Object|null} element - Element to select (or null to deselect)
   */
  setSelectedElement(element) {
    this.selectedElement = element;
    this.notify('selectionChanged', element);
  }

  // ===== Label Settings Management =====

  /**
   * Update label settings (merge changes)
   * @param {Object} changes - Object with settings to update
   */
  updateLabelSettings(changes) {
    Object.assign(this.labelSettings, changes);
    this.notify('labelSettingsChanged', this.labelSettings);
  }

  /**
   * Replace entire label settings object
   * @param {Object} settings - New settings object
   */
  setLabelSettings(settings) {
    this.labelSettings = settings;
    this.notify('labelSettingsChanged', this.labelSettings);
  }

  // ===== History Management =====

  /**
   * Get current history entries
   * @returns {Array} History entries
   */
  getHistoryEntries() {
    return this.history.entries;
  }

  /**
   * Get current history index
   * @returns {number} History index
   */
  getHistoryIndex() {
    return this.history.index;
  }

  /**
   * Set history entries
   * @param {Array} entries - History entries array
   */
  setHistoryEntries(entries) {
    this.history.entries = entries;
    this.notify('historyChanged', { entries: this.history.entries, index: this.history.index });
  }

  /**
   * Set history index
   * @param {number} index - New history index
   */
  setHistoryIndex(index) {
    this.history.index = index;
    this.notify('historyChanged', { entries: this.history.entries, index: this.history.index });
  }

  /**
   * Add a history entry
   * @param {Object} entry - History entry object
   */
  addHistoryEntry(entry) {
    // If not at the end of history, truncate forward entries
    if (this.history.index < this.history.entries.length - 1) {
      this.history.entries = this.history.entries.slice(0, this.history.index + 1);
    }

    this.history.entries.push(entry);
    this.history.index = this.history.entries.length - 1;

    // Limit history size
    if (this.history.entries.length > HISTORY_LIMIT) {
      const overflow = this.history.entries.length - HISTORY_LIMIT;
      this.history.entries.splice(0, overflow);
      this.history.index = Math.max(0, this.history.index - overflow);
    }

    this.notify('historyChanged', { entries: this.history.entries, index: this.history.index });
  }

  /**
   * Reset history
   */
  resetHistory() {
    this.history.entries = [];
    this.history.index = -1;
    this.history.commitTimers.forEach(timer => clearTimeout(timer));
    this.history.commitTimers.clear();
    this.notify('historyChanged', { entries: this.history.entries, index: this.history.index });
  }

  /**
   * Check if currently applying history state
   * @returns {boolean}
   */
  isApplyingHistory() {
    return this.history.isApplying;
  }

  /**
   * Set history applying flag
   * @param {boolean} value
   */
  setApplyingHistory(value) {
    this.history.isApplying = value;
  }

  /**
   * Get history commit timer
   * @param {string} key
   * @returns {number|undefined}
   */
  getHistoryCommitTimer(key) {
    return this.history.commitTimers.get(key);
  }

  /**
   * Set history commit timer
   * @param {string} key
   * @param {number} timer
   */
  setHistoryCommitTimer(key, timer) {
    this.history.commitTimers.set(key, timer);
  }

  /**
   * Delete history commit timer
   * @param {string} key
   */
  deleteHistoryCommitTimer(key) {
    this.history.commitTimers.delete(key);
  }

  /**
   * Clear history commit timer
   * @param {string} key
   */
  clearHistoryCommitTimer(key) {
    const timer = this.history.commitTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.history.commitTimers.delete(key);
    }
  }

  // ===== Transform Session Management =====

  /**
   * Get active transform session
   * @returns {Object|null}
   */
  getActiveTransformSession() {
    return this.activeTransformSession;
  }

  /**
   * Set active transform session
   * @param {Object|null} session
   */
  setActiveTransformSession(session) {
    this.activeTransformSession = session;
  }

  /**
   * Get keyboard move session
   * @returns {Object|null}
   */
  getKeyboardMoveSession() {
    return this.keyboardMoveSession;
  }

  /**
   * Set keyboard move session
   * @param {Object|null} session
   */
  setKeyboardMoveSession(session) {
    this.keyboardMoveSession = session;
  }

  // ===== Warnings Management =====

  /**
   * Set warnings from Labelary linter
   * @param {Array} warnings - Parsed and resolved warning objects
   */
  setWarnings(warnings) {
    this.warnings = warnings;
    this.notify('warningsChanged', this.warnings);
  }

  /**
   * Clear all warnings
   */
  clearWarnings() {
    this.warnings = [];
    this.notify('warningsChanged', this.warnings);
  }

  /**
   * Get warnings for a specific element
   * @param {string|number} elementId - Element ID
   * @returns {Array} Warnings for the element
   */
  getWarningsForElement(elementId) {
    const idStr = String(elementId);
    return this.warnings.filter(w => w.elementId !== null && String(w.elementId) === idStr);
  }

  // ===== Complete State Serialization =====

  /**
   * Serialize complete application state
   * @returns {Object} Serialized state
   */
  serialize() {
    return {
      labelSettings: JSON.parse(JSON.stringify(this.labelSettings)),
      elements: this.elements.map(element => {
        if (!element) return null;
        const data = JSON.parse(JSON.stringify(element));
        data.id = element.id;
        return data;
      }),
      selectedElementId: this.selectedElement ? String(this.selectedElement.id) : null
    };
  }

  /**
   * Restore application state from serialized data
   * @param {Object} data - Serialized state data
   * @param {Function} createElementFromData - Function to recreate elements from data
   */
  restore(data, createElementFromData) {
    if (!data) return;

    // Restore elements
    if (data.elements) {
      this.elements = data.elements.map(el => createElementFromData(el, { keepId: true }));
      this.notify('elementsChanged', this.elements);
    }

    // Restore label settings
    if (data.labelSettings) {
      Object.assign(this.labelSettings, data.labelSettings);
      this.notify('labelSettingsChanged', this.labelSettings);
    }

    // Restore selection
    if (data.selectedElementId) {
      this.selectedElement = this.elements.find(el => String(el.id) === String(data.selectedElementId)) || null;
    } else {
      this.selectedElement = null;
    }
    this.notify('selectionChanged', this.selectedElement);
  }
}
