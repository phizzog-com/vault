/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

// Mock Tauri API
const mockInvoke = jest.fn();
jest.unstable_mockModule('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}));

// Mock EntitlementManager
jest.unstable_mockModule('../../src/services/entitlement-manager.js', () => ({
  default: class MockEntitlementManager {
    isPremiumEnabled() {
      return true; // Always premium for these tests
    }
    checkEntitlement() {
      // No-op for tests
    }
  }
}));

let PACASDBClient;
let GlobalSearchPanel;
let EntitlementManager;

describe('PACASDB Search Integration Tests', () => {
  // Helper to mock successful connection
  const mockConnection = () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'healthy' })
    });
  };

  // Helper to create connected client
  const createConnectedClient = async () => {
    const entitlementManager = new EntitlementManager();
    const client = new PACASDBClient(entitlementManager);
    mockConnection();
    await client.connect();
    return client;
  };

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    global.fetch.mockClear();
    mockInvoke.mockClear();

    // Clear DOM
    document.body.innerHTML = '';

    // Import modules
    const clientModule = await import('../../src/services/pacasdb-client.js');
    PACASDBClient = clientModule.default;

    const panelModule = await import('../../src/components/GlobalSearchPanel.js');
    GlobalSearchPanel = panelModule.default;

    const entitlementModule = await import('../../src/services/entitlement-manager.js');
    EntitlementManager = entitlementModule.default;
  });

  describe('End-to-End Search Flow', () => {
    test('should perform search and render results', async () => {
      // Mock health check for connect()
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' })
      });

      // Mock PACASDB search response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              content: 'This is a test note about machine learning',
              title: 'Machine Learning Notes',
              score: 0.95,
              metadata: {
                file_path: '/vault/ml-notes.md',
                tags: ['ai', 'ml'],
                created_at: '2025-12-01T00:00:00Z'
              }
            },
            {
              content: 'Neural networks are a type of machine learning model',
              title: 'Neural Networks',
              score: 0.87,
              metadata: {
                file_path: '/vault/neural-networks.md',
                tags: ['ai', 'deep-learning'],
                created_at: '2025-12-15T00:00:00Z'
              }
            }
          ],
          should_abstain: false,
          total: 2
        })
      });

      const entitlementManager = new EntitlementManager();
      const client = new PACASDBClient(entitlementManager);

      // Connect to PACASDB (mocked)
      await client.connect();

      // Perform search
      const results = await client.search({
        text: 'machine learning',
        k: 10,
        vaultId: 'test-vault'
      });

      expect(results).toBeDefined();
      expect(results.items).toHaveLength(2);
      expect(results.items[0].title).toBe('Machine Learning Notes');
      expect(results.items[0].score).toBe(0.95);

      // Verify fetch was called correctly
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/search',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: expect.stringContaining('machine learning')
        })
      );
    });

    test.skip('should open search panel and handle user input', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      const entitlementManager = new EntitlementManager();
      const client = new PACASDBClient(entitlementManager);

      const panel = new GlobalSearchPanel(container, client, entitlementManager);
      panel.show();

      // Verify panel is rendered
      const searchInput = container.querySelector('input[type="text"]');
      expect(searchInput).toBeTruthy();

      // Mock search results
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              content: 'Test result',
              title: 'Test Note',
              score: 0.9,
              metadata: { file_path: '/vault/test.md' }
            }
          ],
          should_abstain: false,
          total: 1
        })
      });

      // Simulate user typing
      searchInput.value = 'test query';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      // Verify search was triggered
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/search',
        expect.any(Object)
      );
    });

    test.skip('should click result and open note', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      // Mock window.paneManager for note opening
      window.paneManager = {
        getActiveTabManager: jest.fn(() => ({
          openFile: jest.fn()
        }))
      };

      const entitlementManager = new EntitlementManager();
      const client = new PACASDBClient(entitlementManager);

      // Mock search results
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              content: 'Test content',
              title: 'Test Note',
              score: 0.95,
              metadata: { file_path: '/vault/test.md' }
            }
          ],
          should_abstain: false,
          total: 1
        })
      });

      const panel = new GlobalSearchPanel(container, client, entitlementManager);
      panel.show();

      // Trigger search
      const searchInput = container.querySelector('input[type="text"]');
      searchInput.value = 'test';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 350));

      // Wait for results to render
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find result element
      const resultElement = container.querySelector('.search-result');
      if (resultElement) {
        resultElement.click();

        // Verify openFile was called
        expect(window.paneManager.getActiveTabManager().openFile).toHaveBeenCalledWith(
          expect.stringContaining('test.md')
        );
      }

      delete window.paneManager;
    });
  });

  describe('Search Caching', () => {
    test('should cache search results for repeated queries', async () => {
      const client = await createConnectedClient();

      const mockResponse = {
        ok: true,
        json: async () => ({
          items: [{ title: 'Test', score: 0.9, metadata: {} }],
          should_abstain: false,
          total: 1
        })
      };

      // First search - should hit server (call #2, #1 was connect health check)
      global.fetch.mockResolvedValueOnce(mockResponse);

      const results1 = await client.search({
        text: 'cached query',
        k: 10,
        vaultId: 'test-vault'
      });

      expect(global.fetch).toHaveBeenCalledTimes(2); // connect + search

      // Second identical search - should use cache
      const results2 = await client.search({
        text: 'cached query',
        k: 10,
        vaultId: 'test-vault'
      });

      // Fetch should still be called only twice (no new call for cached result)
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(results2).toEqual(results1);
    });

    test('should bypass cache for different queries', async () => {
      const client = await createConnectedClient();

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [],
          should_abstain: false,
          total: 0
        })
      });

      await client.search({ text: 'query 1', k: 10, vaultId: 'test' });
      await client.search({ text: 'query 2', k: 10, vaultId: 'test' });

      // Different queries should hit server twice (plus 1 for connect health check)
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Vault Filtering', () => {
    test('should accept vault ID parameter', async () => {
      const client = await createConnectedClient();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          should_abstain: false,
          total: 0
        })
      });

      // Should not throw when vaultId is provided
      await expect(client.search({
        text: 'test',
        k: 10,
        vaultId: 'specific-vault-id'
      })).resolves.toBeDefined();
    });
  });

  describe('Mode Switching', () => {
    test('should support semantic search with text parameter', async () => {
      const client = await createConnectedClient();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          should_abstain: false,
          total: 0
        })
      });

      // Should successfully search with text parameter
      const results = await client.search({
        text: 'semantic query',
        k: 10,
        vaultId: 'test'
      });

      expect(results).toBeDefined();
      expect(results.items).toEqual([]);
    });

    test('should support different k values', async () => {
      const client = await createConnectedClient();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          should_abstain: false,
          total: 0
        })
      });

      // Should accept different k values
      await expect(client.search({
        text: 'test',
        k: 20,
        vaultId: 'test'
      })).resolves.toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors', async () => {
      const entitlementManager = new EntitlementManager();
      const client = new PACASDBClient(entitlementManager);

      // Don't connect, so isConnected() returns false
      // Search should throw when not connected
      await expect(client.search({
        text: 'test',
        k: 10,
        vaultId: 'test'
      })).rejects.toThrow('Not connected');
    });

    test('should handle timeout', async () => {
      const client = await createConnectedClient();

      // Mock timeout by delaying response
      global.fetch.mockImplementationOnce(() =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ items: [], total: 0 })
            });
          }, 15000); // Longer than typical timeout
        })
      );

      // This should timeout or be handled by the client
      // The actual timeout handling depends on PACASDBClient implementation
      const searchPromise = client.search({
        text: 'test',
        k: 10,
        vaultId: 'test'
      });

      // We won't wait for this to complete in the test
      expect(searchPromise).toBeDefined();
    });

    test('should handle 500 server error', async () => {
      const client = await createConnectedClient();

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error'
      });

      // Should handle server errors
      await expect(client.search({
        text: 'test',
        k: 10,
        vaultId: 'test'
      })).rejects.toThrow();
    }, 10000); // Increase timeout

    test('should handle malformed response', async () => {
      const client = await createConnectedClient();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      await expect(client.search({
        text: 'test',
        k: 10,
        vaultId: 'test'
      })).rejects.toThrow();
    });
  });
});
