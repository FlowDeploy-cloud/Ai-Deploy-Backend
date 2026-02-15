const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getRazorpayService, PLANS } = require('../services/RazorpayService');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const User = require('../models/User');

const razorpayService = getRazorpayService();

// Get all available plans
router.get('/plans', (req, res) => {
    try {
        const plans = razorpayService.getAllPlans();
        res.json({
            success: true,
            plans: plans.map(plan => ({
                id: plan.id,
                name: plan.name,
                price: plan.price / 100, // Convert to rupees for display
                currency: plan.currency,
                period: plan.period,
                limits: plan.limits
            }))
        });
    } catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch plans'
        });
    }
});

// Create payment order (with server-side price verification)
router.post('/create-order', authenticate, async (req, res) => {
    try {
        const { plan_id } = req.body;
        const userId = req.user.id;

        if (!plan_id) {
            return res.status(400).json({
                success: false,
                error: 'Plan ID is required'
            });
        }

        // Verify plan exists (server-side)
        const plan = razorpayService.getPlan(plan_id);
        if (!plan) {
            return res.status(400).json({
                success: false,
                error: 'Invalid plan'
            });
        }

        // Get user details
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Create Razorpay order with server-verified amount
        const { order, plan: verifiedPlan } = await razorpayService.createOrder(
            plan_id,
            userId,
            user.email
        );

        // Save payment record
        await Payment.createPayment({
            user_id: userId,
            razorpay_order_id: order.id,
            amount: verifiedPlan.price,
            currency: verifiedPlan.currency,
            status: 'created',
            description: `Payment for ${verifiedPlan.name}`
        });

        res.json({
            success: true,
            order_id: order.id,
            amount: verifiedPlan.price,
            currency: verifiedPlan.currency,
            key_id: process.env.RAZORPAY_KEY_ID,
            plan: {
                id: verifiedPlan.id,
                name: verifiedPlan.name,
                limits: verifiedPlan.limits
            }
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create order'
        });
    }
});

// Verify payment and activate subscription
router.post('/verify-payment', authenticate, async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            plan_id
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        // CRITICAL: Verify signature to prevent tampering
        const isValid = razorpayService.verifyPaymentSignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (!isValid) {
            return res.status(400).json({
                success: false,
                error: 'Invalid payment signature'
            });
        }

        // Get payment record
        const payment = await Payment.findByOrderId(razorpay_order_id);
        if (!payment) {
            return res.status(404).json({
                success: false,
                error: 'Payment record not found'
            });
        }

        // Verify user owns this payment
        if (payment.user_id.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        // Get plan details (server-side verification)
        const plan = razorpayService.getPlan(plan_id);

        // Verify amount matches plan (prevent tampering)
        if (payment.amount !== plan.price) {
            return res.status(400).json({
                success: false,
                error: 'Price tampering detected'
            });
        }

        // Update payment status
        await Payment.updatePaymentStatus(razorpay_order_id, {
            razorpay_payment_id,
            razorpay_signature,
            status: 'captured',
            payment_method: 'razorpay'
        });

        // Create or update subscription
        const currentDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1); // 1 month from now

        let subscription = await Subscription.findByUserId(req.user.id);
        
        if (subscription) {
            // Update existing subscription
            subscription.plan_id = plan.id;
            subscription.plan_name = plan.name;
            subscription.amount = plan.price;
            subscription.status = 'active';
            subscription.current_start = currentDate;
            subscription.current_end = endDate;
            subscription.next_billing_date = endDate;
            subscription.limits = plan.limits;
            await subscription.save();
        } else {
            // Create new subscription
            subscription = await Subscription.createSubscription({
                user_id: req.user.id,
                plan_id: plan.id,
                plan_name: plan.name,
                amount: plan.price,
                currency: plan.currency,
                status: 'active',
                current_start: currentDate,
                current_end: endDate,
                next_billing_date: endDate,
                limits: plan.limits
            });
        }

        // Update user plan
        await User.findByIdAndUpdate(req.user.id, {
            plan: plan.id,
            max_deployments: plan.limits.max_frontend + plan.limits.max_backend
        });

        res.json({
            success: true,
            message: 'Payment verified and subscription activated',
            subscription: {
                plan: plan.name,
                status: subscription.status,
                current_end: subscription.current_end,
                limits: subscription.limits
            }
        });
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Payment verification failed'
        });
    }
});

// Get current subscription
router.get('/subscription', authenticate, async (req, res) => {
    try {
        const subscription = await Subscription.findByUserId(req.user.id);
        
        if (!subscription) {
            return res.json({
                success: true,
                subscription: null,
                message: 'No active subscription'
            });
        }

        // Check if expired
        if (subscription.isExpired()) {
            subscription.status = 'expired';
            await subscription.save();
        }

        res.json({
            success: true,
            subscription: {
                plan_id: subscription.plan_id,
                plan_name: subscription.plan_name,
                status: subscription.status,
                current_start: subscription.current_start,
                current_end: subscription.current_end,
                next_billing_date: subscription.next_billing_date,
                limits: subscription.limits,
                is_active: subscription.isActive()
            }
        });
    } catch (error) {
        console.error('Error fetching subscription:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch subscription'
        });
    }
});

