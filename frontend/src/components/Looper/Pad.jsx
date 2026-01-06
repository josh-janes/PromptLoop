/**
 * Pad Component - Individual pad in the looper grid
 */

import { useState, useRef } from 'react';
import { useAudioStore } from '../../stores/audioStore';
import { audioContext } from '../../audio/AudioContextManager';
import './Pad.css';

function Pad({ index, pad, isGenerating, generationProgress, progress = 0, mode, onGenerate, onRecordClick }) {
    const [prompt, setPrompt] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const { loadPad, clearPad, toggleMute, toggleSolo, startRecording } = useAudioStore();

    // Handle file drop
    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragOver(false);

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('audio/')) {
            await loadAudioFile(file);
        }
    };

    // Handle file selection
    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await loadAudioFile(file);
        }
    };

    // Load audio file into this pad
    const loadAudioFile = async (file) => {
        try {
            const ctx = audioContext.getContext();
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

            loadPad(index, audioBuffer, {
                name: file.name.replace(/\.[^/.]+$/, ''),
                sourceType: 'upload'
            });
        } catch (error) {
            console.error('Failed to load audio file:', error);
        }
    };

    // Handle pad click based on mode
    const handleClick = (e) => {
        e.stopPropagation();

        if (isGenerating) return;

        if (mode === 'generate' && pad.status === 'empty') {
            // In-place generation
            return;
        }

        if (mode === 'record' && pad.status === 'empty') {
            onRecordClick?.(index);
            return;
        }

        if (pad.status === 'ready') {
            // Toggle mute on click anywhere on the tile
            toggleMute(index);
        } else if (pad.status === 'empty') {
            fileInputRef.current?.click();
        }
    };

    const handleKeyDown = (e) => {
        // Ignore if user is typing in the prompt input
        if (e.target.tagName === 'INPUT') return;

        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e);
        }
    };

    // Get pad status class
    const getStatusClass = () => {
        // User requested to remove value-based sequencer highlighting
        // if (isActive) return 'pad--active'; 
        if (pad.muted) return 'pad--muted';
        if (pad.solo) return 'pad--solo';
        if (pad.status === 'loading' || isGenerating) return 'pad--loading';
        if (pad.status === 'ready') return 'pad--ready';
        return 'pad--empty';
    };

    const handleGenerate = (e) => {
        e.stopPropagation();
        if (prompt.trim()) {
            onGenerate(index, prompt);
        }
    };

    return (
        <div
            className={`pad ${getStatusClass()}`}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            data-index={index}
            tabIndex="0"
            role="button"
            aria-label={`Pad ${index + 1}: ${pad.name || 'Empty'}`}
        >
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
            />

            {/* Pad content */}
            <div className="pad__content">
                {isGenerating ? (
                    <div className="pad__generating">
                        <span className="pad__status-text">Generating...</span>
                        <div className="pad__gen-progress-bar">
                            <div
                                className="pad__gen-progress-fill"
                                style={{ width: `${generationProgress}%` }}
                            />
                        </div>
                    </div>
                ) : mode === 'generate' ? (
                    <div className="pad__generate-input" onClick={e => e.stopPropagation()}>
                        <input
                            type="text"
                            placeholder="Prompt..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleGenerate(e)}
                        />
                        <button onClick={handleGenerate} disabled={!prompt.trim()}>Go</button>
                    </div>
                ) : pad.status === 'empty' ? (
                    <div className="pad__placeholder">
                        <span className="pad__index">{index + 1}</span>
                        {mode === 'record' && <span className="pad__hint">🎤 Record</span>}
                        {mode === 'play' && <span className="pad__hint">Drop audio</span>}
                    </div>
                ) : (
                    <>
                        <span className="pad__name">{pad.name}</span>
                        <div className="pad__controls">
                            <button
                                className={`pad__btn ${!pad.muted ? 'active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); toggleMute(index); }}
                                title={pad.muted ? "Turn On" : "Turn Off"}
                            >
                                {pad.muted ? 'OFF' : 'ON'}
                            </button>
                            <button
                                className={`pad__btn ${pad.solo ? 'active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); toggleSolo(index); }}
                                title="Solo"
                            >
                                S
                            </button>
                            <button
                                className="pad__btn pad__btn--clear"
                                onClick={(e) => { e.stopPropagation(); clearPad(index); }}
                                title="Clear"
                            >
                                ×
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Source type indicator */}
            {pad.sourceType && (
                <div className="pad__source">
                    {pad.sourceType === 'ai_generation' && '✨'}
                    {pad.sourceType === 'recording' && '🎤'}
                    {pad.sourceType === 'upload' && '📁'}
                </div>
            )}

            {/* Drag overlay */}
            {isDragOver && (
                <div className="pad__drop-overlay">
                    Drop audio here
                </div>
            )}

            {/* Progress Bar (Top of pad) */}
            {(progress > 0 && !pad.muted) && (
                <div className="pad__playback-progress">
                    <div
                        className="pad__playback-progress-fill"
                        style={{ width: `${progress * 100}%` }}
                    />
                </div>
            )}
        </div>
    );
}

export default Pad;
