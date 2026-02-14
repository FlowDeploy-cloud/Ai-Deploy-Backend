const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validateRegistration, validateLogin } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');

// Register new user
router.post('/signup', validateRegistration, async (req, res) => {
    try {
        const { username, email, password, plan = 'free' } = req.body;

        // Create user
        const user = await User.create({ username, email, password, plan });

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRATION || '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    plan: user.plan,
                    max_deployments: user.max_deployments,
                    api_key: user.api_key
                },
                token
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        
        if (error.message.includes('already exists')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to register user'
        });
    }
});

// Login
router.post('/login', validateLogin, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await User.findByEmail(email);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Verify password
        const validPassword = await User.verifyPassword(user, password);
        
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRATION || '7d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    plan: user.plan,
                    max_deployments: user.max_deployments,
                    api_key: user.api_key
                },
                token
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

// Get current user profile
router.get('/profile', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const deploymentCount = await User.getDeploymentCount(user.id);

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    plan: user.plan,
                    max_deployments: user.max_deployments,
                    api_key: user.api_key,
                    created_at: user.created_at
                },
                deploymentCount
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get profile'
        });
    }
});

// Regenerate API key
router.post('/regenerate-api-key', authenticate, async (req, res) => {
    try {
        const newApiKey = await User.regenerateApiKey(req.user.id);

        res.json({
            success: true,
            message: 'API key regenerated successfully',
            data: {
                api_key: newApiKey
            }
        });
    } catch (error) {
        console.error('API key regeneration error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to regenerate API key'
        });
    }
});

// Change password
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({
                success: false,
                error: 'Current password and new password are required'
            });
        }

        // Verify current password
        const user = await User.findById(req.user.id);
        const validPassword = await User.verifyPassword(user, current_password);

        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Current password is incorrect'
            });
        }

        // Update password
        await User.updatePassword(req.user.id, new_password);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to change password'
        });
    }
});

module.exports = router;
