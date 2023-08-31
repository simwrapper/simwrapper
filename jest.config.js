module.exports = {
  testEnvironment: 'jest-environment-jsdom', // Use the jest-environment-jsdom package
  // testEnvironment: 'jsdom',
  moduleFileExtensions: ['js', 'ts', 'json', 'vue'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.vue$': '@vue/vue2-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // '^@shared(.*)$': '<rootDir>/shared$1',
    // '^@components(.*)$': '<rootDir>/shared/components$1',
  },
}
