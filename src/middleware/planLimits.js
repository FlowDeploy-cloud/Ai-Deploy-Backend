const Subscription = require('../models/Subscription');
const Deployment = require('../models/Deployment');

// Check if user has reached deployment limits
const checkDeploymentLimits = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Get user's active subscription
        const subscription = await Subscription.findByUserId(userId);

        // If no subscription or expired, block all deployments (free plan)
        if (!subscription || !subscription.isActive()) {
            return res.status(403).json({
                success: false,
                error: 'Subscription required',
                message: 'Free plan does not support deployments. Please upgrade to a paid plan to deploy your projects.',
                requiresUpgrade: true
            });
        }

        // Use subscription limits
        let limits = {
            max_frontend: 0,
            max_backend: 0
        };

        if (subscription && subscription.isActive()) {
            limits = subscription.limits;
        }

        // Count current deployments
        const deployments = await Deployment.findByUserId(userId);
        
        let frontendCount = 0;
        let backendCount = 0;

        deployments.forEach(deployment => {
            if (deployment.frontend_repo) frontendCount++;
            if (deployment.backend_repo) backendCount++;
        });

        // Check if user is trying to deploy
        const { frontend_repo, backend_repo } = req.body;

        if (frontend_repo && frontendCount >= limits.max_frontend) {
            return res.status(403).json({
                success: false,
                error: 'Frontend deployment limit reached',
                message: `Your plan allows ${limits.max_frontend} frontend deployment(s). Please upgrade your plan.`,
                limits: {
                    max_frontend: limits.max_frontend,
                    current_frontend: frontendCount,
                    max_backend: limits.max_backend,
                    current_backend: backendCount
                }
            });
        }

        if (backend_repo && backendCount >= limits.max_backend) {
            return res.status(403).json({
                success: false,
                error: 'Backend deployment limit reached',
                message: `Your plan allows ${limits.max_backend} backend deployment(s). Please upgrade your plan.`,
                limits: {
                    max_frontend: limits.max_frontend,
                    current_frontend: frontendCount,
                    max_backend: limits.max_backend,
                    current_backend: backendCount
                }
            });
        }

        // Attach limits to request for reference
        req.planLimits = limits;
        req.currentUsage = {
            frontend: frontendCount,
            backend: backendCount
        };

        next();
    } catch (error) {
        console.error('Error checking deployment limits:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check deployment limits'
        });
    }
};

// Check if user has access to a feature
const checkFeatureAccess = (featureName) => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;

            // Get user's active subscription
            const subscription = await Subscription.findByUserId(userId);

            // If no subscription or expired, deny access to premium features
            if (!subscription || !subscription.isActive()) {
                return res.status(403).json({
                    success: false,
                    error: 'Feature not available',
                    message: 'This feature requires an active subscription. Please upgrade your plan.'
                });
            }

            // Check if subscription includes the feature
            if (!subscription.limits.features.includes(featureName)) {
                return res.status(403).json({
                    success: false,
                    error: 'Feature not available in your plan',
                    message: `The ${featureName} feature is not available in your current plan. Please upgrade.`
                });
            }

            next();
        } catch (error) {
            console.error('Error checking feature access:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to check feature access'
            });
        }
    };
};

// Middleware to check if subscription is expired
const checkSubscriptionStatus = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Get user's active subscription
        const subscription = await Subscription.findByUserId(userId);

        if (subscription && subscription.isExpired()) {
            // Update status to expired
            subscription.status = 'expired';
            await subscription.save();

            return res.status(403).json({
                success: false,
                error: 'Subscription expired',
                message: 'Your subscription has expired. Please renew to continue.'
            });
        }

        next();
    } catch (error) {
        console.error('Error checking subscription status:', error);
        next(); // Continue even if check fails
    }
};

module.exports = {
    checkDeploymentLimits,
    checkFeatureAccess,
    checkSubscriptionStatus
};
