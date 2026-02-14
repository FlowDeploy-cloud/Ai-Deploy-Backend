const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT authentication middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired'
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
};

// API Key authentication middleware
const authenticateApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API key required'
            });
        }

        const user = await User.findByApiKey(apiKey);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
};

// Combined authentication (checks both token and API key)
const authenticate = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'];

    if (authHeader) {
        return authenticateToken(req, res, next);
    } else if (apiKey) {
        return authenticateApiKey(req, res, next);
    } else {
        return res.status(401).json({
            success: false,
            error: 'Authentication required (Bearer token or API key)'
        });
    }
};

// Optional authentication (doesn't fail if no auth provided)
const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'];

    if (!authHeader && !apiKey) {
        return next();
    }

    return authenticate(req, res, next);
};

module.exports = {
    authenticateToken,
    authenticateApiKey,
    authenticate,
    optionalAuth
};
