import { useState, useEffect, useRef } from 'react';
import { useAudioStore } from '../../stores/audioStore';
import { audioContext } from '../../audio/AudioContextManager';
import './Pad.css';

function encodeWav(audioBuffer) {
    const ch = audioBuffer.numberOfChannels;
    const sr = audioBuffer.sampleRate;
    const n  = audioBuffer.length;
    const buf  = new ArrayBuffer(44 + n * ch * 2);
    const view = new DataView(buf);
    const str  = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); view.setUint32(4, 36 + n * ch * 2, true);
    str(8, 'WAVE'); str(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, ch, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * ch * 2, true);
    view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true);
    str(36, 'data'); view.setUint32(40, n * ch * 2, true);
    let off = 44;
    for (let i = 0; i < n; i++)
        for (let c = 0; c < ch; c++) {
            const s = Math.max(-1, Math.min(1, audioBuffer.getChannelData(c)[i]));
            view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            off += 2;
        }
    return buf;
}

function savePad(pad) {
    if (!pad.buffer) return;
    const blob = new Blob([encodeWav(pad.buffer)], { type: 'audio/wav' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `${pad.name || 'sample'}.wav` });
    a.click();
    URL.revokeObjectURL(url);
}

function Pad({ index, pad, isGenerating, generationStatus, onGenerate, onRecordClick }) {
    const [prompt, setPrompt]     = useState('');
    const [isDragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);
    const presetPrompt = pad.promptHistory?.prompt ?? pad.suggestedPrompt;

    useEffect(() => { if (presetPrompt) setPrompt(presetPrompt); }, [presetPrompt]);

    const { loadPad, clearPad, toggleMute, toggleSolo, setPadVolume } = useAudioStore();

    const loadFile = async (file) => {
        if (!file?.type.startsWith('audio/')) return;
        try {
            const ctx    = audioContext.getContext();
            const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
            loadPad(index, decoded, { name: file.name.replace(/\.[^/.]+$/, ''), sourceType: 'upload' });
        } catch (e) { console.error('Failed to load audio:', e); }
    };

    const handleClick = (e) => {
        e.stopPropagation();
        if (isGenerating) return;
        if (pad.status === 'ready') toggleMute(index);
        else fileInputRef.current?.click();
    };

    const handleGenerate = (e) => {
        e.stopPropagation();
        if (prompt.trim()) onGenerate(index, prompt.trim());
    };

    const hasAudio = pad.status === 'ready' && pad.buffer;

    const statusClass = pad.muted ? 'pad--muted'
        : pad.solo        ? 'pad--solo'
        : isGenerating    ? 'pad--loading'
        : hasAudio        ? 'pad--ready'
        : 'pad--empty';

    return (
        <div
            className={`pad ${statusClass}`}
            onClick={handleClick}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files[0]); }}
            tabIndex="0"
            role="button"
            aria-label={`Pad ${index + 1}: ${pad.name || 'Empty'}`}
        >
            <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }}
                onChange={(e) => loadFile(e.target.files[0])} />

            <div className="pad__content">
                {isGenerating ? (
                    <span className="pad__status-text">{generationStatus || 'Generating...'}</span>
                ) : (
                    <>
                        {/* Identity */}
                        <div className="pad__identity">
                            {hasAudio
                                ? <span className="pad__name">{pad.name}</span>
                                : <span className="pad__index">{index + 1}</span>
                            }
                            {pad.sourceType && (
                                <span className="pad__source-badge">
                                    {pad.sourceType === 'ai_generation' ? '✨' : pad.sourceType === 'recording' ? '🎤' : '📁'}
                                </span>
                            )}
                        </div>

                        {/* Playback controls — only when loaded */}
                        {hasAudio && (
                            <>
                                <div className="pad__controls">
                                    <button className={`pad__btn ${!pad.muted ? 'active' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); toggleMute(index); }}
                                        title={pad.muted ? 'Unmute' : 'Mute'}>
                                        {pad.muted ? 'OFF' : 'ON'}
                                    </button>
                                    <button className={`pad__btn ${pad.solo ? 'active' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); toggleSolo(index); }}
                                        title="Solo">S</button>
                                    <button className="pad__btn pad__btn--clear"
                                        onClick={(e) => { e.stopPropagation(); clearPad(index); }}
                                        title="Clear">×</button>
                                </div>
                                <div className="pad__volume" onClick={(e) => e.stopPropagation()}>
                                    <span className="pad__volume-label">VOL</span>
                                    <input
                                        className="pad__volume-slider"
                                        type="range"
                                        min="0" max="1" step="0.01"
                                        value={pad.volume}
                                        onChange={(e) => setPadVolume(index, parseFloat(e.target.value))}
                                    />
                                    <span className="pad__volume-value">{Math.round(pad.volume * 100)}</span>
                                </div>
                            </>
                        )}

                        {/* Record + Generate — always visible */}
                        <div className="pad__actions" onClick={(e) => e.stopPropagation()}>
                            <button className="pad__btn-rec" onClick={() => onRecordClick(index)} title="Record">
                                🎤
                            </button>
                            <input
                                className="pad__prompt-input"
                                type="text"
                                placeholder="Describe sound…"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleGenerate(e)}
                            />
                            <button className="pad__btn-gen" onClick={handleGenerate} disabled={!prompt.trim()}
                                title={hasAudio ? 'Regenerate' : 'Generate'}>
                                {hasAudio ? '↻' : '✨'}
                            </button>
                            {hasAudio && (
                                <button className="pad__btn-save" onClick={() => savePad(pad)} title="Save WAV">
                                    ↓
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>

            {isDragOver && <div className="pad__drop-overlay">Drop audio</div>}
        </div>
    );
}

export default Pad;
