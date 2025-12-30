/**
 * PACASDBClient - HTTP client for PACASDB server integration
 *
 * Responsibilities:
 * - Verify premium entitlement before operations
 * - Connect to local PACASDB server (localhost:8000)
 * - Perform health checks
 * - Execute search and indexing operations
 *
 * Requires EntitlementManager for license validation.
 */
class PACASDBClient {
  constructor(entitlementManager) {
    this.entitlementManager = entitlementManager;
    this.baseUrl = 'http://localhost:8000';
    this.connected = false;
    this.connectionTimeout = 5000; // 5 seconds
  }

  /**
   * Check if user has premium entitlement
   * @param {string} featureName - Optional feature name for error message
   * @throws {Error} If premium not enabled
   */
  checkEntitlement(featureName) {
    if (!this.entitlementManager.isPremiumEnabled()) {
      if (featureName) {
        throw new Error(`${featureName} requires premium`);
      }
      throw new Error('Premium features not enabled');
    }
  }

  /**
   * Connect to PACASDB server and perform health check
   * @returns {Promise<boolean>} True if connected successfully
   */
  async connect() {
    try {
      // Check entitlement first
      this.checkEntitlement();

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.connectionTimeout);

      // Perform health check
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.connected = true;
        return true;
      } else {
        this.connected = false;
        return false;
      }
    } catch (error) {
      this.connected = false;
      return false;
    }
  }

  /**
   * Check if currently connected to PACASDB server
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.connected;
  }
}

// Export class (not singleton - tests need to create instances)
export default PACASDBClient;
