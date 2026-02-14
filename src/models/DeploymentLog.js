const mongoose = require('mongoose');

const deploymentLogSchema = new mongoose.Schema({
    deployment_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deployment',
        required: true
    },
    message: {
        type: String,
        required: true
    },
    log_type: {
        type: String,
        enum: ['info', 'error', 'success', 'warning'],
        default: 'info'
    }
}, {
    timestamps: true,
    toJSON: {
        transform: (doc, ret) => {
            ret.id = ret._id;
            ret.timestamp = ret.createdAt;
            delete ret._id;
            delete ret.__v;
            delete ret.updatedAt;
            return ret;
        }
    }
});

// Indexes
deploymentLogSchema.index({ deployment_id: 1, createdAt: -1 });

// Static methods
deploymentLogSchema.statics.create = async function(deploymentId, message, logType = 'info') {
    const log = new this({
        deployment_id: deploymentId,
        message,
        log_type: logType
    });
    await log.save();
    return log;
};

deploymentLogSchema.statics.findByDeploymentId = async function(deploymentId, limit = 100) {
    return await this.find({ deployment_id: deploymentId })
        .sort({ createdAt: 1 }) // Chronological order
        .limit(limit);
};

deploymentLogSchema.statics.deleteByDeploymentId = async function(deploymentId) {
    return await this.deleteMany({ deployment_id: deploymentId });
};

deploymentLogSchema.statics.delete = async function(id) {
    return await this.findByIdAndDelete(id);
};

const DeploymentLog = mongoose.model('DeploymentLog', deploymentLogSchema);

module.exports = DeploymentLog;
