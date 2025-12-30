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
});
