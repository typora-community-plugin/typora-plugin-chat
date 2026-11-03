import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { transform } from 'esbuild'
import { compile, compileModule, preprocess } from 'svelte/compiler'
import { sveltePreprocess } from 'svelte-preprocess'


/**
 * Compile a single .svelte source file to ESM JavaScript.
 */
export async function compileSvelte(source, filename, dev = false) {
  const preprocessed = await preprocess(
    source,
    sveltePreprocess({
      scss: {},
    }),
    { filename },
  )
  const { js } = compile(preprocessed.code, {
    filename,
    generate: 'dom',
    css: 'injected',
    dev,
  })
  return { code: js.code, map: js.map }
}

/**
 * Compile a runes module (`.svelte.ts`): `$state`/`$derived`/`$effect` are
 * compiler macros, so the file must not reach the TypeScript loader as-is.
 */
export async function compileSvelteModule(source, filename, dev = false) {
  // `compileModule` parses JavaScript only, and the TypeScript plugin must not
  // emit this file (that would leave `$state(...)` as a runtime call), so strip
  // the types here and let the Svelte compiler see the runes.
  const stripped = await transform(source, { loader: 'ts', target: 'esnext', format: 'esm' })
  const { js } = compileModule(stripped.code, {
    filename,
    generate: 'client',
    dev,
  })
  return { code: js.code, map: js.map }
}

/**
 * Svelte files are imported without their `.ts` suffix:
 * `./inline-session.svelte` resolves to `inline-session.svelte.ts`. TypeScript
 * and Vite already append extensions that way; rollup does not, so resolve the
 * runes module here (a real `.svelte` component still falls through).
 */
function resolveRunesModule(source, importer) {
  if (!importer || !source.startsWith('.') || !source.endsWith('.svelte')) return null
  const candidate = resolve(dirname(importer), `${source}.ts`)
  return existsSync(candidate) ? candidate : null
}

/**
 * esbuild plugin: intercepts `.svelte` / `.svelte.ts` imports and compiles them.
 *
 * @param {{ dev?: boolean }} [options]
 */
export function esbuildSveltePlugin(options = {}) {
  const { dev = false } = options
  return {
    name: 'svelte',
    setup(build) {
      build.onLoad({ filter: /\.svelte(\.js|\.ts)?$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const result = /\.svelte\.(js|ts)$/.test(args.path)
          ? await compileSvelteModule(source, args.path, dev)
          : await compileSvelte(source, args.path, dev)
        return { contents: result.code, loader: 'js' }
      })
    },
  }
}

/**
 * rollup plugin: transform hook for `.svelte` / `.svelte.ts` / `.svelte.js`
 * files (production build).
 */
export function rollupSveltePlugin() {
  return {
    name: 'svelte',
    resolveId(source, importer) {
      return resolveRunesModule(source, importer)
    },
    async transform(code, id) {
      if (!/\.svelte(\.js|\.ts)?$/.test(id)) return null
      const result = /\.svelte\.(js|ts)$/.test(id)
        ? await compileSvelteModule(code, id, false)
        : await compileSvelte(code, id, false)
      return { code: result.code, map: result.map }
    },
  }
}

