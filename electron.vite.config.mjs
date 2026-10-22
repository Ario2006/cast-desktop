import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Production CSP is injected at build time only (the dev server needs inline HMR scripts).
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

const cspPlugin = () => ({
  name: 'cast-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
})

const alias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.js') } }
    }
  },
  preload: {
    resolve: { alias },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.js'),
          recorder: resolve('src/preload/recorder.js')
        }
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias },
    plugins: [react(), cspPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          recorder: resolve('src/renderer/recorder.html')
        }
      }
    }
  }
})
