/**
 * Svelte 5 configuration for Typora plugin builds.
 *
 * The actual compilation is performed by the shared plugin in
 * `svelte-build-plugin.js` (esbuild onLoad / rollup transform).
 * This file is consumed by `svelte-check` and documents compiler options.
 */
export default {
  compilerOptions: {
    dev: process.env.NODE_ENV !== 'production',
    generate: 'dom',
    css: 'injected',
  },
}
