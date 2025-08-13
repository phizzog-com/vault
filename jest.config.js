export default {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {},
  moduleNameMapper: {
    '^@tauri-apps/api/(.*)$': '<rootDir>/__mocks__/tauri-api.js',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  testMatch: [
    '<rootDir>/src/**/*.test.js',
    '<rootDir>/src/**/*.test.jsx',
    '<rootDir>/tests/**/*.test.js'
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