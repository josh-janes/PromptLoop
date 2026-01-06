/**
 * Auth Modal - Login and Signup
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../../stores/authStore';
import './AuthModal.css';

function AuthModal({ isOpen, onClose }) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const { login, signup, isLoading, error, clearError } = useAuthStore();

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        clearError();

        let success = false;
        if (isLogin) {
            success = await login(email, password);
        } else {
            if (password !== confirmPassword) {
                // We'll let the store handle error setting ideally, or set local error
                // For now, let's just try signup, server validates confirmation usually or we check here
                if (password !== confirmPassword) {
                    // manual error setting if store doesn't handle client validation
                }
            }
            success = await signup(email, password, confirmPassword);
        }

        if (success) {
            onClose();
            // Reset form
            setEmail('');
            setPassword('');
            setConfirmPassword('');
        }
    };

    const toggleMode = () => {
        setIsLogin(!isLogin);
        clearError();
        setPassword('');
        setConfirmPassword('');
    };

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
                    className="auth-modal"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <header className="auth-modal__header">
                        <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                        <button className="auth-modal__close" onClick={onClose}>×</button>
                    </header>

                    <form onSubmit={handleSubmit} className="auth-modal__form">
                        <div className="auth-modal__field">
                            <label>Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="you@example.com"
                            />
                        </div>

                        <div className="auth-modal__field">
                            <label>Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="••••••••"
                                minLength={6}
                            />
                        </div>

                        {!isLogin && (
                            <div className="auth-modal__field">
                                <label>Confirm Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    placeholder="••••••••"
                                    minLength={6}
                                />
                            </div>
                        )}

                        {error && (
                            <div className="auth-modal__error">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="btn btn--primary btn--full"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Processing...' : (isLogin ? 'Log In' : 'Sign Up')}
                        </button>
                    </form>

                    <div className="auth-modal__footer">
                        <p>
                            {isLogin ? "Don't have an account? " : "Already have an account? "}
                            <button className="btn--link" onClick={toggleMode}>
                                {isLogin ? 'Sign up' : 'Log in'}
                            </button>
                        </p>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default AuthModal;
