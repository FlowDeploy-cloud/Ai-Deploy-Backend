const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    plan_id: {
        type: String,
        required: true,
        enum: ['starter', 'growth', 'business', 'enterprise']
    },
    plan_name: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    razorpay_subscription_id: {
        type: String,
        unique: true,
        sparse: true
    },
    razorpay_plan_id: {
        type: String
    },
    status: {
        type: String,
        enum: ['created', 'active', 'paused', 'cancelled', 'expired', 'halted'],
        default: 'created'
    },
    current_start: {
        type: Date
    },
    current_end: {
        type: Date
    },
    next_billing_date: {
        type: Date
    },
    cancelled_at: {
        type: Date
    },
    limits: {
        max_frontend: {
            type: Number,
            required: true
        },
        max_backend: {
            type: Number,
            required: true
        },
        features: {
            type: [String],
            default: []
        }
    },
    trial_end: {
        type: Date
    }
}, {
    timestamps: true
});

// Indexes
subscriptionSchema.index({ user_id: 1, status: 1 });
subscriptionSchema.index({ razorpay_subscription_id: 1 });
subscriptionSchema.index({ current_end: 1 });

// Static methods
subscriptionSchema.statics.createSubscription = async function(data) {
    const subscription = new this(data);
    await subscription.save();
    return subscription;
};

subscriptionSchema.statics.findByUserId = async function(userId) {
    return await this.findOne({ 
        user_id: userId,
        status: { $in: ['active', 'created'] }
    }).sort({ createdAt: -1 });
};

subscriptionSchema.statics.findByRazorpayId = async function(razorpaySubscriptionId) {
    return await this.findOne({ razorpay_subscription_id: razorpaySubscriptionId });
};

subscriptionSchema.statics.updateStatus = async function(subscriptionId, status, additionalData = {}) {
    return await this.findByIdAndUpdate(
        subscriptionId,
        { 
            status,
            ...additionalData,
            updatedAt: new Date()
        },
        { new: true }
    );
};

// Check if subscription is expired
subscriptionSchema.methods.isExpired = function() {
    if (!this.current_end) return false;
    return new Date() > this.current_end;
};

// Check if subscription is active
subscriptionSchema.methods.isActive = function() {
    return this.status === 'active' && !this.isExpired();
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
