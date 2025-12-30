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
});
