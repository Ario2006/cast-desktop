// Ad-hoc sign the app with its real bundle identifier. Without this the bundle keeps Electron's
// original "Electron" signature identity (invalidated by our edits), and macOS Notification Center
// will not register Cast — so no permission prompt and no banners.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appId = context.packager.appInfo.id
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', appId, app], {
    stdio: 'inherit'
  })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
  console.log(`  • ad-hoc signed ${app} as ${appId}`)
}
