/**
 * AI Generator Service
 *
 * Primary path: local Python/CUDA service (generator-service/main.py running ACE-Step).
 * Fallback path: in-browser Transformers.js worker (slower, no GPU required).
 *
 * Set VITE_GENERATOR_URL to override the local service URL (default: http://localhost:8765).
 */

const GENERATOR_URL = import.meta.env.VITE_GENERATOR_URL ?? 'http://localhost:8765';
const SERVICE_CHECK_TIMEOUT_MS = 2000;
const GENERATE_TIMEOUT_MS = 180_000; // 3 min max for model inference

class AIGeneratorService {
    constructor() {
        // Local service state
        this._serviceAvailable = null; // null = unchecked, true/false = known
        this._serviceCheckPromise = null;

        // Browser worker fallback state
        this.worker = null;
        this.isReady = false;
        this.isLoading = false;
        this.onProgressCallback = null;
        this.initResolve = null;
        this.requests = new Map();
    }

    onProgress(callback) {
        this.onProgressCallback = callback;
    }

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------

    async generate(prompt, options = {}) {
        const serviceUp = await this._checkLocalService();

        if (serviceUp) {
            return this._generateViaService(prompt, options);
        }

        console.warn('[AIGenerator] Local service unavailable — falling back to browser model');
        return this._generateViaBrowserWorker(prompt, options);
    }

    // ---------------------------------------------------------------------------
    // Local CUDA service path
    // ---------------------------------------------------------------------------

