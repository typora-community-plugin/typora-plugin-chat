import { readFile } from 'node:fs/promises'
import { compile, preprocess } from 'svelte/compiler'
import { sveltePreprocess } from 'svelte-preprocess'


/**
 * Compile a single .svelte source file to ESM JavaScript.
 */
async function compileSvelte(source, filename, dev = false) {
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
 * esbuild plugin: intercepts `.svelte` imports and compiles them.
 *
 * @param {{ dev?: boolean }} [options]
 */
export function esbuildSveltePlugin(options = {}) {
  const { dev = false } = options
  return {
    name: 'svelte',
    setup(build) {
      build.onLoad({ filter: /\.svelte$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const result = await compileSvelte(source, args.path, dev)
        return { contents: result.code, loader: 'js' }
      })
    },
  }
}

/**
 * rollup plugin: transform hook for `.svelte` files (production build).
 */
export function rollupSveltePlugin() {
  return {
    name: 'svelte',
    async transform(code, id) {
      if (!id.endsWith('.svelte')) return null
      const result = await compileSvelte(code, id, false)
      return { code: result.code, map: result.map }
    },
  }
}
