import fs from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'rollup'
import { babel } from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
import replace from '@rollup/plugin-replace'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import scss from 'rollup-plugin-scss'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import virtual from '@rollup/plugin-virtual'
import { virtualModules } from 'rollup-plugin-typora'
import { rollupSveltePlugin } from './svelte-build-plugin.js'


const { compilerOptions } = JSON.parse(await fs.readFile('./tsconfig.json', 'utf8'))

const overrided = {
  "target": "ES5",
  "downlevelIteration": true,

  "module": undefined,
  "emitDeclarationOnly": undefined,
  "declaration": undefined,
  "declarationDir": undefined,
}

await fs.rm('./dist', { recursive: true, force: true })
await fs.mkdir('./dist')
await fs.cp('./src/locales', './dist/locales', { recursive: true })

export default defineConfig({
  input: 'src/main.ts',
  output: {
    file: 'dist/main.js',
    format: 'es',
  },
  plugins: [
    {
      name: 'src-alias',
      async resolveId(source, importer) {
        if (!source.startsWith('@/')) return null
        // Map `@/…` to `src/…` and hand the relative result back to the normal
        // pipeline so `.ts`/`.svelte` extension resolution still applies.
        const target = fileURLToPath(new URL(`./src/${source.slice(2)}`, import.meta.url))
        const base = importer ? dirname(importer) : process.cwd()
        const rel = relative(base, target).split('\\').join('/')
        return this.resolve(rel || '.', importer, { skipSelf: true })
      },
    },
    replace({
      preventAssignment: true,
      'process.env.IS_DEV': 'false',
    }),
    virtual(virtualModules),
    nodeResolve(),
    commonjs(),
    rollupSveltePlugin(),
    typescript({
      compilerOptions: {
        ...compilerOptions,
        ...overrided,
      },
    }),
    babel({
      babelHelpers: 'bundled',
      extensions: ['.js', '.jsx', '.es6', '.es', '.mjs', '.svelte'],
      presets: [["@babel/preset-env", { "useBuiltIns": "entry", "corejs": 3 }]],
      exclude: [
        /\bcore-js\b/,
      ],
    }),
    scss({
      fileName: 'style.css',
      processor: (css, map) => ({ css: css.replace(/\n+\s*/g, '') }),
    }),
    terser(),
  ],
})
