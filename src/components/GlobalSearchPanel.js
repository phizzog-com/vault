/**
 * GlobalSearchPanel - Premium-gated global search interface
 * Provides semantic search across all vaults using PACASDB
 */
import PremiumGate from './PremiumGate.js';

export default class GlobalSearchPanel {
  constructor(entitlementManager, pacasdbClient = null) {
    this.entitlementManager = entitlementManager;
    this.pacasdbClient = pacasdbClient;
    this.element = null;
    this.searchInput = null;
    this.modeSelector = null;
    this.vaultFilter = null;
    this.resultsContainer = null;
  }

  /**
   * Render the search panel
   * @returns {HTMLElement}
   */
  render() {
    if (this.element) {
      return this.element;
    }

    // Check premium access first
    const gate = PremiumGate.wrap(this.entitlementManager, 'Global Search');
    if (gate) {
      this.element = gate.render();
      return this.element;
    }

    // Premium enabled - show search interface
    const container = document.createElement('div');
    container.className = 'global-search-panel';

    // Search input
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = 'Search across all vaults...';
    this.searchInput.className = 'search-input';
    searchContainer.appendChild(this.searchInput);

    // Controls row
    const controlsRow = document.createElement('div');
    controlsRow.className = 'search-controls';

    // Mode selector
    this.modeSelector = document.createElement('select');
    this.modeSelector.className = 'search-mode';

    const modes = [
      { value: 'hybrid', label: 'Hybrid Search' },
      { value: 'semantic', label: 'Semantic' },
      { value: 'keyword', label: 'Keyword' },
      { value: 'cognitive', label: 'Cognitive' }
    ];

    modes.forEach(mode => {
      const option = document.createElement('option');
      option.value = mode.value;
      option.textContent = mode.label;
      this.modeSelector.appendChild(option);
    });

    controlsRow.appendChild(this.modeSelector);

    // Vault filter
    this.vaultFilter = document.createElement('select');
    this.vaultFilter.className = 'vault-filter';

    const allVaultsOption = document.createElement('option');
    allVaultsOption.value = 'all';
    allVaultsOption.textContent = 'All Vaults';
    this.vaultFilter.appendChild(allVaultsOption);

    controlsRow.appendChild(this.vaultFilter);

    // Results container
    this.resultsContainer = document.createElement('div');
    this.resultsContainer.className = 'search-results';

    // Assemble panel
    container.appendChild(searchContainer);
    container.appendChild(controlsRow);
    container.appendChild(this.resultsContainer);

    this.element = container;
    return container;
  }

  /**
   * Remove the panel from DOM
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.searchInput = null;
    this.modeSelector = null;
    this.vaultFilter = null;
    this.resultsContainer = null;
  }
}
