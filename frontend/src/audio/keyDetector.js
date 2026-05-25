/**
 * Musical key detection via Goertzel algorithm + Krumhansl-Schmuckler profiles.
 *
 * Goertzel computes power at a specific frequency in O(N) — far cheaper than a
 * full FFT when you only need ~36 target frequencies (3 octaves × 12 notes).
 * KS correlation then matches the resulting chroma vector against major/minor
 * key profiles to find the best fit.
 */

// Krumhansl-Schmuckler key profiles, C-rooted (index 0 = tonic)
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Power at a single target frequency (Goertzel)
function goertzel(samples, freq, sr) {
    const coeff = 2 * Math.cos(2 * Math.PI * freq / sr);
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < samples.length; i++) {
        s0 = samples[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    return s2 * s2 + s1 * s1 - coeff * s1 * s2;
}

// 12-bin chroma vector: sum Goertzel power across MIDI 45–80 (A2–G#5)
function buildChroma(samples, sr) {
    const chroma = new Float32Array(12);
    const A4 = 440, A4_MIDI = 69;
    for (let midi = 45; midi <= 80; midi++) {
        const freq = A4 * Math.pow(2, (midi - A4_MIDI) / 12);
        if (freq >= sr / 2) continue;
        chroma[midi % 12] += goertzel(samples, freq, sr);
    }
    return chroma;
}

function pearson(chroma, profile) {
    const n = 12;
    const cMu = chroma.reduce((a, b) => a + b) / n;
    const pMu = profile.reduce((a, b) => a + b) / n;
    let num = 0, dA = 0, dB = 0;
    for (let i = 0; i < n; i++) {
        const c = chroma[i] - cMu, p = profile[i] - pMu;
        num += c * p; dA += c * c; dB += p * p;
    }
    return num / Math.sqrt(dA * dB + 1e-10);
}

/**
 * Detect the musical key of a mono Float32Array.
 * Returns a string like "A Minor" or "C Major".
 */
export function detectKey(samples, sampleRate) {
    // Downsample to ~4 kHz — sufficient for pitch-class analysis, much faster
    const factor = Math.max(1, Math.floor(sampleRate / 4000));
    const dsLen = Math.floor(samples.length / factor);
    const ds = new Float32Array(dsLen);
    for (let i = 0; i < dsLen; i++) ds[i] = samples[i * factor];
    const sr = sampleRate / factor;

    // Analyse at most 2 seconds
    const slice = ds.subarray(0, Math.min(dsLen, Math.floor(sr * 2)));
    const chroma = buildChroma(slice, sr);

    let best = -Infinity, bestKey = 'C Major';
    for (let root = 0; root < 12; root++) {
        // Rotate chroma so the candidate root sits at index 0
        const rot = new Float32Array(12);
        for (let i = 0; i < 12; i++) rot[i] = chroma[(i + root) % 12];

        const maj = pearson(rot, KS_MAJOR);
        const min = pearson(rot, KS_MINOR);
        if (maj > best) { best = maj; bestKey = `${NOTE_NAMES[root]} Major`; }
        if (min > best) { best = min; bestKey = `${NOTE_NAMES[root]} Minor`; }
    }
    return bestKey;
}

export const ALL_KEYS = [
    ...NOTE_NAMES.map(n => `${n} Major`),
    ...NOTE_NAMES.map(n => `${n} Minor`),
];
