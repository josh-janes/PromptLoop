/**
 * Generate Modal - UI for AI audio generation
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { aiGenerator } from '../../services/aiGenerator';
import './GenerateModal.css';

function GenerateModal({ isOpen, onClose, onGenerated, bpm = 120 }) {
    const [prompt, setPrompt] = useState('');
    const [duration, setDuration] = useState(4);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isModelLoading, setIsModelLoading] = useState(false);
    const [loadProgress, setLoadProgress] = useState(0);
    const [error, setError] = useState(null);

    // Example prompts
    const examplePrompts = [
        'funky bass line',
        'electronic drum beat',
        'ambient pad texture',
        'acoustic guitar loop',
        'synth arpeggio',
        'jazz piano riff'
    ];

    useEffect(() => {
        // Set up progress callback
        aiGenerator.onProgress((progress) => {
            setLoadProgress(progress);
        });
    }, []);

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setError('Please enter a prompt');
            return;
        }

        setError(null);
        setIsGenerating(true);

        // Check if model needs loading
        if (!aiGenerator.ready) {
            setIsModelLoading(true);
        }

        try {
            const audioBuffer = await aiGenerator.generate(prompt, {
                bpm,
                durationSeconds: duration
            });

            setIsModelLoading(false);
            setIsGenerating(false);

            // Call the callback with the generated audio
            onGenerated({
                buffer: audioBuffer,
                name: prompt.slice(0, 30),
                sourceType: 'ai_generation',
                promptHistory: {
                    prompt,
                    bpm,
                    duration,
                    generatedAt: new Date().toISOString()
                }
            });

            onClose();

        } catch (err) {
            setIsModelLoading(false);
            setIsGenerating(false);
            setError(err.message);
        }
    };

    const handleExampleClick = (example) => {
        setPrompt(example);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    className="generate-modal"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <header className="generate-modal__header">
                        <h2>✨ Generate Audio</h2>
                        <button className="generate-modal__close" onClick={onClose}>×</button>
                    </header>

                    <div className="generate-modal__body">
                        {/* Prompt input */}
                        <div className="generate-modal__field">
                            <label>Describe the sound you want:</label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="e.g., funky bass line in E minor"
                                rows={3}
                                disabled={isGenerating}
                            />
                        </div>

                        {/* Example prompts */}
                        <div className="generate-modal__examples">
                            <span>Try:</span>
                            {examplePrompts.map((example) => (
                                <button
                                    key={example}
                                    className="example-chip"
                                    onClick={() => handleExampleClick(example)}
                                    disabled={isGenerating}
                                >
                                    {example}
                                </button>
                            ))}
                        </div>

                        {/* Duration slider */}
                        <div className="generate-modal__field">
                            <label>Duration: {duration} seconds</label>
                            <input
                                type="range"
                                min="2"
                                max="10"
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                                disabled={isGenerating}
                            />
                        </div>

                        {/* BPM display */}
                        <div className="generate-modal__info">
                            <span>BPM: {bpm}</span>
                        </div>

                        {/* Error message */}
                        {error && (
                            <div className="generate-modal__error">
                                {error}
                            </div>
                        )}

                        {/* Loading state */}
                        {isModelLoading && (
                            <div className="generate-modal__loading">
                                <div className="loading-spinner" />
                                <span>Loading AI model... {loadProgress}%</span>
                                <div className="loading-bar">
                                    <div
                                        className="loading-bar__fill"
                                        style={{ width: `${loadProgress}%` }}
                                    />
                                </div>
                                <p className="loading-note">
                                    First load downloads ~300MB model (cached for future use)
                                </p>
                            </div>
                        )}

                        {/* Generating state */}
                        {isGenerating && !isModelLoading && (
                            <div className="generate-modal__loading">
                                <div className="loading-spinner generating" />
                                <span>Generating audio...</span>
                            </div>
                        )}
                    </div>

                    <footer className="generate-modal__footer">
                        <button
                            className="btn btn--secondary"
                            onClick={onClose}
                            disabled={isGenerating}
                        >
                            Cancel
                        </button>
                        <button
                            className="btn btn--primary"
                            onClick={handleGenerate}
                            disabled={isGenerating || !prompt.trim()}
                        >
                            {isGenerating ? 'Generating...' : '✨ Generate'}
                        </button>
                    </footer>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default GenerateModal;