// Get payment history
router.get('/payments', authenticate, async (req, res) => {
    try {
        const payments = await Payment.find({ user_id: req.user.id })
            .sort({ createdAt: -1 })
            .limit(50);

        res.json({
            success: true,
            payments: payments.map(payment => ({
                id: payment._id,
                amount: payment.amount / 100, // Convert to rupees
                currency: payment.currency,
                status: payment.status,
                payment_method: payment.payment_method,
                description: payment.description,
                createdAt: payment.createdAt
            }))
        });
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payments'
        });
    }
});

// Cancel subscription
router.post('/subscription/cancel', authenticate, async (req, res) => {
    try {
        const subscription = await Subscription.findByUserId(req.user.id);
        
        if (!subscription) {
            return res.status(404).json({
                success: false,
                error: 'No active subscription found'
            });
        }

        // If Razorpay subscription exists, cancel it
        if (subscription.razorpay_subscription_id) {
            await razorpayService.cancelSubscription(subscription.razorpay_subscription_id, true);
        }

        // Update local subscription
        subscription.status = 'cancelled';
        subscription.cancelled_at = new Date();
        await subscription.save();

        res.json({
            success: true,
            message: 'Subscription cancelled successfully'
        });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel subscription'
        });
    }
});

// Razorpay webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        // Verify webhook signature
        if (webhookSecret) {
            const isValid = razorpayService.verifyWebhookSignature(
                req.body,
                signature,
                webhookSecret
            );

            if (!isValid) {
                return res.status(400).json({ error: 'Invalid signature' });
            }
        }

        const event = req.body;

        // Handle different webhook events
        switch (event.event) {
            case 'payment.captured':
                // Payment successful
                await handlePaymentCaptured(event.payload.payment.entity);
                break;

            case 'payment.failed':
                // Payment failed
                await handlePaymentFailed(event.payload.payment.entity);
                break;

            case 'subscription.activated':
                // Subscription activated
                await handleSubscriptionActivated(event.payload.subscription.entity);
                break;

            case 'subscription.charged':
                // Subscription charged (recurring payment)
                await handleSubscriptionCharged(event.payload.subscription.entity, event.payload.payment.entity);
                break;

            case 'subscription.cancelled':
                // Subscription cancelled
                await handleSubscriptionCancelled(event.payload.subscription.entity);
                break;

            case 'subscription.completed':
                // Subscription completed
                await handleSubscriptionCompleted(event.payload.subscription.entity);
                break;

            default:
                console.log('Unhandled webhook event:', event.event);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Webhook handlers
async function handlePaymentCaptured(payment) {
    const dbPayment = await Payment.findByPaymentId(payment.id);
    if (dbPayment) {
        dbPayment.status = 'captured';
        dbPayment.payment_method = payment.method;
        await dbPayment.save();
    }
}

async function handlePaymentFailed(payment) {
    const dbPayment = await Payment.findByPaymentId(payment.id);
    if (dbPayment) {
        dbPayment.status = 'failed';
        dbPayment.error_code = payment.error_code;
        dbPayment.error_description = payment.error_description;
        await dbPayment.save();
    }
}

async function handleSubscriptionActivated(subscription) {
    const dbSubscription = await Subscription.findByRazorpayId(subscription.id);
    if (dbSubscription) {
        dbSubscription.status = 'active';
        await dbSubscription.save();
    }
}

async function handleSubscriptionCharged(subscription, payment) {
    const dbSubscription = await Subscription.findByRazorpayId(subscription.id);
    if (dbSubscription) {
        // Update subscription dates
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
        
        dbSubscription.current_start = new Date();
        dbSubscription.current_end = endDate;
        dbSubscription.next_billing_date = endDate;
        dbSubscription.status = 'active';
        await dbSubscription.save();

        // Create payment record
        await Payment.createPayment({
            user_id: dbSubscription.user_id,
            subscription_id: dbSubscription._id,
            razorpay_payment_id: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            status: 'captured',
            payment_method: payment.method,
            description: `Recurring payment for ${dbSubscription.plan_name}`
        });
    }
}

async function handleSubscriptionCancelled(subscription) {
    const dbSubscription = await Subscription.findByRazorpayId(subscription.id);
    if (dbSubscription) {
        dbSubscription.status = 'cancelled';
        dbSubscription.cancelled_at = new Date();
        await dbSubscription.save();
    }
}

async function handleSubscriptionCompleted(subscription) {
    const dbSubscription = await Subscription.findByRazorpayId(subscription.id);
    if (dbSubscription) {
        dbSubscription.status = 'expired';
        await dbSubscription.save();
    }
}

module.exports = router;
