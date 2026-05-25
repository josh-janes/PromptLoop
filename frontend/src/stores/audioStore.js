/**
 * Audio Store - Zustand store for audio state management
 * Manages the state of the 16-pad looper outside of React's render cycle
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * @typedef {Object} PadState
 * @property {AudioBuffer|null} buffer - The audio buffer for this pad
 * @property {string|null} name - Display name for the pad
 * @property {'empty'|'loading'|'ready'|'error'} status - Current status
 * @property {number} volume - Volume 0-1
 * @property {boolean} muted - Is muted
 * @property {boolean} solo - Is soloed
 * @property {'upload'|'recording'|'ai_generation'|null} sourceType - How the audio was created
 * @property {Object|null} promptHistory - AI generation metadata
 */

/**
 * @typedef {Object} AudioState
 * @property {PadState[]} pads - Array of 16 pads
 * @property {boolean} isPlaying - Global play state
 * @property {boolean} isRecording - Recording in progress
 * @property {number} bpm - Current BPM
 * @property {number} currentStep - Current step in the loop (0-15)
 * @property {number} masterVolume - Master volume 0-1
 * @property {AudioWorkletNode|null} looperNode - The worklet node
 */

const createEmptyPad = () => ({
    buffer: null,
    name: null,
    status: 'empty',
    volume: 1.0,
    muted: false,
    solo: false,
    sourceType: null,
    promptHistory: null,
    suggestedPrompt: null,
});

export const useAudioStore = create(
    subscribeWithSelector((set, get) => ({
        // State
        pads: Array(16).fill(null).map(() => createEmptyPad()),
        isPlaying: false,
        isRecording: false,
        recordingPadIndex: null,
        bpm: 120,
        currentStep: 0,
        progress: 0,
        masterVolume: 1.0,
        looperNode: null,

        // Actions

        /**
         * Set the looper worklet node reference
         */
        setLooperNode: (node) => set({ looperNode: node }),

        /**
         * Start playback
         */
        play: () => {
            const { looperNode } = get();
            if (looperNode) {
                looperNode.port.postMessage({ type: 'play' });
            }
            set({ isPlaying: true });
        },

        /**
         * Stop playback and reset position
         */
        stop: () => {
            const { looperNode } = get();
            if (looperNode) {
                looperNode.port.postMessage({ type: 'stop' });
            }
            set({ isPlaying: false, currentStep: 0 });
        },

        /**
         * Pause playback (keep position)
         */
        pause: () => {
            const { looperNode } = get();
            if (looperNode) {
                looperNode.port.postMessage({ type: 'pause' });
            }
            set({ isPlaying: false });
        },

        /**
         * Set BPM
         */
        setBpm: (bpm) => {
            const { looperNode } = get();
            if (looperNode) {
                looperNode.port.postMessage({ type: 'setBpm', data: { bpm } });
            }
            set({ bpm });
        },

        /**
         * Load audio buffer into a pad
         */
        loadPad: (index, buffer, metadata = {}) => {
            const { looperNode, pads } = get();

            // Convert AudioBuffer to Float32Array for the worklet
            const channelData = buffer.getChannelData(0);

            if (looperNode) {
                looperNode.port.postMessage({
                    type: 'loadPad',
                    data: { index, buffer: channelData }
                });
            }

            // Update React state
            const newPads = [...pads];
            newPads[index] = {
                ...newPads[index],
                buffer,
                status: 'ready',
                name: metadata.name || `Pad ${index + 1}`,
                sourceType: metadata.sourceType || 'upload',
                promptHistory: metadata.promptHistory || null
            };

            set({ pads: newPads });
        },

        /**
         * Set a suggested prompt on an empty pad (pre-fills the generate input without loading audio)
         */
        setSuggestedPrompt: (index, prompt) => {
            const { pads } = get();
            const newPads = [...pads];
            newPads[index] = { ...newPads[index], suggestedPrompt: prompt };
            set({ pads: newPads });
        },

        /**
         * Clear a pad
         */
        clearPad: (index) => {
            const { looperNode, pads } = get();

            if (looperNode) {
                looperNode.port.postMessage({ type: 'clearPad', data: { index } });
            }

            const newPads = [...pads];
            newPads[index] = createEmptyPad();

            set({ pads: newPads });
        },

        /**
         * Set pad volume
         */
        setPadVolume: (index, volume) => {
            const { looperNode, pads } = get();

            if (looperNode) {
                looperNode.port.postMessage({
                    type: 'setPadState',
                    data: { index, state: { volume } }
                });
            }

            const newPads = [...pads];
            newPads[index] = { ...newPads[index], volume };

            set({ pads: newPads });
        },

        /**
         * Toggle pad mute
         */
        toggleMute: (index) => {
            const { looperNode, pads } = get();
            const newMuted = !pads[index].muted;

            if (looperNode) {
                looperNode.port.postMessage({
                    type: 'setPadState',
                    data: { index, state: { muted: newMuted } }
                });
            }

            const newPads = [...pads];
            newPads[index] = { ...newPads[index], muted: newMuted };

            set({ pads: newPads });
        },

        /**
         * Toggle pad solo
         */
        toggleSolo: (index) => {
            const { looperNode, pads } = get();
            const newSolo = !pads[index].solo;

            if (looperNode) {
                looperNode.port.postMessage({
                    type: 'setPadState',
                    data: { index, state: { solo: newSolo } }
                });
            }

            const newPads = [...pads];
            newPads[index] = { ...newPads[index], solo: newSolo };

            set({ pads: newPads });
        },

        /**
         * Update current step and progress (called from worklet)
         */
        updateStep: (step, progress) => set({ currentStep: step, progress }),

        /**
         * Set master volume
         */
        setMasterVolume: (volume) => set({ masterVolume: volume }),

        /**
         * Start recording to a specific pad
         */
        startRecording: (padIndex) => set({
            isRecording: true,
            recordingPadIndex: padIndex
        }),

        /**
         * Stop recording
         */
        stopRecording: () => set({
            isRecording: false,
            recordingPadIndex: null
        }),
        /**
         * Load a full project
         */
        loadProject: (project) => {
            const { looperNode } = get();

            // Set BPM
            set({ bpm: project.bpm });
            if (looperNode) {
                looperNode.port.postMessage({ type: 'setBpm', data: { bpm: project.bpm } });
            }

            // Load tracks
            // Note: This needs the actual audio buffers. 
            // In a real implementation, we would fetch the audio files from URLs in project.tracks
            // For now, we assume project structure or just reset pads if no audio data provided

            // This is a placeholder for real loading logic
            console.log('Loading project structure:', project);
        },
    }))
);

export default useAudioStore;
