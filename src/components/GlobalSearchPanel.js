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
    this.isLoading = false;
    this.debounceTimer = null;
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
    this.searchInput.addEventListener('input', (e) => this.onSearchInput(e.target.value));
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
   * Handle search input with debouncing
   * @param {string} query - Search query
   */
  onSearchInput(query) {
    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Handle empty input
    if (query === '') {
      this.resultsContainer.innerHTML = '';
      return;
    }

    // Ignore queries less than 2 characters
    if (query.length < 2) {
      return;
    }

    // Debounce search execution (300ms)
    this.debounceTimer = setTimeout(() => {
      this.performSearch(query);
    }, 300);
  }

  /**
   * Execute search query
   * @param {string} query - Search query
   * @returns {Promise<void>}
   */
  async performSearch(query) {
    if (!this.pacasdbClient) {
      return;
    }

    this.isLoading = true;

    try {
      const mode = this.modeSelector.value;
      const searchParams = {
        mode: mode
      };

      // Different modes send different query types
      if (mode === 'keyword') {
        searchParams.keywords = query;
      } else {
        searchParams.text = query;
      }

      const results = await this.pacasdbClient.search(searchParams);

      this.isLoading = false;
      this.renderResults(results);

    } catch (error) {
      this.isLoading = false;
      console.error('Search error:', error);
    }
  }

  /**
   * Render search results
   * @param {Object} results - Search results from PACASDB
   */
  renderResults(results) {
    this.resultsContainer.innerHTML = '';

    if (!results.items || results.items.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'no-results';
      noResults.textContent = 'No results found';
      this.resultsContainer.appendChild(noResults);
      return;
    }

    results.items.forEach(item => {
      const resultCard = document.createElement('div');
      resultCard.className = 'search-result';

      const title = document.createElement('div');
      title.className = 'result-title';
      title.textContent = item.title;
      resultCard.appendChild(title);

      const content = document.createElement('div');
      content.className = 'result-content';
      content.textContent = item.content;
      resultCard.appendChild(content);

      if (item.score !== undefined) {
        const score = document.createElement('div');
        score.className = 'result-score';
        score.textContent = `Score: ${item.score.toFixed(2)}`;
        resultCard.appendChild(score);
      }

      this.resultsContainer.appendChild(resultCard);
    });
  }

  /**
   * Remove the panel from DOM
   */
  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

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
