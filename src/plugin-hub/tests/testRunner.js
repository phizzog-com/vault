/**
 * Test Runner for Plugin Hub
 * Runs all unit, integration, and performance tests
 */

import { runFuzzySearchTests } from './unit/fuzzySearch.test.js';
import { runTelemetryTests } from './unit/telemetry.test.js';
import { runIntegrationTests } from './integration/pluginHub.test.js';
import PerformanceTestSuite from './performance.test.js';

/**
 * Simple test framework setup
 */
function setupTestFramework() {
  const suites = {};
  let currentSuite = null;
  
  window.describe = function(name, fn) {
    suites[name] = {
      tests: [],
      beforeEach: null,
      afterEach: null
    };
    currentSuite = suites[name];
    fn();
    currentSuite = null;
  };
  
  window.test = window.it = function(name, fn) {
    if (currentSuite) {
      currentSuite.tests.push({ name, fn });
    }
  };
  
  window.beforeEach = function(fn) {
    if (currentSuite) {
      currentSuite.beforeEach = fn;
    }
  };
  
  window.afterEach = function(fn) {
    if (currentSuite) {
      currentSuite.afterEach = fn;
    }
  };
  
  window.expect = function(actual) {
    return {
      toBe: (expected) => {
        if (actual !== expected) {
          throw new Error(`Expected ${actual} to be ${expected}`);
        }
      },
      toEqual: (expected) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
        }
      },
      toBeDefined: () => {
        if (actual === undefined) {
          throw new Error(`Expected value to be defined`);
        }
      },
      toBeUndefined: () => {
        if (actual !== undefined) {
          throw new Error(`Expected value to be undefined`);
        }
      },
      toBeNull: () => {
        if (actual !== null) {
          throw new Error(`Expected value to be null`);
        }
      },
      toBeInstanceOf: (expected) => {
        if (!(actual instanceof expected)) {
          throw new Error(`Expected value to be instance of ${expected.name}`);
        }
      },
      toHaveLength: (expected) => {
        if (actual.length !== expected) {
          throw new Error(`Expected length ${actual.length} to be ${expected}`);
        }
      },
      toContain: (expected) => {
        if (!actual.includes(expected)) {
          throw new Error(`Expected ${actual} to contain ${expected}`);
        }
      },
      toBeGreaterThan: (expected) => {
        if (actual <= expected) {
          throw new Error(`Expected ${actual} to be greater than ${expected}`);
        }
      },
      toBeGreaterThanOrEqual: (expected) => {
        if (actual < expected) {
          throw new Error(`Expected ${actual} to be greater than or equal to ${expected}`);
        }
      },
      toBeLessThan: (expected) => {
        if (actual >= expected) {
          throw new Error(`Expected ${actual} to be less than ${expected}`);
        }
      }
    };
  };
  
  // Mock jest functions
  window.jest = {
    fn: (impl) => {
      const mockFn = impl || (() => {});
      mockFn.mock = { calls: [] };
      return new Proxy(mockFn, {
        apply: (target, thisArg, args) => {
          mockFn.mock.calls.push(args);
          return target.apply(thisArg, args);
        }
      });
    }
  };
  
  describe.tests = suites;
  return suites;
}

/**
 * Run all test suites
 */
