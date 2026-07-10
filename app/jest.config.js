/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: ['parser/**/*.js', 'util/**/*.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
};
