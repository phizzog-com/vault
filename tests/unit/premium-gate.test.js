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

let PremiumGate;
let mockEntitlementManager;
let EntitlementManager;

describe('PremiumGate', () => {
  beforeEach(async () => {
    // Import modules
    const entitlementModule = await import('../../src/services/entitlement-manager.js');
    EntitlementManager = entitlementModule.default;
    mockEntitlementManager = new EntitlementManager();

    const gateModule = await import('../../src/components/PremiumGate.js');
    PremiumGate = gateModule.default;
  });

  describe('wrap() function', () => {
    test('should return null when premium is enabled', () => {
      // Set premium enabled
      mockEntitlementManager.status = { type: 'Licensed' };

      const result = PremiumGate.wrap(mockEntitlementManager, 'Test Feature');

      expect(result).toBeNull();
    });

    test('should return PremiumGate instance when not premium', () => {
      // Set unlicensed
      mockEntitlementManager.status = { type: 'Unlicensed' };

      const result = PremiumGate.wrap(mockEntitlementManager, 'PACASDB Search');

      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(PremiumGate);
    });

    test('should include feature name in gate instance', () => {
      mockEntitlementManager.status = { type: 'Unlicensed' };

      const gate = PremiumGate.wrap(mockEntitlementManager, 'Semantic Search');

      expect(gate.featureName).toBe('Semantic Search');
    });
  });

  describe('render() method', () => {
    test('should create DOM element with feature name', () => {
      mockEntitlementManager.status = { type: 'Unlicensed' };

      const gate = new PremiumGate(mockEntitlementManager, 'Advanced Search');
      const element = gate.render();

      expect(element).toBeTruthy();
      expect(element.textContent).toContain('Advanced Search');
      expect(element.textContent).toContain('requires premium');
    });

    test('should return same element on multiple renders', () => {
      mockEntitlementManager.status = { type: 'Unlicensed' };

      const gate = new PremiumGate(mockEntitlementManager, 'Test');
      const element1 = gate.render();
      const element2 = gate.render();

      expect(element1).toBe(element2);
    });
  });

  describe('Unlicensed state', () => {
    beforeEach(() => {
      mockEntitlementManager.status = { type: 'Unlicensed' };
    });

    test('should show Start Free Trial button', () => {
      const gate = new PremiumGate(mockEntitlementManager, 'PACASDB');
      const element = gate.render();

      expect(element.textContent).toContain('Start Free Trial');
    });

    test('should show premium feature description', () => {
      const gate = new PremiumGate(mockEntitlementManager, 'Advanced Search');
      const element = gate.render();

      expect(element.textContent).toContain('Advanced Search');
      expect(element.textContent).toContain('requires premium');
      expect(element.textContent).toContain('30-day trial');
    });

    test('should have both Start Trial and Purchase buttons', () => {
      const gate = new PremiumGate(mockEntitlementManager, 'PACASDB');
      const element = gate.render();

      const buttons = element.querySelectorAll('button');
      expect(buttons.length).toBe(2);

      const buttonTexts = Array.from(buttons).map(b => b.textContent);
      expect(buttonTexts).toContain('Start Free Trial');
      expect(buttonTexts).toContain('Purchase License');
    });
  });

  describe('Trial state', () => {
    test('should return null from wrap() when trial is active', () => {
      mockEntitlementManager.status = {
        type: 'Trial',
        days_remaining: 15
      };

      const result = PremiumGate.wrap(mockEntitlementManager, 'PACASDB');

      expect(result).toBeNull();
    });
  });

  describe('Expired state', () => {
    beforeEach(() => {
      mockEntitlementManager.status = {
        type: 'Expired',
        expired_at: '2025-06-01T00:00:00Z'
      };
    });

    test('should show Purchase License button', () => {
      const gate = new PremiumGate(mockEntitlementManager, 'PACASDB');
      const element = gate.render();

      expect(element.textContent).toContain('Purchase License');
    });

    test('should show trial expired message', () => {
      const gate = new PremiumGate(mockEntitlementManager, 'PACASDB');
      const element = gate.render();

      expect(element.textContent).toContain('expired');
    });

    test('should only have one button (Purchase)', () => {
      const gate = new PremiumGate(mockEntitlementManager, 'PACASDB');
      const element = gate.render();

      const buttons = element.querySelectorAll('button');
      expect(buttons.length).toBe(1);
      expect(buttons[0].textContent).toBe('Purchase License');
    });
  });

  describe('Invalid state', () => {
    beforeEach(() => {
      mockEntitlementManager.status = {
        type: 'Invalid',
        reason: 'License key is invalid'
      };
    });

    test('should show error message', () => {
      const gate = new PremiumGate(mockEntitlementManager, 'PACASDB');
      const element = gate.render();

      expect(element.textContent).toContain('invalid');
    });

    test('should show Purchase License button for invalid license', () => {
      const gate = new PremiumGate(mockEntitlementManager, 'PACASDB');
      const element = gate.render();

      expect(element.textContent).toContain('Purchase License');
    });
  });

  describe('destroy() method', () => {
    test('should remove element from DOM', () => {
      mockEntitlementManager.status = { type: 'Unlicensed' };

      const gate = new PremiumGate(mockEntitlementManager, 'Test');
      const element = gate.render();

      // Add to document for testing
      document.body.appendChild(element);
      expect(document.body.contains(element)).toBe(true);

      gate.destroy();
      expect(document.body.contains(element)).toBe(false);
    });

    test('should clear element reference', () => {
      mockEntitlementManager.status = { type: 'Unlicensed' };

      const gate = new PremiumGate(mockEntitlementManager, 'Test');
      gate.render();

      expect(gate.element).not.toBeNull();

      gate.destroy();
      expect(gate.element).toBeNull();
    });
  });
});
