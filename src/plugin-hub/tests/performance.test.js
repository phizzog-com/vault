/**
 * Performance Tests for Plugin Hub
 * Tests handling of large datasets and UI responsiveness
 */

import { PluginContext } from '../PluginContext.js';
import { fuzzySearchPlugins } from '../utils/fuzzySearch.js';

/**
 * Generate mock plugin data
 */
function generateMockPlugins(count) {
  const plugins = [];
  const categories = ['productivity', 'development', 'writing', 'data', 'ui'];
  const authors = ['Alice', 'Bob', 'Charlie', 'David', 'Eve'];
  
  for (let i = 0; i < count; i++) {
    plugins.push({
      id: `plugin-${i}`,
      name: `Test Plugin ${i}`,
      description: `This is a test plugin number ${i} with various features and capabilities for testing performance`,
      version: `1.${i % 10}.${i % 100}`,
      author: authors[i % authors.length],
      category: categories[i % categories.length],
      enabled: i % 3 === 0,
      tags: [`tag${i % 5}`, `feature${i % 7}`, `type${i % 3}`],
      permissions: [],
      resources: {
        memory: { used: Math.random() * 100, limit: 100 },
        cpu: Math.random() * 100,
        storage: { used: Math.random() * 500, limit: 500 }
      }
    });
  }
  
  return plugins;
}

/**
 * Measure function execution time
 */
function measureTime(fn, iterations = 1) {
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  return { avg, min, max, times };
}

/**
 * Performance test suite
 */
export class PerformanceTestSuite {
  constructor() {
    this.results = [];
  }
  
  /**
   * Test fuzzy search performance
   */
  testFuzzySearch() {
    console.log('Testing fuzzy search performance...');
    
    const testCases = [
      { count: 100, query: 'test' },
      { count: 500, query: 'plugin' },
      { count: 1000, query: 'feature' },
      { count: 5000, query: 'data' },
      { count: 10000, query: 'prod' }
    ];
    
    const results = [];
    
    for (const testCase of testCases) {
      const plugins = generateMockPlugins(testCase.count);
      
      const timing = measureTime(() => {
        fuzzySearchPlugins(plugins, testCase.query);
      }, 10);
      
      results.push({
        pluginCount: testCase.count,
        query: testCase.query,
        avgTime: timing.avg.toFixed(2),
        minTime: timing.min.toFixed(2),
        maxTime: timing.max.toFixed(2)
      });
      
      console.log(`  ${testCase.count} plugins, query "${testCase.query}": ${timing.avg.toFixed(2)}ms avg`);
    }
    
    this.results.push({
      test: 'Fuzzy Search',
      results,
      passed: results.every(r => parseFloat(r.avgTime) < 50) // Should be under 50ms
    });
    
    return results;
  }
  
  /**
   * Test state update performance
   */
  testStateUpdates() {
    console.log('Testing state update performance...');
    
    const context = new PluginContext();
    const results = [];
    
    const testCases = [100, 500, 1000, 5000];
    
    for (const count of testCases) {
      const plugins = generateMockPlugins(count);
      
      const timing = measureTime(() => {
        context.setState({ installedPlugins: plugins });
      }, 10);
      
      results.push({
        pluginCount: count,
        avgTime: timing.avg.toFixed(2),
        minTime: timing.min.toFixed(2),
        maxTime: timing.max.toFixed(2)
      });
      
      console.log(`  ${count} plugins state update: ${timing.avg.toFixed(2)}ms avg`);
    }
    
    this.results.push({
      test: 'State Updates',
      results,
      passed: results.every(r => parseFloat(r.avgTime) < 100) // Should be under 100ms
    });
    
    return results;
  }
  
  /**
   * Test DOM rendering performance
   */
  testDOMRendering() {
    console.log('Testing DOM rendering performance...');
    
    const results = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const testCases = [50, 100, 200, 500];
    
    for (const count of testCases) {
      const plugins = generateMockPlugins(count);
      
      const timing = measureTime(() => {
        container.innerHTML = '';
        
        // Simulate rendering plugin cards
        const html = plugins.map(plugin => `
          <div class="plugin-card" data-plugin-id="${plugin.id}">
            <h3>${plugin.name}</h3>
            <p>${plugin.description}</p>
            <span>${plugin.version}</span>
          </div>
        `).join('');
        
        container.innerHTML = html;
      }, 5);
      
      results.push({
        pluginCount: count,
        avgTime: timing.avg.toFixed(2),
        minTime: timing.min.toFixed(2),
        maxTime: timing.max.toFixed(2)
      });
      
      console.log(`  ${count} plugin cards rendered: ${timing.avg.toFixed(2)}ms avg`);
    }
    
    document.body.removeChild(container);
    
    this.results.push({
      test: 'DOM Rendering',
      results,
      passed: results.every(r => parseFloat(r.avgTime) < 200) // Should be under 200ms
    });
    
    return results;
  }
  
