/**
 * Browser-half bundle for the dsh web client. The dsh module host expects one
 * classic script per plugin that registers a CommonJS factory:
 *   window.__ModuleLoader__.load({ id, factory: (require) => module.exports })
 * Platform modules (react, cordis, the dsh client platform packages) resolve
 * through the injected `require`; everything else inlines. Mirrors
 * `packages/client/tsdown.client.ts` in the harness repository, minus its CSS
 * pipeline (this plugin injects its stylesheet from a string).
 */
import { defineConfig } from 'tsdown'

const ID = 'dsh-ai4scholar'

/** The web shell's module table: what a plugin bundle may `require` at runtime. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

export default defineConfig({
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...PLATFORM_MODULES],
  noExternal: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  plugins: [{
    // Fail the build on any @deepseek-ai value import that is not a platform
    // module: it would either duplicate a shared runtime or hit a require the
    // module table cannot answer. Type-only imports are erased before this.
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (PLATFORM_MODULES.includes(source)) return null
      throw new Error(`client bundle purity: "${source}" is not a dsh web platform module; only type-only imports are allowed from it`)
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
