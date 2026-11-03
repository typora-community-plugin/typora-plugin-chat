import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import { compileSvelte, compileSvelteModule } from './svelte-build-plugin.js'


const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * Compile Svelte in tests with the same settings as the real builds, so a
 * component (or a runes module) cannot pass here and fail after `pnpm build`.
 */
function sveltePlugin() {
  return {
    name: 'svelte',
    enforce: 'pre' as const,
    // `./x.svelte` may be a runes module (`x.svelte.ts`); Vite only appends
    // extensions, which turns it into `x.svelte.ts` anyway — but be explicit.
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !source.startsWith('.') || !source.endsWith('.svelte')) return null
      const candidate = resolve(dirname(importer), `${source}.ts`)
      return existsSync(candidate) ? candidate : null
    },
    async transform(code: string, id: string) {
      if (/\.svelte\.(js|ts)$/.test(id)) {
        const compiled = await compileSvelteModule(code, id, true)
        return { code: compiled.code, map: null }
      }
      if (id.endsWith('.svelte')) {
        const compiled = await compileSvelte(code, id, true)
        return { code: compiled.code, map: null }
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [sveltePlugin()],
  resolve: {
    // Tests mount components, so `svelte` must resolve to its client build
    // (`svelte/internal/client`) instead of the SSR one.
    conditions: ['browser'],
    alias: {
      // `@typora-community-plugin/core` is a types-only package (no runtime
      // entry), so point vitest at a stub; tests/setup.ts overrides it via
      // `vi.mock(...)` factories.
      '@typora-community-plugin/core': resolve(root, 'tests/mocks/typora-core.ts'),
      // `@/` maps to the `src/` root, matching tsconfig `paths`.
      '@': resolve(root, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    globals: false,
    mockReset: true,
    restoreMocks: true,
    // `@testing-library/svelte` ships runes modules (`.svelte.js`); they need
    // our compiler, so they must not be externalized as plain ESM.
    server: { deps: { inline: [/@testing-library[\\/]svelte/] } },
  },
})
