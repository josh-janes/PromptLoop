/**
 * API Service
 * Handles communication with the Rails backend
 */

import axios from 'axios';

// Get API URL from env or default to localhost
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

// Create Axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add interceptor to inject JWT token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// API Methods
export const auth = {
    login: async (email, password) => {
        const response = await api.post('/login', { email, password });
        return response.data;
    },
    signup: async (email, password, passwordConfirmation) => {
        const response = await api.post('/signup', {
            user: {
                email,
                password,
                password_confirmation: passwordConfirmation
            }
        });
        return response.data;
    },
    me: async () => {
        const response = await api.get('/me');
        return response.data;
    }
};

export const projects = {
    getAll: async () => {
        const response = await api.get('/projects');
        return response.data;
    },
    get: async (id) => {
        const response = await api.get(`/projects/${id}`);
        return response.data;
    },
    create: async (projectData) => {
        const response = await api.post('/projects', { project: projectData });
        return response.data;
    },
    update: async (id, projectData) => {
        const response = await api.put(`/projects/${id}`, { project: projectData });
        return response.data;
    },
    delete: async (id) => {
        const response = await api.delete(`/projects/${id}`);
        return response.data;
    }
};

export const tracks = {
    generate: async (projectId, prompt, duration) => {
        const response = await api.post(`/projects/${projectId}/generate_track`, {
            prompt,
            duration
        });
        return response.data;
    }
};

export default api;
