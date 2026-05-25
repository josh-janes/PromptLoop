import { useState, useEffect, useCallback } from 'react';
import { useAudioStore } from '../../stores/audioStore';
import { audioContext } from '../../audio/AudioContextManager';
import { createChordPad, createBassLine, createDrumLoop } from '../../audio/synthUtils';
import { detectKey, ALL_KEYS } from '../../audio/keyDetector';

import { RecordingModal } from '../RecordingModal';
import Pad from './Pad';
import TransportControls from './TransportControls';
import './Looper.css';

function Looper() {
    const [isInitialized, setIsInitialized]       = useState(false);
    const [generatingPads, setGeneratingPads]     = useState({});
    const [showRecordingModal, setShowRecordingModal] = useState(false);
    const [recordingTargetPad, setRecordingTargetPad] = useState(null);
    const [isIsolated, setIsIsolated]             = useState(true);
    const [key, setKey]                           = useState('C Major');

    useEffect(() => { setIsIsolated(window.crossOriginIsolated); }, []);

    const { pads, isPlaying, bpm, progress, setLooperNode, loadPad, setSuggestedPrompt, play, stop, setBpm } = useAudioStore();

    // Auto-detect key whenever the active mix changes
    const readyCount = pads.filter(p => p.status === 'ready').length;
    const mutedCount = pads.filter(p => p.muted).length;
    useEffect(() => {
        if (!isInitialized) return;
        const mix = audioContext.getMixAudioBuffer(pads);
        if (!mix) return;
        setKey(detectKey(mix.getChannelData(0), audioContext.getContext().sampleRate));
    }, [readyCount, mutedCount, isInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

    const initializeAudio = useCallback(async () => {
        if (isInitialized) return;
        try {
            const ctx = await audioContext.initialize();
            const looperNode = new AudioWorkletNode(ctx, 'looper-processor');
            looperNode.connect(audioContext.getMasterGain());
            looperNode.port.onmessage = ({ data: { type, position, total } }) => {
                if (type === 'position') {
                    const p = position / total;
                    useAudioStore.getState().updateStep(Math.floor(p * 16) % 16, p);
                }
            };
            looperNode.port.postMessage({ type: 'setBpm', data: { bpm } });
            setLooperNode(looperNode);
            setIsInitialized(true);
        } catch (e) { console.error('Audio init failed:', e); }
    }, [isInitialized, bpm, setLooperNode]);

    const handleLoadDemo = async (e) => {
        e.stopPropagation();
        if (!isInitialized) await initializeAudio();
        const bars = 2;
        const dur  = (60 / bpm) * 4 * bars;
        const [drums, chord, bass] = await Promise.all([
            createDrumLoop(bpm, bars),
            createChordPad(dur, ['C3', 'E3', 'G3', 'B3']),
            createBassLine(bpm, bars),
        ]);
        loadPad(0, drums, { name: 'Drums',     sourceType: 'upload' });
        loadPad(1, chord, { name: 'Chord Pad', sourceType: 'upload' });
        loadPad(4, bass,  { name: 'Bass Line', sourceType: 'upload' });

        // Pre-seed empty pads with prompts covering different musical roles
        const suggestions = {
            2:  'warm Rhodes electric piano, jazz comping, lo-fi, mellow',
            3:  'tenor saxophone melody, soulful jazz, expressive, breathy',
            5:  'funky clavinet, tight percussive rhythm, groove',
            6:  'lush string pad, sustained, ambient, cinematic',
            7:  'pulsing synth arpeggio, bright electronic, driving 16th notes',
            8:  'fat Moog lead synth, warm analog, vintage, melodic',
            9:  'shaker and tambourine, tight rhythmic groove, percussive',
            10: 'vintage Hammond B3 organ, gospel chord comping, warm drawbar',
            11: 'clean Fender guitar fingerpicking, gentle, ambient',
            12: 'ethereal reverb guitar, shoegaze, washed, atmospheric',
            13: 'deep 808 sub bass, punchy electronic, low end',
            14: 'orchestral cello section, cinematic, rich, dramatic pulse',
            15: 'vibraphone melody, jazz, shimmering, delicate',
        };
        Object.entries(suggestions).forEach(([i, prompt]) => setSuggestedPrompt(Number(i), prompt));
    };

    const handlePadRecordClick = useCallback((padIndex) => {
        setRecordingTargetPad(padIndex);
        setShowRecordingModal(true);
    }, []);

    const handleGenerate = useCallback(async (padIndex, prompt) => {
        setGeneratingPads(prev => ({ ...prev, [padIndex]: { progress: 0, status: 'Initializing...' } }));
        try {
            const duration = (60 / bpm) * 8;
            const { aiGenerator } = await import('../../services/aiGenerator');
            const result = await aiGenerator.generate(prompt, {
                bpm, durationSeconds: duration, key,
                onProgress: (p) => setGeneratingPads(prev =>
                    prev[padIndex] ? { ...prev, [padIndex]: { ...prev[padIndex], progress: p } } : prev),
                onStatus: (s) => setGeneratingPads(prev =>
                    prev[padIndex] ? { ...prev, [padIndex]: { ...prev[padIndex], status: s } } : prev),
            });
            loadPad(padIndex, result, { name: prompt, sourceType: 'ai_generation', promptHistory: { prompt } });
        } catch (e) {
            console.error('Generation failed', e);
        } finally {
            setGeneratingPads(prev => { const n = { ...prev }; delete n[padIndex]; return n; });
        }
    }, [bpm, key, loadPad, pads]);

    const handleRecordingComplete = useCallback((result) => {
        if (recordingTargetPad !== null)
            loadPad(recordingTargetPad, result.buffer, { name: result.name, sourceType: result.sourceType });
        setShowRecordingModal(false);
        setRecordingTargetPad(null);
    }, [recordingTargetPad, loadPad]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                isPlaying ? stop() : play();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isPlaying, play, stop]);

    const generatingEntries = Object.entries(generatingPads);
    const activeGen = generatingEntries.length > 0 ? generatingEntries[0][1] : null;

    return (
        <div className="looper" onClick={initializeAudio}>
            {!isInitialized && (
                <div className="looper__init-overlay">
                    <div className="looper__init-message">
                        <h2>PromptLoop</h2>
                        <p>Click anywhere to start</p>
                    </div>
                </div>
            )}

            <header className="looper__header">
                <h1 className="looper__title">PromptLoop</h1>

                {!isIsolated && (
                    <div className="looper__perf-warning" title="SharedArrayBuffer unavailable — WASM single-threaded">
                        ⚠️ Low Perf
                    </div>
                )}

                <button className="btn-text" onClick={handleLoadDemo} style={{ marginLeft: 16, marginRight: 'auto' }}>
                    Load Demo
                </button>

                <div className="looper__bpm">
                    <label>BPM</label>
                    <input type="number" value={bpm} min="20" max="300"
                        onChange={(e) => setBpm(Number(e.target.value))} />
                </div>

                <div className="looper__key">
                    <label>Key</label>
                    <select value={key} onChange={(e) => setKey(e.target.value)}>
                        {ALL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                </div>
            </header>

            <div className="looper__global-progress">
                <div
                    className={`looper__global-progress-fill${activeGen ? ' looper__global-progress-fill--generating' : ''}`}
                    style={{ width: activeGen ? `${activeGen.progress}%` : isPlaying ? `${progress * 100}%` : '0%' }}
                />
                {activeGen && <span className="looper__global-progress-label">{activeGen.status}</span>}
            </div>

            <main className="looper__grid">
                {pads.map((pad, index) => (
                    <Pad
                        key={index}
                        index={index}
                        pad={pad}
                        onGenerate={handleGenerate}
                        onRecordClick={handlePadRecordClick}
                        isGenerating={!!generatingPads[index]}
                        generationStatus={generatingPads[index]?.status || ''}
                    />
                ))}
            </main>

            <TransportControls />

            <RecordingModal
                isOpen={showRecordingModal}
                onClose={() => { setShowRecordingModal(false); setRecordingTargetPad(null); }}
                onRecordingComplete={handleRecordingComplete}
            />
        </div>
    );
}

export default Looper;
