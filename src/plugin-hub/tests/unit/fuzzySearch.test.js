/**
 * Unit Tests for Fuzzy Search
 */

import { fuzzySearchPlugins, highlightMatches, fuzzyMatch } from '../../utils/fuzzySearch.js';

describe('FuzzySearch Unit Tests', () => {
  
  describe('fuzzyMatch', () => {
    test('should return 0 for exact match', () => {
      expect(fuzzyMatch('test', 'test')).toBe(0);
      expect(fuzzyMatch('Plugin', 'plugin')).toBe(0); // Case insensitive
    });
    
    test('should return 1 for contains match', () => {
      expect(fuzzyMatch('test', 'this is a test string')).toBe(1);
      expect(fuzzyMatch('plugin', 'mypluginname')).toBe(1);
    });
    
    test('should return 0.5 for starts with match', () => {
      expect(fuzzyMatch('test', 'testing')).toBe(0.5);
      expect(fuzzyMatch('plugin', 'plugin-manager')).toBe(0.5);
    });
    
    test('should return -1 for no match', () => {
      expect(fuzzyMatch('xyz', 'abc def')).toBe(-1);
      expect(fuzzyMatch('', 'test')).toBe(-1);
      expect(fuzzyMatch('test', '')).toBe(-1);
    });
    
    test('should handle fuzzy matching with Levenshtein distance', () => {
      const score = fuzzyMatch('tset', 'test'); // One transposition
      expect(score).toBeGreaterThanOrEqual(3);
      expect(score).toBeLessThan(5);
    });
    
    test('should match character sequences', () => {
      const score = fuzzyMatch('tst', 'test');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(10);
    });
  });
  
  describe('fuzzySearchPlugins', () => {
    const mockPlugins = [
      { id: '1', name: 'Test Plugin', description: 'A test plugin', author: 'Alice' },
      { id: '2', name: 'Another Plugin', description: 'Another description', author: 'Bob' },
      { id: '3', name: 'Development Tool', description: 'For development', author: 'Charlie' },
      { id: '4', name: 'Data Manager', description: 'Manages data', author: 'David' }
    ];
    
    test('should return all plugins when query is empty', () => {
      const results = fuzzySearchPlugins(mockPlugins, '');
      expect(results).toHaveLength(4);
      expect(results).toEqual(mockPlugins);
    });
    
    test('should find exact matches', () => {
      const results = fuzzySearchPlugins(mockPlugins, 'Test Plugin');
      expect(results[0].name).toBe('Test Plugin');
    });
    
    test('should find partial matches', () => {
      const results = fuzzySearchPlugins(mockPlugins, 'plugin');
      expect(results).toHaveLength(2);
      expect(results[0].name).toContain('Plugin');
    });
    
    test('should search in multiple fields', () => {
      const results = fuzzySearchPlugins(mockPlugins, 'Alice');
      expect(results).toHaveLength(1);
      expect(results[0].author).toBe('Alice');
    });
    
    test('should handle fuzzy matches', () => {
      const results = fuzzySearchPlugins(mockPlugins, 'Develpoment'); // Typo
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Development Tool');
    });
    
    test('should respect threshold option', () => {
      const results = fuzzySearchPlugins(mockPlugins, 'xyz', { threshold: 1 });
      expect(results).toHaveLength(0);
    });
    
    test('should respect limit option', () => {
      const results = fuzzySearchPlugins(mockPlugins, 'plugin', { limit: 1 });
      expect(results).toHaveLength(1);
    });
    
    test('should handle array fields like tags', () => {
      const pluginsWithTags = [
        { ...mockPlugins[0], tags: ['testing', 'development'] },
        { ...mockPlugins[1], tags: ['utility', 'tool'] }
      ];
      
      const results = fuzzySearchPlugins(pluginsWithTags, 'testing', {
        keys: ['name', 'tags']
      });
      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('testing');
    });
  });
  
  describe('highlightMatches', () => {
    test('should highlight exact matches', () => {
      const result = highlightMatches('This is a test string', 'test');
      expect(result).toContain('<mark class="fuzzy-highlight">test</mark>');
    });
    
    test('should highlight multiple matches', () => {
      const result = highlightMatches('test test test', 'test');
      const matches = result.match(/<mark/g);
      expect(matches).toHaveLength(3);
    });
    
    test('should preserve case in highlighting', () => {
      const result = highlightMatches('Test String', 'test');
      expect(result).toContain('<mark class="fuzzy-highlight">Test</mark>');
    });
    
    test('should return original text when no match', () => {
      const text = 'No match here';
      const result = highlightMatches(text, 'xyz');
      expect(result).toBe(text);
    });
    
    test('should handle empty inputs', () => {
      expect(highlightMatches('', 'test')).toBe('');
      expect(highlightMatches('test', '')).toBe('test');
      expect(highlightMatches(null, 'test')).toBe(null);
    });
  });
});

// Export test runner
export function runFuzzySearchTests() {
  const results = [];
  let passed = 0;
  let failed = 0;
  
  // Run all test suites
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
  
  return {
    total: passed + failed,
    passed,
    failed,
    results
  };
}

// Mock test framework for standalone execution
if (typeof describe === 'undefined') {
  window.describe = function(name, fn) {
    describe.tests = describe.tests || {};
    describe.tests[name] = [];
    describe.currentSuite = name;
    fn();
  };
  
  window.test = window.it = function(name, fn) {
    describe.tests[describe.currentSuite].push({ name, fn });
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
}