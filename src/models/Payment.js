const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    subscription_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription'
    },
    razorpay_order_id: {
        type: String,
        unique: true,
        sparse: true
    },
    razorpay_payment_id: {
        type: String,
        unique: true,
        sparse: true
    },
    razorpay_signature: {
        type: String
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    status: {
        type: String,
        enum: ['created', 'authorized', 'captured', 'failed', 'refunded'],
        default: 'created'
    },
    payment_method: {
        type: String
    },
    description: {
        type: String
    },
    error_code: {
        type: String
    },
    error_description: {
        type: String
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Indexes
paymentSchema.index({ razorpay_order_id: 1 });
paymentSchema.index({ razorpay_payment_id: 1 });
paymentSchema.index({ user_id: 1, status: 1 });

// Static methods
paymentSchema.statics.createPayment = async function(data) {
    const payment = new this(data);
    await payment.save();
    return payment;
};

paymentSchema.statics.findByOrderId = async function(orderId) {
    return await this.findOne({ razorpay_order_id: orderId });
};

paymentSchema.statics.findByPaymentId = async function(paymentId) {
    return await this.findOne({ razorpay_payment_id: paymentId });
};

paymentSchema.statics.updatePaymentStatus = async function(orderId, updateData) {
    return await this.findOneAndUpdate(
        { razorpay_order_id: orderId },
        { ...updateData, updatedAt: new Date() },
        { new: true }
    );
};

module.exports = mongoose.model('Payment', paymentSchema);
