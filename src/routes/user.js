const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const { authenticate } = require('../middleware/auth');

const isValidEmail = (email = '') => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPhone = (value = '') => {
    return /^\+?[1-9]\d{7,14}$/.test(value);
};

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

        if (!['free', 'starter', 'growth', 'business', 'pro', 'enterprise'].includes(plan)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid plan. Must be free, starter, growth, business, pro, or enterprise'
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

router.get('/notification-settings', authenticate, async (req, res) => {
    const prefs = req.user.notification_preferences || {};

    res.json({
        success: true,
        data: {
            alert_email_enabled: !!prefs.alert_email_enabled,
            alert_email: prefs.alert_email || req.user.email || '',
            alert_whatsapp_enabled: !!prefs.alert_whatsapp_enabled,
            alert_whatsapp_number: prefs.alert_whatsapp_number || '',
            alert_whatsapp_provider: prefs.alert_whatsapp_provider || 'twilio',
            critical_only: prefs.critical_only !== false
        }
    });
});

router.put('/notification-settings', authenticate, async (req, res) => {
    try {
        const {
            alert_email_enabled,
            alert_email,
            alert_whatsapp_enabled,
            alert_whatsapp_number,
            alert_whatsapp_provider,
            critical_only
        } = req.body;

        const normalizedEmail = (alert_email || '').trim().toLowerCase();
        const normalizedPhone = (alert_whatsapp_number || '').trim();

        if (alert_email_enabled && !isValidEmail(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                error: 'Valid alert email is required when email alerts are enabled'
            });
        }

        if (alert_whatsapp_enabled && !isValidPhone(normalizedPhone.replace(/\s+/g, ''))) {
            return res.status(400).json({
                success: false,
                error: 'Valid WhatsApp number is required when WhatsApp alerts are enabled'
            });
        }

        const provider = ['twilio', '360dialog'].includes(alert_whatsapp_provider)
            ? alert_whatsapp_provider
            : 'twilio';

        const updated = await User.findByIdAndUpdate(
            req.user.id,
            {
                notification_preferences: {
                    alert_email_enabled: !!alert_email_enabled,
                    alert_email: normalizedEmail,
                    alert_whatsapp_enabled: !!alert_whatsapp_enabled,
                    alert_whatsapp_number: normalizedPhone,
                    alert_whatsapp_provider: provider,
                    critical_only: critical_only !== false
                }
            },
            { new: true }
        );

        res.json({
            success: true,
            message: 'Notification settings updated',
            data: updated.notification_preferences
        });
    } catch (error) {
        console.error('Update notification settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update notification settings'
        });
    }
});

router.get('/calendar-settings', authenticate, async (req, res) => {
    const prefs = req.user.calendar_preferences || {};

    res.json({
        success: true,
        data: {
            enabled: !!prefs.enabled,
            timezone: prefs.timezone || 'Asia/Kolkata',
            calendar_id: prefs.calendar_id || 'primary',
            daily_hour: Number.isInteger(prefs.daily_hour) ? prefs.daily_hour : 9,
            daily_minute: Number.isInteger(prefs.daily_minute) ? prefs.daily_minute : 0
        }
    });
});

router.put('/calendar-settings', authenticate, async (req, res) => {
    try {
        const {
            enabled,
            timezone,
            calendar_id,
            daily_hour,
            daily_minute
        } = req.body;

        const hour = Number.isInteger(daily_hour) ? daily_hour : 9;
        const minute = Number.isInteger(daily_minute) ? daily_minute : 0;

        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return res.status(400).json({
                success: false,
                error: 'Invalid calendar schedule time'
            });
        }

        const updated = await User.findByIdAndUpdate(
            req.user.id,
            {
                calendar_preferences: {
                    enabled: !!enabled,
                    timezone: (timezone || 'Asia/Kolkata').trim(),
                    calendar_id: (calendar_id || 'primary').trim(),
                    daily_hour: hour,
                    daily_minute: minute
                }
            },
            { new: true }
        );

        res.json({
            success: true,
            message: 'Calendar settings updated',
            data: updated.calendar_preferences
        });
    } catch (error) {
        console.error('Update calendar settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update calendar settings'
        });
    }
});

module.exports = router;
