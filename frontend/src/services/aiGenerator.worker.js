/**
 * AI Generator Worker
 * Handles heavy model computation off the main thread
 */

import { AutoModel, AutoProcessor, AutoTokenizer, env } from '@huggingface/transformers';

// Configure Transformers.js for worker
env.allowLocalModels = false;
env.useBrowserCache = true;

// Silence harmless diagnostic warnings from ONNX Runtime (e.g. CPU fallbacks)
env.backends.onnx.logLevel = 'error';

// Optimization: Explicitly set WASM settings for maximum speed
// Multi-threading requires SharedArrayBuffer (cross-origin isolation)
const canUseMultiThreading = typeof SharedArrayBuffer !== 'undefined';
if (canUseMultiThreading) {
    env.backends.onnx.wasm.numThreads = Math.min((typeof self !== 'undefined' && self.navigator?.hardwareConcurrency) || 4, 8);
} else {
    console.warn('SharedArrayBuffer not available. WASM restricted to single thread. Enabling Cross-Origin isolation headers would fix this.');
    env.backends.onnx.wasm.numThreads = 1;
}
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.simd = true;

let model = null;
let tokenizer = null;
let processor = null;
let modelName = 'Xenova/musicgen-small';

// Track progress locally to throttle updates
let lastProgressUpdate = 0;

async function initialize() {
    if (model) return;

    // Check for Cross-Origin Isolation (needed for SharedArrayBuffer/Worklet efficiency)
    console.log(`[Worker] Cross-Origin Isolated: ${self.crossOriginIsolated}`);

    // Check for WebGPU with detailed error reporting
    let hasWebGPU = false;
    try {
        if (navigator.gpu) {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
                hasWebGPU = true;
                // Resiliently try to get GPU info for logging
                const info = adapter.info || (typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : {});
                console.log(`[Worker] WebGPU detected on: ${info.description || info.vendor || 'Unknown GPU'}`);
            }
        }
    } catch (e) {
        console.warn('[Worker] WebGPU pre-check error:', e);
    }

    if (!hasWebGPU) {
        console.warn('[Worker] WebGPU is NOT available in this context. Fallback to multi-threaded WASM.');
    }

    self.postMessage({ type: 'status', data: 'Loading models...' });

    try {
        tokenizer = await AutoTokenizer.from_pretrained(modelName);
        processor = await AutoProcessor.from_pretrained(modelName);

        const progress_callback = (p) => {
            if (p.status === 'progress') {
                const now = Date.now();
                if (now - lastProgressUpdate > 100) {
                    self.postMessage({
                        type: 'progress',
                        data: Math.round((p.loaded / p.total) * 100)
                    });
                    lastProgressUpdate = now;
                }
            }
        };

        // Try WebGPU first with q8 (best balance of speed and availability)
        if (hasWebGPU) {
            try {
                console.log('Attempting WebGPU (q8)...');
                model = await AutoModel.from_pretrained(modelName, {
                    dtype: 'q8',
                    device: 'webgpu',
                    progress_callback
                });
                console.log('✅ Success: Using WebGPU (q8)');
            } catch (webgpuError) {
                console.warn('WebGPU (q8) failed, attempting fp32 as fallback...', webgpuError);
                try {
                    model = await AutoModel.from_pretrained(modelName, {
                        dtype: 'fp32',
                        device: 'webgpu',
                        progress_callback
                    });
                    console.log('✅ Success: Using WebGPU (fp32)');
                } catch (fp32Error) {
                    console.error('WebGPU failed completely:', fp32Error);
                    hasWebGPU = false; // Trigger WASM fallback below
                }
            }
        }

        if (!model) {
            console.log('Initializing multi-threaded WASM (q8)...');
            model = await AutoModel.from_pretrained(modelName, {
                dtype: 'q8',
                device: 'wasm',
                progress_callback
            });
            console.log('✅ Success: Using WASM (q8)');
        }

        self.postMessage({
            type: 'ready',
            device: model.device || (hasWebGPU ? 'webgpu' : 'wasm')
        });
    } catch (error) {
        self.postMessage({ type: 'error', data: error.message });
    }
}

