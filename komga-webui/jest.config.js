module.exports = {
  preset: '@vue/cli-plugin-unit-jest/presets/typescript-and-babel',
  moduleNameMapper: {
    '^@/functions/reflow-analysis-worker-factory$': '<rootDir>/tests/unit/mocks/reflow-analysis-worker-factory.ts',
  },
}
