/**
 * Integration Tests for Plugin Hub
 */

import { PluginHub } from '../../PluginHub.js';
import { PluginContext } from '../../PluginContext.js';

describe('PluginHub Integration Tests', () => {
  let pluginHub;
  let container;
  
  beforeEach(() => {
    // Create container
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // Create plugin hub instance
    pluginHub = new PluginHub();
  });
  
  afterEach(() => {
    // Clean up
    if (pluginHub.isOpen) {
      pluginHub.close();
    }
    document.body.removeChild(container);
  });
  
  describe('Initialization', () => {
    test('should initialize with default state', () => {
      expect(pluginHub.currentView).toBe('installed');
      expect(pluginHub.searchQuery).toBe('');
      expect(pluginHub.isOpen).toBe(false);
      expect(pluginHub.context).toBeInstanceOf(PluginContext);
    });
    
    test('should lazy load error boundary', async () => {
      await pluginHub.initializeLazyLoading();
      expect(pluginHub.errorBoundary).toBeDefined();
    });
  });
  
  describe('Opening and Closing', () => {
    test('should open plugin hub', async () => {
      await pluginHub.open();
      
      expect(pluginHub.isOpen).toBe(true);
      expect(pluginHub.container).toBeDefined();
      expect(document.getElementById('plugin-hub-container')).toBeDefined();
    });
    
    test('should close plugin hub', async () => {
      await pluginHub.open();
      pluginHub.close();
      
      expect(pluginHub.isOpen).toBe(false);
      expect(pluginHub.container).toBeNull();
      expect(document.getElementById('plugin-hub-container')).toBeNull();
    });
    
    test('should not open if already open', async () => {
      await pluginHub.open();
      const firstContainer = pluginHub.container;
      
      await pluginHub.open();
      expect(pluginHub.container).toBe(firstContainer);
    });
  });
  
  describe('View Switching', () => {
    test('should switch views', async () => {
      await pluginHub.open();
      
      pluginHub.switchView('discover');
      expect(pluginHub.currentView).toBe('discover');
      
      pluginHub.switchView('permissions');
      expect(pluginHub.currentView).toBe('permissions');
      
      pluginHub.switchView('resources');
      expect(pluginHub.currentView).toBe('resources');
    });
    
    test('should lazy load views on demand', async () => {
      await pluginHub.open();
      
      expect(Object.keys(pluginHub.views)).toHaveLength(0);
      
      await pluginHub.renderCurrentView();
      
      // Should have loaded the current view
      expect(pluginHub.views[pluginHub.currentView]).toBeDefined();
    });
    
    test('should announce view changes for accessibility', async () => {
      await pluginHub.open();
      
      const announcement = document.getElementById('plugin-hub-announcement');
      expect(announcement).toBeDefined();
      
      pluginHub.switchView('discover');
      expect(announcement.textContent).toContain('discover');
    });
  });
  
  describe('Keyboard Navigation', () => {
    test('should handle number keys for view switching', async () => {
      await pluginHub.open();
      
      const event1 = new KeyboardEvent('keydown', { key: '1' });
      document.dispatchEvent(event1);
      expect(pluginHub.currentView).toBe('discover');
      
      const event2 = new KeyboardEvent('keydown', { key: '2' });
      document.dispatchEvent(event2);
      expect(pluginHub.currentView).toBe('installed');
      
      const event3 = new KeyboardEvent('keydown', { key: '3' });
      document.dispatchEvent(event3);
      expect(pluginHub.currentView).toBe('permissions');
      
      const event4 = new KeyboardEvent('keydown', { key: '4' });
      document.dispatchEvent(event4);
      expect(pluginHub.currentView).toBe('resources');
    });
    
    test('should handle escape key to close', async () => {
      await pluginHub.open();
      
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);
      
      expect(pluginHub.isOpen).toBe(false);
    });
    
    test('should handle slash key for search focus', async () => {
      await pluginHub.open();
      
      const event = new KeyboardEvent('keydown', { key: '/' });
      document.dispatchEvent(event);
      
      const searchInput = pluginHub.container.querySelector('.plugin-search-input');
      expect(document.activeElement).toBe(searchInput);
    });
    
    test('should not handle keys when input is focused', async () => {
      await pluginHub.open();
      
      const searchInput = pluginHub.container.querySelector('.plugin-search-input');
      searchInput.focus();
      
      const initialView = pluginHub.currentView;
      const event = new KeyboardEvent('keydown', { key: '1' });
      searchInput.dispatchEvent(event);
      
      expect(pluginHub.currentView).toBe(initialView);
    });
  });
  
  describe('Search Functionality', () => {
    test('should update search query', async () => {
      await pluginHub.open();
      
      pluginHub.handleSearch('test query');
      expect(pluginHub.searchQuery).toBe('test query');
      expect(pluginHub.context.state.searchQuery).toBe('test query');
    });
    
    test('should trigger view update on search', async () => {
      await pluginHub.open();
      
      let updateCalled = false;
      pluginHub.updateCurrentView = () => {
        updateCalled = true;
      };
      
      pluginHub.handleSearch('test');
      expect(updateCalled).toBe(true);
    });
  });
  
  describe('Plugin Operations', () => {
    test('should handle plugin toggle', async () => {
      await pluginHub.open();
      
      // Mock context method
      let toggleCalled = false;
      pluginHub.context.enablePlugin = async (id) => {
        toggleCalled = true;
        return Promise.resolve();
      };
      
      await pluginHub.handlePluginToggle('test-plugin', true);
      expect(toggleCalled).toBe(true);
    });
    
    test('should handle plugin uninstall with confirmation', async () => {
      await pluginHub.open();
      
      // Mock context methods
      let uninstallCalled = false;
      pluginHub.context.uninstallPlugin = async (id) => {
        uninstallCalled = true;
        return Promise.resolve();
      };
      
      pluginHub.context.confirm = async () => true;
      
      pluginHub.context.state.installedPlugins = [
        { id: 'test-plugin', name: 'Test Plugin' }
      ];
      
      await pluginHub.handlePluginUninstall('test-plugin');
      expect(uninstallCalled).toBe(true);
    });
    
    test('should not uninstall without confirmation', async () => {
      await pluginHub.open();
      
      let uninstallCalled = false;
      pluginHub.context.uninstallPlugin = async (id) => {
        uninstallCalled = true;
        return Promise.resolve();
      };
      
      pluginHub.context.confirm = async () => false;
      
      pluginHub.context.state.installedPlugins = [
        { id: 'test-plugin', name: 'Test Plugin' }
      ];
      
      await pluginHub.handlePluginUninstall('test-plugin');
      expect(uninstallCalled).toBe(false);
    });
  });
  
  describe('Error Handling', () => {
    test('should handle view loading errors gracefully', async () => {
      await pluginHub.open();
      
      // Force an error
      pluginHub.getViewClassName = () => 'NonExistentView';
      
      await pluginHub.renderCurrentView();
      
      const content = pluginHub.container.querySelector('.plugin-hub-content');
      expect(content.innerHTML).toContain('Failed to load view');
    });
    
    test('should recover from errors using error boundary', async () => {
      await pluginHub.initializeLazyLoading();
      
      if (pluginHub.errorBoundary) {
        let errorHandled = false;
        pluginHub.errorBoundary.handleError = () => {
          errorHandled = true;
        };
        
        // Trigger an error
        const error = new Error('Test error');
        window.dispatchEvent(new ErrorEvent('error', { error }));
        
        expect(errorHandled).toBe(true);
      }
    });
  });
});

// Export test runner
export function runIntegrationTests() {
  const results = [];
  let passed = 0;
  let failed = 0;
  
  // Run all test suites
  if (typeof describe !== 'undefined' && describe.tests) {
    Object.entries(describe.tests).forEach(([suiteName, suite]) => {
      suite.forEach(test => {
        try {
          // Setup
          if (suite.beforeEach) suite.beforeEach();
          
          // Run test
          test.fn();
          results.push({ name: `${suiteName}: ${test.name}`, status: 'passed' });
          passed++;
          
          // Teardown
          if (suite.afterEach) suite.afterEach();
        } catch (error) {
          results.push({ 
            name: `${suiteName}: ${test.name}`, 
            status: 'failed', 
            error: error.message 
          });
          failed++;
        }
      });
    });
  }
  
  return {
    total: passed + failed,
    passed,
    failed,
    coverage: Math.round((passed / (passed + failed)) * 100),
    results
  };
}