const progressThrottles = new Map();

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    if (type === 'init') {
        await initialize();
    } else if (type === 'generate') {
        const { requestId } = e.data;
        progressThrottles.set(requestId, 0);

        try {
            if (!model) await initialize();

            const { prompt, options } = payload;

            if (options.inputAudio) {
                if (!(options.inputAudio instanceof Float32Array)) {
                    options.inputAudio = new Float32Array(options.inputAudio);
                }
            }

            let enhancedPrompt = `${prompt}, ${options.bpm} BPM, musical`;

            let inputs;
            if (options.inputAudio && options.inputAudio instanceof Float32Array) {
                const audioPrompt = `Track in the style of provided audio: ${enhancedPrompt}`;
                console.time(`[Worker] Processor Time - ${requestId}`);
                self.postMessage({ type: 'status', requestId, data: 'Encoding context...' });
                self.postMessage({ type: 'progress', requestId, data: 5 });

                inputs = await processor(audioPrompt, options.inputAudio, {
                    sampling_rate: 32000,
                });
                console.timeEnd(`[Worker] Processor Time - ${requestId}`);
            } else {
                inputs = await tokenizer(enhancedPrompt, {
                    padding: true,
                    return_tensors: 'pt',
                });
            }

            if (!model) {
                throw new Error('Model failed to initialize. Please check browser hardware acceleration/WebGPU support.');
            }

            // Generate
            self.postMessage({ type: 'status', requestId, data: 'Generating...' });
            self.postMessage({ type: 'progress', requestId, data: 15 });

            if (!options.durationSeconds || isNaN(options.durationSeconds)) {
                options.durationSeconds = 4; // Default to 2 bars at 120bpm
            }

            const max_new_tokens = Math.floor(options.durationSeconds * 50);
            console.log(`[Worker] Starting inference for ${max_new_tokens} tokens on device: ${model.device}`);

            const output = await model.generate({
                ...inputs,
                max_new_tokens,
                do_sample: true,
                guidance_scale: 1.0,
                temperature: 1.0,
                top_p: 0.9,
                top_k: 50,
                num_beams: 1,
                callback_function: (outputs) => {
                    const now = Date.now();
                    const lastUpdate = progressThrottles.get(requestId) || 0;

                    if (lastUpdate === 0 || now - lastUpdate > 100) {
                        let outputIds = outputs;
                        if (Array.isArray(outputs) && outputs[0]?.output_ids) {
                            outputIds = outputs[0].output_ids;
                        } else if (outputs.output_ids) { // Added this else if to handle direct output_ids
                            outputIds = outputs.output_ids;
                        }

                        let generatedTokens = 0;
                        if (outputIds.dims) {
                            generatedTokens = outputIds.dims[outputIds.dims.length - 1];
                        } else if (Array.isArray(outputIds)) {
                            generatedTokens = Array.isArray(outputIds[0]) ? outputIds[0].length : outputIds.length;
                        } else if (typeof outputIds === 'number') { // Added this else if to handle direct number
                            generatedTokens = outputIds;
                        }

                        if (generatedTokens > 0) {
                            if (lastUpdate === 0) console.log(`[Worker] Generation heartbeat: received first tokens for ${requestId}`);

                            const genProgress = Math.min(Math.round((generatedTokens / max_new_tokens) * 80), 80);
                            const totalProgress = 15 + genProgress;

                            self.postMessage({
                                type: 'progress',
                                requestId,
                                data: totalProgress
                            });
                            progressThrottles.set(requestId, now);
                        }
                    }
                }
            });

            console.log(`[Worker] Generation complete for ${requestId}`);
            self.postMessage({ type: 'status', requestId, data: 'Completing...' });
            self.postMessage({ type: 'progress', requestId, data: 100 });

            // Return tensor data using Transferables for zero-copy speed
            const resultPayload = {
                data: output.data,
                dims: output.dims
            };

            self.postMessage({
                type: 'result',
                requestId,
                payload: resultPayload
            }, [output.data.buffer]);

            progressThrottles.delete(requestId);

        } catch (error) {
            console.error('[Worker] Generation error:', error);
            self.postMessage({ type: 'error', requestId, data: error.message });
            progressThrottles.delete(requestId);
        }
    }
};
