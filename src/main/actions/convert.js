import { execFile } from 'node:child_process'
import fs from 'node:fs'

/**
 * Convert a recording to an mp4 that plays everywhere (H.264 + AAC, fast-start). `webm` from
 * MediaRecorder has no duration metadata and is not supported by QuickTime.
 * Resolves with the output path; rejects (leaving the input intact) on any failure.
 */
export function toMp4({ ffmpeg, input, output, timeoutMs = 10 * 60_000 }) {
  return new Promise((resolve, reject) => {
    if (!ffmpeg || !fs.existsSync(ffmpeg)) return reject(new Error('ffmpeg is not available'))
    const args = [
      '-y', '-i', input,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      output
    ] // prettier-ignore
    execFile(ffmpeg, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err) => {
      if (err || !fs.existsSync(output) || fs.statSync(output).size === 0) {
        fs.rmSync(output, { force: true })
        return reject(err ?? new Error('ffmpeg produced no output'))
      }
      resolve(output)
    })
  })
}

/** ffmpeg-static returns a path inside app.asar when packaged; the binary lives in app.asar.unpacked. */
export const unpackedPath = (p) => (p ? p.replace('app.asar', 'app.asar.unpacked') : p)
