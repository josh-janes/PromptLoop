/**
 * Projects Modal - Save and Load Projects
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { projects } from '../../services/api';
import useAuthStore from '../../stores/authStore';
import { useAudioStore } from '../../stores/audioStore';
import './ProjectsModal.css';

function ProjectsModal({ isOpen, onClose, currentProjectState }) {
    const [mode, setMode] = useState('list'); // 'list', 'save'
    const [projectList, setProjectList] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [saveName, setSaveName] = useState('');

    const { isAuthenticated } = useAuthStore();
    const { loadProject, pads, bpm } = useAudioStore();

    // Fetch projects when opening list mode
    useEffect(() => {
        if (isOpen && mode === 'list' && isAuthenticated) {
            fetchProjects();
        }
    }, [isOpen, mode, isAuthenticated]);

    const fetchProjects = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await projects.getAll();
            setProjectList(data);
        } catch (err) {
            setError('Failed to load projects');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!saveName.trim()) return;

        setIsLoading(true);
        setError(null);

        try {
            // Prepare project data
            // We need to upload audio files for pads that have content
            // For now, let's assume we just save metadata and maybe base64 or specialized logic later
            // The Rails API expects `project: { title, bpm, global_settings, tracks_attributes }`

            // Construct tracks attributes
            const tracksAttributes = pads.map((pad, index) => {
                if (pad.status === 'empty') return null;

                return {
                    pad_index: index,
                    source_type: pad.sourceType || 'upload',
                    settings: {
                        name: pad.name,
                        volume: pad.volume,
                        muted: pad.muted,
                        solo: pad.solo
                    },
                    // We need a way to store the actual audio. 
                    // For the AI generated/recorded ones, we might need to upload blobs.
                    // Implementation detail: separate file upload or base64 in settings (bad for large files)
                };
            }).filter(Boolean);

            const projectData = {
                title: saveName,
                bpm: bpm,
                global_settings: { masterVolume: 1.0 }, // Example
                tracks_attributes: tracksAttributes
            };

            await projects.create(projectData);

            setMode('list');
            fetchProjects();
            setSaveName('');
        } catch (err) {
            setError('Failed to save project');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoad = async (project) => {
        try {
            // In a real app, we'd fetch the full project details including track URLs
            // const fullProject = await projects.get(project.id);
            // loadProject(fullProject); 
            console.log('Load project:', project);
            onClose();
        } catch (err) {
            setError('Failed to load project');
        }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this project?')) return;

        try {
            await projects.delete(id);
            fetchProjects();
        } catch (err) {
            setError('Failed to delete project');
        }
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
                    className="projects-modal"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <header className="projects-modal__header">
                        <h2>{mode === 'list' ? 'My Projects' : 'Save Project'}</h2>
                        <div className="header-actions">
                            {mode === 'list' && (
                                <button className="btn btn--primary" onClick={() => setMode('save')}>
                                    New Save
                                </button>
                            )}
                            {mode === 'save' && (
                                <button className="btn btn--secondary" onClick={() => setMode('list')}>
                                    Back
                                </button>
                            )}
                            <button className="projects-modal__close" onClick={onClose}>×</button>
                        </div>
                    </header>

                    <div className="projects-modal__body">
                        {error && <div className="error-message">{error}</div>}

                        {mode === 'list' ? (
                            <div className="project-list">
                                {isLoading ? (
                                    <div className="loading">Loading projects...</div>
                                ) : projectList.length === 0 ? (
                                    <div className="empty-state">No projects found. Create one!</div>
                                ) : (
                                    projectList.map(project => (
                                        <div
                                            key={project.id}
                                            className="project-item"
                                            onClick={() => handleLoad(project)}
                                        >
                                            <div className="project-info">
                                                <h3>{project.title}</h3>
                                                <span>{project.bpm} BPM • {new Date(project.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <button
                                                className="btn-delete"
                                                onClick={(e) => handleDelete(project.id, e)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : (
                            <form onSubmit={handleSave} className="save-form">
                                <label>Project Title</label>
                                <input
                                    type="text"
                                    value={saveName}
                                    onChange={(e) => setSaveName(e.target.value)}
                                    placeholder="My Awesome Loop"
                                    required
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    className="btn btn--primary btn--full"
                                    disabled={isLoading}
                                >
                                    {isLoading ? 'Saving...' : 'Save Project'}
                                </button>
                            </form>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default ProjectsModal;
