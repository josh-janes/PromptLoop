/**
 * AI Generator Worker
 * Handles heavy model computation off the main thread
 */

import { AutoModel, AutoProcessor, AutoTokenizer, env } from '@huggingface/transformers';

// Configure Transformers.js for worker
env.allowLocalModels = false;
env.useBrowserCache = true;

let model = null;
let tokenizer = null;
let processor = null;
let modelName = 'Xenova/musicgen-small';

async function initialize() {
    if (model) return;

    self.postMessage({ type: 'status', data: 'Loading models...' });

    try {
        tokenizer = await AutoTokenizer.from_pretrained(modelName);
        processor = await AutoProcessor.from_pretrained(modelName);

        // Use WASM for reliability in the worker first, or attempt WebGPU if available
        // Note: WebGPU in workers is still experimental in some browsers but supported in Chrome.
        model = await AutoModel.from_pretrained(modelName, {
            dtype: 'q8',
            device: 'wasm', // Safety first for worker reliability
            progress_callback: (p) => {
                if (p.status === 'progress') {
                    self.postMessage({
                        type: 'progress',
                        data: Math.round((p.loaded / p.total) * 100)
                    });
                }
            }
        });

        self.postMessage({ type: 'ready' });
    } catch (error) {
        self.postMessage({ type: 'error', data: error.message });
    }
}

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    if (type === 'init') {
        await initialize();
    } else if (type === 'generate') {
        try {
            if (!model) await initialize();

            const { prompt, options } = payload;
            const enhancedPrompt = `${prompt}, ${options.bpm} BPM, smooth, musical, high quality`;

            // Prepare inputs
            let inputs;
            if (options.inputAudio) {
                // Multimodal
                inputs = await processor(enhancedPrompt, options.inputAudio, {
                    sampling_rate: options.inputSampleRate || 44100,
                });
            } else {
                // Text-only
                inputs = await tokenizer(enhancedPrompt, {
                    padding: true,
                    return_tensors: 'pt',
                });
            }

            // Generate
            const output = await model.generate({
                ...inputs,
                max_new_tokens: Math.floor(options.durationSeconds * 50),
                do_sample: true,
                guidance_scale: 3.0,
                temperature: 1.0,
                top_k: 250,
            });

            // Return tensor data (cannot send Complex objects, so we send the raw data)
            self.postMessage({
                type: 'result',
                payload: {
                    data: output.data,
                    dims: output.dims
                }
            });

        } catch (error) {
            self.postMessage({ type: 'error', data: error.message });
        }
    }
};
