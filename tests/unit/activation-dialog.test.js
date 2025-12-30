/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// Mock EntitlementManager
jest.unstable_mockModule('../../src/services/entitlement-manager.js', () => ({
  default: class MockEntitlementManager {
    async activateLicense(key) {
      if (key === 'VALID-LICENSE-KEY') {
        return {
          success: true,
          license_info: {
            key: 'VALID-LICENSE-KEY',
            type: 'lifetime',
            features: ['pacasdb'],
            activated_at: '2025-12-30T00:00:00Z'
          }
        };
      } else if (key === 'EXPIRED-KEY') {
        throw new Error('License expired');
      } else if (key === 'INVALID-KEY') {
        throw new Error('Invalid license key');
      }
      throw new Error('Activation failed');
    }
  }
}));

let ActivationDialog;
let mockEntitlementManager;
let EntitlementManager;

describe('ActivationDialog', () => {
  beforeEach(async () => {
    // Clear DOM
    document.body.innerHTML = '';

    // Import modules
    const entitlementModule = await import('../../src/services/entitlement-manager.js');
    EntitlementManager = entitlementModule.default;
    mockEntitlementManager = new EntitlementManager();

    const dialogModule = await import('../../src/components/ActivationDialog.js');
    ActivationDialog = dialogModule.default;
  });

  describe('show()', () => {
    test('should insert modal into DOM', () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const modal = document.querySelector('.activation-dialog-modal');
      expect(modal).toBeTruthy();
      expect(document.body.contains(modal)).toBe(true);
    });

    test('should have license key input field', () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      expect(input).toBeTruthy();
      expect(input.placeholder).toContain('license key');
    });

    test('should have activate button', () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const activateBtn = document.querySelector('.activate-btn');
      expect(activateBtn).toBeTruthy();
      expect(activateBtn.textContent).toContain('Activate');
    });

    test('should have close button', () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const closeBtn = document.querySelector('.close-btn');
      expect(closeBtn).toBeTruthy();
    });

    test('should focus input field', (done) => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      // Focus happens async via setTimeout
      setTimeout(() => {
        const input = document.querySelector('input[type="text"]');
        expect(document.activeElement).toBe(input);
        done();
      }, 10);
    });
  });

  describe('validation', () => {
    test('should show error when key is empty', async () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const activateBtn = document.querySelector('.activate-btn');
      activateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      const errorMsg = document.querySelector('.error-message');
      expect(errorMsg).toBeTruthy();
      expect(errorMsg.textContent).toContain('Please enter');
    });

    test('should show error when key is whitespace', async () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      input.value = '   ';

      const activateBtn = document.querySelector('.activate-btn');
      activateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      const errorMsg = document.querySelector('.error-message');
      expect(errorMsg).toBeTruthy();
      expect(errorMsg.textContent).toContain('Please enter');
    });

    test('should clear previous error when typing', () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      const activateBtn = document.querySelector('.activate-btn');

      // Trigger error
      activateBtn.click();

      // Type in input
      input.value = 'A';
      input.dispatchEvent(new Event('input'));

      const errorMsg = document.querySelector('.error-message');
      expect(errorMsg).toBeFalsy();
    });
  });

  describe('activation', () => {
    test('should trigger activation with valid key', async () => {
      const activateSpy = jest.spyOn(mockEntitlementManager, 'activateLicense');

      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      input.value = 'VALID-LICENSE-KEY';

      const activateBtn = document.querySelector('.activate-btn');
      activateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(activateSpy).toHaveBeenCalledWith('VALID-LICENSE-KEY');
    });

    test('should show loading state during activation', async () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      input.value = 'VALID-LICENSE-KEY';

      const activateBtn = document.querySelector('.activate-btn');

      // Click but don't wait
      activateBtn.click();

      // Should show loading immediately
      expect(activateBtn.disabled).toBe(true);
      expect(activateBtn.textContent).toContain('Activating');

      await new Promise(resolve => setTimeout(resolve, 50));
    });

    test('should disable input during activation', async () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      input.value = 'VALID-LICENSE-KEY';

      const activateBtn = document.querySelector('.activate-btn');
      activateBtn.click();

      // Input should be disabled
      expect(input.disabled).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });

  describe('successful activation', () => {
    test('should show success message', async () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      input.value = 'VALID-LICENSE-KEY';

      const activateBtn = document.querySelector('.activate-btn');
      activateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const successMsg = document.querySelector('.success-message');
      expect(successMsg).toBeTruthy();
      expect(successMsg.textContent).toContain('activated');
    });

    test('should call onSuccess callback', async () => {
      const onSuccess = jest.fn();

      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.onSuccess = onSuccess;
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      input.value = 'VALID-LICENSE-KEY';

      const activateBtn = document.querySelector('.activate-btn');
      activateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onSuccess).toHaveBeenCalled();
    });

    test('should auto-close after success', async () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      input.value = 'VALID-LICENSE-KEY';

      const activateBtn = document.querySelector('.activate-btn');
      activateBtn.click();

      // Wait for activation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Wait for auto-close (2000ms + buffer)
      await new Promise(resolve => setTimeout(resolve, 2100));

      const modal = document.querySelector('.activation-dialog-modal');
      expect(modal).toBeFalsy();
    }, 10000); // 10 second timeout
  });

  describe('failed activation', () => {
    test('should show error message for invalid key', async () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      input.value = 'INVALID-KEY';

      const activateBtn = document.querySelector('.activate-btn');
      activateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorMsg = document.querySelector('.error-message');
      expect(errorMsg).toBeTruthy();
      expect(errorMsg.textContent).toContain('Invalid');
    }, 10000);

    test('should show error message for expired key', async () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      input.value = 'EXPIRED-KEY';

      const activateBtn = document.querySelector('.activate-btn');
      activateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorMsg = document.querySelector('.error-message');
      expect(errorMsg).toBeTruthy();
      expect(errorMsg.textContent).toContain('expired');
    }, 10000);

    test('should re-enable input after error', async () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      input.value = 'INVALID-KEY';

      const activateBtn = document.querySelector('.activate-btn');
      activateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(input.disabled).toBe(false);
      expect(activateBtn.disabled).toBe(false);
    }, 10000);
  });

  describe('close()', () => {
    test('should remove modal from DOM when close button clicked', () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const closeBtn = document.querySelector('.close-btn');
      closeBtn.click();

      const modal = document.querySelector('.activation-dialog-modal');
      expect(modal).toBeFalsy();
    });

    test('should remove modal when backdrop clicked', () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const backdrop = document.querySelector('.activation-dialog-modal');
      backdrop.click();

      const modal = document.querySelector('.activation-dialog-modal');
      expect(modal).toBeFalsy();
    });

    test('should not close when clicking dialog content', () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const content = document.querySelector('.dialog-content');
      content.click();

      const modal = document.querySelector('.activation-dialog-modal');
      expect(modal).toBeTruthy();
    });

    test('should call onClose callback', () => {
      const onClose = jest.fn();

      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.onClose = onClose;
      dialog.show();

      const closeBtn = document.querySelector('.close-btn');
      closeBtn.click();

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('keyboard shortcuts', () => {
    test('should activate on Enter key', async () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      const input = document.querySelector('input[type="text"]');
      input.value = 'VALID-LICENSE-KEY';

      // Simulate Enter key
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(enterEvent);

      await new Promise(resolve => setTimeout(resolve, 100));

      const successMsg = document.querySelector('.success-message');
      expect(successMsg).toBeTruthy();
    }, 10000);

    test('should close on Escape key', () => {
      const dialog = new ActivationDialog(mockEntitlementManager);
      dialog.show();

      // Simulate Escape key
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);

      const modal = document.querySelector('.activation-dialog-modal');
      expect(modal).toBeFalsy();
    });
  });
});
