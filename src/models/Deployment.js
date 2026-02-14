const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const deploymentSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    deployment_id: {
        type: String,
        unique: true,
        default: () => uuidv4().replace(/-/g, '').slice(0, 12)
    },
    name: {
        type: String,
        required: true
    },
    subdomain: {
        type: String,
        unique: true,
        required: true
    },
    frontend_repo: String,
    backend_repo: String,
    frontend_description: String,
    backend_description: String,
    frontend_port: Number,              // Actual port (for backwards compatibility)
    backend_port: Number,               // Actual port (for backwards compatibility)
    frontend_allocated_port: Number,    // Port we tried to allocate
    backend_allocated_port: Number,     // Port we tried to allocate
    frontend_actual_port: Number,       // Port app is actually listening on
    backend_actual_port: Number,        // Port app is actually listening on
    frontend_url: String,
    backend_url: String,
    custom_domain: String,
    env_vars: {
        type: Map,
        of: String,
        default: new Map()
    },
    status: {
        type: String,
        enum: ['deploying', 'deployed', 'failed', 'stopped'],
        default: 'deploying'
    },
    pm2_frontend_name: String,
    pm2_backend_name: String
}, {
    timestamps: true,
    toJSON: {
        transform: (doc, ret) => {
            ret.id = ret._id;
            delete ret._id;
            delete ret.__v;
            // Convert Map to Object for JSON
            if (ret.env_vars instanceof Map) {
                ret.env_vars = Object.fromEntries(ret.env_vars);
            }
            return ret;
        }
    }
});

// Indexes
deploymentSchema.index({ user_id: 1 });
deploymentSchema.index({ deployment_id: 1 });
deploymentSchema.index({ subdomain: 1 });
deploymentSchema.index({ status: 1 });

// Static methods
deploymentSchema.statics.create = async function(deploymentData) {
    const deployment = new this(deploymentData);
    await deployment.save();
    return deployment;
};

deploymentSchema.statics.findById = async function(id) {
    try {
        return await this.findOne({ _id: id });
    } catch (error) {
        return null;
    }
};

deploymentSchema.statics.findByDeploymentId = async function(deploymentId) {
    return await this.findOne({ deployment_id: deploymentId });
};

deploymentSchema.statics.findBySubdomain = async function(subdomain) {
    return await this.findOne({ subdomain });
};

deploymentSchema.statics.findByUserId = async function(userId, limit = 50, offset = 0) {
    return await this.find({ user_id: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset);
};

deploymentSchema.statics.update = async function(id, updates) {
    return await this.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
    );
};

deploymentSchema.statics.updateStatus = async function(id, status) {
    return await this.findByIdAndUpdate(
        id,
        { status },
        { new: true }
    );
};

deploymentSchema.statics.delete = async function(id) {
    return await this.findByIdAndDelete(id);
};

deploymentSchema.statics.list = async function(limit = 50, offset = 0) {
    return await this.find()
        .populate('user_id', 'username email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset);
};

deploymentSchema.statics.countByUserId = async function(userId) {
    return await this.countDocuments({
        user_id: userId,
        status: { $ne: 'failed' }
    });
};

deploymentSchema.statics.getStats = async function() {
    const total = await this.countDocuments();
    const deployed = await this.countDocuments({ status: 'deployed' });
    const deploying = await this.countDocuments({ status: 'deploying' });
    const failed = await this.countDocuments({ status: 'failed' });
    const stopped = await this.countDocuments({ status: 'stopped' });

    return {
        total,
        deployed,
        deploying,
        failed,
        stopped
    };
};

const Deployment = mongoose.model('Deployment', deploymentSchema);

module.exports = Deployment;
