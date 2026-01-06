/**
 * AI Generator Service - Proxy for the AI Worker
 */

class AIGeneratorService {
    constructor() {
        this.worker = null;
        this.isReady = false;
        this.isLoading = false;
        this.onProgressCallback = null;
        this.pendingResolve = null;
        this.pendingReject = null;
        this.initResolve = null;
    }

    onProgress(callback) {
        this.onProgressCallback = callback;
    }

    async initialize() {
        if (this.isReady) return;
        if (this.isLoading) return new Promise(resolve => this.initResolve = resolve);

        this.isLoading = true;

        return new Promise((resolve, reject) => {
            this.initResolve = resolve;

            // Create worker using Vite's worker constructor
            this.worker = new Worker(
                new URL('./aiGenerator.worker.js', import.meta.url),
                { type: 'module' }
            );

            this.worker.onmessage = (e) => {
                const { type, data, payload } = e.data;

                switch (type) {
                    case 'ready':
                        this.isReady = true;
                        this.isLoading = false;
                        if (this.initResolve) this.initResolve();
                        break;
                    case 'progress':
                        if (this.currentProgressCallback) this.currentProgressCallback(data);
                        if (this.onProgressCallback) this.onProgressCallback(data);
                        break;
                    case 'result':
                        if (this.pendingResolve) {
                            this.pendingResolve(payload);
                        }
                        break;
                    case 'error':
                        console.error('Worker Error:', data);
                        if (this.pendingReject) {
                            this.pendingReject(new Error(data));
                        }
                        break;
                }
            };

            this.worker.postMessage({ type: 'init' });
        });
    }

    async generate(prompt, options = {}) {
        if (!this.isReady) await this.initialize();

        const { onProgress, ...serializableOptions } = options;
        this.currentProgressCallback = onProgress;

        return new Promise((resolve, reject) => {
            this.pendingResolve = async (payload) => {
                this.currentProgressCallback = null;
                const buffer = await this.createAudioBufferFromRawData(payload);
                resolve(buffer);
            };
            this.pendingReject = (err) => {
                this.currentProgressCallback = null;
                reject(err);
            };

            this.worker.postMessage({
                type: 'generate',
                payload: { prompt, options: serializableOptions }
            });
        });
    }

    async createAudioBufferFromRawData(payload) {
        const { data, dims } = payload;
        let audioData = data;
        const sourceSamplingRate = 32000;

        // Normalization (Main thread handles this for AudioContext access)
        let maxAmp = 0;
        for (let i = 0; i < audioData.length; i++) {
            const abs = Math.abs(audioData[i]);
            if (abs > maxAmp) maxAmp = abs;
        }

        const normalizedData = new Float32Array(audioData.length);
        const scale = maxAmp > 1.0 ? (0.9 / maxAmp) : 1.0;
        for (let i = 0; i < audioData.length; i++) {
            normalizedData[i] = Math.max(-1, Math.min(1, audioData[i] * scale));
        }

        const { audioContext } = await import('../audio/AudioContextManager');
        const targetCtx = audioContext.getContext();
        if (!targetCtx) return null;

        const targetSamplingRate = targetCtx.sampleRate;
        const sourceBuffer = targetCtx.createBuffer(1, normalizedData.length, sourceSamplingRate);
        sourceBuffer.copyToChannel(normalizedData, 0);

        if (sourceSamplingRate === targetSamplingRate) {
            return sourceBuffer;
        }

        const offlineCtx = new OfflineAudioContext(1, Math.ceil(normalizedData.length * (targetSamplingRate / sourceSamplingRate)), targetSamplingRate);
        const sourceNode = offlineCtx.createBufferSource();
        sourceNode.buffer = sourceBuffer;
        sourceNode.connect(offlineCtx.destination);
        sourceNode.start(0);

        return await offlineCtx.startRendering();
    }
}

export const aiGenerator = new AIGeneratorService();
export default aiGenerator;
