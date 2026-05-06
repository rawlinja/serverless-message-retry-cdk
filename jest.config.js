/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  //roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.[tj]sx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{ts}', '!**/node_modules/**'],
  moduleNameMapper: {
    '^/opt/nodejs/node_modules/(.*)$': '<rootDir>/node_modules/$1',
    '^@lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@stacks/(.*)$': '<rootDir>/src/Infrastructure/stacks/$1',
  },
  transformIgnorePatterns: ['node_modules/(?!(nanoid|@middy)/)'],
}
