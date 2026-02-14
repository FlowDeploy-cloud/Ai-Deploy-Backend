const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const { authenticate } = require('../middleware/auth');

// Get user stats
router.get('/stats', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const deploymentCount = await User.getDeploymentCount(userId);
        const deployments = await Deployment.findByUserId(userId);

        const stats = {
            total_deployments: deploymentCount,
            max_deployments: req.user.max_deployments,
            remaining_deployments: req.user.max_deployments - deploymentCount,
            deployed: deployments.filter(d => d.status === 'deployed').length,
            deploying: deployments.filter(d => d.status === 'deploying').length,
            failed: deployments.filter(d => d.status === 'failed').length,
            stopped: deployments.filter(d => d.status === 'stopped').length
        };

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch stats'
        });
    }
});

// Update user plan
router.post('/plan', authenticate, async (req, res) => {
    try {
        const { plan } = req.body;

        if (!['free', 'pro', 'enterprise'].includes(plan)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid plan. Must be free, pro, or enterprise'
            });
        }

        const updatedUser = await User.updatePlan(req.user.id, plan);

        res.json({
            success: true,
            message: 'Plan updated successfully',
            data: updatedUser
        });
    } catch (error) {
        console.error('Update plan error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update plan'
        });
    }
});

module.exports = router;
