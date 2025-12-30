/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// Mock Tauri API
const mockInvoke = jest.fn();
jest.unstable_mockModule('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}));

let EntitlementManager;
let PremiumGate;

describe('License Flow Integration Tests', () => {
  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    mockInvoke.mockClear();

    // Clear DOM
    document.body.innerHTML = '';

    // Import modules
    const entitlementModule = await import('../../src/services/entitlement-manager.js');
    EntitlementManager = entitlementModule.default;

    const premiumGateModule = await import('../../src/components/PremiumGate.js');
    PremiumGate = premiumGateModule.default;
  });

  describe('Trial Start Flow', () => {
    test('should activate trial and update UI to show trial badge', async () => {
      // Setup: User starts unlicensed
      mockInvoke.mockImplementation((command) => {
        if (command === 'get_license_status') {
          return Promise.resolve({ type: 'Unlicensed' });
        }
        if (command === 'start_trial') {
          return Promise.resolve({
            success: true,
            trial_started_at: new Date().toISOString(),
            days_remaining: 30
          });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const entitlementManager = new EntitlementManager();
      await entitlementManager.initialize();

      // Verify initial state is Unlicensed
      expect(entitlementManager.getStatus().type).toBe('Unlicensed');
      expect(entitlementManager.isPremiumEnabled()).toBe(false);

      // Mock trial activation to return Trial status
      mockInvoke.mockImplementation((command) => {
        if (command === 'start_trial') {
          return Promise.resolve({
            success: true,
            trial_started_at: new Date().toISOString(),
            days_remaining: 30
          });
        }
        if (command === 'get_license_status') {
          return Promise.resolve({
            type: 'Trial',
            days_remaining: 30,
            trial_started_at: new Date().toISOString()
          });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      // User clicks "Start Trial" button
      await entitlementManager.startTrial();

      // Verify license status updated to Trial
      const status = entitlementManager.getStatus();
      expect(status.type).toBe('Trial');
      expect(status.days_remaining).toBe(30);

      // Verify premium features are now accessible
      expect(entitlementManager.isPremiumEnabled()).toBe(true);

      // Verify days remaining calculation
      expect(entitlementManager.getDaysRemaining()).toBe(30);
    });

    test('should show trial badge with days remaining in UI', async () => {
      mockInvoke.mockImplementation((command) => {
        if (command === 'get_license_status') {
          return Promise.resolve({
            type: 'Trial',
            days_remaining: 15
          });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const entitlementManager = new EntitlementManager();
      await entitlementManager.initialize();

      // Verify status message
      const statusMessage = entitlementManager.getStatusMessage();
      expect(statusMessage).toContain('Trial');
      expect(statusMessage).toContain('15');
      expect(statusMessage).toContain('days remaining');
    });

    test('should enable premium features after trial start', async () => {
      mockInvoke.mockImplementation((command) => {
        if (command === 'get_license_status') {
          return Promise.resolve({
            type: 'Trial',
            days_remaining: 30
          });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const entitlementManager = new EntitlementManager();
      await entitlementManager.initialize();

      // Test PremiumGate component respects trial status
      const container = document.createElement('div');
      document.body.appendChild(container);

      const premiumGate = new PremiumGate('search', entitlementManager);
      const shouldShowGate = !entitlementManager.isPremiumEnabled();

      expect(shouldShowGate).toBe(false); // Gate should NOT show for trial users
    });
  });

  describe('License Activation Flow', () => {
    test('should activate valid license key and update status', async () => {
      mockInvoke.mockImplementation((command, args) => {
        if (command === 'get_license_status') {
          return Promise.resolve({ type: 'Unlicensed' });
        }
        if (command === 'activate_license') {
          if (args.key === 'VALID-TEST-KEY') {
            return Promise.resolve({
              success: true,
              license_info: {
                key: args.key,
                type: 'lifetime',
                features: ['pacasdb'],
                activated_at: new Date().toISOString()
              }
            });
          }
          throw new Error('Invalid license key');
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const entitlementManager = new EntitlementManager();
      await entitlementManager.initialize();

      expect(entitlementManager.isPremiumEnabled()).toBe(false);

      // Mock successful activation response
      mockInvoke.mockImplementation((command, args) => {
        if (command === 'activate_license') {
          return Promise.resolve({
            success: true,
            license_info: {
              key: args.key,
              type: 'lifetime',
              features: ['pacasdb'],
              activated_at: new Date().toISOString()
            }
          });
        }
        if (command === 'get_license_status') {
          return Promise.resolve({
            type: 'Licensed',
            license_type: 'lifetime',
            features: ['pacasdb']
          });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      // User activates license
      const result = await entitlementManager.activateLicense('VALID-TEST-KEY');

      expect(result.success).toBe(true);
      expect(entitlementManager.getStatus().type).toBe('Licensed');
      expect(entitlementManager.isPremiumEnabled()).toBe(true);
    });

    test('should reject invalid license key', async () => {
      mockInvoke.mockImplementation((command, args) => {
        if (command === 'get_license_status') {
          return Promise.resolve({ type: 'Unlicensed' });
        }
        if (command === 'activate_license') {
          throw new Error('Invalid license key');
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const entitlementManager = new EntitlementManager();
      await entitlementManager.initialize();

      await expect(entitlementManager.activateLicense('INVALID-KEY'))
        .rejects.toThrow('Invalid license key');

      // Status should remain Unlicensed
      expect(entitlementManager.getStatus().type).toBe('Unlicensed');
      expect(entitlementManager.isPremiumEnabled()).toBe(false);
    });

    test('should transition from Trial to Licensed on activation', async () => {
      // Start with Trial status
      mockInvoke.mockImplementation((command, args) => {
        if (command === 'get_license_status') {
          return Promise.resolve({
            type: 'Trial',
            days_remaining: 5
          });
        }
        if (command === 'activate_license') {
          return Promise.resolve({
            success: true,
            license_info: {
              key: args.key,
              type: 'lifetime',
              features: ['pacasdb']
            }
          });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const entitlementManager = new EntitlementManager();
      await entitlementManager.initialize();

      expect(entitlementManager.getStatus().type).toBe('Trial');

      // Mock Licensed status after activation
      mockInvoke.mockImplementation((command) => {
        if (command === 'get_license_status') {
          return Promise.resolve({ type: 'Licensed' });
        }
        if (command === 'activate_license') {
          return Promise.resolve({ success: true });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      // Activate license during trial
      await entitlementManager.activateLicense('VALID-KEY');

      // Should now be Licensed
      expect(entitlementManager.getStatus().type).toBe('Licensed');
      expect(entitlementManager.isPremiumEnabled()).toBe(true);
    });
  });

  describe('Offline Grace Period', () => {
    test('should enter grace period when offline validation fails', async () => {
      // Simulate network failure for validation
      const gracePeriodDate = new Date();
      gracePeriodDate.setDate(gracePeriodDate.getDate() + 25);

      mockInvoke.mockImplementation((command) => {
        if (command === 'get_license_status') {
          return Promise.resolve({
            type: 'GracePeriod',
            grace_expires_at: gracePeriodDate.toISOString(),
            last_validated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago
          });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const entitlementManager = new EntitlementManager();
      await entitlementManager.initialize();

      const status = entitlementManager.getStatus();
      expect(status.type).toBe('GracePeriod');

      // Premium should still be enabled during grace period
      expect(entitlementManager.isPremiumEnabled()).toBe(true);

      // Days remaining should be calculated
      const daysRemaining = entitlementManager.getDaysRemaining();
      expect(daysRemaining).toBeGreaterThan(0);
      expect(daysRemaining).toBeLessThanOrEqual(30);
    });

    test('should show grace period warning with days remaining', async () => {
      const gracePeriodDate = new Date();
      gracePeriodDate.setDate(gracePeriodDate.getDate() + 7);

      mockInvoke.mockImplementation((command) => {
        if (command === 'get_license_status') {
          return Promise.resolve({
            type: 'GracePeriod',
            grace_expires_at: gracePeriodDate.toISOString()
          });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const entitlementManager = new EntitlementManager();
      await entitlementManager.initialize();

      const statusMessage = entitlementManager.getStatusMessage();
      expect(statusMessage).toContain('Grace Period');
      expect(statusMessage).toContain('days remaining');
    });

    test('should expire and disable features when grace period ends', async () => {
      mockInvoke.mockImplementation((command) => {
        if (command === 'get_license_status') {
          return Promise.resolve({
            type: 'Expired',
            expired_at: new Date().toISOString()
          });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const entitlementManager = new EntitlementManager();
      await entitlementManager.initialize();

      expect(entitlementManager.getStatus().type).toBe('Expired');
      expect(entitlementManager.isPremiumEnabled()).toBe(false);
      expect(entitlementManager.getDaysRemaining()).toBe(0);
    });
  });

  describe('End-to-End User Journey', () => {
    test('should complete full flow: unlicensed -> trial -> licensed', async () => {
      // Step 1: Start unlicensed
      mockInvoke.mockResolvedValueOnce({ type: 'Unlicensed' });

      const entitlementManager = new EntitlementManager();
      await entitlementManager.initialize();

      expect(entitlementManager.getStatus().type).toBe('Unlicensed');
      expect(entitlementManager.isPremiumEnabled()).toBe(false);

      // Step 2: Start trial
      mockInvoke
        .mockResolvedValueOnce({ success: true, days_remaining: 30 })
        .mockResolvedValueOnce({ type: 'Trial', days_remaining: 30 });

      await entitlementManager.startTrial();

      expect(entitlementManager.getStatus().type).toBe('Trial');
      expect(entitlementManager.isPremiumEnabled()).toBe(true);

      // Step 3: Activate license during trial
      mockInvoke
        .mockResolvedValueOnce({ success: true, license_info: { type: 'lifetime' } })
        .mockResolvedValueOnce({ type: 'Licensed' });

      await entitlementManager.activateLicense('PREMIUM-KEY');

      expect(entitlementManager.getStatus().type).toBe('Licensed');
      expect(entitlementManager.isPremiumEnabled()).toBe(true);
    });
  });
});
