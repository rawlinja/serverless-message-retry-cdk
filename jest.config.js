/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: {
          isolatedModules: true,
        },
      },
    ],
  },
  testPathIgnorePatterns: ['/node_modules/', '/cdk.out/'],
  modulePathIgnorePatterns: ['<rootDir>/cdk.out/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  coverageProvider: 'v8',
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', '!**/node_modules/**', '!src/tests/**'],
  moduleNameMapper: {
    '^/opt/nodejs/node_modules/@middy/core$': '<rootDir>/src/tests/__mocks__/middy.ts',
    '^/opt/nodejs/node_modules/@middy/http-json-body-parser$':
      '<rootDir>/src/tests/__mocks__/middy-body-parser.ts',
    '^/opt/nodejs/node_modules/(.*)$': '<rootDir>/node_modules/$1',
    '^@lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@stacks/(.*)$': '<rootDir>/src/Infrastructure/stacks/$1',
  },
  transformIgnorePatterns: ['node_modules/(?!(nanoid|@middy)/)'],
}
