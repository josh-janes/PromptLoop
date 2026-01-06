/**
 * Looper Processor - AudioWorklet for sample-accurate loop playback
 * Runs on the audio rendering thread for zero-jitter scheduling
 */

class LooperProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // State
        this.isPlaying = false;
        this.loopLength = 0; // in samples
        this.currentPosition = 0;
        this.bpm = 120;
        this.pads = new Array(16).fill(null); // AudioBuffer data for each pad
        this.padStates = new Array(16).fill(null).map(() => ({
            active: false,
            volume: 1.0,
            muted: false,
            solo: false
        }));

        // Message handling from main thread
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        const { type, data } = event.data;

        switch (type) {
            case 'play':
                this.isPlaying = true;
                this.currentPosition = 0;
                break;

            case 'stop':
                this.isPlaying = false;
                this.currentPosition = 0;
                break;

            case 'pause':
                this.isPlaying = false;
                break;

            case 'setBpm':
                this.bpm = data.bpm;
                this.calculateLoopLength();
                break;

            case 'loadPad':
                // data.index: pad number (0-15)
                // data.buffer: Float32Array of audio samples
                console.log(`[Worklet] Loading pad ${data.index}, samples: ${data.buffer.length}`);
                this.pads[data.index] = data.buffer;
                break;

            case 'clearPad':
                this.pads[data.index] = null;
                break;

            case 'setPadState':
                Object.assign(this.padStates[data.index], data.state);
                break;

            case 'setLoopLength':
                this.loopLength = data.samples;
                break;
        }
    }

    calculateLoopLength() {
        // Default: 4 bars at current BPM
        const beatsPerBar = 4;
        const bars = 4;
        const samplesPerBeat = (sampleRate * 60) / this.bpm;
        this.loopLength = Math.floor(samplesPerBeat * beatsPerBar * bars);
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const outputChannel = output[0];

        if (!this.isPlaying || !outputChannel) {
            return true;
        }

        // Check if any pad has solo enabled
        const hasSolo = this.padStates.some(state => state.solo);

        for (let sample = 0; sample < outputChannel.length; sample++) {
            let mixedSample = 0;

            // Mix all active pads
            for (let padIndex = 0; padIndex < 16; padIndex++) {
                const padBuffer = this.pads[padIndex];
                const state = this.padStates[padIndex];

                if (!padBuffer || state.muted) continue;
                if (hasSolo && !state.solo) continue;

                // Get sample from pad buffer (with wrapping)
                const padPosition = this.currentPosition % padBuffer.length;
                const padSample = padBuffer[padPosition] * state.volume;

                mixedSample += padSample;
            }

            // Write to output (with simple clipping)
            outputChannel[sample] = Math.max(-1, Math.min(1, mixedSample));

            // Advance position
            this.currentPosition++;

            // Global loop back
            if (this.loopLength > 0 && this.currentPosition >= this.loopLength) {
                this.currentPosition = 0;
                // Notify main thread of loop restart
                this.port.postMessage({ type: 'loopRestart' });
            }
        }

        // Send position update periodically (every ~100ms)
        if (this.currentPosition % Math.floor(sampleRate / 10) < 128) {
            this.port.postMessage({
                type: 'position',
                position: this.currentPosition,
                total: this.loopLength
            });
        }

        return true; // Keep processor alive
    }
}

registerProcessor('looper-processor', LooperProcessor);
