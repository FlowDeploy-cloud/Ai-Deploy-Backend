const crypto = require('crypto');

// Plan configurations - Server-side source of truth (prevents tampering)
const PLANS = {
    starter: {
        id: 'starter',
        name: 'Starter Plan',
        price: 9900, // in paise (₹99.00)
        currency: 'INR',
        period: 'monthly',
        limits: {
            max_frontend: 1,
            max_backend: 1,
            features: ['basic_ssl', 'community_support']
        }
    },
    growth: {
        id: 'growth',
        name: 'Growth Plan',
        price: 19900, // in paise (₹199.00)
        currency: 'INR',
        period: 'monthly',
        limits: {
            max_frontend: 5,
            max_backend: 3,
            features: ['basic_ssl', 'priority_support', 'custom_domain']
        }
    },
    business: {
        id: 'business',
        name: 'Business Plan',
        price: 29900, // in paise (₹299.00)
        currency: 'INR',
        period: 'monthly',
        limits: {
            max_frontend: 10,
            max_backend: 7,
            features: ['basic_ssl', 'priority_support', 'custom_domain', 'advanced_analytics']
        }
    },
    enterprise: {
        id: 'enterprise',
        name: 'Enterprise Plan',
        price: 59900, // in paise (₹599.00)
        currency: 'INR',
        period: 'monthly',
        limits: {
            max_frontend: 15,
            max_backend: 15,
            features: ['basic_ssl', 'priority_support', 'custom_domain', 'advanced_analytics', 'log_monitoring', 'auto_scaling', 'dedicated_support']
        }
    }
};

class RazorpayService {
    constructor() {
        const Razorpay = require('razorpay');
        this.razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
    }

    // Get plan by ID (server-side source of truth)
    getPlan(planId) {
        const plan = PLANS[planId];
        if (!plan) {
            throw new Error('Invalid plan ID');
        }
        return plan;
    }

    // Get all plans
    getAllPlans() {
        return Object.values(PLANS);
    }

    // Verify plan and amount (prevent tampering)
    verifyPlanAmount(planId, amount) {
        const plan = this.getPlan(planId);
        if (plan.price !== amount) {
            throw new Error('Price tampering detected');
        }
        return plan;
    }

    // Create Razorpay order for one-time payment
    async createOrder(planId, userId, userEmail) {
        try {
            const plan = this.getPlan(planId);
            
            // Create order with verified amount from server
            // Generate short receipt (max 40 chars for Razorpay)
            const shortUserId = userId.toString().slice(-8); // Last 8 chars of userId
            const timestamp = Date.now().toString().slice(-10); // Last 10 digits of timestamp
            const options = {
                amount: plan.price, // Server-side verified amount
                currency: plan.currency,
                receipt: `ord_${shortUserId}_${timestamp}`, // Format: ord_XXXXXXXX_XXXXXXXXXX (max 26 chars)
                notes: {
                    user_id: userId,
                    plan_id: planId,
                    plan_name: plan.name,
                    email: userEmail
                }
            };

            const order = await this.razorpay.orders.create(options);
            return {
                order,
                plan
            };
        } catch (error) {
            console.error('Error creating Razorpay order:', error);
            throw new Error('Failed to create payment order');
        }
    }

    // Create Razorpay subscription for recurring payments
    async createSubscription(planId, userId, userEmail, customerName) {
        try {
            const plan = this.getPlan(planId);
            
            // First, create or get customer
            const customer = await this.createCustomer(userEmail, customerName, userId);

            // Create Razorpay plan if not exists (for subscriptions)
            const razorpayPlan = await this.createRazorpayPlan(plan);

            // Create subscription
            const subscription = await this.razorpay.subscriptions.create({
                plan_id: razorpayPlan.id,
                customer_notify: 1,
                quantity: 1,
                total_count: 12, // 12 months
                notes: {
                    user_id: userId,
                    plan_id: planId,
                    plan_name: plan.name
                }
            });

            return {
                subscription,
                plan,
                customer
            };
        } catch (error) {
            console.error('Error creating subscription:', error);
            throw new Error('Failed to create subscription');
        }
    }

    // Create Razorpay customer
    async createCustomer(email, name, userId) {
        try {
            const customer = await this.razorpay.customers.create({
                name: name,
                email: email,
                fail_existing: 0,
                notes: {
                    user_id: userId
                }
            });
            return customer;
        } catch (error) {
            console.error('Error creating customer:', error);
            throw error;
        }
    }

    // Create Razorpay plan (for subscriptions)
    async createRazorpayPlan(plan) {
        try {
            // Check if plan already exists
            const planId = `plan_${plan.id}`;
            
            try {
                const existingPlan = await this.razorpay.plans.fetch(planId);
                return existingPlan;
            } catch (error) {
                // Plan doesn't exist, create it
            }

            const razorpayPlan = await this.razorpay.plans.create({
                period: 'monthly',
                interval: 1,
                item: {
                    name: plan.name,
                    amount: plan.price,
                    currency: plan.currency,
                    description: `${plan.name} - Monthly subscription`
                },
                notes: {
                    plan_id: plan.id
                }
            });

            return razorpayPlan;
        } catch (error) {
            console.error('Error creating Razorpay plan:', error);
            throw error;
        }
    }

    // Verify payment signature (CRITICAL FOR SECURITY)
    verifyPaymentSignature(orderId, paymentId, signature) {
        const text = `${orderId}|${paymentId}`;
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(text)
            .digest('hex');

        if (generated_signature !== signature) {
            throw new Error('Invalid payment signature');
        }

        return true;
    }

    // Verify subscription signature
    verifySubscriptionSignature(subscriptionId, paymentId, signature) {
        const text = `${subscriptionId}|${paymentId}`;
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(text)
            .digest('hex');

        if (generated_signature !== signature) {
            throw new Error('Invalid subscription signature');
        }

        return true;
    }

    // Verify webhook signature
    verifyWebhookSignature(webhookBody, signature, webhookSecret) {
        const generated_signature = crypto
            .createHmac('sha256', webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(JSON.stringify(webhookBody))
            .digest('hex');

        return generated_signature === signature;
    }

    // Fetch payment details
    async fetchPayment(paymentId) {
        try {
            return await this.razorpay.payments.fetch(paymentId);
        } catch (error) {
            console.error('Error fetching payment:', error);
            throw error;
        }
    }

    // Fetch subscription details
    async fetchSubscription(subscriptionId) {
        try {
            return await this.razorpay.subscriptions.fetch(subscriptionId);
        } catch (error) {
            console.error('Error fetching subscription:', error);
            throw error;
        }
    }

    // Cancel subscription
    async cancelSubscription(subscriptionId, cancelAtCycleEnd = false) {
        try {
            return await this.razorpay.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
        } catch (error) {
            console.error('Error cancelling subscription:', error);
            throw error;
        }
    }

    // Pause subscription
    async pauseSubscription(subscriptionId) {
        try {
            return await this.razorpay.subscriptions.pause(subscriptionId);
        } catch (error) {
            console.error('Error pausing subscription:', error);
            throw error;
        }
    }

    // Resume subscription
    async resumeSubscription(subscriptionId) {
        try {
            return await this.razorpay.subscriptions.resume(subscriptionId);
        } catch (error) {
            console.error('Error resuming subscription:', error);
            throw error;
        }
    }
}

// Export singleton instance
let instance;
const getRazorpayService = () => {
    if (!instance) {
        instance = new RazorpayService();
    }
    return instance;
};

module.exports = { getRazorpayService, PLANS };
