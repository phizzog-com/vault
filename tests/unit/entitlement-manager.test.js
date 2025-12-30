import { jest } from '@jest/globals';

// Mock the Tauri API before importing anything else
jest.unstable_mockModule('@tauri-apps/api/core', () => ({
  invoke: jest.fn()
}));

// Import EntitlementManager will be done dynamically
let EntitlementManager;
let invoke;

describe('EntitlementManager', () => {
  let manager;

  beforeEach(async () => {
    // Clear all timers
    jest.clearAllTimers();

    // Use fake timers for interval testing
    jest.useFakeTimers();

    // Import fresh modules (without resetModules to keep mock)
    const tauriModule = await import('@tauri-apps/api/core');
    invoke = tauriModule.invoke;
    invoke.mockClear(); // Clear previous calls but keep mock

    const module = await import('../../src/services/entitlement-manager.js');
    EntitlementManager = module.default;

    // Get fresh instance
    manager = new EntitlementManager();
  });

  afterEach(() => {
    // Cleanup intervals
    if (manager && typeof manager.cleanup === 'function') {
      manager.cleanup();
    }

    // Restore real timers
    jest.useRealTimers();
  });

  describe('initialize()', () => {
    test('should fetch initial license status from Tauri', async () => {
      // Mock Tauri response
      const mockStatus = {
        type: 'Unlicensed'
      };
      invoke.mockResolvedValueOnce(mockStatus);

      // Initialize
      await manager.initialize();

      // Verify Tauri was called
      expect(invoke).toHaveBeenCalledWith('get_license_status');
      expect(invoke).toHaveBeenCalledTimes(1);

      // Verify status was set
      expect(manager.getStatus()).toEqual(mockStatus);
    });

    test('should set up hourly polling interval after initialization', async () => {
      // Mock console.error to suppress any polling errors
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Mock Tauri response
      const mockStatus = { type: 'Unlicensed' };
      invoke.mockResolvedValue(mockStatus);

      // Initialize
      await manager.initialize();

      // Verify initial call
      expect(invoke).toHaveBeenCalledTimes(1);

      // Fast-forward 1 hour (3600000ms)
      jest.advanceTimersByTime(3600000);

      // Wait for promises to resolve
      await Promise.resolve();

      // Should have called again
      expect(invoke).toHaveBeenCalledTimes(2);

      // Fast-forward another hour
      jest.advanceTimersByTime(3600000);
      await Promise.resolve();

      // Should have called a third time
      expect(invoke).toHaveBeenCalledTimes(3);

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });

    test('should not create duplicate intervals on multiple initialize() calls', async () => {
      // Mock Tauri response
      const mockStatus = { type: 'Unlicensed' };
      invoke.mockResolvedValue(mockStatus);

      // Initialize multiple times
      await manager.initialize();
      await manager.initialize();
      await manager.initialize();

      // Should have called invoke 3 times (once per initialize)
      expect(invoke).toHaveBeenCalledTimes(3);

      // Clear the invoke calls to track polling
      invoke.mockClear();

      // Fast-forward 1 hour
      jest.advanceTimersByTime(3600000);
      await Promise.resolve();

      // Should only poll once (not 3 times)
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    test('should handle different license status types', async () => {
      const statusTypes = [
        { type: 'Unlicensed' },
        {
          type: 'Trial',
          expires_at: '2025-12-29T00:00:00Z',
          days_remaining: 15
        },
        {
          type: 'Licensed',
          key: 'VAULT-PACAS-TEST-KEY',
          expires_at: '2026-12-29T00:00:00Z',
          last_validated: '2025-12-29T15:30:00Z',
          features: ['pacasdb']
        },
        {
          type: 'Expired',
          expired_at: '2025-06-01T00:00:00Z'
        },
        {
          type: 'GracePeriod',
          last_validated: '2025-12-01T00:00:00Z',
          grace_expires_at: '2025-12-31T00:00:00Z'
        },
        {
          type: 'Invalid',
          reason: 'License key is invalid'
        }
      ];

      for (const status of statusTypes) {
        invoke.mockResolvedValueOnce(status);
        await manager.initialize();
        expect(manager.getStatus()).toEqual(status);
      }
    });

    test('should handle Tauri invoke errors gracefully', async () => {
      // Mock console.error to suppress expected error output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Mock Tauri error
      const error = new Error('Tauri IPC failed');
      invoke.mockRejectedValueOnce(error);

      // Initialize should not throw
      await expect(manager.initialize()).resolves.not.toThrow();

      // Status should remain unlicensed or indicate error
      const status = manager.getStatus();
      expect(status).toBeDefined();
      expect(['Unlicensed', 'Invalid']).toContain(status.type);

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe('cleanup()', () => {
    test('should properly remove polling interval', async () => {
      // Mock Tauri response
      const mockStatus = { type: 'Unlicensed' };
      invoke.mockResolvedValue(mockStatus);

      // Initialize to start polling
      await manager.initialize();
      expect(invoke).toHaveBeenCalledTimes(1);

      // Cleanup
      manager.cleanup();

      // Clear invoke calls
      invoke.mockClear();

      // Fast-forward 2 hours
      jest.advanceTimersByTime(7200000);
      await Promise.resolve();

      // Should NOT have polled
      expect(invoke).not.toHaveBeenCalled();
    });

    test('should handle cleanup when not initialized', () => {
      // Should not throw
      expect(() => manager.cleanup()).not.toThrow();
    });

    test('should handle multiple cleanup calls', async () => {
      // Mock Tauri response
      const mockStatus = { type: 'Unlicensed' };
      invoke.mockResolvedValue(mockStatus);

      // Initialize
      await manager.initialize();

      // Multiple cleanups should not throw
      expect(() => {
        manager.cleanup();
        manager.cleanup();
        manager.cleanup();
      }).not.toThrow();
    });
  });

  describe('memory leak prevention', () => {
    test('should not accumulate intervals over multiple init/cleanup cycles', async () => {
      // Mock Tauri response
      const mockStatus = { type: 'Unlicensed' };
      invoke.mockResolvedValue(mockStatus);

      // Run multiple init/cleanup cycles
      for (let i = 0; i < 5; i++) {
        await manager.initialize();
        manager.cleanup();
      }

      // Final initialize
      await manager.initialize();

      // Clear invoke calls
      invoke.mockClear();

      // Fast-forward 1 hour
      jest.advanceTimersByTime(3600000);
      await Promise.resolve();

      // Should only poll once (no accumulated intervals)
      expect(invoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('isPremiumEnabled()', () => {
    test('should return true for Licensed status', () => {
      manager.status = {
        type: 'Licensed',
        key: 'VAULT-PACAS-TEST',
        expires_at: '2026-12-29T00:00:00Z'
      };

      expect(manager.isPremiumEnabled()).toBe(true);
    });

    test('should return true for Trial status', () => {
      manager.status = {
        type: 'Trial',
        expires_at: '2025-12-29T00:00:00Z',
        days_remaining: 15
      };

      expect(manager.isPremiumEnabled()).toBe(true);
    });

    test('should return true for GracePeriod status', () => {
      manager.status = {
        type: 'GracePeriod',
        last_validated: '2025-12-01T00:00:00Z',
        grace_expires_at: '2025-12-31T00:00:00Z'
      };

      expect(manager.isPremiumEnabled()).toBe(true);
    });

    test('should return false for Unlicensed status', () => {
      manager.status = {
        type: 'Unlicensed'
      };

      expect(manager.isPremiumEnabled()).toBe(false);
    });

    test('should return false for Expired status', () => {
      manager.status = {
        type: 'Expired',
        expired_at: '2025-06-01T00:00:00Z'
      };

      expect(manager.isPremiumEnabled()).toBe(false);
    });

    test('should return false for Invalid status', () => {
      manager.status = {
        type: 'Invalid',
        reason: 'License key is invalid'
      };

      expect(manager.isPremiumEnabled()).toBe(false);
    });

    test('should handle edge case: null status', () => {
      manager.status = null;

      expect(manager.isPremiumEnabled()).toBe(false);
    });

    test('should handle edge case: undefined status', () => {
      manager.status = undefined;

      expect(manager.isPremiumEnabled()).toBe(false);
    });

    test('should handle edge case: empty status object', () => {
      manager.status = {};

      expect(manager.isPremiumEnabled()).toBe(false);
    });

    test('should handle edge case: unknown status type', () => {
      manager.status = {
        type: 'Unknown'
      };

      expect(manager.isPremiumEnabled()).toBe(false);
    });
  });

  describe('getDaysRemaining()', () => {
    test('should return days remaining for Trial status', () => {
      manager.status = {
        type: 'Trial',
        expires_at: '2025-12-29T00:00:00Z',
        days_remaining: 15
      };

      expect(manager.getDaysRemaining()).toBe(15);
    });

    test('should calculate days remaining for GracePeriod status', () => {
      // Use real timers for this test since we need Date.now()
      jest.useRealTimers();

      // Mock current date to 2025-12-25
      const originalDate = global.Date;
      const mockDate = new Date('2025-12-25T00:00:00Z');
      global.Date = class extends Date {
        constructor(...args) {
          if (args.length === 0) {
            super(mockDate);
          } else {
            super(...args);
          }
        }
        static now() {
          return mockDate.getTime();
        }
      };

      manager.status = {
        type: 'GracePeriod',
        grace_expires_at: '2025-12-31T00:00:00Z'
      };

      expect(manager.getDaysRemaining()).toBe(6);

      // Restore Date and timers
      global.Date = originalDate;
      jest.useFakeTimers();
    });

    test('should return null for Licensed status (no expiration)', () => {
      manager.status = {
        type: 'Licensed',
        key: 'VAULT-PACAS-TEST',
        expires_at: null
      };

      expect(manager.getDaysRemaining()).toBeNull();
    });

    test('should return 0 for Expired status', () => {
      manager.status = {
        type: 'Expired',
        expired_at: '2025-06-01T00:00:00Z'
      };

      expect(manager.getDaysRemaining()).toBe(0);
    });

    test('should return null for Unlicensed status', () => {
      manager.status = {
        type: 'Unlicensed'
      };

      expect(manager.getDaysRemaining()).toBeNull();
    });
  });

  describe('getStatusMessage()', () => {
    test('should return message for Unlicensed status', () => {
      manager.status = {
        type: 'Unlicensed'
      };

      const message = manager.getStatusMessage();
      expect(message).toBe('No active license');
    });

    test('should return message for Trial status', () => {
      manager.status = {
        type: 'Trial',
        days_remaining: 15
      };

      const message = manager.getStatusMessage();
      expect(message).toBe('Trial: 15 days remaining');
    });

    test('should return message for Licensed status', () => {
      manager.status = {
        type: 'Licensed',
        key: 'VAULT-PACAS-TEST'
      };

      const message = manager.getStatusMessage();
      expect(message).toBe('Premium Active');
    });

    test('should return message for Expired status', () => {
      manager.status = {
        type: 'Expired',
        expired_at: '2025-06-01T00:00:00Z'
      };

      const message = manager.getStatusMessage();
      expect(message).toBe('License Expired');
    });

    test('should return message for GracePeriod status', () => {
      manager.status = {
        type: 'GracePeriod',
        grace_expires_at: '2025-12-31T00:00:00Z'
      };

      const message = manager.getStatusMessage();
      expect(message).toMatch(/Grace Period:/);
    });

    test('should return message for Invalid status', () => {
      manager.status = {
        type: 'Invalid',
        reason: 'License key is invalid'
      };

      const message = manager.getStatusMessage();
      expect(message).toBe('Invalid License');
    });

    test('should handle unknown status type', () => {
      manager.status = {
        type: 'Unknown'
      };

      const message = manager.getStatusMessage();
      expect(message).toBe('Unknown Status');
    });
  });

  describe('addListener() / onChange pattern', () => {
    test('should call listener when status changes', async () => {
      const listener = jest.fn();
      const unsubscribe = manager.addListener(listener);

      // Mock Tauri response
      const mockStatus = { type: 'Licensed', key: 'TEST' };
      invoke.mockResolvedValueOnce(mockStatus);

      // Initialize to trigger status change
      await manager.initialize();

      // Listener should have been called with new status
      expect(listener).toHaveBeenCalledWith(mockStatus);
      expect(listener).toHaveBeenCalledTimes(1);

      // Cleanup
      unsubscribe();
    });

    test('should allow multiple listeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      manager.addListener(listener1);
      manager.addListener(listener2);
      manager.addListener(listener3);

      // Mock Tauri response
      const mockStatus = { type: 'Trial', days_remaining: 20 };
      invoke.mockResolvedValueOnce(mockStatus);

      // Initialize to trigger status change
      await manager.initialize();

      // All listeners should have been called
      expect(listener1).toHaveBeenCalledWith(mockStatus);
      expect(listener2).toHaveBeenCalledWith(mockStatus);
      expect(listener3).toHaveBeenCalledWith(mockStatus);
    });

    test('should unsubscribe listener', async () => {
      const listener = jest.fn();
      const unsubscribe = manager.addListener(listener);

      // Mock Tauri response
      const mockStatus1 = { type: 'Trial', days_remaining: 20 };
      invoke.mockResolvedValueOnce(mockStatus1);

      // Initialize to trigger first status change
      await manager.initialize();
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Clear the listener mock
      listener.mockClear();

      // Trigger another status change via refresh
      const mockStatus2 = { type: 'Licensed', key: 'TEST' };
      invoke.mockResolvedValueOnce(mockStatus2);
      await manager.refresh();

      // Listener should NOT have been called
      expect(listener).not.toHaveBeenCalled();
    });

    test('should handle listener errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const badListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();

      manager.addListener(badListener);
      manager.addListener(goodListener);

      // Mock Tauri response
      const mockStatus = { type: 'Licensed', key: 'TEST' };
      invoke.mockResolvedValueOnce(mockStatus);

      // Initialize should not throw
      await expect(manager.initialize()).resolves.not.toThrow();

      // Good listener should still have been called
      expect(goodListener).toHaveBeenCalledWith(mockStatus);

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
});
