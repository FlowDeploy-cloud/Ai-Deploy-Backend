const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 50
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password_hash: {
        type: String,
        required: true
    },
    api_key: {
        type: String,
        unique: true,
        default: () => crypto.randomBytes(32).toString('hex')
    },
    plan: {
        type: String,
        enum: ['free', 'pro', 'enterprise'],
        default: 'free'
    },
    max_deployments: {
        type: Number,
        default: 5
    }
}, {
    timestamps: true,
    toJSON: {
        transform: (doc, ret) => {
            ret.id = ret._id;
            delete ret._id;
            delete ret.__v;
            delete ret.password_hash;
            return ret;
        }
    }
});

// Index for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ api_key: 1 });

// Static methods
userSchema.statics.create = async function({ username, email, password, plan = 'free' }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const apiKey = crypto.randomBytes(32).toString('hex');
    
    const maxDeployments = plan === 'free' ? 5 : plan === 'pro' ? 50 : 999;

    try {
        const user = new this({
            username,
            email,
            password_hash: passwordHash,
            api_key: apiKey,
            plan,
            max_deployments: maxDeployments
        });

        await user.save();
        return user;
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            throw new Error(`${field.charAt(0).toUpperCase() + field.slice(1)} already exists`);
        }
        throw error;
    }
};

userSchema.statics.findById = async function(id) {
    try {
        return await this.findOne({ _id: id });
    } catch (error) {
        return null;
    }
};

userSchema.statics.findByEmail = async function(email) {
    return await this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByUsername = async function(username) {
    return await this.findOne({ username });
};

userSchema.statics.findByApiKey = async function(apiKey) {
    return await this.findOne({ api_key: apiKey });
};

userSchema.statics.verifyPassword = async function(user, password) {
    return await bcrypt.compare(password, user.password_hash);
};

userSchema.statics.updatePassword = async function(userId, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    return await this.findByIdAndUpdate(
        userId,
        { password_hash: passwordHash },
        { new: true }
    );
};

userSchema.statics.updatePlan = async function(userId, plan) {
    const maxDeployments = plan === 'free' ? 5 : plan === 'pro' ? 50 : 999;
    return await this.findByIdAndUpdate(
        userId,
        { plan, max_deployments: maxDeployments },
        { new: true }
    );
};

userSchema.statics.regenerateApiKey = async function(userId) {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const user = await this.findByIdAndUpdate(
        userId,
        { api_key: apiKey },
        { new: true }
    );
    return user?.api_key;
};

userSchema.statics.getDeploymentCount = async function(userId) {
    const Deployment = mongoose.model('Deployment');
    const count = await Deployment.countDocuments({
        user_id: userId,
        status: { $ne: 'failed' }
    });
    return count;
};

userSchema.statics.canDeploy = async function(userId) {
    const user = await this.findById(userId);
    const deploymentCount = await this.getDeploymentCount(userId);
    return deploymentCount < user.max_deployments;
};

userSchema.statics.delete = async function(userId) {
    return await this.findByIdAndDelete(userId);
};

userSchema.statics.list = async function(limit = 50, offset = 0) {
    return await this.find()
        .select('-password_hash')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
