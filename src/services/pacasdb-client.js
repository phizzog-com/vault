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

  /**
   * Index a single document in PACASDB
   * @param {Object} document - Document to index
   * @param {string} vaultId - Vault identifier
   * @returns {Promise<Object>} Indexing result with doc_id
   * @throws {Error} If not connected
   */
  async indexDocument(document, vaultId) {
    if (!this.connected) {
      throw new Error('Not connected to PACASDB server');
    }

    try {
      const response = await fetch(`${this.baseUrl}/index`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vault_id: vaultId,
          document: document
        })
      });

      if (!response.ok) {
        throw new Error(`Indexing failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Clear cache after successful indexing
      this.clearCache();

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Batch index multiple documents
   * @param {Array<Object>} documents - Documents to index
   * @param {string} vaultId - Vault identifier
   * @returns {Promise<Object>} Batch result with indexed/failed counts
   * @throws {Error} If not connected
   */
  async batchIndex(documents, vaultId) {
    if (!this.connected) {
      throw new Error('Not connected to PACASDB server');
    }

    try {
      const response = await fetch(`${this.baseUrl}/batch-index`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vault_id: vaultId,
          documents: documents
        })
      });

      if (!response.ok) {
        throw new Error(`Batch indexing failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Clear cache after batch indexing
      this.clearCache();

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Clear search cache
   * Called after indexing operations to invalidate stale results
   */
  clearCache() {
    // Cache clearing implementation - placeholder for now
    // Will be implemented when search caching is added
  }
}

// Export class (not singleton - tests need to create instances)
export default PACASDBClient;
