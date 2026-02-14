const express = require('express');
const router = express.Router();
const Deployment = require('../models/Deployment');
const DeploymentService = require('../services/DeploymentService');
const { authenticate } = require('../middleware/auth');
const { validateDeployment, validateDeploymentId } = require('../middleware/validation');

const deploymentService = new DeploymentService();

// Create new deployment
router.post('/', authenticate, validateDeployment, async (req, res) => {
    try {
        const userId = req.user.id;
        const deploymentData = req.body;

        console.log(`📦 Starting deployment for user ${userId}`);

        // Start deployment asynchronously and get the deployment record
        const deploymentServiceInstance = new DeploymentService();
        
        // Create initial deployment record synchronously
        const Deployment = require('../models/Deployment');
        const SubdomainGenerator = require('../utils/SubdomainGenerator');
        const subdomainGenerator = new SubdomainGenerator();
        
        const existingDeployments = await Deployment.findByUserId(userId);
        const existingSubdomains = existingDeployments.map(d => d.subdomain);
        const subdomain = subdomainGenerator.generateUnique(existingSubdomains);

        const deployment = await Deployment.create({
            user_id: userId,
            name: deploymentData.name || `Deployment ${subdomain}`,
            subdomain,
            frontend_repo: deploymentData.frontend_repo,
            backend_repo: deploymentData.backend_repo,
            frontend_description: deploymentData.frontend_description,
            backend_description: deploymentData.backend_description,
            env_vars: deploymentData.env_vars || {},
            status: 'deploying'
        });

        console.log(`✅ Deployment record created: ${deployment.deployment_id}`);

        // Send immediate response with deployment info
        res.json({
            success: true,
            message: 'Deployment started',
            data: {
                deployment_id: deployment.deployment_id,
                name: deployment.name,
                subdomain: deployment.subdomain,
                status: 'deploying',
                message: 'Your deployment is in progress. Check deployment logs for updates.'
            }
        });

        // Deploy asynchronously
        deploymentServiceInstance.deploy(userId, {
            ...deploymentData,
            deployment_id: deployment.id
        }).catch(error => {
            console.error('Async deployment error:', error);
            // Update status to failed
            Deployment.updateStatus(deployment.id, 'failed').catch(console.error);
        });

    } catch (error) {
        console.error('Deployment initiation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to initiate deployment'
        });
    }
});

// Get all deployments for current user
router.get('/', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const deployments = await Deployment.findByUserId(userId, limit, offset);

        res.json({
            success: true,
            data: deployments,  // Return deployments array directly
            count: deployments.length
        });
    } catch (error) {
        console.error('Get deployments error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch deployments'
        });
    }
});

// Get specific deployment
router.get('/:id', authenticate, validateDeploymentId, async (req, res) => {
    try {
        const deploymentId = req.params.id;
        
        // Try to find by numeric ID first, then by deployment_id
        let deployment = await Deployment.findById(deploymentId);
        
        if (!deployment) {
            deployment = await Deployment.findByDeploymentId(deploymentId);
        }

        if (!deployment) {
            return res.status(404).json({
                success: false,
                error: 'Deployment not found'
            });
        }

        // Check ownership (convert both to strings for comparison)
        if (deployment.user_id.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Get status
        const statusInfo = await deploymentService.getDeploymentStatus(deployment.id);

        res.json({
            success: true,
            data: {
                deployment,
                status: statusInfo.status
            }
        });
    } catch (error) {
        console.error('Get deployment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch deployment'
        });
    }
});

// Stop deployment
router.post('/:id/stop', authenticate, validateDeploymentId, async (req, res) => {
    try {
        const deploymentId = req.params.id;
        
        let deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            deployment = await Deployment.findByDeploymentId(deploymentId);
        }

        if (!deployment) {
            return res.status(404).json({
                success: false,
                error: 'Deployment not found'
            });
        }

        // Check ownership (convert both to strings for comparison)
        if (deployment.user_id.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const result = await deploymentService.stopDeployment(deployment.id);

        res.json({
            success: result.success,
            message: result.success ? 'Deployment stopped successfully' : 'Failed to stop deployment',
            data: result
        });
    } catch (error) {
        console.error('Stop deployment error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to stop deployment'
        });
    }
});

