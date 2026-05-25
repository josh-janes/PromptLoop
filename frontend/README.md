# PromptLoop — Frontend

React SPA for the PromptLoop AI looper.

## Development

```bash
npm install
npm run dev   # http://localhost:5173
```

Expects the generator service at `http://localhost:8765` (see `../generator-service/`). Set `VITE_GENERATOR_URL` to override. Falls back to in-browser MusicGen if the service is unreachable.

## Structure

```
src/
  audio/
    AudioContextManager.js   # AudioContext singleton + mix helpers
    keyDetector.js           # Goertzel + Krumhansl-Schmuckler key detection
    synthUtils.js            # Demo track synthesis (drums, bass, chord pad)
  components/
    Looper/
      Looper.jsx / .css      # Main layout, header, global progress bar
      Pad.jsx / .css         # Individual pad (generate, record, mute, volume)
  services/
    aiGenerator.js           # GPU service client; browser worker fallback
    aiGenerator.worker.js    # Transformers.js MusicGen Web Worker
  stores/
    audioStore.js            # Zustand store — pad state, BPM, transport

public/
  audio/
    looper-processor.js      # AudioWorklet — real-time loop engine
```

## Key Details

- **AudioWorklet** (`looper-processor.js`) runs on the audio render thread for sample-accurate looping with no scheduler jitter.
- **Phase-locked entry** — pads loaded or unmuted mid-loop are held in a pending set and enter on the next loop boundary.
- **Key detection** — Goertzel algorithm + Krumhansl-Schmuckler profiles detect the musical key from the active mix and pass it to the generator.
- **Generator service** — `POST /generate` with `{ prompt, bpm, key, duration_seconds }`. Key and BPM are passed as ACE-Step metadata conditioning (not text), so generation stays in key regardless of prompt wording.
