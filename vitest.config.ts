import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'


export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    globals: false,
    mockReset: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      // `@typora-community-plugin/core` is a types-only package (no runtime
      // entry), so point vitest at a stub; tests/setup.ts overrides it via
      // `vi.mock(...)` factories.
      '@typora-community-plugin/core': fileURLToPath(new URL('./tests/mocks/typora-core.ts', import.meta.url)),
      // `@/` maps to the `src/` root, matching tsconfig `paths`.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