// Restart deployment
router.post('/:id/restart', authenticate, validateDeploymentId, async (req, res) => {
    try {
        const deploymentId = req.params.id;
        
        let deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            deployment = await Deployment.findByDeploymentId(deploymentId);
        }

        if (!deployment) {
            return res.status(404).json({
                success: false,
                error: 'Deployment not found'
            });
        }

        // Check ownership (convert both to strings for comparison)
        if (deployment.user_id.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const result = await deploymentService.restartDeployment(deployment.id);

        res.json({
            success: result.success,
            message: result.success ? 'Deployment restarted successfully' : 'Failed to restart deployment',
            data: result
        });
    } catch (error) {
        console.error('Restart deployment error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to restart deployment'
        });
    }
});

// Delete deployment
router.delete('/:id', authenticate, validateDeploymentId, async (req, res) => {
    try {
        const deploymentId = req.params.id;
        
        let deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            deployment = await Deployment.findByDeploymentId(deploymentId);
        }

        if (!deployment) {
            return res.status(404).json({
                success: false,
                error: 'Deployment not found'
            });
        }

        // Check ownership (convert both to strings for comparison)
        if (deployment.user_id.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        await deploymentService.deleteDeployment(deployment.id);

        res.json({
            success: true,
            message: 'Deployment deleted successfully'
        });
    } catch (error) {
        console.error('Delete deployment error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete deployment'
        });
    }
});

// Get deployment logs
router.get('/:id/logs', authenticate, validateDeploymentId, async (req, res) => {
    try {
        const deploymentId = req.params.id;
        const lines = parseInt(req.query.lines) || 100;
        
        let deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            deployment = await Deployment.findByDeploymentId(deploymentId);
        }

        if (!deployment) {
            return res.status(404).json({
                success: false,
                error: 'Deployment not found'
            });
        }

        // Check ownership (convert both to strings for comparison)
        if (deployment.user_id.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const logs = await deploymentService.getDeploymentLogs(deployment.id, lines);

        res.json({
            success: true,
            data: {
                logs,
                deployment: {
                    id: deployment.deployment_id,
                    name: deployment.name,
                    status: deployment.status
                }
            }
        });
    } catch (error) {
        console.error('Get logs error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch logs'
        });
    }
});

// Get PM2 logs
router.get('/:id/pm2-logs', authenticate, validateDeploymentId, async (req, res) => {
    try {
        const deploymentId = req.params.id;
        const target = req.query.target || 'frontend'; // frontend or backend
        const lines = parseInt(req.query.lines) || 100;
        
        let deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            deployment = await Deployment.findByDeploymentId(deploymentId);
        }

        if (!deployment) {
            return res.status(404).json({
                success: false,
                error: 'Deployment not found'
            });
        }

        // Check ownership (convert both to strings for comparison)
        if (deployment.user_id.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const result = await deploymentService.getDeploymentPM2Logs(deployment.id, target, lines);

        res.json({
            success: result.success,
            data: {
                logs: result.logs,
                target
            }
        });
    } catch (error) {
        console.error('Get PM2 logs error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch PM2 logs'
        });
    }
});

// Verify deployment health
router.get('/:id/health', authenticate, validateDeploymentId, async (req, res) => {
    try {
        const deploymentId = req.params.id;
        
        let deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            deployment = await Deployment.findByDeploymentId(deploymentId);
        }

        if (!deployment) {
            return res.status(404).json({
                success: false,
                error: 'Deployment not found'
            });
        }

        // Check ownership (convert both to strings for comparison)
        if (deployment.user_id.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const health = {
            deployment_id: deployment.deployment_id,
            status: deployment.status,
            frontend: null,
            backend: null
        };

        // Check frontend
        if (deployment.pm2_frontend_name) {
            const frontendStatus = await deploymentService.clawdBot.checkDeploymentStatus(deployment.pm2_frontend_name);
            health.frontend = {
                name: deployment.pm2_frontend_name,
                port: deployment.frontend_port,
                url: deployment.frontend_url,
                ...frontendStatus
            };
        }

        // Check backend
        if (deployment.pm2_backend_name) {
            const backendStatus = await deploymentService.clawdBot.checkDeploymentStatus(deployment.pm2_backend_name);
            health.backend = {
                name: deployment.pm2_backend_name,
                port: deployment.backend_port,
                url: deployment.backend_url,
                ...backendStatus
            };
        }

        res.json({
            success: true,
            data: health
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to check deployment health'
        });
    }
});

module.exports = router;
