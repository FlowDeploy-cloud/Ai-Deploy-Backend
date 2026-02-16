const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validateRegistration, validateLogin } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const githubService = require('../services/GithubService');

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

// GitHub OAuth - Get authorization URL
router.get('/github/url', (req, res) => {
    try {
        const authUrl = githubService.getAuthorizationUrl();
        res.json({
            success: true,
            data: { url: authUrl }
        });
    } catch (error) {
        console.error('GitHub auth URL error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate GitHub authorization URL'
        });
    }
});

// GitHub OAuth - Callback handler
router.post('/github/callback', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { code } = req.body;

        // Validate code parameter
        if (!code || typeof code !== 'string' || code.trim() === '') {
            console.error('❌ GitHub callback: Missing or invalid authorization code');
            return res.status(400).json({
                success: false,
                error: 'Authorization code is required'
            });
        }

        console.log('🔐 GitHub OAuth callback initiated');
        console.log('📋 Code received:', code.substring(0, 8) + '...');

        // Step 1: Exchange code for access token
        let accessToken;
        try {
            accessToken = await githubService.getAccessToken(code);
            
            if (!accessToken) {
                throw new Error('No access token returned from GitHub');
            }
        } catch (tokenError) {
            console.error('❌ Token exchange failed:', tokenError.message);
            
            // Return user-friendly error
            return res.status(400).json({
                success: false,
                error: tokenError.message || 'Failed to authenticate with GitHub'
            });
        }

        // Step 2: Fetch user info from GitHub
        let githubUser;
        try {
            githubUser = await githubService.getUserInfo(accessToken);
            console.log('✅ GitHub user authenticated:', githubUser.username);
        } catch (userError) {
            console.error('❌ Failed to fetch user info:', userError.message);
            
            return res.status(500).json({
                success: false,
                error: userError.message || 'Failed to fetch user information'
            });
        }

        // Step 3: Create/update user in database
        let user;
        try {
            user = await User.findOrCreateGithubUser({
                githubId: githubUser.githubId,
                username: githubUser.username,
                email: githubUser.email,
                accessToken: accessToken,
                avatarUrl: githubUser.avatarUrl
            });
            
            if (!user) {
                throw new Error('Failed to create user in database');
            }
            
            console.log('✅ User persisted in database:', user.username);
        } catch (dbError) {
            console.error('❌ Database error:', dbError.message);
            
            return res.status(500).json({
                success: false,
                error: 'Failed to create user account'
            });
        }

        // Step 4: Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRATION || '7d' }
        );

        const duration = Date.now() - startTime;
        console.log(`✅ GitHub OAuth completed successfully in ${duration}ms`);

        // Return success response
        return res.json({
            success: true,
            message: 'GitHub authentication successful',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    plan: user.plan,
                    max_deployments: user.max_deployments,
                    api_key: user.api_key,
                    github_username: user.github_username,
                    avatar_url: user.avatar_url,
                    auth_provider: user.auth_provider
                },
                token
            }
        });
        
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ GitHub OAuth failed after ${duration}ms`);
        console.error('Error details:', error.message);
        
        // Generic error response (don't expose internal details)
        return res.status(500).json({
            success: false,
            error: 'Authentication failed. Please try again.'
        });
    }
});

// Get user's GitHub repositories
router.get('/github/repos', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user.github_access_token) {
            return res.status(400).json({
                success: false,
                error: 'User is not authenticated with GitHub'
            });
        }

        const repositories = await githubService.getUserRepositories(user.github_access_token);

        res.json({
            success: true,
            data: {
                repositories,
                message: 'Private repositories coming soon!'
            }
        });
    } catch (error) {
        console.error('GitHub repos error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch GitHub repositories'
        });
    }
});

// Get repository details
router.get('/github/repos/:owner/:repo', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const { owner, repo } = req.params;

        if (!user.github_access_token) {
            return res.status(400).json({
                success: false,
                error: 'User is not authenticated with GitHub'
            });
        }

        const repoDetails = await githubService.getRepositoryDetails(user.github_access_token, owner, repo);

        res.json({
            success: true,
            data: repoDetails
        });
    } catch (error) {
        console.error('GitHub repo details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch repository details'
        });
    }
});

module.exports = router;
