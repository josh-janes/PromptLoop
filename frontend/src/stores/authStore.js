/**
 * Auth Store - Manages user authentication state
 */

import { create } from 'zustand';
import { auth } from '../services/api';

const useAuthStore = create((set, get) => ({
    user: JSON.parse(localStorage.getItem('user')) || null,
    token: localStorage.getItem('auth_token') || null,
    isAuthenticated: !!localStorage.getItem('auth_token'),
    isLoading: false,
    error: null,

    login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
            const data = await auth.login(email, password);
            const { token, user } = data;

            localStorage.setItem('auth_token', token);
            localStorage.setItem('user', JSON.stringify(user));

            set({
                user,
                token,
                isAuthenticated: true,
                isLoading: false
            });
            return true;
        } catch (error) {
            set({
                error: error.response?.data?.error || 'Login failed',
                isLoading: false
            });
            return false;
        }
    },

    signup: async (email, password, passwordConfirmation) => {
        set({ isLoading: true, error: null });
        try {
            const data = await auth.signup(email, password, passwordConfirmation);
            const { token, user } = data;

            localStorage.setItem('auth_token', token);
            localStorage.setItem('user', JSON.stringify(user));

            set({
                user,
                token,
                isAuthenticated: true,
                isLoading: false
            });
            return true;
        } catch (error) {
            let errorMsg = 'Signup failed';
            if (error.response?.data?.errors) {
                errorMsg = Object.entries(error.response.data.errors)
                    .map(([key, msgs]) => `${key} ${msgs.join(', ')}`)
                    .join('. ');
            }
            set({
                error: errorMsg,
                isLoading: false
            });
            return false;
        }
    },

    logout: () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        set({
            user: null,
            token: null,
            isAuthenticated: false
        });
    },

    clearError: () => set({ error: null })
}));

export default useAuthStore;
