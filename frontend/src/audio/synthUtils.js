/**
 * Synth utilities — generates AudioBuffers for the demo track.
 */

import { audioContext } from '../audio/AudioContextManager';

const NOTES = {
    C2: 65.41,  D2: 73.42,  E2: 82.41,  F2: 87.31,
    G2: 98.00,  A2: 110.00, B2: 123.47,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61,
    G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
    G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25,
};

// ---------------------------------------------------------------------------
// Chord pad — warm detuned oscillators, sustained through the loop
// ---------------------------------------------------------------------------
export const createChordPad = async (duration, notes) => {
    const ctx = audioContext.getContext();
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);

    const attackSamples  = Math.floor(sr * 0.04);
    const releaseSamples = Math.floor(sr * 0.25);

    notes.forEach(name => {
        const base = NOTES[name] ?? 440;
        // Three oscillators: unison, +0.15 st detune, −0.15 st detune for width
        [-0.15, 0, 0.15].forEach(dt => {
            const freq = base * Math.pow(2, dt / 12);
            let ph = Math.random() * Math.PI * 2;
            const gain = 0.18 / notes.length;
            for (let i = 0; i < len; i++) {
                // Smooth attack / release envelope, sustain in between
                let env = 1;
                if (i < attackSamples)              env = i / attackSamples;
                if (i > len - releaseSamples)       env = (len - i) / releaseSamples;
                // Fundamental + gentle 2nd harmonic
                out[i] += (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * env * gain;
                ph += 2 * Math.PI * freq / sr;
            }
        });
    });

    return buf;
};

// Backward-compat alias used elsewhere
export const createPianoSample = createChordPad;

// ---------------------------------------------------------------------------
// Bass line — root note that pumps on every beat
// ---------------------------------------------------------------------------
export const createBassLine = async (bpm, bars = 2) => {
    const ctx = audioContext.getContext();
    const sr = ctx.sampleRate;
    const beatSamples   = Math.floor(sr * 60 / bpm);
    const totalBeats    = bars * 4;
    const len           = beatSamples * totalBeats;
    const buf           = ctx.createBuffer(1, len, sr);
    const out           = buf.getChannelData(0);

    // Simple root pattern: C2 on 1&3, G2 on 2&4 (adds movement)
    const pattern = [65.41, 98.00, 65.41, 98.00]; // C2, G2, C2, G2 per bar

    for (let bar = 0; bar < bars; bar++) {
        for (let beat = 0; beat < 4; beat++) {
            const freq   = pattern[beat];
            const start  = (bar * 4 + beat) * beatSamples;
            const noteDur = Math.floor(beatSamples * 0.85); // slight gap between notes
            let ph = 0;
            for (let i = 0; i < noteDur && start + i < len; i++) {
                // Fast attack, slow decay — gives a "pluck-bass" feel
                const env = Math.min(i / (sr * 0.01), 1) * Math.exp(-4 * i / sr);
                out[start + i] += (Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph)) * env * 0.55;
                ph += 2 * Math.PI * freq / sr;
            }
        }
    }

    return buf;
};

// ---------------------------------------------------------------------------
// Drum loop — kick/snare/hi-hat with proper synthesis
// ---------------------------------------------------------------------------
export const createDrumLoop = async (bpm = 120, bars = 2) => {
    const ctx = audioContext.getContext();
    const sr  = ctx.sampleRate;
    const beatSamples = Math.floor(sr * 60 / bpm);
    const len         = beatSamples * 4 * bars;
    const buf         = ctx.createBuffer(1, len, sr);
    const out         = buf.getChannelData(0);

    const addKick = (start) => {
        const dur = Math.min(Math.floor(sr * 0.18), len - start);
        let ph = 0;
        for (let i = 0; i < dur; i++) {
            const t    = i / sr;
            const freq = 160 * Math.exp(-35 * t) + 40;         // pitch sweep
            const amp  = Math.exp(-18 * t);
            const click = (i < Math.floor(sr * 0.005)) ? (Math.random() * 2 - 1) * 0.4 : 0;
            out[start + i] += (Math.sin(ph) * amp + click) * 0.85;
            ph += 2 * Math.PI * freq / sr;
        }
    };

    const addSnare = (start) => {
        const dur = Math.min(Math.floor(sr * 0.14), len - start);
        let ph = 0;
        for (let i = 0; i < dur; i++) {
            const t    = i / sr;
            const body = Math.sin(ph) * Math.exp(-25 * t) * 0.3;
            const snap = (Math.random() * 2 - 1) * Math.exp(-28 * t) * 0.7;
            out[start + i] += (body + snap) * 0.65;
            ph += 2 * Math.PI * 195 / sr;
        }
    };

    // Closed hi-hat
    const addHH = (start, gain = 0.28) => {
        const dur = Math.min(Math.floor(sr * 0.04), len - start);
        for (let i = 0; i < dur; i++) {
            const t = i / sr;
            out[start + i] += (Math.random() * 2 - 1) * Math.exp(-90 * t) * gain;
        }
    };

    // Open hi-hat (longer decay, used on "and" of 4)
    const addOpenHH = (start) => {
        const dur = Math.min(Math.floor(sr * 0.22), len - start);
        for (let i = 0; i < dur; i++) {
            const t = i / sr;
            out[start + i] += (Math.random() * 2 - 1) * Math.exp(-14 * t) * 0.22;
        }
    };

    for (let bar = 0; bar < bars; bar++) {
        const bOff = bar * 4 * beatSamples;

        // Kick: beat 1, 3, and a ghost kick on the "and" of 2
        addKick(bOff + 0 * beatSamples);
        addKick(bOff + 2 * beatSamples);
        addKick(bOff + Math.floor(1.5 * beatSamples)); // "and" of 2

        // Snare: beats 2 and 4
        addSnare(bOff + 1 * beatSamples);
        addSnare(bOff + 3 * beatSamples);

        // Hi-hats: 8th notes, open HH on "and" of 4
        for (let eighth = 0; eighth < 8; eighth++) {
            const pos = bOff + Math.floor(eighth * beatSamples / 2);
            if (eighth === 7) addOpenHH(pos); // and of 4
            else addHH(pos);
        }
    }

    return buf;
};
