/**
 * Telemetry and Analytics Utilities
 * Track plugin usage and performance metrics
 */

class TelemetryManager {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.endpoint = options.endpoint || '/api/telemetry';
    this.batchSize = options.batchSize || 50;
    this.flushInterval = options.flushInterval || 30000; // 30 seconds
    this.sessionId = this.generateSessionId();
    this.userId = options.userId || 'anonymous';
    
    this.events = [];
    this.metrics = new Map();
    this.timers = new Map();
    
    // Start periodic flush
    if (this.enabled) {
      this.startPeriodicFlush();
    }
    
    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flush(true);
    });
  }
  
  /**
   * Generate a unique session ID
   */
  generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Track an event
   */
  trackEvent(category, action, label = null, value = null) {
    if (!this.enabled) return;
    
    const event = {
      type: 'event',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
      category,
      action,
      label,
      value
    };
    
    this.events.push(event);
    
    // Auto-flush if batch size reached
    if (this.events.length >= this.batchSize) {
      this.flush();
    }
  }
  
  /**
   * Track a metric
   */
  trackMetric(name, value, unit = null) {
    if (!this.enabled) return;
    
    const metric = {
      type: 'metric',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
      name,
      value,
      unit
    };
    
    // Store aggregated metrics
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        values: []
      });
    }
    
    const stats = this.metrics.get(name);
    stats.count++;
    stats.sum += value;
    stats.min = Math.min(stats.min, value);
    stats.max = Math.max(stats.max, value);
    stats.values.push(value);
    
    // Keep only recent values
    if (stats.values.length > 100) {
      stats.values.shift();
    }
    
    this.events.push(metric);
  }
  
  /**
   * Start a timer
   */
  startTimer(name) {
    if (!this.enabled) return;
    
    this.timers.set(name, Date.now());
  }
  
  /**
   * End a timer and track the duration
   */
  endTimer(name, category = 'performance') {
    if (!this.enabled) return;
    
    const startTime = this.timers.get(name);
    if (!startTime) return;
    
    const duration = Date.now() - startTime;
    this.timers.delete(name);
    
    this.trackEvent(category, 'timing', name, duration);
    this.trackMetric(`${name}_duration`, duration, 'ms');
    
    return duration;
  }
  
  /**
   * Track an error
   */
  trackError(error, context = {}) {
    if (!this.enabled) return;
    
    const errorEvent = {
      type: 'error',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context
    };
    
    this.events.push(errorEvent);
    
    // Errors should be flushed immediately
    this.flush();
  }
  
  /**
   * Track page view
   */
  trackPageView(page, properties = {}) {
    if (!this.enabled) return;
    
    this.trackEvent('navigation', 'pageview', page);
    
    // Track additional properties
    for (const [key, value] of Object.entries(properties)) {
      this.trackEvent('pageview_property', key, page, value);
    }
  }
  
  /**
   * Get metric statistics
   */
  getMetricStats(name) {
    const stats = this.metrics.get(name);
    if (!stats || stats.values.length === 0) return null;
    
    // Calculate percentiles
    const sorted = [...stats.values].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    
    return {
      count: stats.count,
      sum: stats.sum,
      min: stats.min,
      max: stats.max,
      avg: stats.sum / stats.count,
      p50: sorted[p50Index],
      p95: sorted[p95Index],
      p99: sorted[p99Index]
    };
  }
  
  /**
   * Start periodic flush
   */
  startPeriodicFlush() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }
  
  /**
   * Stop periodic flush
   */
  stopPeriodicFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
  
  /**
   * Flush events to backend
   */
  async flush(sync = false) {
    if (!this.enabled || this.events.length === 0) return;
    
    const eventsToSend = [...this.events];
    this.events = [];
    
    const payload = {
      sessionId: this.sessionId,
      userId: this.userId,
      events: eventsToSend,
      metrics: Object.fromEntries(
        Array.from(this.metrics.entries()).map(([name, stats]) => [
          name,
          this.getMetricStats(name)
        ])
      )
    };
    
    try {
      if (sync) {
        // Use sendBeacon for synchronous send on page unload
        if (navigator.sendBeacon) {
          navigator.sendBeacon(this.endpoint, JSON.stringify(payload));
        }
      } else {
        // Normal async send
        await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }
    } catch (error) {
      console.error('Failed to send telemetry:', error);
      // Re-add events to queue
      this.events.unshift(...eventsToSend);
    }
  }
  
  /**
   * Disable telemetry
   */
  disable() {
    this.enabled = false;
    this.stopPeriodicFlush();
    this.events = [];
    this.metrics.clear();
    this.timers.clear();
  }
  
  /**
   * Enable telemetry
   */
  enable() {
    this.enabled = true;
    this.startPeriodicFlush();
  }
}

