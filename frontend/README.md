# PromptLoop - Frontend

The React-based frontend for the PromptLoop AI music looper.

## Key Features

- **AudioWorklet Looping**: Uses a high-performance AudioWorklet (`looper-processor.js`) for sample-accurate looping.
- **Transformers.js Integration**: Runs the `Xenova/musicgen-small` model directly in a Web Worker.
- **Multimodal Generation**: Supports audio-guided generation by mixing active pads into the AI prompt.
- **Keyboard Navigation**: Fully accessible via keyboard (Tab to navigate, Space/Enter to toggle).

## Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **State**: Zustand
- **Audio**: Web Audio API + Transformers.js

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Structure

- `src/audio/`: AudioContext management and synth utilities.
- `src/services/aiGenerator.js`: Proxy for the AI Worker.
- `src/services/aiGenerator.worker.js`: Heavy-lifting AI computation.
- `public/audio/looper-processor.js`: The real-time audio thread.
