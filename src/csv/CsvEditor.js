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
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

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

    // Original value before editing (for cancel operation)
    this.originalEditValue = null;

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
   * Calculate optimal column widths based on content
   * @returns {number[]} Array of column widths in pixels
   */
  calculateColumnWidths() {
    const data = this.state.data;
    if (!data || data.headers.length === 0) return [];

    const MIN_WIDTH = 80;
    const MAX_WIDTH = 300;
    const CHAR_WIDTH = 8; // Approximate width per character
    const PADDING = 24;   // Cell padding (12px * 2)

    const widths = [];

    // Calculate width for each column based on header and data content
    for (let colIndex = 0; colIndex < data.headers.length; colIndex++) {
      // Start with header length
      let maxLength = data.headers[colIndex].length;

      // Check first 100 rows for content length (performance optimization)
      const rowsToCheck = Math.min(this.state.workingRows.length, 100);
      for (let rowIndex = 0; rowIndex < rowsToCheck; rowIndex++) {
        const cellValue = this.state.workingRows[rowIndex][colIndex] || '';
        maxLength = Math.max(maxLength, cellValue.toString().length);
      }

      // Calculate width with bounds
      const calculatedWidth = (maxLength * CHAR_WIDTH) + PADDING;
      widths.push(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, calculatedWidth)));
    }

    return widths;
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

    // Calculate column widths
    const columnWidths = this.calculateColumnWidths();

    // Create colgroup for column widths
    const colgroup = document.createElement('colgroup');

    // Row number column
    const rowNumCol = document.createElement('col');
    rowNumCol.style.width = '50px';
    rowNumCol.style.minWidth = '50px';
    colgroup.appendChild(rowNumCol);

    // Data columns with calculated widths
    columnWidths.forEach(width => {
      const col = document.createElement('col');
      col.style.width = `${width}px`;
      col.style.minWidth = `${Math.min(width, 80)}px`;
      colgroup.appendChild(col);
    });
    table.appendChild(colgroup);

    // Create header row
    const thead = document.createElement('thead');
    thead.className = 'csv-thead-sticky';
    const headerRow = document.createElement('tr');
    headerRow.className = 'csv-header-row';

    // Add row number header
    const rowNumHeader = document.createElement('th');
    rowNumHeader.className = 'csv-row-number-header';
    rowNumHeader.textContent = '#';
    rowNumHeader.title = 'Row number';
    headerRow.appendChild(rowNumHeader);

    // Add column headers with tooltips
    data.headers.forEach((header, colIndex) => {
      const th = document.createElement('th');
      th.className = 'csv-header-cell';
      th.dataset.col = colIndex;

      // Create span for text content (allows for truncation)
      const textSpan = document.createElement('span');
      textSpan.className = 'csv-header-text';
      textSpan.textContent = header;
      th.appendChild(textSpan);

      // Full header value in tooltip
      th.title = header;
      th.setAttribute('aria-label', header);
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
      rowNumCell.title = `Row ${rowIndex + 1}`;
      tr.appendChild(rowNumCell);

      // Data cells with proper truncation and tooltips
      row.forEach((cellValue, colIndex) => {
        const td = document.createElement('td');
        td.className = 'csv-cell';
        td.dataset.row = rowIndex;
        td.dataset.col = colIndex;

        // Create span for text content (allows for truncation styling)
        const textSpan = document.createElement('span');
        textSpan.className = 'csv-cell-text';
        textSpan.textContent = cellValue;
        td.appendChild(textSpan);

        // Full value in tooltip for truncated cells
        if (cellValue && cellValue.length > 0) {
          td.title = cellValue;
          td.setAttribute('aria-label', cellValue);
        }

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
    // If currently editing a different cell, finish editing first
    if (this.state.editingCell &&
        (this.state.editingCell.row !== row || this.state.editingCell.col !== col)) {
      this.finishEditing();
    }

    // Clear previous selection
    const prevSelected = this.tableElement?.querySelector('.csv-cell-selected');
    if (prevSelected) {
      prevSelected.classList.remove('csv-cell-selected');
    }

    // Update state
    this.state.selectedCell = { row, col };

    // Add selection to new cell (unless it's being edited)
    if (!this.state.editingCell ||
        this.state.editingCell.row !== row ||
        this.state.editingCell.col !== col) {
      const newCell = this.tableElement?.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
      if (newCell) {
        newCell.classList.add('csv-cell-selected');
      }
    }

    // Update delete button state
    this.updateDeleteButtonState();

    console.log('Cell selected:', { row, col });
  }

  /**
   * Start editing a cell with CodeMirror
   * Uses singleton pattern - one CodeMirror instance repositioned for each cell edit
   * @param {number} row - Row index
   * @param {number} col - Column index
   */
  startEditing(row, col) {
    console.log('Start editing cell:', { row, col });

    // If already editing this cell, do nothing
    if (this.state.editingCell &&
        this.state.editingCell.row === row &&
        this.state.editingCell.col === col) {
      return;
    }

    // If editing a different cell, finish it first
    if (this.state.editingCell) {
      this.finishEditing();
    }

    // Get the cell element
    const cellElement = this.tableElement?.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    if (!cellElement) {
      console.error('Cell element not found for editing:', { row, col });
      return;
    }

    // Get the current cell value
    const currentValue = this.state.workingRows[row]?.[col] ?? '';

    // Store original value for cancel operation
    this.originalEditValue = currentValue;

    // Update state
    this.state.editingCell = { row, col };
    this.state.selectedCell = { row, col };

    // Remove selection styling and add editing styling
    cellElement.classList.remove('csv-cell-selected');
    cellElement.classList.add('csv-cell-editing');

    // Clear cell content (the span with text)
    const textSpan = cellElement.querySelector('.csv-cell-text');
    if (textSpan) {
      textSpan.style.display = 'none';
    }

    // Create or reuse CodeMirror editor (singleton pattern)
    if (!this.cellEditor) {
      this.cellEditor = new EditorView({
        doc: currentValue,
        extensions: this.createCellEditorExtensions(),
        parent: cellElement
      });
    } else {
      // Reposition existing editor to this cell
      cellElement.appendChild(this.cellEditor.dom);

      // Reset content for this cell
      this.cellEditor.dispatch({
        changes: {
          from: 0,
          to: this.cellEditor.state.doc.length,
          insert: currentValue
        }
      });
    }

    // Focus the editor and select all text
    this.cellEditor.focus();
    this.cellEditor.dispatch({
      selection: { anchor: 0, head: this.cellEditor.state.doc.length }
    });

    console.log('Cell editing started:', { row, col, value: currentValue });
  }

  /**
   * Create CodeMirror extensions for cell editing
   * Minimal setup optimized for single-line CSV cell editing
   * @returns {Array} Array of CodeMirror extensions
   */
  createCellEditorExtensions() {
    return [
      // History for undo/redo
      history(),
      keymap.of(historyKeymap),

      // Default keymap for basic editing
      keymap.of(defaultKeymap),

      // Custom keymap for CSV cell editing
      keymap.of([
        {
          key: 'Enter',
          run: () => {
            this.finishEditing();
            return true;
          }
        },
        {
          key: 'Escape',
          run: () => {
            this.cancelEditing();
            return true;
          }
        },
        {
          key: 'Tab',
          run: () => {
            this.finishEditingAndMoveNext();
            return true;
          }
        },
        {
          key: 'Shift-Tab',
          run: () => {
            this.finishEditingAndMovePrev();
            return true;
          }
        }
      ]),

      // Minimal theme for cell editor
      EditorView.theme({
        '&': {
          backgroundColor: 'var(--background-primary, #1e1e1e)',
          color: 'var(--text-normal, #dcddde)',
          fontSize: '13px',
          fontFamily: 'inherit'
        },
        '.cm-content': {
          padding: '6px 12px',
          caretColor: 'var(--interactive-accent, #7c3aed)'
        },
        '&.cm-focused': {
          outline: 'none'
        },
        '.cm-line': {
          padding: '0'
        },
        '.cm-cursor': {
          borderLeftColor: 'var(--interactive-accent, #7c3aed)'
        },
        '.cm-selectionBackground': {
          backgroundColor: 'var(--interactive-accent-muted, rgba(124, 58, 237, 0.3))'
        },
        '&.cm-focused .cm-selectionBackground': {
          backgroundColor: 'var(--interactive-accent-muted, rgba(124, 58, 237, 0.3))'
        }
      }),

      // Listen for document changes to track dirty state
      EditorView.updateListener.of((update) => {
        if (update.docChanged && this.state.editingCell) {
          // Mark as potentially dirty (will be confirmed on finishEditing)
          console.log('Cell content changed');
        }
      })
    ];
  }

  /**
   * Finish editing and save the value
   */
  finishEditing() {
    if (!this.state.editingCell || !this.cellEditor) {
      return;
    }

    const { row, col } = this.state.editingCell;
    const newValue = this.cellEditor.state.doc.toString();
    const oldValue = this.originalEditValue;

    console.log('Finishing edit:', { row, col, oldValue, newValue });

    // Update the working data if value changed
    if (newValue !== oldValue) {
      if (this.state.workingRows[row]) {
        this.state.workingRows[row][col] = newValue;
      }
      // Check if dirty state changed
      this.checkDirty();
    }

    // Clean up the editing state
    this.cleanupEditing(row, col, newValue);
  }

  /**
   * Cancel editing and discard changes
   */
  cancelEditing() {
    if (!this.state.editingCell || !this.cellEditor) {
      return;
    }

    const { row, col } = this.state.editingCell;
    const originalValue = this.originalEditValue;

    console.log('Canceling edit:', { row, col, restoredValue: originalValue });

    // Clean up without updating the value (restore original)
    this.cleanupEditing(row, col, originalValue);
  }

  /**
   * Clean up after editing - restore cell display and state
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @param {string} displayValue - Value to display in the cell
   */
  cleanupEditing(row, col, displayValue) {
    // Get the cell element
    const cellElement = this.tableElement?.querySelector(`td[data-row="${row}"][data-col="${col}"]`);

    if (cellElement) {
      // Remove editing class and add selected class
      cellElement.classList.remove('csv-cell-editing');
      cellElement.classList.add('csv-cell-selected');

      // Restore text span
      const textSpan = cellElement.querySelector('.csv-cell-text');
      if (textSpan) {
        textSpan.textContent = displayValue;
        textSpan.style.display = '';
      }

      // Update tooltip
      cellElement.title = displayValue || '';

      // Remove CodeMirror DOM from cell (but keep instance for reuse)
      if (this.cellEditor && this.cellEditor.dom.parentNode === cellElement) {
        this.cellEditor.dom.remove();
      }
    }

    // Clear editing state
    this.state.editingCell = null;
    this.originalEditValue = null;

    // Focus the table container for keyboard navigation
    if (this.tableContainer) {
      this.tableContainer.focus();
    }
  }

  /**
   * Finish editing and move to next cell (Tab)
   */
  finishEditingAndMoveNext() {
    if (!this.state.editingCell) return;

    const { row, col } = this.state.editingCell;
    this.finishEditing();

    // Calculate next cell position
    const headers = this.state.data?.headers || [];
    const rows = this.state.workingRows || [];

    let nextRow = row;
    let nextCol = col + 1;

    // Wrap to next row if at end of columns
    if (nextCol >= headers.length) {
      nextCol = 0;
      nextRow = row + 1;
    }

    // Check if within bounds
    if (nextRow < rows.length) {
      this.selectCell(nextRow, nextCol);
      this.startEditing(nextRow, nextCol);
    }
  }

  /**
   * Finish editing and move to previous cell (Shift+Tab)
   */
  finishEditingAndMovePrev() {
    if (!this.state.editingCell) return;

    const { row, col } = this.state.editingCell;
    this.finishEditing();

    // Calculate previous cell position
    const headers = this.state.data?.headers || [];

    let prevRow = row;
    let prevCol = col - 1;

    // Wrap to previous row if at start of columns
    if (prevCol < 0) {
      prevCol = headers.length - 1;
      prevRow = row - 1;
    }

    // Check if within bounds
    if (prevRow >= 0) {
      this.selectCell(prevRow, prevCol);
      this.startEditing(prevRow, prevCol);
    }
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
    this.updateDirtyIndicator();
    return this.state.isDirty;
  }

  /**
   * Update the dirty indicator on the filename
   */
  updateDirtyIndicator() {
    const filenameEl = this.toolbar?.querySelector('.csv-filename');
    if (filenameEl) {
      if (this.state.isDirty) {
        filenameEl.classList.add('dirty');
      } else {
        filenameEl.classList.remove('dirty');
      }
    }
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
