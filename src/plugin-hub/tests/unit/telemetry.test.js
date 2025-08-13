/**
 * Unit Tests for Telemetry
 */

import { PluginTelemetry } from '../../utils/telemetry.js';

describe('Telemetry Unit Tests', () => {
  let telemetry;
  
  beforeEach(() => {
    telemetry = new PluginTelemetry({
      enabled: true,
      endpoint: '/test/telemetry',
      batchSize: 5,
      flushInterval: 1000
    });
  });
  
  afterEach(() => {
    telemetry.disable();
  });
  
  describe('Event Tracking', () => {
    test('should track events', () => {
      telemetry.trackEvent('test', 'action', 'label', 100);
      
      expect(telemetry.events).toHaveLength(2); // Including session start
      const event = telemetry.events[1];
      expect(event.category).toBe('test');
      expect(event.action).toBe('action');
      expect(event.label).toBe('label');
      expect(event.value).toBe(100);
    });
    
    test('should generate session ID', () => {
      expect(telemetry.sessionId).toBeDefined();
      expect(telemetry.sessionId).toMatch(/^\d+-[a-z0-9]+$/);
    });
    
    test('should respect enabled flag', () => {
      telemetry.disable();
      telemetry.trackEvent('test', 'action');
      
      expect(telemetry.events).toHaveLength(0);
    });
  });
  
  describe('Metric Tracking', () => {
    test('should track metrics', () => {
      telemetry.trackMetric('test_metric', 100, 'ms');
      telemetry.trackMetric('test_metric', 200, 'ms');
      telemetry.trackMetric('test_metric', 150, 'ms');
      
      const stats = telemetry.getMetricStats('test_metric');
      expect(stats.count).toBe(3);
      expect(stats.sum).toBe(450);
      expect(stats.avg).toBe(150);
      expect(stats.min).toBe(100);
      expect(stats.max).toBe(200);
    });
    
    test('should calculate percentiles', () => {
      for (let i = 1; i <= 100; i++) {
        telemetry.trackMetric('percentile_test', i);
      }
      
      const stats = telemetry.getMetricStats('percentile_test');
      expect(stats.p50).toBe(50);
      expect(stats.p95).toBe(95);
      expect(stats.p99).toBe(99);
    });
  });
  
  describe('Timer Tracking', () => {
    test('should track timer duration', async () => {
      telemetry.startTimer('test_timer');
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const duration = telemetry.endTimer('test_timer');
      
      expect(duration).toBeGreaterThanOrEqual(90);
      expect(duration).toBeLessThan(200);
      
      // Check that event was tracked
      const timerEvent = telemetry.events.find(e => 
        e.action === 'timing' && e.label === 'test_timer'
      );
      expect(timerEvent).toBeDefined();
    });
    
    test('should handle non-existent timer', () => {
      const duration = telemetry.endTimer('non_existent');
      expect(duration).toBeUndefined();
    });
  });
  
  describe('Plugin-specific Methods', () => {
    test('should track plugin installation', () => {
      telemetry.trackPluginInstall('test-plugin', 'marketplace');
      
      const events = telemetry.events.filter(e => e.category === 'plugin');
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('install');
      expect(events[0].label).toBe('test-plugin');
    });
    
    test('should track plugin toggle', () => {
      telemetry.trackPluginToggle('test-plugin', true);
      telemetry.trackPluginToggle('test-plugin', false);
      
      const events = telemetry.events.filter(e => e.category === 'plugin');
      expect(events).toHaveLength(2);
      expect(events[0].action).toBe('enable');
      expect(events[1].action).toBe('disable');
    });
    
    test('should track search', () => {
      telemetry.trackSearch('test query', 10);
      
      const searchEvent = telemetry.events.find(e => 
        e.category === 'search' && e.action === 'query'
      );
      expect(searchEvent).toBeDefined();
      expect(searchEvent.label).toBe('test query');
      expect(searchEvent.value).toBe(10);
      
      const metric = telemetry.getMetricStats('search_result_count');
      expect(metric.count).toBe(1);
      expect(metric.sum).toBe(10);
    });
    
    test('should track view changes', () => {
      telemetry.trackViewChange('installed', 'discover');
      
      const event = telemetry.events.find(e => 
        e.category === 'navigation' && e.action === 'view_change'
      );
      expect(event).toBeDefined();
      expect(event.label).toBe('installed->discover');
    });
    
    test('should track resource usage', () => {
      const resources = {
        memory: { used: 80, limit: 100 },
        cpu: 60
      };
      
      telemetry.trackResourceUsage('test-plugin', resources);
      
      const memoryMetric = telemetry.getMetricStats('plugin_memory_test-plugin');
      expect(memoryMetric.count).toBe(1);
      expect(memoryMetric.sum).toBe(80);
      
      const cpuMetric = telemetry.getMetricStats('plugin_cpu_test-plugin');
      expect(cpuMetric.count).toBe(1);
      expect(cpuMetric.sum).toBe(60);
      
      // Check for warning events
      const warningEvents = telemetry.events.filter(e => 
        e.category === 'resource_warning'
      );
      expect(warningEvents).toHaveLength(2); // Memory high and CPU high
    });
  });
  
  describe('Error Tracking', () => {
    test('should track errors', () => {
      const error = new Error('Test error');
      telemetry.trackError(error, { context: 'test' });
      
      const errorEvent = telemetry.events.find(e => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error.message).toBe('Test error');
      expect(errorEvent.context.context).toBe('test');
    });
  });
  
  describe('Batch Management', () => {
    test('should auto-flush when batch size reached', () => {
      // Mock fetch
      let flushed = false;
      global.fetch = jest.fn(() => {
        flushed = true;
        return Promise.resolve({ ok: true });
      });
      
      // Track events up to batch size
      for (let i = 0; i < 5; i++) {
        telemetry.trackEvent('test', 'action', `label${i}`);
      }
      
      // Should trigger flush
      expect(flushed).toBe(true);
      expect(telemetry.events).toHaveLength(0);
    });
  });
});

// Export test runner
export function runTelemetryTests() {
  const results = [];
  let passed = 0;
  let failed = 0;
  
  // Mock fetch for testing
  if (typeof global === 'undefined') {
    window.global = window;
  }
  global.fetch = () => Promise.resolve({ ok: true });
  
  // Run all test suites
  if (typeof describe !== 'undefined' && describe.tests) {
    Object.entries(describe.tests).forEach(([suiteName, suite]) => {
      suite.forEach(test => {
        try {
          test.fn();
          results.push({ name: test.name, status: 'passed' });
          passed++;
        } catch (error) {
          results.push({ name: test.name, status: 'failed', error: error.message });
          failed++;
        }
      });
    });
  }
  
  return {
    total: passed + failed,
    passed,
    failed,
    results
  };
}