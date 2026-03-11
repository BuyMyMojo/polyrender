import { defineConfig, type Plugin } from 'vite'

/**
 * The core library's `requirePeerDep` does `import(moduleName)` where
 * `moduleName` is a variable — Vite cannot statically analyze that, so the
 * import fails at runtime in the browser.
 *
 * This plugin rewrites the variable import into a lookup of static `import()`
 * calls that Vite CAN resolve and pre-bundle.
 */
function resolvePeerDeps(): Plugin {
  const peerDeps = [
    'pdfjs-dist',
    'epubjs',
    'docx-preview',
    'papaparse',
    'highlight.js',
    'jszip',
    'xlsx',
  ]

  // Build a code snippet that maps module names → static imports.
  // highlight.js needs `.default` unwrapping for ESM compatibility.
  const cases = peerDeps
    .map((d) => `      case '${d}': return import('${d}').then(m => m.default || m);`)
    .join('\n')

  const replacement = [
    '(async (name) => { switch(name) {',
    cases,
    '      default: throw new Error(`Unknown peer dep: ${name}`);',
    '    }})(moduleName)',
  ].join('\n')

  return {
    name: 'resolve-docview-peer-deps',
    enforce: 'pre',
    transform(code: string, id: string) {
      // Only transform the @docview/core bundle
      if (!id.includes('docview')) return
      if (!code.includes('moduleName')) return

      // Replace `await import(moduleName)` or `await import(\n  moduleName\n)`
      const result = code.replace(
        /await\s+import\(\s*(?:\/\*.*?\*\/\s*)?moduleName\s*\)/g,
        `await ${replacement}`,
      )

      if (result !== code) return result
    },
  }
}

export default defineConfig({
  plugins: [resolvePeerDeps()],
  optimizeDeps: {
    include: [
      'pdfjs-dist',
      'epubjs',
      'docx-preview',
      'papaparse',
      'highlight.js',
      'jszip',
      'xlsx',
    ],
  },
})