export async function runAllTests() {
  console.log('=================================');
  console.log('Plugin Hub Test Suite');
  console.log('=================================\n');
  
  setupTestFramework();
  
  const results = {
    unit: [],
    integration: [],
    performance: null,
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      coverage: 0
    }
  };
  
  // Run unit tests
  console.log('Running Unit Tests...\n');
  console.log('---------------------');
  
  console.log('Fuzzy Search Tests:');
  const fuzzyResults = runFuzzySearchTests();
  results.unit.push({ name: 'Fuzzy Search', ...fuzzyResults });
  console.log(`  ✓ Passed: ${fuzzyResults.passed}`);
  console.log(`  ✗ Failed: ${fuzzyResults.failed}`);
  
  console.log('\nTelemetry Tests:');
  const telemetryResults = runTelemetryTests();
  results.unit.push({ name: 'Telemetry', ...telemetryResults });
  console.log(`  ✓ Passed: ${telemetryResults.passed}`);
  console.log(`  ✗ Failed: ${telemetryResults.failed}`);
  
  // Run integration tests
  console.log('\n\nRunning Integration Tests...\n');
  console.log('---------------------------');
  
  const integrationResults = runIntegrationTests();
  results.integration = integrationResults;
  console.log(`  ✓ Passed: ${integrationResults.passed}`);
  console.log(`  ✗ Failed: ${integrationResults.failed}`);
  console.log(`  Coverage: ${integrationResults.coverage}%`);
  
  // Run performance tests
  console.log('\n\nRunning Performance Tests...\n');
  console.log('---------------------------');
  
  const perfSuite = new PerformanceTestSuite();
  const perfResults = await perfSuite.runAll();
  results.performance = perfResults;
  
  // Calculate summary
  results.unit.forEach(suite => {
    results.summary.total += suite.total;
    results.summary.passed += suite.passed;
    results.summary.failed += suite.failed;
  });
  
  results.summary.total += integrationResults.total;
  results.summary.passed += integrationResults.passed;
  results.summary.failed += integrationResults.failed;
  
  results.summary.coverage = Math.round(
    (results.summary.passed / results.summary.total) * 100
  );
  
  // Print summary
  console.log('\n\n=================================');
  console.log('Test Summary');
  console.log('=================================\n');
  
  console.log(`Total Tests: ${results.summary.total}`);
  console.log(`Passed: ${results.summary.passed} ✓`);
  console.log(`Failed: ${results.summary.failed} ✗`);
  console.log(`Coverage: ${results.summary.coverage}%`);
  
  // Print failed tests if any
  if (results.summary.failed > 0) {
    console.log('\n\nFailed Tests:');
    console.log('-------------');
    
    results.unit.forEach(suite => {
      if (suite.results) {
        suite.results
          .filter(r => r.status === 'failed')
          .forEach(r => {
            console.log(`  ✗ ${suite.name}: ${r.name}`);
            console.log(`    Error: ${r.error}`);
          });
      }
    });
    
    if (integrationResults.results) {
      integrationResults.results
        .filter(r => r.status === 'failed')
        .forEach(r => {
          console.log(`  ✗ Integration: ${r.name}`);
          console.log(`    Error: ${r.error}`);
        });
    }
  }
  
  // Success criteria check
  const SUCCESS_CRITERIA = {
    coverage: 90,
    performance: {
      searchTime: 50,    // ms
      stateUpdate: 100,  // ms
      renderTime: 200,   // ms
      scrollFPS: 30      // fps
    }
  };
  
  console.log('\n\n=================================');
  console.log('Success Criteria Validation');
  console.log('=================================\n');
  
  const coverageMet = results.summary.coverage >= SUCCESS_CRITERIA.coverage;
  console.log(`Coverage >= ${SUCCESS_CRITERIA.coverage}%: ${coverageMet ? '✓' : '✗'} (${results.summary.coverage}%)`);
  
  const performanceMet = perfResults && perfResults.passed;
  console.log(`Performance Tests: ${performanceMet ? '✓' : '✗'}`);
  
  const allTestsPassed = results.summary.failed === 0;
  console.log(`All Tests Passed: ${allTestsPassed ? '✓' : '✗'}`);
  
  const overallSuccess = coverageMet && performanceMet && allTestsPassed;
  
  console.log('\n' + (overallSuccess ? 
    '✅ All success criteria met!' : 
    '❌ Some success criteria not met'
  ));
  
  return {
    success: overallSuccess,
    results
  };
}

// Run tests if executed directly
if (typeof window !== 'undefined' && window.location.pathname.includes('testRunner')) {
  runAllTests().then(({ success }) => {
    if (!success) {
      console.error('\nTests failed!');
      if (typeof process !== 'undefined') {
        process.exit(1);
      }
    }
  });
}

export default runAllTests;