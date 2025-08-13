// ModeToggle.js - Toggle between Chat and CLI modes
export class ModeToggle {
  constructor(options = {}) {
    this.currentMode = options.initialMode || 'chat';
    this.onToggle = options.onToggle || (() => {});
    this.disabled = false;
    this.element = null;
    this.button = null;
    
    this.createUI();
    this.setupKeyboardShortcuts();
  }
  
  createUI() {
    // Create container
    this.element = document.createElement('div');
    this.element.className = 'mode-toggle-container';
    
    // Create toggle button
    this.button = document.createElement('button');
    this.button.className = 'mode-toggle-button';
    this.button.setAttribute('role', 'switch');
    this.button.setAttribute('aria-checked', this.currentMode === 'cli');
    this.button.setAttribute('aria-label', `Switch to ${this.currentMode === 'chat' ? 'CLI' : 'Chat'} mode`);
    this.button.title = `${this.currentMode === 'chat' ? 'CLI' : 'Chat'} Mode (${navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+\`)`;
    
    this.updateButtonContent();
    
    // Add click handler
    this.button.addEventListener('click', () => {
      if (!this.disabled) {
        this.toggle();
      }
    });
    
    this.element.appendChild(this.button);
  }
  
  updateButtonContent() {
    const isCliMode = this.currentMode === 'cli';
    
    this.button.innerHTML = `
      <svg class="mode-icon mode-icon-chat ${!isCliMode ? 'active' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <div class="mode-toggle-track">
        <div class="mode-toggle-thumb ${isCliMode ? 'cli-mode' : ''}"></div>
      </div>
      <svg class="mode-icon mode-icon-cli ${isCliMode ? 'active' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <path d="M9 9l3 3-3 3"></path>
        <line x1="16" y1="15" x2="16" y2="15"></line>
      </svg>
    `;
    
    this.button.classList.toggle('cli-mode', isCliMode);
  }
  
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + ` to toggle mode
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault();
        if (!this.disabled) {
          this.toggle();
        }
      }
    });
  }
  
  toggle() {
    this.currentMode = this.currentMode === 'chat' ? 'cli' : 'chat';
    this.updateButtonContent();
    this.button.setAttribute('aria-checked', this.currentMode === 'cli');
    this.button.setAttribute('aria-label', `Switch to ${this.currentMode === 'chat' ? 'CLI' : 'Chat'} mode`);
    this.button.title = `${this.currentMode === 'chat' ? 'CLI' : 'Chat'} Mode (${navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+\`)`;
    
    // Emit toggle event
    this.onToggle(this.currentMode);
    
    // Log for debugging
    console.log(`🔄 Mode toggled to: ${this.currentMode}`);
  }
  
  setMode(mode) {
    if (mode !== 'chat' && mode !== 'cli') {
      console.error('Invalid mode:', mode);
      return;
    }
    
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.updateButtonContent();
      this.button.setAttribute('aria-checked', this.currentMode === 'cli');
      this.button.setAttribute('aria-label', `Switch to ${this.currentMode === 'chat' ? 'CLI' : 'Chat'} mode`);
    }
  }
  
  setDisabled(disabled) {
    this.disabled = disabled;
    this.button.disabled = disabled;
    this.button.classList.toggle('disabled', disabled);
  }
  
  mount(container) {
    container.appendChild(this.element);
  }
  
  unmount() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}