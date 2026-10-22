// Hidden window: captures the display (main process picks the source) and streams WebM chunks
// back to the main process, which writes them to disk.
let recorder = null
let streams = []
let pending = Promise.resolve() // keeps chunk order and lets `done` wait for the last one

const pickMime = () =>
  ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) =>
    MediaRecorder.isTypeSupported(m)
  )

window.recorder.onStart(async ({ audio }) => {
  try {
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false
    })
    streams = [display]
    const tracks = [...display.getVideoTracks()]
    if (audio) {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      streams.push(mic)
      tracks.push(...mic.getAudioTracks())
    }
    recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType: pickMime(),
      videoBitsPerSecond: 8_000_000
    })
    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return
      pending = pending.then(async () => window.recorder.chunk(await e.data.arrayBuffer()))
    }
    recorder.onstop = () => {
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
      pending.then(() => window.recorder.done())
    }
    recorder.start(1000)
    window.recorder.started()
  } catch (e) {
    window.recorder.error(e?.message ?? e)
  }
})

window.recorder.onStop(() => {
  if (recorder && recorder.state !== 'inactive') recorder.stop()
  else window.recorder.done()
})
