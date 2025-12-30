/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// Mock EntitlementManager
jest.unstable_mockModule('../../src/services/entitlement-manager.js', () => ({
  default: class MockEntitlementManager {
    constructor() {
      this.status = { type: 'Unlicensed' };
    }
    isPremiumEnabled() {
      return ['Trial', 'Licensed', 'GracePeriod'].includes(this.status.type);
    }
    getStatus() {
      return this.status;
    }
    getDaysRemaining() {
      if (this.status.type === 'Trial') {
        return this.status.days_remaining || 0;
      }
      return null;
    }
  }
}));

// Mock PACASDBClient
jest.unstable_mockModule('../../src/services/pacasdb-client.js', () => ({
  default: class MockPACASDBClient {
    async search() {
      return {
        items: [
          { title: 'Test Note', content: 'Test content', score: 0.95 }
        ],
        total: 1,
        should_abstain: false
      };
    }
    async isConnected() {
      return true;
    }
  }
}));

let GlobalSearchPanel;
let mockEntitlementManager;
let EntitlementManager;
let PremiumGate;

describe('GlobalSearchPanel', () => {
  beforeEach(async () => {
    // Clear DOM
    document.body.innerHTML = '';

    // Import modules
    const entitlementModule = await import('../../src/services/entitlement-manager.js');
    EntitlementManager = entitlementModule.default;
    mockEntitlementManager = new EntitlementManager();

    const gateModule = await import('../../src/components/PremiumGate.js');
    PremiumGate = gateModule.default;

    const panelModule = await import('../../src/components/GlobalSearchPanel.js');
    GlobalSearchPanel = panelModule.default;
  });

  describe('render() with PremiumGate integration', () => {
    test('should call PremiumGate.wrap() first when not premium', () => {
      // Set unlicensed
      mockEntitlementManager.status = { type: 'Unlicensed' };

      const panel = new GlobalSearchPanel(mockEntitlementManager);
      const element = panel.render();

      // Should return PremiumGate element
      expect(element).toBeTruthy();
      expect(element.textContent).toContain('Global Search');
      expect(element.textContent).toContain('requires premium');
    });

    test('should show upgrade prompt when not premium', () => {
      mockEntitlementManager.status = { type: 'Unlicensed' };

      const panel = new GlobalSearchPanel(mockEntitlementManager);
      const element = panel.render();

      // Should have premium gate with upgrade buttons
      expect(element.textContent).toContain('Start Free Trial');
      expect(element.textContent).toContain('Purchase License');
    });

    test('should show search interface when premium', () => {
      mockEntitlementManager.status = { type: 'Licensed' };

      const panel = new GlobalSearchPanel(mockEntitlementManager);
      const element = panel.render();

      // Should NOT show premium gate
      expect(element.textContent).not.toContain('requires premium');
      expect(element.textContent).not.toContain('Start Free Trial');

      // Should show search interface
      const searchInput = element.querySelector('input[type="text"]');
      expect(searchInput).toBeTruthy();
    });
  });

  describe('search interface elements', () => {
    beforeEach(() => {
      // Set premium for these tests
      mockEntitlementManager.status = { type: 'Licensed' };
    });

    test('should have search input with correct placeholder', () => {
      const panel = new GlobalSearchPanel(mockEntitlementManager);
      const element = panel.render();

      const searchInput = element.querySelector('input[type="text"]');
      expect(searchInput).toBeTruthy();
      expect(searchInput.placeholder).toBe('Search across all vaults...');
    });

    test('should have mode selector with all search modes', () => {
      const panel = new GlobalSearchPanel(mockEntitlementManager);
      const element = panel.render();

      const modeSelector = element.querySelector('select.search-mode');
      expect(modeSelector).toBeTruthy();

      const options = Array.from(modeSelector.querySelectorAll('option'));
      const optionValues = options.map(opt => opt.value);

      expect(optionValues).toContain('hybrid');
      expect(optionValues).toContain('semantic');
      expect(optionValues).toContain('keyword');
      expect(optionValues).toContain('cognitive');
    });

    test('should have vault filter dropdown', () => {
      const panel = new GlobalSearchPanel(mockEntitlementManager);
      const element = panel.render();

      const vaultFilter = element.querySelector('select.vault-filter');
      expect(vaultFilter).toBeTruthy();

      // Should have "All Vaults" option
      const allVaultsOption = vaultFilter.querySelector('option[value="all"]');
      expect(allVaultsOption).toBeTruthy();
      expect(allVaultsOption.textContent).toBe('All Vaults');
    });

    test('should return same element on multiple renders', () => {
      const panel = new GlobalSearchPanel(mockEntitlementManager);
      const element1 = panel.render();
      const element2 = panel.render();

      expect(element1).toBe(element2);
    });
  });

  describe('Trial state', () => {
    test('should show search interface when trial is active', () => {
      mockEntitlementManager.status = {
        type: 'Trial',
        days_remaining: 15
      };

      const panel = new GlobalSearchPanel(mockEntitlementManager);
      const element = panel.render();

      // Should show search interface, not premium gate
      const searchInput = element.querySelector('input[type="text"]');
      expect(searchInput).toBeTruthy();
      expect(element.textContent).not.toContain('Start Free Trial');
    });
  });

  describe('GracePeriod state', () => {
    test('should show search interface when in grace period', () => {
      mockEntitlementManager.status = {
        type: 'GracePeriod',
        days_left: 5
      };

      const panel = new GlobalSearchPanel(mockEntitlementManager);
      const element = panel.render();

      // Should show search interface
      const searchInput = element.querySelector('input[type="text"]');
      expect(searchInput).toBeTruthy();
    });
  });

  describe('destroy() method', () => {
    test('should remove element from DOM', () => {
      mockEntitlementManager.status = { type: 'Licensed' };

      const panel = new GlobalSearchPanel(mockEntitlementManager);
      const element = panel.render();

      document.body.appendChild(element);
      expect(document.body.contains(element)).toBe(true);

      panel.destroy();
      expect(document.body.contains(element)).toBe(false);
    });

    test('should clear element reference', () => {
      mockEntitlementManager.status = { type: 'Licensed' };

      const panel = new GlobalSearchPanel(mockEntitlementManager);
      panel.render();

      expect(panel.element).not.toBeNull();

      panel.destroy();
      expect(panel.element).toBeNull();
    });
  });

  describe('search input handling', () => {
    let mockPacasdbClient;

    beforeEach(async () => {
      mockEntitlementManager.status = { type: 'Licensed' };

      const clientModule = await import('../../src/services/pacasdb-client.js');
      mockPacasdbClient = new clientModule.default();
      mockPacasdbClient.search = jest.fn(async () => ({
        items: [
          { title: 'Result 1', content: 'Content 1', score: 0.95 }
        ],
        total: 1,
        should_abstain: false
      }));
    });

    test('should ignore queries with less than 2 characters', () => {
      const panel = new GlobalSearchPanel(mockEntitlementManager, mockPacasdbClient);
      panel.render();

      // Call with single character
      panel.onSearchInput('a');

      // Should not trigger search
      expect(mockPacasdbClient.search).not.toHaveBeenCalled();
    });

    test('should clear results for empty input', () => {
      const panel = new GlobalSearchPanel(mockEntitlementManager, mockPacasdbClient);
      const element = panel.render();

      // First add some results
      panel.resultsContainer.innerHTML = '<div>Previous results</div>';

      // Clear with empty input
      panel.onSearchInput('');

      // Results should be cleared
      expect(panel.resultsContainer.innerHTML).toBe('');
    });

    test('should debounce input with 300ms delay', (done) => {
      jest.useFakeTimers();

      const panel = new GlobalSearchPanel(mockEntitlementManager, mockPacasdbClient);
      panel.render();

      // Trigger multiple inputs quickly
      panel.onSearchInput('test');
      panel.onSearchInput('test query');

      // Should not call immediately
      expect(mockPacasdbClient.search).not.toHaveBeenCalled();

      // Fast-forward 200ms
      jest.advanceTimersByTime(200);
      expect(mockPacasdbClient.search).not.toHaveBeenCalled();

      // Fast-forward to 300ms
      jest.advanceTimersByTime(100);

      // Now it should have been called once (debounced)
      setTimeout(() => {
        expect(mockPacasdbClient.search).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
        done();
      }, 50);

      jest.runAllTimers();
    });
  });

  describe('search execution', () => {
    let mockPacasdbClient;

    beforeEach(async () => {
      mockEntitlementManager.status = { type: 'Licensed' };

      const clientModule = await import('../../src/services/pacasdb-client.js');
      mockPacasdbClient = new clientModule.default();
      mockPacasdbClient.search = jest.fn(async () => ({
        items: [
          { title: 'Result 1', content: 'Content 1', score: 0.95 }
        ],
        total: 1,
        should_abstain: false
      }));
    });

    test('should show loading state during search', async () => {
      const panel = new GlobalSearchPanel(mockEntitlementManager, mockPacasdbClient);
      const element = panel.render();

      // Start search
      const searchPromise = panel.performSearch('test query');

      // Should show loading
      expect(panel.isLoading).toBe(true);

      await searchPromise;

      // Loading should be false after completion
      expect(panel.isLoading).toBe(false);
    });

    test('should call pacasdbClient.search() with query', async () => {
      const panel = new GlobalSearchPanel(mockEntitlementManager, mockPacasdbClient);
      panel.render();

      await panel.performSearch('test query');

      expect(mockPacasdbClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'test query'
        })
      );
    });

    test('should send correct query for hybrid mode', async () => {
      const panel = new GlobalSearchPanel(mockEntitlementManager, mockPacasdbClient);
      const element = panel.render();

      panel.modeSelector.value = 'hybrid';

      await panel.performSearch('test query');

      expect(mockPacasdbClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'test query',
          mode: 'hybrid'
        })
      );
    });

    test('should send correct query for semantic mode', async () => {
      const panel = new GlobalSearchPanel(mockEntitlementManager, mockPacasdbClient);
      const element = panel.render();

      panel.modeSelector.value = 'semantic';

      await panel.performSearch('test query');

      expect(mockPacasdbClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'test query',
          mode: 'semantic'
        })
      );
    });

    test('should send correct query for keyword mode', async () => {
      const panel = new GlobalSearchPanel(mockEntitlementManager, mockPacasdbClient);
      const element = panel.render();

      panel.modeSelector.value = 'keyword';

      await panel.performSearch('test query');

      expect(mockPacasdbClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          keywords: 'test query',
          mode: 'keyword'
        })
      );
    });

    test('should render results after search', async () => {
      mockPacasdbClient.search = jest.fn(async () => ({
        items: [
          { title: 'Note 1', content: 'Content 1', score: 0.95 },
          { title: 'Note 2', content: 'Content 2', score: 0.85 }
        ],
        total: 2,
        should_abstain: false
      }));

      const panel = new GlobalSearchPanel(mockEntitlementManager, mockPacasdbClient);
      const element = panel.render();

      await panel.performSearch('test');

      // Should render results
      const resultElements = panel.resultsContainer.querySelectorAll('.search-result');
      expect(resultElements.length).toBe(2);
    });
  });
});
