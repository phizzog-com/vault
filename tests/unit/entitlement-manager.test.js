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
});
