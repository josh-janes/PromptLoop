/**
 * AudioContext Manager
 * Singleton that manages the Web Audio API context
 * Provides a single point of entry for all audio operations
 */

class AudioContextManager {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.analyser = null;
        this.workletLoaded = false;
    }

    /**
     * Initialize the audio context (must be called after user interaction)
     * @returns {Promise<AudioContext>}
     */
    async initialize() {
        if (this.context && this.context.state !== 'closed') {
            if (this.context.state === 'suspended') {
                await this.context.resume();
            }
            return this.context;
        }

        // Create new AudioContext
        this.context = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 44100,
            latencyHint: 'interactive'
        });

        // Create master gain node
        this.masterGain = this.context.createGain();
        this.masterGain.connect(this.context.destination);

        // Create analyser for visualizations
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 2048;
        this.masterGain.connect(this.analyser);

        // Load the AudioWorklet for precise looping
        await this.loadWorklet();

        return this.context;
    }

    /**
     * Load the AudioWorklet processor
     */
    async loadWorklet() {
        if (this.workletLoaded) return;

        try {
            await this.context.audioWorklet.addModule('/audio/looper-processor.js');
            this.workletLoaded = true;
            console.log('AudioWorklet loaded successfully');
        } catch (error) {
            console.error('Failed to load AudioWorklet:', error);
            // Fallback to ScriptProcessorNode if needed
        }
    }

    /**
     * Get the current AudioContext
     * @returns {AudioContext|null}
     */
    getContext() {
        return this.context;
    }

    /**
     * Get the master gain node
     * @returns {GainNode|null}
     */
    getMasterGain() {
        return this.masterGain;
    }

    /**
     * Get the analyser node for visualizations
     * @returns {AnalyserNode|null}
     */
    getAnalyser() {
        return this.analyser;
    }

    /**
     * Get the current time from the audio context
     * @returns {number}
     */
    getCurrentTime() {
        return this.context?.currentTime || 0;
    }

    /**
     * Set master volume
     * @param {number} volume - Volume from 0 to 1
     */
    setMasterVolume(volume) {
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(
                Math.max(0, Math.min(1, volume)),
                this.context.currentTime
            );
        }
    }

    /**
     * Suspend the audio context (for power saving)
     */
    async suspend() {
        if (this.context && this.context.state === 'running') {
            await this.context.suspend();
        }
    }

    /**
     * Resume the audio context
     */
    async resume() {
        if (this.context && this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    /**
     * Close the audio context and clean up
     */
    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
            this.masterGain = null;
            this.analyser = null;
            this.workletLoaded = false;
        }
    }
    /**
     * Create a mix of all active pads
     * @param {Array} pads - Array of pad objects from store
     * @returns {AudioBuffer|null} - Mono mix of all tracks or null
     */
    getMixAudioBuffer(pads) {
        if (!this.context) return null;

        // Filter active pads with buffers
        const activePads = pads.filter(p =>
            p.status === 'ready' &&
            p.buffer &&
            !p.muted
        );

        if (activePads.length === 0) return null;

        // Find max duration
        const maxDuration = activePads.reduce((max, p) =>
            Math.max(max, p.buffer.duration), 0
        );

        // Limit to reasonable context length (e.g. 30s) for AI to avoid OOM
        // MusicGen max is typically 30s
        const duration = Math.min(maxDuration, 30);
        const length = Math.floor(duration * this.context.sampleRate);

        // Create mono buffer for mix
        const mixBuffer = this.context.createBuffer(
            1,
            length,
            this.context.sampleRate
        );
        const outputData = mixBuffer.getChannelData(0);

        // Sum tracks
        activePads.forEach(pad => {
            const buffer = pad.buffer;
            const inputData = buffer.getChannelData(0); // Assume mono or take left channel

            // Gain adjustment (simple 1/N to prevent clipping, or use pad volume)
            const volume = pad.volume;

            for (let i = 0; i < length && i < inputData.length; i++) {
                outputData[i] += inputData[i] * volume;
            }
        });

        // Simple hard limiter/normalization to prevents clipping
        // (Optional: could assume user manages levels)
        let maxAmp = 0;
        for (let i = 0; i < length; i++) {
            const abs = Math.abs(outputData[i]);
            if (abs > maxAmp) maxAmp = abs;
        }
        if (maxAmp > 0.95) {
            const gain = 0.95 / maxAmp;
            for (let i = 0; i < length; i++) {
                outputData[i] *= gain;
            }
        }

        return mixBuffer;
    }
}

// Export singleton instance
export const audioContext = new AudioContextManager();
export default audioContext;
