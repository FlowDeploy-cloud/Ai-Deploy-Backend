const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const { authenticateInternal } = require('../middleware/internalAuth');

const buildDateRange = (inputDate) => {
    const baseDate = inputDate ? new Date(inputDate) : new Date();
    const date = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return { start, end };
};

router.get('/daily-calendar-activities', authenticateInternal, async (req, res) => {
    try {
        const { date } = req.query;
        const { start, end } = buildDateRange(date);

        const users = await User.find({
            'calendar_preferences.enabled': true
        }).select('username email calendar_preferences notification_preferences');

        const activities = [];

        for (const user of users) {
            const [createdToday, totalActive] = await Promise.all([
                Deployment.countDocuments({
                    user_id: user._id,
                    createdAt: { $gte: start, $lte: end }
                }),
                Deployment.countDocuments({
                    user_id: user._id,
                    status: { $in: ['deploying', 'deployed', 'stopped'] }
                })
            ]);

            const timezone = user.calendar_preferences?.timezone || 'Asia/Kolkata';
            const eventHour = user.calendar_preferences?.daily_hour ?? 9;
            const eventMinute = user.calendar_preferences?.daily_minute ?? 0;
            const calendarId = user.calendar_preferences?.calendar_id || 'primary';

            const eventStart = new Date(start);
            eventStart.setHours(eventHour, eventMinute, 0, 0);

            const eventEnd = new Date(eventStart);
            eventEnd.setMinutes(eventEnd.getMinutes() + 30);

            activities.push({
                user_id: user.id,
                username: user.username,
                email: user.email,
                timezone,
                calendar_id: calendarId,
                notifications: {
                    email_enabled: !!user.notification_preferences?.alert_email_enabled,
                    whatsapp_enabled: !!user.notification_preferences?.alert_whatsapp_enabled
                },
                event: {
                    title: `DeployEase Daily Activity - ${user.username}`,
                    description: `Daily deployment summary for ${user.username}. New deployments today: ${createdToday}. Total active deployments: ${totalActive}.`,
                    start: eventStart.toISOString(),
                    end: eventEnd.toISOString()
                },
                metrics: {
                    created_today: createdToday,
                    active_deployments: totalActive
                }
            });
        }

        res.json({
            success: true,
            date: start.toISOString().slice(0, 10),
            count: activities.length,
            data: activities
        });
    } catch (error) {
        console.error('Daily calendar activity feed error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate daily calendar activity feed'
        });
    }
});

module.exports = router;
