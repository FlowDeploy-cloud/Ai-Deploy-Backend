require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

// Import database
const { connectDB } = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const deployRoutes = require('./routes/deploy');
const userRoutes = require('./routes/user');

// Import services
const { getSSHManager } = require('./services/SSHManager');
const DeploymentService = require('./services/DeploymentService');
const { authenticate } = require('./middleware/auth');
const jwt = require('jsonwebtoken');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
    }
});

// Middleware - relaxed security for development
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'unsafe-none' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
}));

// CORS configuration - handle multiple origins
const allowedOrigins = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : '*';

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        
        // If wildcard, allow all
        if (allowedOrigins === '*') return callback(null, true);
        
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log(`[CORS] Blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        success: false,
        error: 'Too many requests, please try again later'
    }
});

app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'ClawDeploy SaaS Backend is running',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development'
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/deployments', deployRoutes);
app.use('/api/user', userRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to ClawDeploy SaaS Backend API',
        version: '1.0.0',
        documentation: '/api/docs',
        endpoints: {
            auth: {
                signup: 'POST /api/auth/signup',
                login: 'POST /api/auth/login',
                profile: 'GET /api/auth/profile'
            },
            deployments: {
                create: 'POST /api/deployments',
                list: 'GET /api/deployments',
                get: 'GET /api/deployments/:id',
                stop: 'POST /api/deployments/:id/stop',
                restart: 'POST /api/deployments/:id/restart',
                delete: 'DELETE /api/deployments/:id',
                logs: 'GET /api/deployments/:id/logs'
            },
            user: {
                stats: 'GET /api/user/stats',
                plan: 'POST /api/user/plan'
            }
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// WebSocket authentication middleware
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error('Authentication error: Token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        next();
    } catch (error) {
        next(new Error('Authentication error: Invalid token'));
    }
});

// WebSocket connection handler
io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id} (User: ${socket.userId})`);

    // Join user room for broadcasting
    socket.join(`user_${socket.userId}`);
    console.log(`📡 User ${socket.userId} joined room user_${socket.userId}`);

    // Handle deployment request via WebSocket
    socket.on('deploy', async (data) => {
        try {
            console.log(`📦 Deployment request from user ${socket.userId}`);
            
            const deploymentService = new DeploymentService();
            
            // Log callback that emits to socket
            const onLog = (message, type) => {
                socket.emit('log', {
                    message,
                    type,
                    timestamp: new Date().toISOString()
                });
            };

            // Start deployment
            socket.emit('log', {
                message: '🚀 Starting deployment...',
                type: 'info',
                timestamp: new Date().toISOString()
            });

            const result = await deploymentService.deploy(socket.userId, data, onLog);

            if (result.success) {
                const deployment = result.deployment;
                
                // Build success message with port information
                let successMessage = '\u2705 Deployment completed successfully!';
                if (deployment.frontend_url) {
                    successMessage += `\n\n\ud83c\udf10 Frontend: ${deployment.frontend_url}`;
                    if (deployment.frontend_allocated_port && deployment.frontend_actual_port) {
                        if (deployment.frontend_allocated_port !== deployment.frontend_actual_port) {
                            successMessage += `\n   \ud83d\udd0c Port: ${deployment.frontend_actual_port} (allocated: ${deployment.frontend_allocated_port})`;
                        } else {
                            successMessage += `\n   \ud83d\udd0c Port: ${deployment.frontend_actual_port}`;
                        }
                    }
                }
                if (deployment.backend_url) {
                    successMessage += `\n\n\ud83d\udee0\ufe0f Backend: ${deployment.backend_url}`;
                    if (deployment.backend_allocated_port && deployment.backend_actual_port) {
                        if (deployment.backend_allocated_port !== deployment.backend_actual_port) {
                            successMessage += `\n   \ud83d\udd0c Port: ${deployment.backend_actual_port} (allocated: ${deployment.backend_allocated_port})`;
                        } else {
                            successMessage += `\n   \ud83d\udd0c Port: ${deployment.backend_actual_port}`;
                        }
                    }
                }

                // Emit completion event
                socket.emit('deployment_complete', {
                    success: true,
                    deployment: deployment,
                    message: successMessage
                });

                // Emit status event for compatibility
                socket.emit('status', {
                    type: 'status',
                    status: 'deployed',
                    url: deployment.frontend_url || deployment.backend_url,
                    deployment: deployment
                });
            } else {
                socket.emit('deployment_failed', {
                    success: false,
                    error: 'Deployment failed',
                    details: result
                });

                // Emit status event for compatibility
                socket.emit('status', {
                    type: 'status',
                    status: 'failed',
                    error: result.error || 'Deployment failed'
                });
            }

        } catch (error) {
            console.error('WebSocket deployment error:', error);
            socket.emit('deployment_failed', {
                success: false,
                error: error.message
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });

    // Handle errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Initialize SSH connection on startup
const initializeSSH = async () => {
    try {
        const sshManager = getSSHManager();
        await sshManager.connect();
        console.log('✅ SSH connection initialized');
    } catch (error) {
        console.error('❌ SSH initialization failed:', error.message);
        console.log('⚠️  Server will start but SSH features may not work');
    }
};

// Database is already connected in connectDB() call above
// No need for separate test function with Mongoose

// Make io available globally for services
global.io = io;

// Start server
const PORT = process.env.PORT || 4000;

const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();
        
        // Initialize SSH
        await initializeSSH();

        // Start HTTP server
        server.listen(PORT, () => {
            console.log('');
            console.log('🚀 ================================');
            console.log('🚀 ClawDeploy SaaS Backend Started');
            console.log('🚀 ================================');
            console.log(`🌐 Server running on port: ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🌐 URL: http://localhost:${PORT}`);
            console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
            console.log(`💾 Database: MongoDB`);
            console.log(`🔐 SSH Host: ${process.env.SSH_HOST}`);
            console.log(`🌍 Base Domain: ${process.env.BASE_DOMAIN}`);
            console.log('🚀 ================================');
            console.log('');
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing server gracefully...');
    
    // Close SSH connection
    const sshManager = getSSHManager();
    await sshManager.disconnect();
    
    // Close MongoDB connection
    await mongoose.connection.close();
    
    // Close server
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing server gracefully...');
    
    // Close SSH connection
    const sshManager = getSSHManager();
    await sshManager.disconnect();
    
    // Close MongoDB connection
    await mongoose.connection.close();
    
    // Close server
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();

module.exports = { app, server, io };
