class LooperProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this.isPlaying = false;
        this.loopLength = 0;
        this.currentPosition = 0;
        this.bpm = 120;
        this.pads = new Array(16).fill(null);
        this.padStates = new Array(16).fill(null).map(() => ({
            active: false,
            volume: 1.0,
            muted: false,
            solo: false
        }));

        this.padPositions = new Int32Array(16);
        // Pads loaded or unmuted mid-loop — held until the next loop boundary
        // so they always enter from sample 0 in phase with the loop.
        this.pendingPads = new Set();

        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        const { type, data } = event.data;

        switch (type) {
            case 'play':
                this.isPlaying = true;
                this.currentPosition = 0;
                this.padPositions.fill(0);
                this.pendingPads.clear();
                break;

            case 'stop':
                this.isPlaying = false;
                this.currentPosition = 0;
                this.padPositions.fill(0);
                this.pendingPads.clear();
                break;

            case 'pause':
                this.isPlaying = false;
                break;

            case 'setBpm':
                this.bpm = data.bpm;
                this.calculateLoopLength();
                break;

            case 'loadPad':
                this.pads[data.index] = data.buffer;
                this.padPositions[data.index] = 0;
                // If mid-loop, defer until the next loop boundary
                if (this.isPlaying && this.currentPosition > 0 && this.loopLength > 0) {
                    this.pendingPads.add(data.index);
                } else {
                    this.pendingPads.delete(data.index);
                }
                break;

            case 'clearPad':
                this.pads[data.index] = null;
                this.padPositions[data.index] = 0;
                this.pendingPads.delete(data.index);
                break;

            case 'setPadState': {
                const prev = this.padStates[data.index];
                // Unmuting mid-loop: reset position and defer to next boundary
                if (data.state.muted === false && prev.muted === true) {
                    if (this.isPlaying && this.currentPosition > 0 && this.loopLength > 0) {
                        this.padPositions[data.index] = 0;
                        this.pendingPads.add(data.index);
                    }
                }
                // Muting: cancel any pending entry
                if (data.state.muted === true) {
                    this.pendingPads.delete(data.index);
                }
                Object.assign(this.padStates[data.index], data.state);
                break;
            }

            case 'setLoopLength':
                this.loopLength = data.samples;
                break;
        }
    }

    calculateLoopLength() {
        const samplesPerBeat = (sampleRate * 60) / this.bpm;
        this.loopLength = Math.floor(samplesPerBeat * 4 * 4); // 4 beats × 4 bars
    }

    process(inputs, outputs, parameters) {
        const outputChannel = outputs[0]?.[0];
        if (!this.isPlaying || !outputChannel) return true;

        const hasSolo = this.padStates.some(s => s.solo);
        const activePads = [];
        for (let i = 0; i < 16; i++) {
            const buf = this.pads[i];
            const state = this.padStates[i];
            if (buf && !state.muted && (!hasSolo || state.solo) && !this.pendingPads.has(i)) {
                activePads.push({ buf, volume: state.volume, idx: i });
            }
        }

        const blockLen = outputChannel.length;
        let loopRestarted = false;

        if (activePads.length === 0) {
            outputChannel.fill(0);
            // Still advance position so loop boundaries are tracked
            for (let s = 0; s < blockLen; s++) {
                if (this.loopLength > 0 && ++this.currentPosition >= this.loopLength) {
                    this.currentPosition = 0;
                    loopRestarted = true;
                    this.port.postMessage({ type: 'loopRestart' });
                }
            }
        } else {
            for (let s = 0; s < blockLen; s++) {
                let mix = 0;
                for (let p = 0; p < activePads.length; p++) {
                    const { buf, volume, idx } = activePads[p];
                    mix += buf[this.padPositions[idx]] * volume;
                    if (++this.padPositions[idx] >= buf.length) {
                        this.padPositions[idx] = 0;
                    }
                }
                outputChannel[s] = mix > 1 ? 1 : mix < -1 ? -1 : mix;

                if (this.loopLength > 0 && ++this.currentPosition >= this.loopLength) {
                    this.currentPosition = 0;
                    loopRestarted = true;
                    this.port.postMessage({ type: 'loopRestart' });
                }
            }
        }

        // On loop restart: admit all pending pads from position 0
        if (loopRestarted && this.pendingPads.size > 0) {
            this.pendingPads.forEach(idx => { this.padPositions[idx] = 0; });
            this.pendingPads.clear();
        }

        if (this.currentPosition % Math.floor(sampleRate / 10) < blockLen) {
            this.port.postMessage({
                type: 'position',
                position: this.currentPosition,
                total: this.loopLength
            });
        }

        return true;
    }
}

registerProcessor('looper-processor', LooperProcessor);
