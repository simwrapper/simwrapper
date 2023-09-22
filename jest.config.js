module.exports = {
  testEnvironment: 'happy-dom',
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
