const axios = require('axios');
const User = require('../models/User');

class AutomationService {
    constructor() {
        this.enabled = process.env.N8N_ENABLED === 'true';
        this.criticalAlertWebhook = process.env.N8N_CRITICAL_ALERT_WEBHOOK_URL;
        this.webhookSecret = process.env.N8N_WEBHOOK_SHARED_SECRET;
    }

    isEnabled() {
        return this.enabled && !!this.criticalAlertWebhook;
    }

    async sendEventAlert({
        userId,
        eventType,
        title,
        message,
        severity = 'critical',
        metadata = {}
    }) {
        if (!this.isEnabled() || !userId) {
            return;
        }

        try {
            const user = await User.findById(userId);
            if (!user) {
                return;
            }

            const preferences = user.notification_preferences || {};
            const emailEnabled = !!preferences.alert_email_enabled;
            const whatsappEnabled = !!preferences.alert_whatsapp_enabled;

            if (!emailEnabled && !whatsappEnabled) {
                return;
            }

            const payload = {
                event_type: eventType,
                severity,
                title,
                message,
                timestamp: new Date().toISOString(),
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                },
                channels: {
                    email: {
                        enabled: emailEnabled,
                        to: preferences.alert_email || user.email
                    },
                    whatsapp: {
                        enabled: whatsappEnabled,
                        provider: preferences.alert_whatsapp_provider || 'twilio',
                        to: preferences.alert_whatsapp_number || ''
                    }
                },
                twilio: {
                    account_sid: process.env.TWILIO_ACCOUNT_SID || '',
                    whatsapp_from: process.env.TWILIO_WHATSAPP_FROM || '',
                    messaging_service_sid: process.env.TWILIO_MESSAGING_SERVICE_SID || ''
                },
                metadata
            };

            await axios.post(this.criticalAlertWebhook, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-webhook-secret': this.webhookSecret || ''
                },
                timeout: 8000
            });
        } catch (error) {
            console.error('Failed to send critical alert webhook:', error.message);
        }
    }

    async sendCriticalAlert(params) {
        return this.sendEventAlert({
            ...params,
            severity: params?.severity || 'critical'
        });
    }

    async sendDeploymentSuccess({ userId, deployment }) {
        if (!deployment) return;

        const urls = [deployment.frontend_url, deployment.backend_url].filter(Boolean);
        const urlText = urls.length > 0 ? urls.join(' | ') : 'URLs not available';

        return this.sendEventAlert({
            userId,
            eventType: 'deployment_success',
            title: 'Deployment Successful',
            message: `Deployment ${deployment.name || deployment.deployment_id} is live. Access URL(s): ${urlText}`,
            severity: 'info',
            metadata: {
                deployment_id: deployment.deployment_id,
                deployment_name: deployment.name,
                frontend_url: deployment.frontend_url || '',
                backend_url: deployment.backend_url || '',
                status: deployment.status
            }
        });
    }
}

module.exports = AutomationService;
