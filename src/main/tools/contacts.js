import { osascript } from './exec.js'

// The name is passed as argv, never spliced into the script.
const SCRIPT = `on run argv
  set q to item 1 of argv
  set out to ""
  tell application "Contacts"
    set found to (every person whose name contains q)
    set n to 0
    repeat with p in found
      set n to n + 1
      if n > 6 then exit repeat
      set phs to ""
      repeat with ph in (phones of p)
        set phs to phs & (value of ph) & "|"
      end repeat
      set ems to ""
      repeat with em in (emails of p)
        set ems to ems & (value of em) & "|"
      end repeat
      set out to out & (name of p) & tab & phs & tab & ems & linefeed
    end repeat
  end tell
  return out
end run`

/** Search macOS Contacts (asks for Automation permission the first time). */
export async function searchContacts(query) {
  const q = String(query).trim().slice(0, 60)
  if (q.length < 2) return []
  const out = await osascript(SCRIPT, [q], { permissionFor: 'Contacts', timeout: 15_000 })
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, phones = '', emails = ''] = line.split('\t')
      return {
        name,
        phones: phones.split('|').filter(Boolean),
        emails: emails.split('|').filter(Boolean)
      }
    })
}

/** URL that starts the call / message / email in the right macOS app. */
export function contactUrl(via, value) {
  const v = String(value).trim()
  if (via === 'email') return `mailto:${encodeURIComponent(v).replace(/%40/g, '@')}`
  const digits = v.replace(/[^\d+]/g, '')
  if (!digits) return null
  if (via === 'facetime') return `facetime:${digits}`
  if (via === 'facetime-audio') return `facetime-audio:${digits}`
  if (via === 'message') return `sms:${digits}`
  return `tel:${digits}`
}
