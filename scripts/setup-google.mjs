// One-time developer setup for one-click Google sign-in.
//   npm run setup:google
// Writes resources/google-oauth.json, which the build compiles into the app. End users then just click
// "Connect" — they never see Google Cloud Console. (Desktop-app client IDs are public by design; the
// security comes from PKCE + the loopback redirect, not from keeping the ID secret.)
import fs from 'node:fs'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const FILE = 'resources/google-oauth.json'
const rl = readline.createInterface({ input: stdin, output: stdout })

console.log(`
Create the credential once in Google Cloud Console (https://console.cloud.google.com):
  1. New project  →  APIs & Services  →  Library  →  enable "Google Calendar API"
  2. OAuth consent screen: External; app name "Cast"; add scopes
       .../auth/calendar.events   and   .../auth/calendar.readonly
     While in "Testing", add your own Google account (and testers) under "Test users".
  3. Credentials → Create credentials → OAuth client ID → Application type: **Desktop app**
  4. Paste the Client ID below (the client secret is optional for Desktop clients).
`)

const clientId = (await rl.question('Client ID: ')).trim()
if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
  console.error(
    '\nThat does not look like a Google client ID (…apps.googleusercontent.com). Nothing written.'
  )
  process.exit(1)
}
const clientSecret = (await rl.question('Client secret (optional, press Enter to skip): ')).trim()
rl.close()

fs.mkdirSync('resources', { recursive: true })
fs.writeFileSync(
  FILE,
  JSON.stringify({ clientId, ...(clientSecret ? { clientSecret } : {}) }, null, 2) + '\n'
)
console.log(
  `\nSaved ${FILE}. Now run:  npm run dist   (or npm run pack)  and distribute the new build.`
)
