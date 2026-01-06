/**
 * Recording Modal - UI for capturing microphone input
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { audioContext } from '../../audio/AudioContextManager';
import './RecordingModal.css';

function RecordingModal({ isOpen, onClose, onRecordingComplete }) {
    const [isRecording, setIsRecording] = useState(false);
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [devices, setDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');
    const [recordingTime, setRecordingTime] = useState(0);
    const [error, setError] = useState(null);
    const [analyserData, setAnalyserData] = useState(new Uint8Array(0));

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const animationFrameRef = useRef(null);
    const analyserRef = useRef(null);
    const streamRef = useRef(null);
    const audioRef = useRef(null);

    // Load available audio input devices
    useEffect(() => {
        if (isOpen) {
            navigator.mediaDevices.enumerateDevices()
                .then(devs => {
                    const audioInputs = devs.filter(d => d.kind === 'audioinput');
                    setDevices(audioInputs);
                    if (audioInputs.length > 0 && !selectedDeviceId) {
                        setSelectedDeviceId(audioInputs[0].deviceId);
                    }
                })
                .catch(err => setError('Failed to list audio devices: ' + err.message));
        } else {
            // Cleanup when closed
            stopStream();
            setRecordedBlob(null);
            setPreviewUrl(null);
            setRecordingTime(0);
            setIsRecording(false);
            setError(null);
        }
    }, [isOpen]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopStream();
    }, []);

    const stopStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
    };

    const startRecording = async () => {
        try {
            setError(null);
            chunksRef.current = [];

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false
                }
            });

            streamRef.current = stream;

            // Setup analyser for visualization
            const audioCtx = audioContext.getContext();
            const source = audioCtx.createMediaStreamSource(stream);
            analyserRef.current = audioCtx.createAnalyser();
            analyserRef.current.fftSize = 256;
            source.connect(analyserRef.current);

            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            setAnalyserData(dataArray);

            const visualize = () => {
                if (!analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);
                setAnalyserData([...dataArray]); // Force re-render
                animationFrameRef.current = requestAnimationFrame(visualize);
            };
            visualize();

            // Setup MediaRecorder
            // Prefer opus/webm if available, fallback to default
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : undefined;

            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mediaRecorderRef.current.mimeType });
                setRecordedBlob(blob);
                setPreviewUrl(URL.createObjectURL(blob));
                stopStream();
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);

            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 100); // Update every 100ms

        } catch (err) {
            setError('Could not start recording: ' + err.message);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
        }
    };

    const handleSave = async () => {
        if (!recordedBlob) return;

        try {
            const arrayBuffer = await recordedBlob.arrayBuffer();
            const audioCtx = audioContext.getContext();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

            onRecordingComplete({
                buffer: audioBuffer,
                name: `Rec ${new Date().toLocaleTimeString()}`,
                sourceType: 'recording'
            });

            onClose();
        } catch (err) {
            setError('Failed to process recording: ' + err.message);
        }
    };

    const formatTime = (tenths) => {
        const secs = Math.floor(tenths / 10);
        const ms = tenths % 10;
        return `${secs}.${ms}`;
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
                    className="recording-modal"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <header className="recording-modal__header">
                        <h2>🎤 Record Audio</h2>
                        <button className="recording-modal__close" onClick={onClose}>×</button>
                    </header>

                    <div className="recording-modal__body">
                        {/* Device Selector */}
                        <div className="recording-modal__field">
                            <label>Input Device</label>
                            <select
                                value={selectedDeviceId}
                                onChange={(e) => setSelectedDeviceId(e.target.value)}
                                disabled={isRecording || recordedBlob}
                            >
                                {devices.map(device => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Visualization / Waveform */}
                        <div className="recording-modal__visualizer">
                            {isRecording ? (
                                <div className="visualizer-bars">
                                    {Array.from(analyserData).slice(0, 32).map((val, i) => (
                                        <div
                                            key={i}
                                            className="bar"
                                            style={{ height: `${(val / 255) * 100}%` }}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="visualizer-placeholder">
                                    {recordedBlob ? 'Recording Complete' : 'Ready to Record'}
                                </div>
                            )}
                        </div>

                        {/* Timer */}
                        <div className="recording-modal__timer">
                            {formatTime(recordingTime)}s
                        </div>

                        {/* Controls */}
                        <div className="recording-modal__controls">
                            {!isRecording && !recordedBlob && (
                                <button className="btn btn--record" onClick={startRecording}>
                                    Stop talking, Start Recording
                                </button>
                            )}

                            {isRecording && (
                                <button className="btn btn--stop" onClick={stopRecording}>
                                    Stop Recording
                                </button>
                            )}

                            {recordedBlob && (
                                <div className="preview-controls">
                                    <audio ref={audioRef} src={previewUrl} controls />
                                    <button className="btn btn--text" onClick={() => {
                                        setRecordedBlob(null);
                                        setPreviewUrl(null);
                                    }}>
                                        Retake
                                    </button>
                                </div>
                            )}
                        </div>

                        {error && <div className="recording-modal__error">{error}</div>}
                    </div>

                    <footer className="recording-modal__footer">
                        <button className="btn btn--secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            className="btn btn--primary"
                            onClick={handleSave}
                            disabled={!recordedBlob}
                        >
                            Save to Pad
                        </button>
                    </footer>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default RecordingModal;
