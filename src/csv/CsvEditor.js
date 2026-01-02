/**
 * CsvEditor.js - CSV Editor Pro component
 *
 * Provides a tabular grid editor for CSV files with:
 * - Data loading from Rust backend
 * - Editable table display with headers and rows
 * - Cell selection and editing (CodeMirror integration)
 * - Dirty state tracking
 * - Premium schema support
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * CsvEditor class - Main CSV editing component
 *
 * Follows the same pattern as PDFTab for integration with TabManager.
 */
export class CsvEditor {
  /**
   * Create a CsvEditor instance
   * @param {string} filePath - Relative path to the CSV file within the vault
   * @param {Object} tabManager - Reference to TabManager for integration
   * @param {string} paneId - ID of the pane containing this editor
   */
  constructor(filePath, tabManager, paneId) {
    console.log(`Creating CSV editor for: ${filePath}`);

    // File and tab references
    this.filePath = filePath;
    this.tabManager = tabManager;
    this.paneId = paneId;

    // DOM elements
    this.container = null;
    this.toolbar = null;
    this.tableContainer = null;
    this.tableElement = null;

    // State
    this.state = {
      // Data from Rust backend
      data: null,           // CsvData { headers, rows, totalRows, truncated }
      schema: null,         // CsvSchema (premium only)

      // UI state
      selectedCell: null,   // { row: number, col: number }
      editingCell: null,    // { row: number, col: number }
      isDirty: false,
      isPremium: false,

      // Working copy for edits
      workingRows: [],      // Copy of data.rows for editing
      savedRows: [],        // Snapshot for dirty comparison

      // Loading state
      isLoading: true,
      error: null
    };

    // File info
    this.fileName = filePath ? filePath.split('/').pop() : 'Untitled.csv';

    // CodeMirror editor for cell editing (singleton pattern)
    this.cellEditor = null;

    // Bound event handlers for cleanup
    this.boundKeydownHandler = null;
  }

  /**
   * Mount the editor - load data and render
   * @returns {Promise<HTMLElement>} The container element
   */
  async mount() {
    console.log('Mounting CSV editor for:', this.filePath);

    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'csv-editor-container';
    this.container.id = `csv-editor-${Date.now()}`;

    // Show loading state
    this.container.innerHTML = `
      <div class="csv-loading">
        <div class="csv-loading-spinner"></div>
        <p>Loading CSV file...</p>
      </div>
    `;

    try {
      // Load data from Rust backend
      await this.loadData();

      // Render the editor UI
      this.render();

      // Set up event handlers
      this.setupEventHandlers();

      console.log('CSV editor mounted successfully');
    } catch (error) {
      console.error('Error mounting CSV editor:', error);
      this.state.error = error.message || 'Failed to load CSV file';
      this.renderError();
    }

    return this.container;
  }

  /**
   * Load data from Rust backend
   */
  async loadData() {
    console.log('Loading CSV data from:', this.filePath);
    this.state.isLoading = true;
    this.state.error = null;

    try {
      // Load CSV data via Tauri command
      // Note: Tauri v2 auto-converts camelCase JS to snake_case Rust
      const data = await invoke('read_csv_data', {
        path: this.filePath,
        maxRows: null // Let backend determine limit based on premium status
      });

      console.log('CSV data loaded:', {
        headers: data.headers.length,
        rows: data.rows.length,
        totalRows: data.totalRows,
        truncated: data.truncated
      });

      this.state.data = data;
      this.state.workingRows = data.rows.map(row => [...row]); // Deep copy
      this.state.savedRows = data.rows.map(row => [...row]);   // Snapshot

      // Try to load schema (premium feature)
      try {
        const schema = await invoke('get_csv_schema', {
          path: this.filePath,
          createIfMissing: false
        });
        this.state.schema = schema;
        this.state.isPremium = !schema.readOnly;
        console.log('CSV schema loaded, premium:', this.state.isPremium);
      } catch (schemaError) {
        // Schema not found or not premium - this is expected for free users
        console.log('No schema loaded (expected for free users):', schemaError.message || schemaError);
        this.state.schema = null;
        this.state.isPremium = false;
      }

      this.state.isLoading = false;
    } catch (error) {
      console.error('Error loading CSV data:', error);
      this.state.isLoading = false;
      throw error;
    }
  }

  /**
   * Render the complete editor UI
   */
  render() {
    // Clear container
    this.container.innerHTML = '';

    // Create toolbar
    this.toolbar = this.renderToolbar();
    this.container.appendChild(this.toolbar);

    // Create table container with scrolling
    this.tableContainer = document.createElement('div');
    this.tableContainer.className = 'csv-table-container';

    // Render table
    this.tableElement = this.renderTable();
    this.tableContainer.appendChild(this.tableElement);

    this.container.appendChild(this.tableContainer);

    // Add premium banner if truncated
    if (this.state.data && this.state.data.truncated) {
      const banner = this.renderTruncationBanner();
      this.container.insertBefore(banner, this.tableContainer);
    }
  }

