export default {
  testEnvironment: 'jest-environment-jsdom',
  rootDir: '..',
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.js'],
  transform: {},
  moduleNameMapper: {
    '^@tauri-apps/api/core$': '<rootDir>/__mocks__/tauri-api.js',
    '^@tauri-apps/api/path$': '<rootDir>/__mocks__/tauri-api-path.js',
    '^@tauri-apps/api/(.*)$': '<rootDir>/__mocks__/tauri-api.js',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  testMatch: [
    '<rootDir>/src/**/*.test.js',
    '<rootDir>/src/**/*.test.jsx',
    '<rootDir>/test/tests/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/test-*.js'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  maxWorkers: 1, // Run tests serially to avoid issues with global mocks
  testTimeout: 10000
}