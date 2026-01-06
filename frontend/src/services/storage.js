/**
 * Storage Service - Local storage for projects and tracks using IndexedDB
 * Uses idb-keyval for simple key-value storage
 */

import { get, set, del, keys, clear } from 'idb-keyval';

const PROJECTS_KEY = 'live-guitar-projects';
const AUDIO_PREFIX = 'live-guitar-audio-';

/**
 * Generate a unique ID
 */
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Project data structure
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} title
 * @property {number} bpm
 * @property {Object} globalSettings
 * @property {Track[]} tracks
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Track data structure
 * @typedef {Object} Track
 * @property {string} id
 * @property {number} padIndex
 * @property {string} name
 * @property {'upload'|'recording'|'ai_generation'} sourceType
 * @property {string} audioId - Reference to stored audio blob
 * @property {Object} settings
 * @property {Object|null} promptHistory
 */

class StorageService {
    /**
     * Get all projects (metadata only, not audio)
     * @returns {Promise<Project[]>}
     */
    async getProjects() {
        const projects = await get(PROJECTS_KEY);
        return projects || [];
    }

    /**
     * Get a single project by ID
     * @param {string} projectId
     * @returns {Promise<Project|null>}
     */
    async getProject(projectId) {
        const projects = await this.getProjects();
        return projects.find(p => p.id === projectId) || null;
    }

    /**
     * Create a new project
     * @param {Partial<Project>} data
     * @returns {Promise<Project>}
     */
    async createProject(data = {}) {
        const projects = await this.getProjects();

        const project = {
            id: generateId(),
            title: data.title || 'Untitled Project',
            bpm: data.bpm || 120,
            globalSettings: data.globalSettings || {
                reverb: 0,
                swing: 0,
                masterVolume: 1
            },
            tracks: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        projects.push(project);
        await set(PROJECTS_KEY, projects);

        return project;
    }

    /**
     * Update a project
     * @param {string} projectId
     * @param {Partial<Project>} updates
     * @returns {Promise<Project>}
     */
    async updateProject(projectId, updates) {
        const projects = await this.getProjects();
        const index = projects.findIndex(p => p.id === projectId);

        if (index === -1) {
            throw new Error(`Project ${projectId} not found`);
        }

        projects[index] = {
            ...projects[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        await set(PROJECTS_KEY, projects);
        return projects[index];
    }

    /**
     * Delete a project and its audio
     * @param {string} projectId
     */
    async deleteProject(projectId) {
        const project = await this.getProject(projectId);

        if (project) {
            // Delete all audio for this project's tracks
            for (const track of project.tracks) {
                if (track.audioId) {
                    await del(AUDIO_PREFIX + track.audioId);
                }
            }
        }

        const projects = await this.getProjects();
        const filtered = projects.filter(p => p.id !== projectId);
        await set(PROJECTS_KEY, filtered);
    }

    /**
     * Save audio data for a track
     * @param {AudioBuffer} audioBuffer
     * @returns {Promise<string>} - Audio ID
     */
    async saveAudio(audioBuffer) {
        const audioId = generateId();

        // Convert AudioBuffer to storable format
        const audioData = {
            sampleRate: audioBuffer.sampleRate,
            numberOfChannels: audioBuffer.numberOfChannels,
            length: audioBuffer.length,
            channels: []
        };

        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            audioData.channels.push(Array.from(audioBuffer.getChannelData(i)));
        }

        await set(AUDIO_PREFIX + audioId, audioData);
        return audioId;
    }

    /**
     * Load audio data and convert to AudioBuffer
     * @param {string} audioId
     * @returns {Promise<AudioBuffer|null>}
     */
    async loadAudio(audioId) {
        const audioData = await get(AUDIO_PREFIX + audioId);

        if (!audioData) {
            return null;
        }

        // Convert back to AudioBuffer
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = audioContext.createBuffer(
            audioData.numberOfChannels,
            audioData.length,
            audioData.sampleRate
        );

        for (let i = 0; i < audioData.numberOfChannels; i++) {
            const channelData = new Float32Array(audioData.channels[i]);
            audioBuffer.copyToChannel(channelData, i);
        }

        return audioBuffer;
    }

    /**
     * Delete audio data
     * @param {string} audioId
     */
    async deleteAudio(audioId) {
        await del(AUDIO_PREFIX + audioId);
    }

    /**
     * Add a track to a project
     * @param {string} projectId
     * @param {Object} trackData
     * @returns {Promise<Track>}
     */
    async addTrack(projectId, trackData) {
        const project = await this.getProject(projectId);

        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        const track = {
            id: generateId(),
            padIndex: trackData.padIndex,
            name: trackData.name || `Pad ${trackData.padIndex + 1}`,
            sourceType: trackData.sourceType || 'upload',
            audioId: trackData.audioId,
            settings: trackData.settings || {
                volume: 1,
                pan: 0,
                muted: false,
                solo: false
            },
            promptHistory: trackData.promptHistory || null
        };

        project.tracks.push(track);
        await this.updateProject(projectId, { tracks: project.tracks });

        return track;
    }

    /**
     * Remove a track from a project
     * @param {string} projectId
     * @param {string} trackId
     */
    async removeTrack(projectId, trackId) {
        const project = await this.getProject(projectId);

        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        const track = project.tracks.find(t => t.id === trackId);

        if (track && track.audioId) {
            await this.deleteAudio(track.audioId);
        }

        project.tracks = project.tracks.filter(t => t.id !== trackId);
        await this.updateProject(projectId, { tracks: project.tracks });
    }

    /**
     * Clear all storage (for debugging)
     */
    async clearAll() {
        await clear();
    }

    /**
     * Get storage usage info
     * @returns {Promise<Object>}
     */
    async getStorageInfo() {
        const allKeys = await keys();
        const audioKeys = allKeys.filter(k => String(k).startsWith(AUDIO_PREFIX));

        return {
            projectCount: (await this.getProjects()).length,
            audioClipCount: audioKeys.length
        };
    }
}

// Export singleton
export const storage = new StorageService();
export default storage;
