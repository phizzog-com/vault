// ToolUseCard.js - Display tool use events in chat
import { icons } from '../icons/icon-utils.js';

export class ToolUseCard {
  constructor(options = {}) {
    this.id = options.id || `tool-${Date.now()}`;
    this.toolName = options.toolName || 'Unknown Tool';
    this.toolInput = options.toolInput || {};
    this.result = options.result || null;
    this.status = options.status || 'pending'; // pending, running, success, error
    this.expanded = false;
    this.element = null;

    this.createUI();
  }

  getToolIcon() {
    const toolIcons = {
      search_notes: 'search',
      get_note: 'fileText',
      get_current_note: 'file',
      list_tags: 'tags',
      notes_by_tag: 'tag',
      semantic_search: 'sparkles',
      write_note: 'filePlus',
      update_note: 'fileEdit',
      append_to_note: 'filePlus2',
      WebSearch: 'globe'
    };

    const iconName = toolIcons[this.toolName] || 'wrench';
    return icons[iconName] ? icons[iconName]({ size: 14 }) : icons.wrench({ size: 14 });
  }

  getStatusIcon() {
    switch (this.status) {
      case 'running':
        return `<span class="tool-status-spinner"></span>`;
      case 'success':
        return icons.checkCircle({ size: 14, class: 'status-success' });
      case 'error':
        return icons.xCircle({ size: 14, class: 'status-error' });
      default:
        return icons.clock({ size: 14, class: 'status-pending' });
    }
  }

  formatToolName() {
    // Convert snake_case to Title Case
    return this.toolName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  formatInput() {
    if (!this.toolInput || Object.keys(this.toolInput).length === 0) {
      return '<span class="no-input">No parameters</span>';
    }

    return Object.entries(this.toolInput)
      .map(([key, value]) => {
        const displayValue = typeof value === 'string'
          ? (value.length > 100 ? value.substring(0, 100) + '...' : value)
          : JSON.stringify(value);
        return `<div class="tool-param">
          <span class="param-key">${key}:</span>
          <span class="param-value">${this.escapeHtml(displayValue)}</span>
        </div>`;
      })
      .join('');
  }

  formatResult() {
    if (!this.result) {
      return '<span class="no-result">Waiting for result...</span>';
    }

    try {
      // Try to parse if it's a JSON string
      let parsed = this.result;
      if (typeof this.result === 'string') {
        try {
          parsed = JSON.parse(this.result);
        } catch {
          // Not JSON, use as-is
        }
      }

      // Handle content array from MCP response
      if (parsed.content && Array.isArray(parsed.content)) {
        const textContent = parsed.content
          .filter(c => c.type === 'text')
          .map(c => {
            try {
              return JSON.parse(c.text);
            } catch {
              return c.text;
            }
          });
        parsed = textContent.length === 1 ? textContent[0] : textContent;
      }

      // Format based on result type
      if (parsed.error) {
        return `<span class="result-error">${this.escapeHtml(parsed.error)}</span>`;
      }

      if (parsed.results && Array.isArray(parsed.results)) {
        return `<span class="result-count">${parsed.results.length} results found</span>`;
      }

      if (parsed.success) {
        return `<span class="result-success">${this.escapeHtml(parsed.message || 'Success')}</span>`;
      }

      // Truncate long results
      const str = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
      const truncated = str.length > 200 ? str.substring(0, 200) + '...' : str;
      return `<pre class="result-json">${this.escapeHtml(truncated)}</pre>`;

    } catch (e) {
      return `<span class="result-raw">${this.escapeHtml(String(this.result).substring(0, 200))}</span>`;
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  createUI() {
    this.element = document.createElement('div');
    this.element.className = `tool-use-card status-${this.status}`;
    this.element.setAttribute('data-tool-id', this.id);

    this.render();
  }

  render() {
    this.element.innerHTML = `
      <div class="tool-card-header" onclick="this.parentElement.toolCard?.toggleExpand()">
        <div class="tool-info">
          <span class="tool-icon">${this.getToolIcon()}</span>
          <span class="tool-name">${this.formatToolName()}</span>
        </div>
        <div class="tool-status">
          ${this.getStatusIcon()}
          <span class="expand-icon ${this.expanded ? 'expanded' : ''}">${icons.chevronDown({ size: 12 })}</span>
        </div>
      </div>
      <div class="tool-card-body ${this.expanded ? 'expanded' : ''}">
        <div class="tool-section">
          <div class="section-label">Input</div>
          <div class="section-content">${this.formatInput()}</div>
        </div>
        ${this.result !== null ? `
          <div class="tool-section">
            <div class="section-label">Result</div>
            <div class="section-content">${this.formatResult()}</div>
          </div>
        ` : ''}
      </div>
    `;

    // Store reference for click handler
    this.element.toolCard = this;
  }

  toggleExpand() {
    this.expanded = !this.expanded;
    this.render();
  }

  setStatus(status) {
    this.status = status;
    this.element.className = `tool-use-card status-${this.status}`;
    this.render();
  }

  setResult(result) {
    this.result = result;
    this.status = result?.error ? 'error' : 'success';
    this.element.className = `tool-use-card status-${this.status}`;
    this.render();
  }

  getElement() {
    return this.element;
  }
}
