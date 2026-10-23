import fs from 'node:fs'
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

/**
 * Google OAuth client baked into the app so users connect with one click. Desktop-app client
 * credentials are not confidential (Google's own docs say so); the user's tokens still go only to
 * their Keychain. Source: CAST_GOOGLE_CLIENT_ID / CAST_GOOGLE_CLIENT_SECRET, or resources/google-oauth.json.
 */
function bundledGoogle() {
  let fromFile = {}
  try {
    fromFile = JSON.parse(fs.readFileSync(resolve('resources/google-oauth.json'), 'utf8'))
  } catch {
    /* none provided: the app falls back to the "bring your own client" setup */
  }
  return {
    clientId: process.env.CAST_GOOGLE_CLIENT_ID || fromFile.clientId || '',
    clientSecret: process.env.CAST_GOOGLE_CLIENT_SECRET || fromFile.clientSecret || ''
  }
}

export default defineConfig({
  main: {
    resolve: { alias },
    define: { __CAST_GOOGLE__: JSON.stringify(bundledGoogle()) },
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