/**
 * Plugin-specific telemetry
 */
export class PluginTelemetry extends TelemetryManager {
  constructor(options = {}) {
    super(options);
    
    // Track session start
    this.trackEvent('session', 'start');
  }
  
  /**
   * Track plugin installation
   */
  trackPluginInstall(pluginId, source = 'unknown') {
    this.trackEvent('plugin', 'install', pluginId);
    this.trackEvent('plugin_source', source, pluginId);
  }
  
  /**
   * Track plugin uninstall
   */
  trackPluginUninstall(pluginId, reason = 'user') {
    this.trackEvent('plugin', 'uninstall', pluginId);
    this.trackEvent('uninstall_reason', reason, pluginId);
  }
  
  /**
   * Track plugin enable/disable
   */
  trackPluginToggle(pluginId, enabled) {
    this.trackEvent('plugin', enabled ? 'enable' : 'disable', pluginId);
  }
  
  /**
   * Track plugin settings change
   */
  trackPluginSettings(pluginId, setting, value) {
    this.trackEvent('plugin_settings', setting, pluginId, value);
  }
  
  /**
   * Track permission grant/revoke
   */
  trackPermission(pluginId, permission, granted) {
    this.trackEvent('permission', granted ? 'grant' : 'revoke', `${pluginId}:${permission}`);
  }
  
  /**
   * Track search
   */
  trackSearch(query, resultCount) {
    this.trackEvent('search', 'query', query, resultCount);
    this.trackMetric('search_result_count', resultCount);
  }
  
  /**
   * Track view change
   */
  trackViewChange(fromView, toView) {
    this.trackEvent('navigation', 'view_change', `${fromView}->${toView}`);
  }
  
  /**
   * Track performance metrics
   */
  trackPerformance() {
    if (!window.performance) return;
    
    const perfData = window.performance.getEntriesByType('navigation')[0];
    if (perfData) {
      this.trackMetric('page_load_time', perfData.loadEventEnd - perfData.fetchStart, 'ms');
      this.trackMetric('dom_content_loaded', perfData.domContentLoadedEventEnd - perfData.fetchStart, 'ms');
      this.trackMetric('dom_interactive', perfData.domInteractive - perfData.fetchStart, 'ms');
    }
    
    // Track memory usage if available
    if (window.performance.memory) {
      this.trackMetric('memory_used', window.performance.memory.usedJSHeapSize / 1048576, 'MB');
      this.trackMetric('memory_limit', window.performance.memory.jsHeapSizeLimit / 1048576, 'MB');
    }
  }
  
  /**
   * Track resource usage
   */
  trackResourceUsage(pluginId, resources) {
    this.trackMetric(`plugin_memory_${pluginId}`, resources.memory.used, 'MB');
    this.trackMetric(`plugin_cpu_${pluginId}`, resources.cpu, '%');
    
    if (resources.memory.used > resources.memory.limit * 0.8) {
      this.trackEvent('resource_warning', 'memory_high', pluginId, resources.memory.used);
    }
    
    if (resources.cpu > 50) {
      this.trackEvent('resource_warning', 'cpu_high', pluginId, resources.cpu);
    }
  }
}

// Create and export singleton instance
// Default to disabled to honor zero‑telemetry principle and avoid 404s in dev.
// Enable only in production with an explicit opt‑in flag on window.
const isProd = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD;
const allowFlag = typeof window !== 'undefined' && window.__VAULT_ALLOW_TELEMETRY__ === true;
const telemetry = new PluginTelemetry({
  enabled: Boolean(isProd && allowFlag),
  endpoint: '/api/telemetry',
  batchSize: 50,
  flushInterval: 30000
});

// Make it available globally for error boundary
window.telemetry = telemetry;

export default telemetry;
