import { jest } from '@jest/globals';

// Create mock functions that will be shared across imports
const mockInvoke = jest.fn();
const mockListen = jest.fn();
const mockOnce = jest.fn();
const mockEmit = jest.fn();

// Mock @tauri-apps/api/core module
export const invoke = mockInvoke;

// Mock @tauri-apps/api/event module
export const listen = mockListen;
export const once = mockOnce;
export const emit = mockEmit;

// Default export for compatibility
export default {
  invoke: mockInvoke,
  listen: mockListen,
  once: mockOnce,
  emit: mockEmit
};
