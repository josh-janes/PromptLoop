/**
 * Synth Utilities - Generate synthesized AudioBuffers for testing
 */

import { audioContext } from '../audio/AudioContextManager';

// Notes frequencies
const NOTES = {
    'C3': 130.81,
    'E3': 164.81,
    'G3': 196.00,
    'A3': 220.00,
    'C4': 261.63,
    'E4': 329.63,
    'G4': 392.00,
    'B4': 493.88
};

/**
 * Create a simple piano-like pluck sound
 */
export const createPianoSample = async (duration = 2.0, notes = ['C3', 'E3', 'G3']) => {
    const ctx = audioContext.getContext();
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
        let sample = 0;
        const t = i / sampleRate;

        // Add harmonics for each note
        notes.forEach(noteName => {
            const freq = NOTES[noteName] || 440;
            // Simple FM/Additive synthesis approximation
            const envelope = Math.exp(-3 * t); // Decay
            const osc = Math.sin(2 * Math.PI * freq * t) +
                0.5 * Math.sin(2 * Math.PI * freq * 2 * t) * Math.exp(-5 * t) +
                0.2 * Math.sin(2 * Math.PI * freq * 3 * t) * Math.exp(-10 * t);
            sample += osc * envelope;
        });

        // Normalize roughly
        data[i] = sample / notes.length * 0.5;
    }

    return buffer;
};

/**
 * Create a simple drum beat loop (Kick, Snare, Hihat)
 */
export const createDrumLoop = async (bpm = 120, bars = 1) => {
    const ctx = audioContext.getContext();
    const sampleRate = ctx.sampleRate;
    const secondsPerBeat = 60 / bpm;
    const duration = secondsPerBeat * 4 * bars;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Simple drum synthesis functions
    const addKick = (startSample) => {
        for (let i = 0; i < 4000 && (startSample + i) < length; i++) {
            const t = i / sampleRate;
            const freq = 150 * Math.exp(-20 * t);
            const amp = Math.exp(-5 * t);
            data[startSample + i] += Math.sin(2 * Math.PI * freq * t) * amp * 0.8;
        }
    };

    const addSnare = (startSample) => {
        for (let i = 0; i < 5000 && (startSample + i) < length; i++) {
            const t = i / sampleRate;
            const noise = (Math.random() * 2 - 1) * Math.exp(-10 * t);
            const tone = Math.sin(2 * Math.PI * 200 * t) * Math.exp(-5 * t);
            data[startSample + i] += (noise + tone) * 0.6;
        }
    };

    const addHihat = (startSample) => {
        for (let i = 0; i < 1000 && (startSample + i) < length; i++) {
            const t = i / sampleRate;
            const noise = (Math.random() * 2 - 1) * Math.exp(-50 * t); // High pass roughly via short decay
            data[startSample + i] += noise * 0.3;
        }
    };

    const beatSamples = Math.floor(sampleRate * secondsPerBeat);

    // Standard Rock Beat Pattern (16th notes usually, but here just beats)
    // 1   2   3   4
    // K   S   K   S
    // H H H H H H H H

    // Kick: 1, 3 (plus syncopation)
    for (let bar = 0; bar < bars; bar++) {
        const barOffset = bar * 4 * beatSamples;
        addKick(barOffset + 0); // Beat 1
        addKick(barOffset + 2 * beatSamples); // Beat 3

        // Snare: 2, 4
        addSnare(barOffset + 1 * beatSamples); // Beat 2
        addSnare(barOffset + 3 * beatSamples); // Beat 4

        // Hihats: Every half beat (8th notes)
        for (let j = 0; j < 8; j++) {
            addHihat(barOffset + j * (beatSamples / 2));
        }
    }

    return buffer;
};
