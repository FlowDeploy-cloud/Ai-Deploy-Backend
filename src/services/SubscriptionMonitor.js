const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const DeploymentService = require('./DeploymentService');

class SubscriptionMonitor {
    constructor() {
        this.deploymentService = new DeploymentService();
        this.GRACE_PERIOD_DAYS = 7; // 7 days grace period before deletion
    }

    // Check and enforce subscription limits
    async checkExpiredSubscriptions() {
        try {
            console.log('🔍 Checking for expired subscriptions...');

            // Find all users with expired or no active subscriptions
            const users = await User.find({
                $or: [
                    { subscription_status: 'expired' },
                    { subscription_status: 'none', current_plan: 'free' }
                ]
            });

            for (const user of users) {
                await this.enforceSubscriptionLimits(user);
            }

            // Check for active subscriptions that have expired
            const activeSubscriptions = await Subscription.find({
                status: 'active',
                current_end: { $lt: new Date() }
            });

            for (const subscription of activeSubscriptions) {
                console.log(`⚠️ Subscription expired for user ${subscription.user_id}`);
                
                // Update subscription status
                await Subscription.updateStatus(subscription._id, 'expired');
                
                // Update user status
                await User.findByIdAndUpdate(subscription.user_id, {
                    subscription_status: 'expired'
                });

                // Enforce limits
                const user = await User.findById(subscription.user_id);
                if (user) {
                    await this.enforceSubscriptionLimits(user);
                }
            }

            console.log('✅ Subscription check completed');
        } catch (error) {
            console.error('❌ Error checking subscriptions:', error);
        }
    }

    // Enforce limits for users with expired or no plans
    async enforceSubscriptionLimits(user) {
        try {
            const deployments = await Deployment.find({ user_id: user._id });

            if (deployments.length === 0) {
                return;
            }

            // Free users can keep 1 deployment, others with expired plans: stop all but keep data
            const allowedDeployments = (user.current_plan === 'free') ? 1 : 0;

            for (let i = 0; i < deployments.length; i++) {
                const deployment = deployments[i];

                // If beyond allowed limit or expired paid plan
                if (i >= allowedDeployments || (user.subscription_status === 'expired' && user.current_plan !== 'free')) {
                    
                    // Stop the deployment if not already stopped
                    if (deployment.status !== 'stopped' && deployment.status !== 'suspended') {
                        console.log(`🛑 Stopping deployment ${deployment.deployment_id} for user ${user.username}`);
                        
                        try {
                            await this.deploymentService.stopDeployment(deployment._id);
                            
                            // Update to suspended status with warning
                            await Deployment.findByIdAndUpdate(deployment._id, {
                                status: 'suspended',
                                suspended_at: new Date(),
                                suspension_reason: user.subscription_status === 'expired' 
                                    ? 'subscription_expired' 
                                    : 'plan_limit_exceeded',
                                delete_scheduled_at: new Date(Date.now() + this.GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
                            });

                            console.log(`✅ Deployment ${deployment.deployment_id} suspended`);
                        } catch (error) {
                            console.error(`❌ Error stopping deployment ${deployment.deployment_id}:`, error);
                        }
                    }
                }
            }

            // Check for deployments past grace period and delete them
            await this.deleteExpiredDeployments(user._id);
        } catch (error) {
            console.error('❌ Error enforcing subscription limits:', error);
        }
    }

    // Delete deployments past grace period
    async deleteExpiredDeployments(userId) {
        try {
            const deploymentsToDelete = await Deployment.find({
                user_id: userId,
                status: 'suspended',
                delete_scheduled_at: { $lt: new Date() }
            });

            for (const deployment of deploymentsToDelete) {
                console.log(`🗑️ Deleting deployment ${deployment.deployment_id} - grace period expired`);
                
                try {
                    // Delete from PM2 and cleanup
                    await this.deploymentService.deleteDeployment(deployment._id);
                    console.log(`✅ Deployment ${deployment.deployment_id} permanently deleted`);
                } catch (error) {
                    console.error(`❌ Error deleting deployment ${deployment.deployment_id}:`, error);
                }
            }
        } catch (error) {
            console.error('❌ Error deleting expired deployments:', error);
        }
    }

    // Get warning info for a user
    async getUserWarnings(userId) {
        const user = await User.findById(userId);
        if (!user) {
            return null;
        }

        const deployments = await Deployment.find({ 
            user_id: userId,
            status: 'suspended'
        });

        const warnings = [];

        if (user.subscription_status === 'expired') {
            warnings.push({
                type: 'subscription_expired',
                severity: 'critical',
                message: 'Your subscription has expired. All deployments have been stopped.',
                action_required: 'Renew your subscription to restore services.',
                suspended_count: deployments.length
            });
        }

        for (const deployment of deployments) {
            if (deployment.delete_scheduled_at) {
                const daysLeft = Math.ceil((deployment.delete_scheduled_at - new Date()) / (1000 * 60 * 60 * 24));
                
                if (daysLeft > 0) {
                    warnings.push({
                        type: 'pending_deletion',
                        severity: 'critical',
                        deployment_id: deployment.deployment_id,
                        deployment_name: deployment.name,
                        message: `Deployment "${deployment.name}" will be permanently deleted in ${daysLeft} day${daysLeft > 1 ? 's' : ''}.`,
                        action_required: 'Upgrade your plan to prevent deletion.',
                        days_until_deletion: daysLeft
                    });
                }
            }
        }

        return {
            has_warnings: warnings.length > 0,
            user_status: user.subscription_status,
            current_plan: user.current_plan,
            warnings
        };
    }

    // Start monitoring (run every hour)
    startMonitoring() {
        console.log('🚀 Starting subscription monitoring service...');
        
        // Run immediately
        this.checkExpiredSubscriptions();

        // Then run every hour
        this.interval = setInterval(() => {
            this.checkExpiredSubscriptions();
        }, 60 * 60 * 1000); // Every hour

        console.log('✅ Subscription monitoring service started');
    }

    // Stop monitoring
    stopMonitoring() {
        if (this.interval) {
            clearInterval(this.interval);
            console.log('🛑 Subscription monitoring service stopped');
        }
    }
}

module.exports = SubscriptionMonitor;
