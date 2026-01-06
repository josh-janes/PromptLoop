/**
 * Looper Component - The main 16-pad loop interface
 */

import { useState, useEffect, useCallback } from 'react';
import { useAudioStore } from '../../stores/audioStore';
import { audioContext } from '../../audio/AudioContextManager';
import { createPianoSample, createDrumLoop } from '../../audio/synthUtils';

import { RecordingModal } from '../RecordingModal';
import { AuthModal } from '../Auth';
import { ProjectsModal } from '../ProjectsModal';
import useAuthStore from '../../stores/authStore';
import Pad from './Pad';
import TransportControls from './TransportControls';
import './Looper.css';

function Looper() {
    const [isInitialized, setIsInitialized] = useState(false);
    const [mode, setMode] = useState('play'); // 'play', 'record', 'generate'
    const [generatingPads, setGeneratingPads] = useState({}); // { [index]: { progress: 0 } }
    const [showRecordingModal, setShowRecordingModal] = useState(false);
    const [recordingTargetPad, setRecordingTargetPad] = useState(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showProjectsModal, setShowProjectsModal] = useState(false);

    const { user, isAuthenticated, logout } = useAuthStore();

    const {
        pads,
        isPlaying,
        bpm,
        currentStep,
        progress,
        setLooperNode,
        loadPad,
        play,
        stop,
        setBpm
    } = useAudioStore();

    // Initialize audio on first user interaction
    const initializeAudio = useCallback(async () => {
        if (isInitialized) return;

        try {
            const ctx = await audioContext.initialize();

            // Create the looper worklet node
            const looperNode = new AudioWorkletNode(ctx, 'looper-processor');
            looperNode.connect(audioContext.getMasterGain());

            // Listen for messages from the worklet
            looperNode.port.onmessage = (event) => {
                const { type, position, total } = event.data;
                if (type === 'position') {
                    // Convert position to step (assuming 16 steps per loop)
                    const progress = position / total;
                    const step = Math.floor(progress * 16) % 16;
                    useAudioStore.getState().updateStep(step, progress);
                }
            };

            // Set initial BPM
            looperNode.port.postMessage({ type: 'setBpm', data: { bpm } });

            setLooperNode(looperNode);
            setIsInitialized(true);

            // Auto-load demo if desired, or just waiting for user
        } catch (error) {
            console.error('Failed to initialize audio:', error);
        }
    }, [isInitialized, bpm, setLooperNode]);

    const handleLoadDemo = async (e) => {
        e.stopPropagation();
        if (!isInitialized) await initializeAudio();

        const ctx = audioContext.getContext();

        // Load Drums on Pad 0
        const drumBuffer = await createDrumLoop(bpm, 2); // 2 bars
        loadPad(0, drumBuffer, { name: 'Demo Drums', sourceType: 'upload' });

        // Load Piano Chords on Pad 1
        const pianoBuffer = await createPianoSample(4.0, ['C3', 'E3', 'G3', 'B3']); // Cmaj7
        loadPad(1, pianoBuffer, { name: 'Piano Cmaj7', sourceType: 'upload' });

        // Load Bass on Pad 4
        const bassBuffer = await createPianoSample(4.0, ['C2']); // C Bass
        loadPad(4, bassBuffer, { name: 'Bass C', sourceType: 'upload' });
    };

    // Handle pad click in record mode
    const handlePadRecordClick = useCallback((padIndex) => {
        setRecordingTargetPad(padIndex);
        setShowRecordingModal(true);
    }, []);

    // Handle in-place generation
    const handleGenerate = useCallback(async (padIndex, prompt) => {
        // Set generating state
        setGeneratingPads(prev => ({
            ...prev,
            [padIndex]: { progress: 0 }
        }));

        try {
            // Calculate duration based on BPM (e.g. 2 bars) or default 4s
            // For now default to 4s to match previous logic
            const duration = 4.0;

            // Note: aiGenerator now supports progress callbacks, but we need to hook it up per-call
            // Since our service is singleton, we might only get global progress. 
            // For now, let's simulate or specific implementation.
            // *Wait*, aiGenerator is singleton. If we want parallel generation, we need to be careful.
            // But JS single thread means we can only generate one at a time comfortably anyway.

            const result = await import('../../services/aiGenerator').then(({ aiGenerator }) => {
                // Get reference mix from other pads
                const inputAudioBuffer = audioContext.getMixAudioBuffer(pads);
                const inputAudio = inputAudioBuffer ? inputAudioBuffer.getChannelData(0) : null;
                const inputSampleRate = audioContext.getContext()?.sampleRate || 44100;

                return aiGenerator.generate(prompt, {
                    bpm,
                    durationSeconds: duration,
                    inputAudio,
                    inputSampleRate,
                    onProgress: (p) => {
                        setGeneratingPads(prev => ({
                            ...prev,
                            [padIndex]: { progress: p }
                        }));
                    }
                });
            });

            // Load the result
            loadPad(padIndex, result, {
                name: prompt,
                sourceType: 'ai_generation',
                promptHistory: { prompt }
            });

        } catch (error) {
            console.error("Generation failed", error);
            // Optionally show error on pad
        } finally {
            // Clear generating state
            setGeneratingPads(prev => {
                const next = { ...prev };
                delete next[padIndex];
                return next;
            });
            // Reset mode to play after generation starts/completes? 
            // User might want to generate multiple. Keep in generate mode.
        }
    }, [bpm, loadPad]);

    // Handle recorded audio
    const handleRecordingComplete = useCallback((result) => {
        if (recordingTargetPad !== null) {
            loadPad(recordingTargetPad, result.buffer, {
                name: result.name,
                sourceType: result.sourceType
            });
        }
        setShowRecordingModal(false);
        setRecordingTargetPad(null);
    }, [recordingTargetPad, loadPad]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space') {
                // Ignore if user is typing in an input
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }

                e.preventDefault();
                if (isPlaying) {
                    stop();
                } else {
                    play();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, play, stop]);

    return (
        <div className="looper" onClick={initializeAudio}>
            {!isInitialized && (
                <div className="looper__init-overlay">
                    <div className="looper__init-message">
                        <h2>🎸 PromptLoop</h2>
                        <p>Click anywhere to start</p>
                    </div>
                </div>
            )}

            <header className="looper__header">
                <h1 className="looper__title">PromptLoop</h1>



                <button className="btn-text" onClick={handleLoadDemo} style={{ marginRight: 'auto', marginLeft: '20px' }}>
                    🎵 Load Demo
                </button>

                <div className="looper__mode-selector">
                    <button
                        className={`mode-btn ${mode === 'play' ? 'active' : ''}`}
                        onClick={() => setMode('play')}
                    >
                        Play
                    </button>
                    <button
                        className={`mode-btn ${mode === 'record' ? 'active' : ''}`}
                        onClick={() => setMode('record')}
                    >
                        Record
                    </button>
                    <button
                        className={`mode-btn ${mode === 'generate' ? 'active' : ''}`}
                        onClick={() => setMode('generate')}
                    >
                        ✨ Generate
                    </button>
                </div>

                <div className="looper__bpm">
                    <label>BPM</label>
                    <input
                        type="number"
                        value={bpm}
                        onChange={(e) => setBpm(Number(e.target.value))}
                        min="20"
                        max="300"
                    />
                </div>

                <div className="looper__auth">
                    {isAuthenticated ? (
                        <div className="auth-status">
                            <button className="btn-primary-sm" onClick={() => setShowProjectsModal(true)}>
                                📁 Projects
                            </button>
                            <span>{user?.email}</span>
                            <button className="btn-text" onClick={logout}>Sign Out</button>
                        </div>
                    ) : (
                        <button className="btn-primary-sm" onClick={() => setShowAuthModal(true)}>
                            Log In
                        </button>
                    )}
                </div>
            </header>

            <main className="looper__grid">
                {pads.map((pad, index) => (
                    <Pad
                        key={index}
                        index={index}
                        pad={pad}
                        isActive={currentStep === index && isPlaying}
                        progress={isPlaying ? progress : 0}
                        mode={mode}
                        onGenerate={handleGenerate}
                        onRecordClick={handlePadRecordClick}
                        isGenerating={!!generatingPads[index]}
                        generationProgress={generatingPads[index]?.progress || 0}
                    />
                ))}
            </main>

            <TransportControls />

            {/* GenerateModal removed - In-place generation used */}

            {/* Recording Modal */}
            <RecordingModal
                isOpen={showRecordingModal}
                onClose={() => {
                    setShowRecordingModal(false);
                    setRecordingTargetPad(null);
                }}
                onRecordingComplete={handleRecordingComplete}
            />

            {/* Auth Modal */}
            <AuthModal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
            />
            {/* ProjectsModal */}
            <ProjectsModal
                isOpen={showProjectsModal}
                onClose={() => setShowProjectsModal(false)}
            />
        </div>
    );
}

export default Looper;