    async _checkLocalService() {
        if (this._serviceAvailable !== null) return this._serviceAvailable;
        if (this._serviceCheckPromise) return this._serviceCheckPromise;

        this._serviceCheckPromise = (async () => {
            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), SERVICE_CHECK_TIMEOUT_MS);
                const res = await fetch(`${GENERATOR_URL}/health`, { signal: ctrl.signal });
                clearTimeout(timer);
                const json = await res.json();
                this._serviceAvailable = json.model_loaded === true;
            } catch {
                this._serviceAvailable = false;
            }
            this._serviceCheckPromise = null;
            return this._serviceAvailable;
        })();

        return this._serviceCheckPromise;
    }

    async _generateViaService(prompt, options = {}) {
        const { bpm, durationSeconds, key, onProgress, onStatus } = options;

        if (onStatus) onStatus('Generating on GPU...');
        if (onProgress) onProgress(5);

        // Animate progress while waiting (inference takes ~5-15s on a 4090)
        const animInterval = this._animateProgress(onProgress, 10, 90, 12_000);

        let wavBuffer;
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), GENERATE_TIMEOUT_MS);

            const res = await fetch(`${GENERATOR_URL}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    bpm: bpm ?? 120,
                    duration_seconds: durationSeconds ?? 8,
                    key: key ?? 'C Major',
                }),
                signal: ctrl.signal,
            });
            clearTimeout(timer);

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Generator service ${res.status}: ${text}`);
            }

            wavBuffer = await res.arrayBuffer();
        } finally {
            clearInterval(animInterval);
        }

        if (onProgress) onProgress(95);
        if (onStatus) onStatus('Decoding audio...');

        const { audioContext } = await import('../audio/AudioContextManager');
        const ctx = audioContext.getContext();
        const decoded = await ctx.decodeAudioData(wavBuffer);

        if (onProgress) onProgress(100);
        return decoded;
    }

    /** Smoothly animate progress from `from` to `to` over `durationMs`. Returns interval ID. */
    _animateProgress(onProgress, from, to, durationMs) {
        if (!onProgress) return null;
        const steps = 40;
        const interval = durationMs / steps;
        const increment = (to - from) / steps;
        let current = from;
        return setInterval(() => {
            current = Math.min(current + increment, to);
            onProgress(Math.round(current));
        }, interval);
    }

    /** Encode a mono Float32Array to a 16-bit PCM WAV ArrayBuffer. */
    _encodeWav(float32, sampleRate) {
        const numSamples = float32.length;
        const buf = new ArrayBuffer(44 + numSamples * 2);
        const view = new DataView(buf);
        const write = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

        write(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 2, true);
        write(8, 'WAVE');
        write(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);        // PCM
        view.setUint16(22, 1, true);        // mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        write(36, 'data');
        view.setUint32(40, numSamples * 2, true);

        for (let i = 0; i < numSamples; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return buf;
    }

    // ---------------------------------------------------------------------------
    // Browser worker fallback (original Transformers.js path)
    // ---------------------------------------------------------------------------

    async _ensureWorkerReady() {
        if (this.isReady) return;
        if (this.isLoading) return new Promise(resolve => { this.initResolve = resolve; });

        this.isLoading = true;

        return new Promise((resolve, reject) => {
            this.initResolve = resolve;

            this.worker = new Worker(
                new URL('./aiGenerator.worker.js', import.meta.url),
                { type: 'module' }
            );

            this.worker.onmessage = (e) => {
                const { type, data, payload, requestId } = e.data;
                const request = this.requests.get(requestId);

                switch (type) {
                    case 'ready':
                        this.isReady = true;
                        this.isLoading = false;
                        if (this.initResolve) this.initResolve();
                        break;
                    case 'progress':
                        if (request?.onProgress) request.onProgress(data);
                        if (this.onProgressCallback) this.onProgressCallback(data);
                        break;
                    case 'result':
                        if (request) {
                            request.resolve(payload);
                            this.requests.delete(requestId);
                        }
                        break;
                    case 'status':
                        if (requestId && request?.onStatus) request.onStatus(data);
                        console.log(`[Worker Status] ${data}`);
                        break;
                    case 'error':
                        console.error('Worker Error:', data);
                        if (request) {
                            request.reject(new Error(data));
                            this.requests.delete(requestId);
                        }
                        break;
                }
            };

            this.worker.postMessage({ type: 'init' });
        });
    }

    async _generateViaBrowserWorker(prompt, options = {}) {
        await this._ensureWorkerReady();

        const requestId = Math.random().toString(36).substring(2, 11);
        const { onProgress, onStatus, ...rest } = options;

        const serializableOptions = {
            bpm: rest.bpm,
            durationSeconds: rest.durationSeconds,
        };

        const transferables = [];
        if (rest.inputAudio instanceof Float32Array) {
            const resampled = await this._resampleAudio(rest.inputAudio, rest.inputSampleRate || 44100, 32000);
            serializableOptions.inputAudio = resampled;
            transferables.push(resampled.buffer);
            serializableOptions.inputSampleRate = 32000;
        }

        return new Promise((resolve, reject) => {
            this.requests.set(requestId, {
                resolve: async (payload) => {
                    const buffer = await this._createAudioBufferFromRawData(payload);
                    resolve(buffer);
                },
                reject,
                onProgress,
                onStatus,
            });

            this.worker.postMessage(
                { type: 'generate', requestId, payload: { prompt, options: serializableOptions } },
                transferables
            );
        });
    }

    async _resampleAudio(audioData, sourceRate, targetRate) {
        if (sourceRate === targetRate) return audioData;

        const { audioContext } = await import('../audio/AudioContextManager');
        const mainCtx = audioContext.getContext();
        if (!mainCtx) return audioData;

        const length = audioData.length;
        const offlineCtx = new OfflineAudioContext(1, Math.round(length * targetRate / sourceRate), targetRate);
        const buffer = offlineCtx.createBuffer(1, length, sourceRate);
        buffer.copyToChannel(audioData, 0);

        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start(0);

        const rendered = await offlineCtx.startRendering();
        return rendered.getChannelData(0);
    }

    async _createAudioBufferFromRawData(payload) {
        const { data, dims } = payload;
        let audioData = data;
        const sourceSamplingRate = 32000;

        let maxAmp = 0;
        for (let i = 0; i < audioData.length; i++) {
            const abs = Math.abs(audioData[i]);
            if (abs > maxAmp) maxAmp = abs;
        }

        const normalizedData = new Float32Array(audioData.length);
        const scale = maxAmp > 1.0 ? 0.9 / maxAmp : 1.0;
        for (let i = 0; i < audioData.length; i++) {
            let val = audioData[i] * scale;
            if (!Number.isFinite(val)) val = 0;
            normalizedData[i] = Math.max(-1, Math.min(1, val));
        }

        const { audioContext } = await import('../audio/AudioContextManager');
        const targetCtx = audioContext.getContext();
        if (!targetCtx) return null;

        const targetRate = targetCtx.sampleRate;
        const sourceBuffer = targetCtx.createBuffer(1, normalizedData.length, sourceSamplingRate);
        sourceBuffer.copyToChannel(normalizedData, 0);

        if (sourceSamplingRate === targetRate) return sourceBuffer;

        const offlineCtx = new OfflineAudioContext(1, Math.ceil(normalizedData.length * targetRate / sourceSamplingRate), targetRate);
        const sourceNode = offlineCtx.createBufferSource();
        sourceNode.buffer = sourceBuffer;
        sourceNode.connect(offlineCtx.destination);
        sourceNode.start(0);

        return offlineCtx.startRendering();
    }
}

export const aiGenerator = new AIGeneratorService();
export default aiGenerator;
