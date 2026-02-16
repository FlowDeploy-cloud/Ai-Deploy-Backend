const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const SubscriptionMonitor = require('../services/SubscriptionMonitor');

const subscriptionMonitor = new SubscriptionMonitor();

// Get user's subscription warnings
router.get('/warnings', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const warnings = await subscriptionMonitor.getUserWarnings(userId);

        if (!warnings) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            data: warnings
        });
    } catch (error) {
        console.error('Error fetching warnings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch warnings'
        });
    }
});

module.exports = router;
