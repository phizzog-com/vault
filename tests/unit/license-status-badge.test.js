/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

let LicenseStatusBadge;
let mockEntitlementManager;

describe('LicenseStatusBadge', () => {
  let badge;
  let container;

  beforeEach(async () => {
    // Clear DOM
    document.body.innerHTML = '';

    // Create a container for the badge
    container = document.createElement('div');
    document.body.appendChild(container);

    // Create mock EntitlementManager
    mockEntitlementManager = {
      status: { type: 'Unlicensed' },
      listeners: [],
      getStatus: jest.fn(),
      getDaysRemaining: jest.fn(),
      addListener: jest.fn((callback) => {
        mockEntitlementManager.listeners.push(callback);
        return () => {
          mockEntitlementManager.listeners = mockEntitlementManager.listeners.filter(cb => cb !== callback);
        };
      }),
      notifyListeners: function() {
        this.listeners.forEach(callback => callback(this.status));
      }
    };

    mockEntitlementManager.getStatus.mockReturnValue(mockEntitlementManager.status);
    mockEntitlementManager.getDaysRemaining.mockReturnValue(null);

    // Import the component
    const badgeModule = await import('../../src/components/LicenseStatusBadge.js');
    LicenseStatusBadge = badgeModule.default;
  });

  afterEach(() => {
    if (badge && badge.destroy) {
      badge.destroy();
    }
    if (container && container.parentNode) {
      document.body.removeChild(container);
    }
  });

  describe('Rendering', () => {
    test('should render badge element with correct structure', () => {
      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      const badgeEl = container.querySelector('.license-status-badge');
      expect(badgeEl).toBeTruthy();
      expect(badgeEl.tagName).toBe('DIV');
    });

    test('should show "Free" with gray color for Unlicensed status', () => {
      mockEntitlementManager.status = { type: 'Unlicensed' };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Unlicensed' });

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      const badgeEl = container.querySelector('.license-status-badge');
      expect(badgeEl.textContent).toContain('Free');
      expect(badgeEl.classList.contains('status-unlicensed')).toBe(true);
    });

    test('should show "Trial (X days left)" with blue color for Trial status', () => {
      mockEntitlementManager.status = { type: 'Trial', days_remaining: 15 };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Trial', days_remaining: 15 });
      mockEntitlementManager.getDaysRemaining.mockReturnValue(15);

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      const badgeEl = container.querySelector('.license-status-badge');
      expect(badgeEl.textContent).toContain('Trial');
      expect(badgeEl.textContent).toContain('15 days left');
      expect(badgeEl.classList.contains('status-trial')).toBe(true);
    });

    test('should show "Premium" with gold color for Licensed status', () => {
      mockEntitlementManager.status = { type: 'Licensed' };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Licensed' });

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      const badgeEl = container.querySelector('.license-status-badge');
      expect(badgeEl.textContent).toContain('Premium');
      expect(badgeEl.classList.contains('status-licensed')).toBe(true);
    });

    test('should show "Expired" with red color for Expired status', () => {
      mockEntitlementManager.status = { type: 'Expired' };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Expired' });

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      const badgeEl = container.querySelector('.license-status-badge');
      expect(badgeEl.textContent).toContain('Expired');
      expect(badgeEl.classList.contains('status-expired')).toBe(true);
    });

    test('should show "Grace Period (X days)" with orange color for GracePeriod status', () => {
      const graceDateFuture = new Date();
      graceDateFuture.setDate(graceDateFuture.getDate() + 10);

      mockEntitlementManager.status = {
        type: 'GracePeriod',
        grace_expires_at: graceDateFuture.toISOString()
      };
      mockEntitlementManager.getStatus.mockReturnValue({
        type: 'GracePeriod',
        grace_expires_at: graceDateFuture.toISOString()
      });
      mockEntitlementManager.getDaysRemaining.mockReturnValue(10);

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      const badgeEl = container.querySelector('.license-status-badge');
      expect(badgeEl.textContent).toContain('Grace Period');
      expect(badgeEl.textContent).toContain('10 days');
      expect(badgeEl.classList.contains('status-grace-period')).toBe(true);
    });
  });

  describe('Tooltip', () => {
    test('should add tooltip with detailed info for Trial status', () => {
      mockEntitlementManager.status = { type: 'Trial', days_remaining: 15 };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Trial', days_remaining: 15 });
      mockEntitlementManager.getDaysRemaining.mockReturnValue(15);

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      const badgeEl = container.querySelector('.license-status-badge');
      const title = badgeEl.getAttribute('title');
      expect(title).toBeTruthy();
      expect(title.toLowerCase()).toContain('trial');
    });

    test('should add tooltip with detailed info for Licensed status', () => {
      mockEntitlementManager.status = { type: 'Licensed' };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Licensed' });

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      const badgeEl = container.querySelector('.license-status-badge');
      const title = badgeEl.getAttribute('title');
      expect(title).toBeTruthy();
      expect(title.toLowerCase()).toContain('premium');
    });

    test('should add tooltip for Unlicensed status', () => {
      mockEntitlementManager.status = { type: 'Unlicensed' };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Unlicensed' });

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      const badgeEl = container.querySelector('.license-status-badge');
      const title = badgeEl.getAttribute('title');
      expect(title).toBeTruthy();
      expect(title.toLowerCase()).toContain('free');
    });
  });

  describe('Reactive Updates', () => {
    test('should listen to EntitlementManager changes on initialization', () => {
      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      expect(mockEntitlementManager.addListener).toHaveBeenCalled();
      expect(mockEntitlementManager.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    test('should update badge when status changes from Unlicensed to Trial', () => {
      mockEntitlementManager.status = { type: 'Unlicensed' };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Unlicensed' });

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      let badgeEl = container.querySelector('.license-status-badge');
      expect(badgeEl.textContent).toContain('Free');

      // Simulate status change
      mockEntitlementManager.status = { type: 'Trial', days_remaining: 30 };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Trial', days_remaining: 30 });
      mockEntitlementManager.getDaysRemaining.mockReturnValue(30);

      // Trigger the listener manually
      mockEntitlementManager.notifyListeners();

      badgeEl = container.querySelector('.license-status-badge');
      expect(badgeEl.textContent).toContain('Trial');
      expect(badgeEl.textContent).toContain('30 days left');
      expect(badgeEl.classList.contains('status-trial')).toBe(true);
    });

    test('should update badge when status changes from Trial to Licensed', () => {
      mockEntitlementManager.status = { type: 'Trial', days_remaining: 5 };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Trial', days_remaining: 5 });
      mockEntitlementManager.getDaysRemaining.mockReturnValue(5);

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      let badgeEl = container.querySelector('.license-status-badge');
      expect(badgeEl.textContent).toContain('Trial');

      // Simulate license activation
      mockEntitlementManager.status = { type: 'Licensed' };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Licensed' });
      mockEntitlementManager.getDaysRemaining.mockReturnValue(null);

      mockEntitlementManager.notifyListeners();

      badgeEl = container.querySelector('.license-status-badge');
      expect(badgeEl.textContent).toContain('Premium');
      expect(badgeEl.classList.contains('status-licensed')).toBe(true);
    });

    test('should update badge when status changes to Expired', () => {
      mockEntitlementManager.status = { type: 'Licensed' };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Licensed' });

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      // Simulate expiration
      mockEntitlementManager.status = { type: 'Expired' };
      mockEntitlementManager.getStatus.mockReturnValue({ type: 'Expired' });

      mockEntitlementManager.notifyListeners();

      const badgeEl = container.querySelector('.license-status-badge');
      expect(badgeEl.textContent).toContain('Expired');
      expect(badgeEl.classList.contains('status-expired')).toBe(true);
    });
  });

  describe('Cleanup', () => {
    test('should provide destroy method to cleanup listeners', () => {
      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      expect(badge.destroy).toBeDefined();
      expect(typeof badge.destroy).toBe('function');
    });

    test('should unsubscribe from EntitlementManager on destroy', () => {
      const mockUnsubscribe = jest.fn();
      mockEntitlementManager.addListener.mockReturnValue(mockUnsubscribe);

      badge = new LicenseStatusBadge(container, mockEntitlementManager);
      badge.render();

      badge.destroy();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});
