/**
 * Transport Controls - Play, Stop, Record buttons
 */

import { useAudioStore } from '../../stores/audioStore';
import './TransportControls.css';

function TransportControls() {
    const {
        isPlaying,
        isRecording,
        play,
        stop,
        pause,
        masterVolume,
        setMasterVolume
    } = useAudioStore();

    return (
        <div className="transport">
            <div className="transport__buttons">
                {/* Stop */}
                <button
                    className="transport__btn transport__btn--stop"
                    onClick={stop}
                    title="Stop (Space)"
                >
                    <span className="transport__icon">◼</span>
                </button>

                {/* Play/Pause */}
                <button
                    className={`transport__btn transport__btn--play ${isPlaying ? 'active' : ''}`}
                    onClick={isPlaying ? pause : play}
                    title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                    <span className="transport__icon">
                        {isPlaying ? '❚❚' : '▶'}
                    </span>
                </button>

                {/* Record */}
                <button
                    className={`transport__btn transport__btn--record ${isRecording ? 'active' : ''}`}
                    title="Record"
                >
                    <span className="transport__icon">●</span>
                </button>
            </div>

            <div className="transport__volume">
                <label>Master</label>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={masterVolume}
                    onChange={(e) => setMasterVolume(Number(e.target.value))}
                />
                <span className="transport__volume-value">
                    {Math.round(masterVolume * 100)}%
                </span>
            </div>
        </div>
    );
}

export default TransportControls;
