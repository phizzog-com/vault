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
    this.activeContextId = null;
    this.lastContextStats = null;
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
   * Search for documents
   * @param {Object} params - Search parameters
   * @param {string} params.text - Semantic search text
   * @param {Array<string>} params.keywords - Keyword search terms
   * @param {number} params.k - Number of results to return
   * @param {boolean} params.currentVaultOnly - Filter to current vault
   * @param {string} vaultId - Current vault ID (used when currentVaultOnly=true)
   * @returns {Promise<Object>} Search results
   * @throws {Error} If not connected
   */
  async search(params, vaultId = null) {
    if (!this.connected) {
      throw new Error('Not connected to PACASDB server');
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(params, vaultId);
    const cachedResults = this.getCachedSearch(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }

    try {
      // Determine query type
      let queryType;
      if (params.text && params.keywords) {
        queryType = 'hybrid';
      } else if (params.text) {
        queryType = 'semantic';
      } else if (params.keywords) {
        queryType = 'keyword';
      } else {
        throw new Error('Must provide either text or keywords');
      }

      // Build payload
      const payload = {
        query_type: queryType,
        k: params.k || 10
      };

      if (params.text) {
        payload.text = params.text;
      }

      if (params.keywords) {
        payload.keywords = params.keywords;
      }

      if (params.currentVaultOnly && vaultId) {
        payload.vault_filter = vaultId;
      }

      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const results = await response.json();

      // Cache the results
      this.setCachedSearch(cacheKey, results, 60000); // 60 second TTL

      return results;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a document from the index
   * @param {string} docId - Document ID to delete
   * @returns {Promise<Object>} Deletion result
   * @throws {Error} If not connected
   */
  async deleteDocument(docId) {
    if (!this.connected) {
      throw new Error('Not connected to PACASDB server');
    }

    try {
      const response = await fetch(`${this.baseUrl}/documents/${docId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Clear cache after deletion
      this.clearCache();

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a new cognitive context for adaptive search
   * @param {Object} config - Context configuration
   * @param {number} config.decay_rate - How quickly activation decays (0-1), default 0.1
   * @param {number} config.max_items - Maximum active items in context, default 500
   * @returns {Promise<Object>} Context info with context_id
   * @throws {Error} If not connected
   */
  async createContext(config = {}) {
    if (!this.connected) {
      throw new Error('Not connected to PACASDB server');
    }

    try {
      const payload = {
        decay_rate: config.decay_rate || 0.1,
        max_items: config.max_items || 500
      };

      const response = await fetch(`${this.baseUrl}/api/v1/contexts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Context creation failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Store active context ID
      this.activeContextId = result.context_id;

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Perform context-aware search with activation spreading
   * @param {string} contextId - Context identifier
   * @param {string} query - Search query
   * @param {number} k - Number of results to return
   * @param {Object} metadataFilter - Optional metadata filter
   * @returns {Promise<Object>} Search results with activation scores
   * @throws {Error} If not connected
   */
  async think(contextId, query, k = 10, metadataFilter = null) {
    if (!this.connected) {
      throw new Error('Not connected to PACASDB server');
    }

    try {
      const payload = {
        query,
        k
      };

      if (metadataFilter) {
        payload.metadata_filter = metadataFilter;
      }

      const response = await fetch(`${this.baseUrl}/api/v1/contexts/${contextId}/think`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Think operation failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Store context stats for later retrieval
      if (result.context_stats) {
        this.lastContextStats = result.context_stats;
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Mark a document as useful in cognitive context
   * @param {string} contextId - Context identifier
   * @param {string} docId - Document identifier
   * @returns {Promise<Object>} Updated activation info
   * @throws {Error} If not connected
   */
  async markUseful(contextId, docId) {
    if (!this.connected) {
      throw new Error('Not connected to PACASDB server');
    }

    try {
      const payload = {
        context_id: contextId,
        doc_id: docId
      };

      const response = await fetch(`${this.baseUrl}/api/v1/feedback/useful`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Feedback failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get current context statistics
   * @returns {Object} Context stats with active items count
   */
  getContextStats() {
    if (!this.lastContextStats) {
      return {
        active_items: 0,
        total_activations: 0,
        avg_activation: 0
      };
    }

    return this.lastContextStats;
  }

  /**
   * Clear active context when switching modes
   */
  clearContext() {
    this.activeContextId = null;
    this.lastContextStats = null;
  }

  /**
   * Get documents related to given document
   * @param {string} docId - Source document identifier
   * @param {number} k - Number of related docs to return (default 10)
   * @returns {Promise<Object>} Related documents grouped by relationship type
   * @throws {Error} If not connected
   */
  async getRelatedDocuments(docId, k = 10) {
    if (!this.connected) {
      throw new Error('Not connected to PACASDB server');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/relationships/${docId}?k=${k}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Get related documents failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate cache key from search parameters
   * @param {Object} params - Search parameters
   * @param {string} vaultId - Vault ID
   * @returns {string} Cache key
   */
  generateCacheKey(params, vaultId) {
    const parts = [
      params.text || '',
      (params.keywords || []).join(','),
      params.k || 10,
      params.currentVaultOnly ? vaultId : 'all'
    ];
    return parts.join('|');
  }

  /**
   * Get cached search results
   * @param {string} key - Cache key
   * @returns {Object|null} Cached results or null
   */
  getCachedSearch(key) {
    if (!this.searchCache) {
      this.searchCache = new Map();
    }

    const cached = this.searchCache.get(key);
    if (!cached) {
      return null;
    }

    // Check expiration
    if (Date.now() > cached.expiresAt) {
      this.searchCache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Set cached search results
   * @param {string} key - Cache key
   * @param {Object} data - Results to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  setCachedSearch(key, data, ttl) {
    if (!this.searchCache) {
      this.searchCache = new Map();
    }

    this.searchCache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });

    // Simple LRU: limit cache size to 100 entries
    if (this.searchCache.size > 100) {
      const firstKey = this.searchCache.keys().next().value;
      this.searchCache.delete(firstKey);
    }
  }

  /**
   * Clear search cache
   * Called after indexing operations to invalidate stale results
   */
  clearCache() {
    if (this.searchCache) {
      this.searchCache.clear();
    }
  }
}

// Export class (not singleton - tests need to create instances)
export default PACASDBClient;
