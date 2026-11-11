// Jest configuration for the API test suite.
// Tests run the real Express app against an in-memory MongoDB
// (see tests/setup.js), so no external database is needed.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Memory-server startup + parallel request storms can be slow on CI.
  testTimeout: 60000,
};
