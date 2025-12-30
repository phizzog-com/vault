import { jest } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

// Mock EntitlementManager before importing PACASDBClient
jest.unstable_mockModule('../../src/services/entitlement-manager.js', () => ({
  default: class MockEntitlementManager {
    constructor() {
      this.premiumEnabled = false;
    }
    isPremiumEnabled() {
      return this.premiumEnabled;
    }
  }
}));

let PACASDBClient;
let EntitlementManager;

describe('PACASDBClient', () => {
  let client;
  let mockEntitlementManager;

  beforeEach(async () => {
    // Clear mocks
    jest.clearAllMocks();
    global.fetch.mockClear();

    // Import modules
    const entitlementModule = await import('../../src/services/entitlement-manager.js');
    EntitlementManager = entitlementModule.default;

    const clientModule = await import('../../src/services/pacasdb-client.js');
    PACASDBClient = clientModule.default;

    // Create instance with mocked entitlement manager
    mockEntitlementManager = new EntitlementManager();
    client = new PACASDBClient(mockEntitlementManager);
  });

  describe('checkEntitlement()', () => {
    test('should throw error when premium not enabled', () => {
      // Mock premium disabled
      mockEntitlementManager.premiumEnabled = false;

      // Should throw
      expect(() => client.checkEntitlement()).toThrow('Premium features not enabled');
    });

    test('should not throw when premium enabled', () => {
      // Mock premium enabled
      mockEntitlementManager.premiumEnabled = true;

      // Should not throw
      expect(() => client.checkEntitlement()).not.toThrow();
    });

    test('should throw with custom message for specific features', () => {
      mockEntitlementManager.premiumEnabled = false;

      expect(() => client.checkEntitlement('PACASDB search'))
        .toThrow('PACASDB search requires premium');
    });
  });

  describe('connect()', () => {
    test('should make health check to localhost:8000', async () => {
      mockEntitlementManager.premiumEnabled = true;

      // Mock successful health check
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'healthy' })
      });

      await client.connect();

      // Verify fetch called with correct URL
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/health',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Object)
        })
      );
    });

    test('should return true when server is healthy', async () => {
      mockEntitlementManager.premiumEnabled = true;

      // Mock successful health check
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'healthy' })
      });

      const result = await client.connect();

      expect(result).toBe(true);
      expect(client.isConnected()).toBe(true);
    });

    test('should return false when server is unreachable', async () => {
      mockEntitlementManager.premiumEnabled = true;

      // Mock network error
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.connect();

      expect(result).toBe(false);
      expect(client.isConnected()).toBe(false);
    });

    test('should return false when server returns error status', async () => {
      mockEntitlementManager.premiumEnabled = true;

      // Mock server error
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await client.connect();

      expect(result).toBe(false);
      expect(client.isConnected()).toBe(false);
    });

    test('should set connection timeout', async () => {
      mockEntitlementManager.premiumEnabled = true;

      // Mock successful response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'healthy' })
      });

      await client.connect();

      // Verify timeout signal was passed
      const fetchCall = global.fetch.mock.calls[0];
      expect(fetchCall[1]).toHaveProperty('signal');
    });

    test('should handle timeout gracefully', async () => {
      mockEntitlementManager.premiumEnabled = true;

      // Mock timeout error
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'AbortError';
      global.fetch.mockRejectedValueOnce(timeoutError);

      const result = await client.connect();

      expect(result).toBe(false);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('isConnected()', () => {
    test('should return false initially', () => {
      expect(client.isConnected()).toBe(false);
    });

    test('should return true after successful connection', async () => {
      mockEntitlementManager.premiumEnabled = true;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'healthy' })
      });

      await client.connect();

      expect(client.isConnected()).toBe(true);
    });

    test('should return false after failed connection', async () => {
      mockEntitlementManager.premiumEnabled = true;

      global.fetch.mockRejectedValueOnce(new Error('Connection failed'));

      await client.connect();

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('indexDocument()', () => {
    beforeEach(() => {
      mockEntitlementManager.premiumEnabled = true;
      client.connected = true;
    });

    test('should send correct payload structure with vault_id', async () => {
      const document = {
        id: 'doc-123',
        content: 'This is a test document',
        metadata: {
          title: 'Test Document',
          created: '2025-12-30T00:00:00Z'
        }
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ doc_id: 'doc-123', indexed: true })
      });

      await client.indexDocument(document, 'vault-001');

      // Verify payload includes vault_id
      const fetchCall = global.fetch.mock.calls[0];
      expect(fetchCall[0]).toBe('http://localhost:8000/index');
      expect(fetchCall[1].method).toBe('POST');

      const payload = JSON.parse(fetchCall[1].body);
      expect(payload).toHaveProperty('vault_id', 'vault-001');
      expect(payload).toHaveProperty('document', document);
    });

    test('should return doc_id on successful indexing', async () => {
      const document = {
        id: 'doc-456',
        content: 'Another test'
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ doc_id: 'doc-456', indexed: true })
      });

      const result = await client.indexDocument(document, 'vault-001');

      expect(result).toEqual({ doc_id: 'doc-456', indexed: true });
    });

    test('should clear cache after successful indexing', async () => {
      const document = { id: 'doc-789', content: 'Test' };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ doc_id: 'doc-789', indexed: true })
      });

      // Add spy for clearCache method
      const clearCacheSpy = jest.spyOn(client, 'clearCache');

      await client.indexDocument(document, 'vault-001');

      expect(clearCacheSpy).toHaveBeenCalled();

      clearCacheSpy.mockRestore();
    });

    test('should throw error when not connected', async () => {
      client.connected = false;

      await expect(
        client.indexDocument({ id: 'doc-1', content: 'test' }, 'vault-001')
      ).rejects.toThrow('Not connected to PACASDB server');
    });
  });

  describe('batchIndex()', () => {
    beforeEach(() => {
      mockEntitlementManager.premiumEnabled = true;
      client.connected = true;
    });

    test('should add vault_id to all documents in batch', async () => {
      const documents = [
        { id: 'doc-1', content: 'First document' },
        { id: 'doc-2', content: 'Second document' },
        { id: 'doc-3', content: 'Third document' }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          indexed: 3,
          failed: 0,
          results: [
            { doc_id: 'doc-1', success: true },
            { doc_id: 'doc-2', success: true },
            { doc_id: 'doc-3', success: true }
          ]
        })
      });

      await client.batchIndex(documents, 'vault-002');

      // Verify all documents have vault_id
      const fetchCall = global.fetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);

      expect(payload).toHaveProperty('vault_id', 'vault-002');
      expect(payload).toHaveProperty('documents', documents);
      expect(payload.documents).toHaveLength(3);
    });

    test('should return indexed and failed counts', async () => {
      const documents = [
        { id: 'doc-1', content: 'First' },
        { id: 'doc-2', content: 'Second' }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          indexed: 2,
          failed: 0,
          results: [
            { doc_id: 'doc-1', success: true },
            { doc_id: 'doc-2', success: true }
          ]
        })
      });

      const result = await client.batchIndex(documents, 'vault-003');

      expect(result.indexed).toBe(2);
      expect(result.failed).toBe(0);
    });

    test('should handle partial batch failures', async () => {
      const documents = [
        { id: 'doc-1', content: 'First' },
        { id: 'doc-2', content: 'Second' },
        { id: 'doc-3', content: 'Third' }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          indexed: 2,
          failed: 1,
          results: [
            { doc_id: 'doc-1', success: true },
            { doc_id: 'doc-2', success: false, error: 'Invalid format' },
            { doc_id: 'doc-3', success: true }
          ]
        })
      });

      const result = await client.batchIndex(documents, 'vault-004');

      expect(result.indexed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results).toHaveLength(3);
      expect(result.results[1].success).toBe(false);
    });

    test('should clear cache after batch indexing', async () => {
      const documents = [{ id: 'doc-1', content: 'Test' }];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          indexed: 1,
          failed: 0,
          results: [{ doc_id: 'doc-1', success: true }]
        })
      });

      const clearCacheSpy = jest.spyOn(client, 'clearCache');

      await client.batchIndex(documents, 'vault-005');

      expect(clearCacheSpy).toHaveBeenCalled();

      clearCacheSpy.mockRestore();
    });

    test('should throw error when not connected', async () => {
      client.connected = false;

      await expect(
        client.batchIndex([{ id: 'doc-1', content: 'test' }], 'vault-001')
      ).rejects.toThrow('Not connected to PACASDB server');
    });

    test('should handle empty document array', async () => {
      const documents = [];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          indexed: 0,
          failed: 0,
          results: []
        })
      });

      const result = await client.batchIndex(documents, 'vault-006');

      expect(result.indexed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('search()', () => {
    beforeEach(() => {
      mockEntitlementManager.premiumEnabled = true;
      client.connected = true;
    });

    test('should send semantic query when only text provided', async () => {
      const searchParams = {
        text: 'machine learning concepts',
        k: 10
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { doc_id: 'doc-1', score: 0.95, title: 'ML Basics' }
          ]
        })
      });

      await client.search(searchParams);

      const fetchCall = global.fetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);

      expect(payload.query_type).toBe('semantic');
      expect(payload.text).toBe('machine learning concepts');
      expect(payload.k).toBe(10);
    });

    test('should send keyword query when only keywords provided', async () => {
      const searchParams = {
        keywords: ['neural', 'network'],
        k: 5
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: []
        })
      });

      await client.search(searchParams);

      const fetchCall = global.fetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);

      expect(payload.query_type).toBe('keyword');
      expect(payload.keywords).toEqual(['neural', 'network']);
    });

    test('should send hybrid query when both text and keywords provided', async () => {
      const searchParams = {
        text: 'deep learning',
        keywords: ['tensorflow', 'pytorch'],
        k: 10
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: []
        })
      });

      await client.search(searchParams);

      const fetchCall = global.fetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);

      expect(payload.query_type).toBe('hybrid');
      expect(payload.text).toBe('deep learning');
      expect(payload.keywords).toEqual(['tensorflow', 'pytorch']);
    });

    test('should include vault filter when currentVaultOnly is true', async () => {
      const searchParams = {
        text: 'search query',
        currentVaultOnly: true,
        k: 10
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: []
        })
      });

      await client.search(searchParams, 'vault-007');

      const fetchCall = global.fetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);

      expect(payload.vault_filter).toBe('vault-007');
    });

    test('should not include vault filter when currentVaultOnly is false', async () => {
      const searchParams = {
        text: 'search query',
        currentVaultOnly: false,
        k: 10
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: []
        })
      });

      await client.search(searchParams);

      const fetchCall = global.fetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);

      expect(payload.vault_filter).toBeUndefined();
    });

    test('should return cached results on cache hit', async () => {
      const searchParams = {
        text: 'cached query',
        k: 10
      };

      const cachedResults = {
        results: [
          { doc_id: 'cached-1', score: 0.9, title: 'Cached Doc' }
        ]
      };

      // Set up cache spy
      const getCacheSpy = jest.spyOn(client, 'getCachedSearch').mockReturnValue(cachedResults);

      const results = await client.search(searchParams);

      // Should use cache and not call fetch
      expect(getCacheSpy).toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
      expect(results).toEqual(cachedResults);

      getCacheSpy.mockRestore();
    });

    test('should cache results after successful search', async () => {
      const searchParams = {
        text: 'new query',
        k: 10
      };

      const searchResults = {
        results: [
          { doc_id: 'new-1', score: 0.85, title: 'New Doc' }
        ]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => searchResults
      });

      const setCacheSpy = jest.spyOn(client, 'setCachedSearch').mockImplementation();

      await client.search(searchParams);

      expect(setCacheSpy).toHaveBeenCalledWith(
        expect.any(String),
        searchResults,
        60000 // 60 seconds TTL
      );

      setCacheSpy.mockRestore();
    });

    test('should throw error when not connected', async () => {
      client.connected = false;

      await expect(
        client.search({ text: 'test', k: 10 })
      ).rejects.toThrow('Not connected to PACASDB server');
    });
  });

  describe('deleteDocument()', () => {
    beforeEach(() => {
      mockEntitlementManager.premiumEnabled = true;
      client.connected = true;
    });

    test('should send delete request with document ID', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deleted: true })
      });

      await client.deleteDocument('doc-to-delete');

      const fetchCall = global.fetch.mock.calls[0];
      expect(fetchCall[0]).toBe('http://localhost:8000/documents/doc-to-delete');
      expect(fetchCall[1].method).toBe('DELETE');
    });

    test('should clear cache after deletion', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deleted: true })
      });

      const clearCacheSpy = jest.spyOn(client, 'clearCache');

      await client.deleteDocument('doc-xyz');

      expect(clearCacheSpy).toHaveBeenCalled();

      clearCacheSpy.mockRestore();
    });

    test('should throw error when not connected', async () => {
      client.connected = false;

      await expect(
        client.deleteDocument('doc-123')
      ).rejects.toThrow('Not connected to PACASDB server');
    });
  });

  describe('Cognitive Context', () => {
    beforeEach(() => {
      mockEntitlementManager.premiumEnabled = true;
      client.connected = true;
    });

    describe('createContext()', () => {
      test('should create context with default config', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            context_id: 'ctx_abc123',
            created_at: '2025-12-30T00:00:00Z',
            config: {
              decay_rate: 0.1,
              max_items: 500
            }
          })
        });

        const result = await client.createContext();

        const fetchCall = global.fetch.mock.calls[0];
        expect(fetchCall[0]).toBe('http://localhost:8000/api/v1/contexts');
        expect(fetchCall[1].method).toBe('POST');

        const payload = JSON.parse(fetchCall[1].body);
        expect(payload.decay_rate).toBe(0.1);
        expect(payload.max_items).toBe(500);

        expect(result.context_id).toBe('ctx_abc123');
      });

      test('should create context with custom config', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            context_id: 'ctx_custom',
            created_at: '2025-12-30T00:00:00Z',
            config: {
              decay_rate: 0.2,
              max_items: 1000
            }
          })
        });

        const result = await client.createContext({
          decay_rate: 0.2,
          max_items: 1000
        });

        const fetchCall = global.fetch.mock.calls[0];
        const payload = JSON.parse(fetchCall[1].body);

        expect(payload.decay_rate).toBe(0.2);
        expect(payload.max_items).toBe(1000);
        expect(result.context_id).toBe('ctx_custom');
      });

      test('should store active context ID', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            context_id: 'ctx_stored',
            created_at: '2025-12-30T00:00:00Z',
            config: { decay_rate: 0.1, max_items: 500 }
          })
        });

        await client.createContext();

        expect(client.activeContextId).toBe('ctx_stored');
      });

      test('should throw error when not connected', async () => {
        client.connected = false;

        await expect(
          client.createContext()
        ).rejects.toThrow('Not connected to PACASDB server');
      });
    });

    describe('think()', () => {
      test('should send think request with correct payload', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 'doc-1',
                title: 'Test Doc',
                score: 0.85,
                activation: 0.92,
                snippet: 'Test snippet'
              }
            ],
            context_stats: {
              active_items: 47,
              total_activations: 235,
              avg_activation: 0.34
            }
          })
        });

        const result = await client.think('ctx_test', 'product features', 10);

        const fetchCall = global.fetch.mock.calls[0];
        expect(fetchCall[0]).toBe('http://localhost:8000/api/v1/contexts/ctx_test/think');
        expect(fetchCall[1].method).toBe('POST');

        const payload = JSON.parse(fetchCall[1].body);
        expect(payload.query).toBe('product features');
        expect(payload.k).toBe(10);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].activation).toBe(0.92);
        expect(result.context_stats.active_items).toBe(47);
      });

      test('should include metadata filter when provided', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            context_stats: {
              active_items: 0,
              total_activations: 0,
              avg_activation: 0
            }
          })
        });

        await client.think('ctx_filter', 'test query', 5, { vault_id: 'vault-123' });

        const fetchCall = global.fetch.mock.calls[0];
        const payload = JSON.parse(fetchCall[1].body);

        expect(payload.metadata_filter).toEqual({ vault_id: 'vault-123' });
      });

      test('should throw error when not connected', async () => {
        client.connected = false;

        await expect(
          client.think('ctx_test', 'query', 10)
        ).rejects.toThrow('Not connected to PACASDB server');
      });
    });

    describe('markUseful()', () => {
      test('should send feedback with correct payload', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            updated: true,
            new_activation: 0.95
          })
        });

        const result = await client.markUseful('ctx_feedback', 'doc-456');

        const fetchCall = global.fetch.mock.calls[0];
        expect(fetchCall[0]).toBe('http://localhost:8000/api/v1/feedback/useful');
        expect(fetchCall[1].method).toBe('POST');

        const payload = JSON.parse(fetchCall[1].body);
        expect(payload.context_id).toBe('ctx_feedback');
        expect(payload.doc_id).toBe('doc-456');

        expect(result.updated).toBe(true);
        expect(result.new_activation).toBe(0.95);
      });

      test('should throw error when not connected', async () => {
        client.connected = false;

        await expect(
          client.markUseful('ctx_test', 'doc-123')
        ).rejects.toThrow('Not connected to PACASDB server');
      });
    });

    describe('getContextStats()', () => {
      test('should return active items count', () => {
        // Mock context stats
        client.lastContextStats = {
          active_items: 47,
          total_activations: 235,
          avg_activation: 0.34
        };

        const stats = client.getContextStats();

        expect(stats.active_items).toBe(47);
        expect(stats.total_activations).toBe(235);
        expect(stats.avg_activation).toBe(0.34);
      });

      test('should return default stats when no context active', () => {
        client.lastContextStats = null;

        const stats = client.getContextStats();

        expect(stats.active_items).toBe(0);
        expect(stats.total_activations).toBe(0);
        expect(stats.avg_activation).toBe(0);
      });
    });

    describe('clearContext()', () => {
      test('should clear active context ID', () => {
        client.activeContextId = 'ctx_to_clear';
        client.lastContextStats = {
          active_items: 50,
          total_activations: 100,
          avg_activation: 0.5
        };

        client.clearContext();

        expect(client.activeContextId).toBeNull();
        expect(client.lastContextStats).toBeNull();
      });
    });
  });
});
