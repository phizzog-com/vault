import { jest } from '@jest/globals'
import { TextEncoder, TextDecoder } from 'util'

// Polyfill for TextEncoder/TextDecoder
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock Tauri API globally
global.__TAURI_INTERNALS__ = {
  invoke: jest.fn(),
  ipc: {
    invoke: jest.fn()
  }
}

// Mock window.tabManager and window.windowContext for WikiLink tests
global.window = global.window || {}
global.window.tabManager = {
  openFile: jest.fn().mockResolvedValue('test-tab-id'),
  createTab: jest.fn().mockResolvedValue({ id: 'test-tab-id' }),
  findTabByPath: jest.fn().mockReturnValue(null),
  activateTab: jest.fn()
}

global.window.windowContext = {
  getComponent: jest.fn().mockReturnValue(global.window.tabManager)
}

// Mock console methods to reduce noise during tests
global.console.log = jest.fn()
global.console.warn = jest.fn()
global.console.error = jest.fn()

// Mock performance API for timing tests
global.performance = global.performance || {
  now: jest.fn(() => Date.now())
}

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks()
  // Clean up any DOM modifications
  if (typeof document !== 'undefined') {
    document.body.innerHTML = ''
  }
})