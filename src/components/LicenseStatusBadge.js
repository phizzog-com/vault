/**
 * LicenseStatusBadge - Displays current license status with color coding
 *
 * Shows a visual badge indicating the user's license state:
 * - Unlicensed: gray, 'Free'
 * - Trial: blue, 'Trial (X days left)'
 * - Licensed: gold, 'Premium'
 * - Expired: red, 'Expired'
 * - GracePeriod: orange, 'Grace Period (X days)'
 *
 * The badge updates automatically when license status changes.
 */
class LicenseStatusBadge {
  /**
   * @param {HTMLElement} container - Parent element to render badge into
   * @param {EntitlementManager} entitlementManager - License manager instance
   */
  constructor(container, entitlementManager) {
    this.container = container;
    this.entitlementManager = entitlementManager;
    this.badgeElement = null;
    this.unsubscribe = null;
  }

  /**
   * Render the badge and set up listeners
   */
  render() {
    // Create badge element
    this.badgeElement = document.createElement('div');
    this.badgeElement.className = 'license-status-badge';

    // Set initial content
    this.updateBadge();

    // Add to container
    this.container.appendChild(this.badgeElement);

    // Listen for status changes
    this.unsubscribe = this.entitlementManager.addListener(() => {
      this.updateBadge();
    });
  }

  /**
   * Update badge content and styling based on current status
   */
  updateBadge() {
    if (!this.badgeElement) return;

    const status = this.entitlementManager.getStatus();
    const statusType = status?.type || 'Unlicensed';

    // Remove all status classes
    this.badgeElement.className = 'license-status-badge';

    let text = '';
    let tooltip = '';
    let cssClass = '';

    switch (statusType) {
      case 'Unlicensed':
        text = 'Free';
        tooltip = 'Free version - upgrade to Premium for advanced features';
        cssClass = 'status-unlicensed';
        break;

      case 'Trial':
        const trialDays = this.entitlementManager.getDaysRemaining();
        text = `Trial (${trialDays} days left)`;
        tooltip = `Premium trial active - ${trialDays} days remaining`;
        cssClass = 'status-trial';
        break;

      case 'Licensed':
        text = 'Premium';
        tooltip = 'Premium features active';
        cssClass = 'status-licensed';
        break;

      case 'Expired':
        text = 'Expired';
        tooltip = 'License expired - renew to continue using Premium features';
        cssClass = 'status-expired';
        break;

      case 'GracePeriod':
        const graceDays = this.entitlementManager.getDaysRemaining();
        text = `Grace Period (${graceDays} days)`;
        tooltip = `Offline grace period - ${graceDays} days remaining`;
        cssClass = 'status-grace-period';
        break;

      default:
        text = 'Unknown';
        tooltip = 'Unknown license status';
        cssClass = 'status-unknown';
    }

    // Update badge
    this.badgeElement.textContent = text;
    this.badgeElement.setAttribute('title', tooltip);
    this.badgeElement.classList.add(cssClass);

    // Apply inline styles for color coding
    this.applyStyles(statusType);
  }

  /**
   * Apply color styles based on status type
   */
  applyStyles(statusType) {
    if (!this.badgeElement) return;

    // Base styles
    this.badgeElement.style.display = 'inline-block';
    this.badgeElement.style.padding = '4px 12px';
    this.badgeElement.style.borderRadius = '12px';
    this.badgeElement.style.fontSize = '12px';
    this.badgeElement.style.fontWeight = '600';
    this.badgeElement.style.cursor = 'help';
    this.badgeElement.style.userSelect = 'none';

    // Status-specific colors
    switch (statusType) {
      case 'Unlicensed':
        this.badgeElement.style.backgroundColor = '#e0e0e0';
        this.badgeElement.style.color = '#666666';
        break;

      case 'Trial':
        this.badgeElement.style.backgroundColor = '#e3f2fd';
        this.badgeElement.style.color = '#1976d2';
        break;

      case 'Licensed':
        this.badgeElement.style.backgroundColor = '#fff9e6';
        this.badgeElement.style.color = '#f59e0b';
        break;

      case 'Expired':
        this.badgeElement.style.backgroundColor = '#ffebee';
        this.badgeElement.style.color = '#d32f2f';
        break;

      case 'GracePeriod':
        this.badgeElement.style.backgroundColor = '#fff3e0';
        this.badgeElement.style.color = '#f57c00';
        break;

      default:
        this.badgeElement.style.backgroundColor = '#f5f5f5';
        this.badgeElement.style.color = '#999999';
    }
  }

  /**
   * Clean up listeners and remove badge from DOM
   */
  destroy() {
    // Unsubscribe from status changes
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Remove badge element
    if (this.badgeElement && this.badgeElement.parentNode) {
      this.badgeElement.parentNode.removeChild(this.badgeElement);
    }

    this.badgeElement = null;
  }
}

export default LicenseStatusBadge;