  /**
   * Test memory usage
   */
  testMemoryUsage() {
    console.log('Testing memory usage...');
    
    if (!window.performance.memory) {
      console.log('  Memory API not available');
      return null;
    }
    
    const results = [];
    const testCases = [100, 500, 1000, 5000];
    
    for (const count of testCases) {
      const beforeMemory = window.performance.memory.usedJSHeapSize;
      const plugins = generateMockPlugins(count);
      const afterMemory = window.performance.memory.usedJSHeapSize;
      
      const memoryUsed = (afterMemory - beforeMemory) / 1048576; // Convert to MB
      
      results.push({
        pluginCount: count,
        memoryUsed: memoryUsed.toFixed(2),
        memoryPerPlugin: (memoryUsed / count * 1000).toFixed(2) // KB per plugin
      });
      
      console.log(`  ${count} plugins: ${memoryUsed.toFixed(2)}MB used`);
    }
    
    this.results.push({
      test: 'Memory Usage',
      results,
      passed: results.every(r => parseFloat(r.memoryPerPlugin) < 10) // Less than 10KB per plugin
    });
    
    return results;
  }
  
  /**
   * Test scroll performance
   */
  testScrollPerformance() {
    console.log('Testing scroll performance...');
    
    const container = document.createElement('div');
    container.style.height = '500px';
    container.style.overflow = 'auto';
    document.body.appendChild(container);
    
    // Create a large list
    const plugins = generateMockPlugins(1000);
    container.innerHTML = plugins.map(plugin => `
      <div class="plugin-card" style="height: 100px; margin: 10px;">
        <h3>${plugin.name}</h3>
        <p>${plugin.description}</p>
      </div>
    `).join('');
    
    // Measure scroll performance
    let frameCount = 0;
    let startTime = performance.now();
    
    const measureFrames = () => {
      frameCount++;
      if (performance.now() - startTime < 1000) {
        requestAnimationFrame(measureFrames);
      }
    };
    
    // Simulate scrolling
    container.scrollTop = 0;
    requestAnimationFrame(measureFrames);
    
    // Scroll the container
    const scrollInterval = setInterval(() => {
      container.scrollTop += 50;
      if (container.scrollTop >= container.scrollHeight - container.clientHeight) {
        clearInterval(scrollInterval);
      }
    }, 16); // ~60fps
    
    // Wait for measurement to complete
    setTimeout(() => {
      document.body.removeChild(container);
      
      const fps = frameCount;
      console.log(`  Scroll FPS: ${fps}`);
      
      this.results.push({
        test: 'Scroll Performance',
        results: [{ fps, passed: fps >= 30 }], // Should maintain at least 30 FPS
        passed: fps >= 30
      });
    }, 1100);
  }
  
  /**
   * Run all performance tests
   */
  async runAll() {
    console.log('Running Plugin Hub Performance Tests\n');
    console.log('=====================================\n');
    
    this.testFuzzySearch();
    this.testStateUpdates();
    this.testDOMRendering();
    this.testMemoryUsage();
    
    // Wait for async scroll test
    await new Promise(resolve => {
      this.testScrollPerformance();
      setTimeout(resolve, 1200);
    });
    
    // Summary
    console.log('\n=====================================');
    console.log('Performance Test Summary\n');
    
    let allPassed = true;
    
    for (const result of this.results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} - ${result.test}`);
      allPassed = allPassed && result.passed;
    }
    
    console.log('\n' + (allPassed ? '✅ All tests passed!' : '❌ Some tests failed'));
    
    return {
      passed: allPassed,
      results: this.results
    };
  }
}

// Export for testing
export default PerformanceTestSuite;

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location.pathname.includes('performance.test')) {
  const suite = new PerformanceTestSuite();
  suite.runAll().then(results => {
    console.log('Test results:', results);
  });
}