  /**
   * Render the toolbar with controls
   * @returns {HTMLElement}
   */
  renderToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'csv-toolbar editor-header';

    const rowCount = this.state.data ? this.state.data.rows.length : 0;
    const totalRows = this.state.data ? this.state.data.totalRows : 0;
    const displayCount = rowCount === totalRows
      ? `${rowCount} rows`
      : `${rowCount} of ${totalRows} rows`;

    toolbar.innerHTML = `
      <div class="editor-header-left">
        <button class="editor-control-btn csv-add-row-btn" title="Add Row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Add Row</span>
        </button>
        <button class="editor-control-btn csv-add-col-btn" title="Add Column">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Add Column</span>
        </button>
        <button class="editor-control-btn csv-delete-row-btn" title="Delete Row" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Delete Row</span>
        </button>
      </div>

      <div class="editor-header-center">
        <span class="csv-filename">${this.escapeHtml(this.fileName)}</span>
        <span class="csv-row-count">${displayCount}</span>
        ${this.state.isPremium ? '<span class="csv-premium-badge">Pro</span>' : ''}
      </div>

      <div class="editor-header-right">
        <button class="editor-control-btn csv-save-btn" title="Save (Cmd+S)" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          <span>Save</span>
        </button>
      </div>
    `;

    return toolbar;
  }

  /**
   * Render the data table
   * @returns {HTMLElement}
   */
  renderTable() {
    const table = document.createElement('table');
    table.className = 'csv-table';

    const data = this.state.data;

    if (!data || data.headers.length === 0) {
      // Empty state
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'csv-empty-state';
      emptyDiv.innerHTML = `
        <p>No data to display</p>
        <button class="csv-add-first-row-btn">Add first row</button>
      `;
      return emptyDiv;
    }

    // Create header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.className = 'csv-header-row';

    // Add row number header
    const rowNumHeader = document.createElement('th');
    rowNumHeader.className = 'csv-row-number-header';
    rowNumHeader.textContent = '#';
    headerRow.appendChild(rowNumHeader);

    // Add column headers
    data.headers.forEach((header, colIndex) => {
      const th = document.createElement('th');
      th.className = 'csv-header-cell';
      th.dataset.col = colIndex;
      th.textContent = header;
      th.title = header;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create data rows
    const tbody = document.createElement('tbody');

    this.state.workingRows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      tr.className = 'csv-data-row';
      tr.dataset.row = rowIndex;

      // Row number cell
      const rowNumCell = document.createElement('td');
      rowNumCell.className = 'csv-row-number';
      rowNumCell.textContent = rowIndex + 1;
      tr.appendChild(rowNumCell);

      // Data cells
      row.forEach((cellValue, colIndex) => {
        const td = document.createElement('td');
        td.className = 'csv-cell';
        td.dataset.row = rowIndex;
        td.dataset.col = colIndex;
        td.textContent = cellValue;
        td.title = cellValue;

        // Add selection classes if this is the selected cell
        if (this.state.selectedCell &&
            this.state.selectedCell.row === rowIndex &&
            this.state.selectedCell.col === colIndex) {
          td.classList.add('csv-cell-selected');
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    return table;
  }

  /**
   * Render truncation banner for free users
   * @returns {HTMLElement}
   */
  renderTruncationBanner() {
    const banner = document.createElement('div');
    banner.className = 'csv-truncation-banner';
    banner.innerHTML = `
      <span class="csv-truncation-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </span>
      <span>Showing first ${this.state.data.rows.length.toLocaleString()} of ${this.state.data.totalRows.toLocaleString()} rows.</span>
      <button class="csv-upgrade-btn">Upgrade for unlimited</button>
    `;
    return banner;
  }

  /**
   * Render error state
   */
  renderError() {
    this.container.innerHTML = `
      <div class="csv-error-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h3>Error loading CSV</h3>
        <p>${this.escapeHtml(this.state.error)}</p>
        <button class="csv-retry-btn">Retry</button>
      </div>
    `;

    // Add retry handler
    const retryBtn = this.container.querySelector('.csv-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.mount());
    }
  }

  /**
   * Set up event handlers
   */
  setupEventHandlers() {
    // Table cell clicks for selection
    if (this.tableElement && this.tableElement.tagName === 'TABLE') {
      this.tableElement.addEventListener('click', (e) => {
        const cell = e.target.closest('.csv-cell');
        if (cell) {
          const row = parseInt(cell.dataset.row, 10);
          const col = parseInt(cell.dataset.col, 10);
          this.selectCell(row, col);
        }
      });

      // Double-click for editing
      this.tableElement.addEventListener('dblclick', (e) => {
        const cell = e.target.closest('.csv-cell');
        if (cell) {
          const row = parseInt(cell.dataset.row, 10);
          const col = parseInt(cell.dataset.col, 10);
          this.startEditing(row, col);
        }
      });
    }

    // Toolbar button handlers
    if (this.toolbar) {
      const addRowBtn = this.toolbar.querySelector('.csv-add-row-btn');
      const addColBtn = this.toolbar.querySelector('.csv-add-col-btn');
      const deleteRowBtn = this.toolbar.querySelector('.csv-delete-row-btn');
      const saveBtn = this.toolbar.querySelector('.csv-save-btn');

      if (addRowBtn) addRowBtn.addEventListener('click', () => this.addRow());
      if (addColBtn) addColBtn.addEventListener('click', () => this.addColumn());
      if (deleteRowBtn) deleteRowBtn.addEventListener('click', () => this.deleteRow());
      if (saveBtn) saveBtn.addEventListener('click', () => this.save());
    }

    // Keyboard navigation
    this.boundKeydownHandler = (e) => this.handleKeydown(e);
    document.addEventListener('keydown', this.boundKeydownHandler);
  }

  /**
   * Select a cell
   * @param {number} row - Row index
   * @param {number} col - Column index
   */
  selectCell(row, col) {
    // Clear previous selection
    const prevSelected = this.tableElement?.querySelector('.csv-cell-selected');
    if (prevSelected) {
      prevSelected.classList.remove('csv-cell-selected');
    }

    // Update state
    this.state.selectedCell = { row, col };

    // Add selection to new cell
    const newCell = this.tableElement?.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    if (newCell) {
      newCell.classList.add('csv-cell-selected');
    }

    // Update delete button state
    this.updateDeleteButtonState();

    console.log('Cell selected:', { row, col });
  }

  /**
   * Start editing a cell (placeholder - full implementation in csv-4.3)
   * @param {number} row - Row index
   * @param {number} col - Column index
   */
  startEditing(row, col) {
    console.log('Start editing cell:', { row, col });
    // Full implementation in csv-4.3 with CodeMirror integration
    this.state.editingCell = { row, col };
  }

  /**
   * Handle keyboard events (placeholder - full implementation in csv-4.4)
   * @param {KeyboardEvent} e
   */
  handleKeydown(e) {
    // Check if we're in the CSV editor context
    if (!this.container || !document.body.contains(this.container)) {
      return;
    }

    // Save shortcut: Cmd/Ctrl + S
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      if (this.state.isDirty) {
        e.preventDefault();
        this.save();
      }
    }

    // Full keyboard navigation implementation in csv-4.4
  }

  /**
   * Add a new row (placeholder - full implementation in csv-4.5)
   */
  addRow() {
    console.log('Add row triggered');
    // Full implementation in csv-4.5
  }

  /**
   * Add a new column (placeholder - full implementation in csv-4.5)
   */
  addColumn() {
    console.log('Add column triggered');
    // Full implementation in csv-4.5
  }

  /**
   * Delete the selected row (placeholder - full implementation in csv-4.5)
   */
  deleteRow() {
    console.log('Delete row triggered');
    // Full implementation in csv-4.5
  }

  /**
   * Save changes to disk (placeholder - full implementation in csv-4.6)
   */
  async save() {
    console.log('Save triggered');
    // Full implementation in csv-4.6
  }

  /**
   * Update delete button enabled state
   */
  updateDeleteButtonState() {
    const deleteBtn = this.toolbar?.querySelector('.csv-delete-row-btn');
    if (deleteBtn) {
      deleteBtn.disabled = !this.state.selectedCell;
    }
  }

  /**
   * Update save button enabled state
   */
  updateSaveButtonState() {
    const saveBtn = this.toolbar?.querySelector('.csv-save-btn');
    if (saveBtn) {
      saveBtn.disabled = !this.state.isDirty;
    }
  }

  /**
   * Check if there are unsaved changes
   */
  checkDirty() {
    // Compare working rows to saved rows
    if (this.state.workingRows.length !== this.state.savedRows.length) {
      this.state.isDirty = true;
    } else {
      this.state.isDirty = this.state.workingRows.some((row, rowIndex) => {
        const savedRow = this.state.savedRows[rowIndex];
        if (!savedRow || row.length !== savedRow.length) return true;
        return row.some((cell, colIndex) => cell !== savedRow[colIndex]);
      });
    }

    this.updateSaveButtonState();
    return this.state.isDirty;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Clean up when editor is closed
   */
  unmount() {
    console.log('Unmounting CSV editor');

    // Remove keyboard handler
    if (this.boundKeydownHandler) {
      document.removeEventListener('keydown', this.boundKeydownHandler);
      this.boundKeydownHandler = null;
    }

    // Destroy CodeMirror cell editor if exists
    if (this.cellEditor) {
      this.cellEditor.destroy();
      this.cellEditor = null;
    }

    // Clear DOM
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    // Clear references
    this.toolbar = null;
    this.tableContainer = null;
    this.tableElement = null;

    console.log('CSV editor unmounted');
  }

  /**
   * Focus the editor
   */
  focus() {
    if (this.tableContainer) {
      this.tableContainer.focus();
    }
  }

  /**
   * Check if editor has unsaved changes
   * @returns {boolean}
   */
  hasUnsavedChanges() {
    return this.state.isDirty;
  }
}
