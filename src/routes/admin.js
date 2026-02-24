const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const Subscription = require('../models/Subscription');
const { authenticate } = require('../middleware/auth');

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // Check if user has admin role
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        next();
    } catch (error) {
        console.error('Admin authentication error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
};

// Get all users with their plans and stats
router.get('/users', authenticate, authenticateAdmin, async (req, res) => {
    try {
        const users = await User.find()
            .select('-password')
            .sort({ createdAt: -1 })
            .lean();

        // Enrich with subscription and deployment data
        const enrichedUsers = await Promise.all(users.map(async (user) => {
            // Get active subscription
            const subscription = await Subscription.findOne({ 
                user_id: user._id,
                status: { $in: ['active', 'created'] }
            }).sort({ createdAt: -1 });

            // Get deployment count
            const deploymentCount = await Deployment.countDocuments({ 
                user_id: user._id 
            });

            const activeDeployments = await Deployment.countDocuments({ 
                user_id: user._id,
                status: 'active'
            });

            return {
                id: user._id,
                username: user.username,
                email: user.email,
                plan: user.plan || 'free',
                github_username: user.github_username,
                avatar_url: user.avatar_url,
                auth_provider: user.auth_provider || 'local',
                subscription_status: subscription ? subscription.status : 'none',
                subscription_end: subscription ? subscription.current_end : null,
                total_deployments: deploymentCount,
                active_deployments: activeDeployments,
                created_at: user.createdAt,
                last_login: user.last_login,
                role: user.role || 'user'
            };
        }));

        res.json({
            success: true,
            data: {
                users: enrichedUsers,
                total: enrichedUsers.length
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users'
        });
    }
});

// Get dashboard statistics
router.get('/stats', authenticate, authenticateAdmin, async (req, res) => {
    try {
        // Total users
        const totalUsers = await User.countDocuments();
        
        // Users by plan
        const usersByPlan = await User.aggregate([
            {
                $group: {
                    _id: '$plan',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Active subscriptions
        const activeSubscriptions = await Subscription.countDocuments({ 
            status: 'active' 
        });

        // Total deployments
        const totalDeployments = await Deployment.countDocuments();
        
        // Active deployments
        const activeDeployments = await Deployment.countDocuments({ 
            status: 'active' 
        });

        // Failed deployments
        const failedDeployments = await Deployment.countDocuments({ 
            status: 'failed' 
        });

        res.json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    by_plan: usersByPlan
                },
                subscriptions: {
                    active: activeSubscriptions
                },
                deployments: {
                    total: totalDeployments,
                    active: activeDeployments,
                    failed: failedDeployments
                }
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics'
        });
    }
});

// Update user plan (admin only)
router.put('/users/:userId/plan', authenticate, authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { plan } = req.body;

        const validPlans = ['free', 'starter', 'growth', 'business', 'enterprise'];
        if (!validPlans.includes(plan)) {
            return res.status(400).json({
                success: false,
                error: `Invalid plan. Must be one of: ${validPlans.join(', ')}`
            });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { plan },
            { new: true }
        ).select('-password');

        res.json({
            success: true,
            message: 'User plan updated successfully',
            data: user
        });
    } catch (error) {
        console.error('Update user plan error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user plan'
        });
    }
});

module.exports = router;
